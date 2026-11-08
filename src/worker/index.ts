// Cloudflare Worker in front of the static site (wrangler.jsonc `main`). Only two endpoints; every
// other request goes straight to the static assets (dist/):
//   POST /api/preguntar  live free question (#15) — behind the PREGUNTA_LIBRE flag, off by default
//   POST /api/avisar     "Reportar error" / "Falta un partido" without a GitHub account
//   /textos/*            programme page texts: read internally through ASSETS, never served
//   /?r=reto             challenge og:title so the shared link's preview changes (#9; nothing about
//                        the user is in the link)
//
// No logs: this code never calls console.*, Workers observability is off in wrangler.jsonc, the
// client IP is never read, and AI Gateway is told not to log each request (`cf-aig-collect-log`).
// Secrets and bindings it needs: docs/deploy.md ("Pregunta libre y avisos").
import datos from '../../data/dataset.json';
import { aplicarModo, type Dataset } from '../dataset';
import type { AdaptadorIA } from '../ia/adaptador';
import { crearIAClaude, MODELOS_PREGUNTA_LIBRE } from '../ia/claude';
import { crearPreguntaLibre, type Almacen } from '../pregunta/libre';
import { TextoPrograma, rutaTexto } from '../pregunta/textos';
import { TERMINOS } from '../registro/terminos';
import { crearAvisos } from '../transparencia/avisos';
import { aplicarReto, esReto } from '../compartir';

/** Minimal shapes of the Cloudflare bindings used here (no workers-types dependency). */
interface Fetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

export interface Entorno {
  ASSETS: Fetcher;
  /** KV namespace: session counters, monthly spending and the FAQ cache. */
  PREGUNTAS?: Almacen;
  /** "1" opens the free question (spec: around 18-nov). Anything else: closed. */
  PREGUNTA_LIBRE?: string;
  /** 'privado' = private prototype dataset (provisional sources included). */
  MODO?: string;
  ANTHROPIC_API_KEY?: string;
  /** https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/anthropic */
  AI_GATEWAY_URL?: string;
  /** Only for an authenticated gateway. */
  CF_AIG_TOKEN?: string;
  /** Monthly cap in euros (default 150). */
  TOPE_MENSUAL?: string;
  /** Fine-grained token with "Issues: read and write" on jorgemasta/29n only. */
  GITHUB_TOKEN?: string;
}

export interface Dependencias {
  /** Tests inject the fake adapter; production builds the Claude one from the environment. */
  ia?: (env: Entorno) => AdaptadorIA;
  /** Tests inject a fake GitHub. */
  fetchGitHub?: typeof fetch;
  ahora?: () => Date;
}

const MAX_CUERPO = 8 * 1024;
const REPO_API = 'https://api.github.com/repos/jorgemasta/29n/issues';

const json = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });

function iaReal(env: Entorno): AdaptadorIA {
  return crearIAClaude({
    apiKey: env.ANTHROPIC_API_KEY,
    ...(env.AI_GATEWAY_URL ? { baseURL: env.AI_GATEWAY_URL } : {}),
    cabeceras: {
      // AI Gateway: do not log this request (prompt, response or metadata).
      'cf-aig-collect-log': 'false',
      ...(env.CF_AIG_TOKEN ? { 'cf-aig-authorization': `Bearer ${env.CF_AIG_TOKEN}` } : {}),
    },
    modelos: MODELOS_PREGUNTA_LIBRE,
    maxTokens: 8000,
  });
}

/** Reads a small JSON body from the same site; null if it is not one. */
async function leerPeticion(peticion: Request): Promise<Record<string, unknown> | null> {
  if (peticion.method !== 'POST') return null;
  const origen = peticion.headers.get('origin');
  if (origen && origen !== new URL(peticion.url).origin) return null;
  if (!(peticion.headers.get('content-type') ?? '').includes('application/json')) return null;
  const texto = await peticion.text();
  if (texto.length > MAX_CUERPO) return null;
  try {
    const v = JSON.parse(texto);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function crearManejador(dep: Dependencias = {}) {
  return async function fetch(peticion: Request, env: Entorno): Promise<Response> {
    const url = new URL(peticion.url);

    if (url.pathname.startsWith('/textos/')) return new Response('No encontrado', { status: 404 });

    if (url.pathname === '/api/preguntar') {
      const cuerpo = await leerPeticion(peticion);
      if (!cuerpo) return json({ estado: 'invalida', mensaje: 'Petición no válida.' }, 400);
      const activa = env.PREGUNTA_LIBRE === '1' && !!env.PREGUNTAS && (!!env.ANTHROPIC_API_KEY || !!dep.ia);
      const dataset = aplicarModo(datos as Dataset, env.MODO === 'privado' ? 'privado' : 'publico');
      const servicio = crearPreguntaLibre(
        {
          ia: activa ? (dep.ia ?? iaReal)(env) : { completar: async () => { throw new Error('cerrada'); } },
          almacen: env.PREGUNTAS ?? { get: async () => null, put: async () => {} },
          textos: async (partido) => {
            const r = await env.ASSETS.fetch(new Request(new URL(`/${rutaTexto(partido)}`, url.origin)));
            if (!r.ok) return null;
            const t = TextoPrograma.safeParse(await r.json().catch(() => null));
            return t.success ? t.data : null;
          },
          ahora: dep.ahora ?? (() => new Date()),
        },
        {
          activa,
          dataset,
          terminos: TERMINOS,
          ...(Number(env.TOPE_MENSUAL) > 0 ? { topeMensual: Number(env.TOPE_MENSUAL) } : {}),
        },
      );
      const r = await servicio.preguntar({ pregunta: String(cuerpo.pregunta ?? ''), sesion: String(cuerpo.sesion ?? '') });
      return json(r, r.estado === 'invalida' ? 400 : r.estado === 'error' ? 502 : 200);
    }

    if (url.pathname === '/api/avisar') {
      const cuerpo = await leerPeticion(peticion);
      if (!cuerpo) return json({ estado: 'invalido', mensaje: 'Petición no válida.' }, 400);
      const llamar = dep.fetchGitHub ?? globalThis.fetch.bind(globalThis);
      const avisos = crearAvisos({
        ...(env.PREGUNTAS ? { almacen: env.PREGUNTAS } : {}),
        ...(env.GITHUB_TOKEN
          ? {
              crearIssue: async ({ titulo, cuerpo: body, etiquetas }) => {
                const r = await llamar(REPO_API, {
                  method: 'POST',
                  headers: {
                    authorization: `Bearer ${env.GITHUB_TOKEN}`,
                    accept: 'application/vnd.github+json',
                    'user-agent': '29n-avisos',
                    'x-github-api-version': '2022-11-28',
                    'content-type': 'application/json',
                  },
                  body: JSON.stringify({ title: titulo, body, labels: etiquetas }),
                });
                if (!r.ok) throw new Error(`GitHub ${r.status}`);
                return { url: ((await r.json()) as { html_url: string }).html_url };
              },
            }
          : {}),
      });
      const r = await avisos.enviar(cuerpo.aviso, String(cuerpo.sesion ?? ''));
      return json(r, r.estado === 'invalido' ? 400 : 200);
    }

    const res = await env.ASSETS.fetch(peticion);
    if (url.pathname === '/' && esReto(url.search) && res.headers.get('content-type')?.includes('text/html'))
      return new Response(aplicarReto(await res.text()), res);
    return res;
  };
}

export default { fetch: crearManejador() };
