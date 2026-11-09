// Live free question (#15, test point C): the handler behind POST /api/preguntar.
//
//   crearPreguntaLibre(puertos, config).preguntar({ pregunta, sesion }) → RespuestaPreguntaLibre
//
// Order: flag → validation → search terms (none = out of scope, no AI) → FAQ cache (served even over
// the limits, costs nothing) → per-session limit → monthly spending cap → one `responderPregunta`
// per published party (same V1/V2, V3–V6 and V10 barriers as the precomputed answers) → cache.
//
// Privacy: nothing here logs. The session id (random, generated in the voter's browser) is only
// stored hashed, as a bare counter that expires; cached answers are keyed by the normalised question
// and never carry a session. No IP is ever received. No Node-only dependency: runs in a Worker.
import type { Dataset, Partido, RespuestaPregunta } from '../dataset/esquema';
import type { AdaptadorIA, Tarea } from '../ia/adaptador';
import { normalizarTermino } from '../pipeline/normalizar';
import type { TerminosIdentificativos } from '../registro/terminos';
import { MAX_REINTENTOS, paginasParaResponder, responderPregunta, VERSION_PROMPT_PREGUNTA } from './index';
import { LIMITE_SESION, MAX_CARACTERES, MIN_CARACTERES } from './limites';
import type { TextoPrograma } from './textos';

/** Minimal key-value store, compatible with a Cloudflare KV namespace. */
export interface Almacen {
  get(clave: string): Promise<string | null>;
  put(clave: string, valor: string, opciones?: { expirationTtl?: number }): Promise<void>;
}

export interface PuertosPreguntaLibre {
  ia: AdaptadorIA;
  almacen: Almacen;
  /** Page text of a party's programme, or null if none is published. */
  textos: (partido: string) => Promise<TextoPrograma | null>;
  ahora: () => Date;
}

export interface ConfigPreguntaLibre {
  /** Feature flag (off by default; spec: the free text box opens around 18-nov). */
  activa: boolean;
  /** Dataset already filtered by mode (public/private). */
  dataset: Dataset;
  terminos: TerminosIdentificativos;
  /** AI-answered questions per session (cached ones are free). */
  limiteSesion?: number;
  /** Monthly cap in euros; once reached only cached questions are served. */
  topeMensual?: number;
  /** Estimated cost in euros of one AI call of this task, charged when the call is made. */
  costeLlamada?: (tarea: Tarea) => number;
  /** Max candidate pages sent to the AI per party. */
  maxPaginas?: number;
}

export { LIMITE_SESION, MAX_CARACTERES, MIN_CARACTERES };
export const TOPE_MENSUAL = 150;
export const MAX_PAGINAS = 4;
/** Session counters expire after a day. */
const TTL_SESION = 24 * 3600;
/** Cached answers expire after 14 days (and change key whenever a programme or the prompt changes). */
const TTL_CACHE = 14 * 24 * 3600;
const MAX_FRECUENTES = 20;

/**
 * Conservative estimates (euros ≈ USD) with the public prices of Nov 2026: Haiku 5.5 $0.10/$0.50
 * per million input/output tokens answers (~8k in, ~4k out incl. thinking); Sonnet 5.5 $2/$10
 * runs the independent V10 check (~3k in, ~1.5k out at low effort).
 */
export const COSTE_ESTIMADO: Partial<Record<Tarea, number>> = {
  'responder-pregunta': 0.005,
  'verificar-fidelidad': 0.025,
};
const costePorDefecto = (t: Tarea) => COSTE_ESTIMADO[t] ?? 0.03;

export type RespuestaPreguntaLibre =
  | { estado: 'ok'; pregunta: { id: string; texto: string }; respuestas: RespuestaPregunta[]; quedan: number; deCache: boolean }
  | { estado: 'cerrada'; mensaje: string }
  | { estado: 'invalida'; mensaje: string }
  | { estado: 'fuera_de_tema'; mensaje: string }
  | { estado: 'limite'; mensaje: string; frecuentes: string[] }
  | { estado: 'solo_frecuentes'; mensaje: string; frecuentes: string[] }
  | { estado: 'error'; mensaje: string };

export interface PeticionPreguntaLibre {
  pregunta: string;
  /** Random id kept in the voter's browser for this session. */
  sesion: string;
}

// Words that say nothing about the subject of a question (question words, verbs about proposing,
// "party", "programme", articles, pronouns…). Compared without accents.
const VACIAS = new Set(
  `a al algo algun alguna alguno ante como con contra cual cuales cuando cuanto cuantos de del desde donde el ella ellos
  en entre es esa ese eso esta este esto estos estas ha han hay hace hacen hacer haran hara harian haria la las le les lo los
  mas me mi muy nada ni no nos nosotros o os otra otro para pero piensa piensan poco por porque propone proponen propuesta
  propuestas proponeis que quien quienes quiere quieren se segun ser si sin sobre son su sus tambien te tiene tienen todo
  todos tu un una unas uno unos usted ustedes va vais van vamos vosotros y ya yo dice dicen opina opinan plantea plantean
  partido partidos programa programas politica politicas medida medidas gobierno hacer pasa pasara piensa cosa cosas
  respecto tema temas vuestro vuestra deberia debe`.split(/\s+/),
);

/**
 * Search terms for a free question: its content words, without accents, plural-insensitive and cut
 * to a 7-letter prefix (the retrieval matches word prefixes: "pension" finds "pensiones").
 */
export function palabrasDeLaPregunta(texto: string): string[] {
  const palabras = normalizarTermino(texto)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((p) => p.length >= 3 && !VACIAS.has(p));
  const raiz = (p: string) => {
    let r = p;
    if (r.length > 5 && /[^aeiou]es$/.test(r)) r = r.slice(0, -2);
    else if (r.length > 4 && r.endsWith('s')) r = r.slice(0, -1);
    return r.slice(0, 7);
  };
  return [...new Set(palabras.map(raiz))];
}

/** Cache key text: same question regardless of case, accents, punctuation and spacing. */
const normalizarPregunta = (texto: string) =>
  normalizarTermino(texto)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export async function sha256(texto: string): Promise<string> {
  const datos = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(datos)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type Publicado = Partido & { programa: Extract<Partido['programa'], { estado: 'publicado' }> };
// Privacy (/privacidad/): the cache keeps answers under a hash of the question, never its words.
// A question's wording is stored only once a second person asks it (it becomes "frecuente").
interface EnCache {
  respuestas: RespuestaPregunta[];
}
interface Frecuente {
  clave: string;
  texto?: string;
  veces: number;
}

export function crearPreguntaLibre(puertos: PuertosPreguntaLibre, config: ConfigPreguntaLibre) {
  const limiteSesion = config.limiteSesion ?? LIMITE_SESION;
  const tope = config.topeMensual ?? TOPE_MENSUAL;
  const coste = config.costeLlamada ?? costePorDefecto;
  const maxPaginas = config.maxPaginas ?? MAX_PAGINAS;
  const { almacen } = puertos;
  const publicados = config.dataset.partidos.filter((p): p is Publicado => p.programa.estado === 'publicado');
  // Any new programme or prompt version invalidates every cached answer.
  const version = sha256(
    [VERSION_PROMPT_PREGUNTA, ...publicados.map((p) => `${p.id}:${p.programa.hashPdf ?? ''}`).sort()].join('|'),
  ).then((h) => h.slice(0, 16));

  const mes = () => puertos.ahora().toISOString().slice(0, 7);
  const leerNumero = async (clave: string) => Number((await almacen.get(clave)) ?? 0) || 0;
  const claveGasto = () => `gasto:${mes()}`;

  const frecuentes = async (): Promise<Frecuente[]> => {
    try {
      return JSON.parse((await almacen.get(`frecuentes:${await version}`)) ?? '[]') as Frecuente[];
    } catch {
      return [];
    }
  };
  const listaFrecuentes = async () =>
    (await frecuentes()).flatMap((f) => (f.veces >= 2 && f.texto ? [f.texto] : []));
  const contarFrecuente = async (clave: string, texto: string) => {
    const lista = await frecuentes();
    const f = lista.find((x) => x.clave === clave);
    if (f) {
      f.veces++;
      f.texto ??= texto;
    } else lista.push({ clave, veces: 1 });
    lista.sort((a, b) => b.veces - a.veces);
    await almacen.put(`frecuentes:${await version}`, JSON.stringify(lista.slice(0, MAX_FRECUENTES)), { expirationTtl: TTL_CACHE });
  };

  /**
   * Spending: a question first RESERVES its worst case (every party with pages answered and checked
   * by V10 on every attempt), then settles to what its calls actually cost. KV has no atomic
   * increment, so two questions arriving in the same few milliseconds can both read the old total;
   * the reservation keeps that window to one read-write (not the whole AI round), and the Anthropic
   * workspace spend limit is the hard backstop (docs/decisions.md).
   */
  const sumarGasto = async (clave: string, importe: number) =>
    almacen.put(clave, String(Math.max(0, (await leerNumero(clave)) + importe)), { expirationTtl: 40 * 24 * 3600 });
  const peorCasoPorPartido = () => (MAX_REINTENTOS + 1) * (coste('responder-pregunta') + coste('verificar-fidelidad'));

  return {
    async preguntar(peticion: PeticionPreguntaLibre): Promise<RespuestaPreguntaLibre> {
      if (!config.activa) return { estado: 'cerrada', mensaje: 'Muy pronto. De momento, elige una de las preguntas sugeridas.' };
      const texto = (peticion.pregunta ?? '').trim().replace(/\s+/g, ' ');
      if (texto.length < MIN_CARACTERES || texto.length > MAX_CARACTERES)
        return { estado: 'invalida', mensaje: `Escribe una pregunta de entre ${MIN_CARACTERES} y ${MAX_CARACTERES} caracteres.` };
      if (!peticion.sesion || typeof peticion.sesion !== 'string' || peticion.sesion.length > 100)
        return { estado: 'invalida', mensaje: 'Recarga la página e inténtalo de nuevo.' };

      const palabras = palabrasDeLaPregunta(texto);
      if (palabras.length === 0)
        return {
          estado: 'fuera_de_tema',
          mensaje: 'Solo podemos buscar lo que dicen los programas sobre un tema concreto. Prueba con algo como «¿Qué proponen sobre el alquiler?».',
        };

      const normalizada = normalizarPregunta(texto);
      const clave = await sha256(normalizada);
      const claveCache = `cache:${await version}:${clave}`;
      const claveSesion = `sesion:${await sha256(`29n:${peticion.sesion}`)}`;
      const usadas = await leerNumero(claveSesion);
      const pregunta = { id: `libre-${clave.slice(0, 12)}`, texto };

      const guardada = await almacen.get(claveCache);
      if (guardada) {
        const enCache = JSON.parse(guardada) as EnCache;
        await contarFrecuente(clave, texto);
        return {
          estado: 'ok',
          pregunta,
          respuestas: enCache.respuestas,
          quedan: Math.max(0, limiteSesion - usadas),
          deCache: true,
        };
      }

      if (usadas >= limiteSesion)
        return {
          estado: 'limite',
          mensaje: `Has llegado al límite de ${limiteSesion} preguntas por sesión. Puedes seguir con las preguntas sugeridas y las frecuentes, ya respondidas.`,
          frecuentes: await listaFrecuentes(),
        };

      // Load texts and pick the candidate pages before spending anything.
      const conTexto = await Promise.all(
        publicados.map(async (partido) => {
          const t = await puertos.textos(partido.id).catch(() => null);
          const vigente = t && t.partido === partido.id && t.hashPdf === partido.programa.hashPdf ? t : null;
          return { partido, texto: vigente };
        }),
      );
      const conCandidatas = conTexto.filter((x) => x.texto && paginasParaResponder(x.texto.paginas, palabras, 1).length > 0).length;
      const claveMes = claveGasto();
      const reserva = conCandidatas * peorCasoPorPartido();
      const gastado = await leerNumero(claveMes);
      if (gastado >= tope || gastado + reserva > tope)
        return {
          estado: 'solo_frecuentes',
          mensaje: 'Hemos llegado al gasto máximo de este mes para preguntas nuevas. Mientras tanto, solo respondemos las preguntas sugeridas y las frecuentes.',
          frecuentes: await listaFrecuentes(),
        };

      await sumarGasto(claveMes, reserva);
      let gastoReal = 0;
      const iaConGasto: AdaptadorIA = {
        completar(p) {
          gastoReal += coste(p.tarea);
          return puertos.ia.completar(p);
        },
      };
      let respuestas: RespuestaPregunta[];
      try {
        respuestas = await Promise.all(
          conTexto.map(async ({ partido, texto: t }): Promise<RespuestaPregunta> => {
            const base = { partido: partido.id, pregunta: pregunta.id, versiones: { prompt: VERSION_PROMPT_PREGUNTA } };
            // No text published for this programme (or a stale one): we cannot check any quote.
            if (!t) return { ...base, estado: 'sin_verificar' };
            const r = await responderPregunta(iaConGasto, { id: pregunta.id, texto, palabrasClave: palabras }, t.paginas, {
              terminos: config.terminos,
              maxPaginas,
            });
            return r.estado === 'responde' ? { ...base, estado: 'responde', texto: r.texto, citas: r.citas } : { ...base, estado: r.estado };
          }),
        );
      } catch {
        return { estado: 'error', mensaje: 'No hemos podido responder ahora. Inténtalo de nuevo en un rato.' };
      } finally {
        await sumarGasto(claveMes, gastoReal - reserva);
      }

      await almacen.put(claveSesion, String(usadas + 1), { expirationTtl: TTL_SESION });
      await almacen.put(claveCache, JSON.stringify({ respuestas } satisfies EnCache), { expirationTtl: TTL_CACHE });
      await contarFrecuente(clave, texto);
      return { estado: 'ok', pregunta, respuestas, quedan: Math.max(0, limiteSesion - usadas - 1), deCache: false };
    },
  };
}

/** In-memory store for tests and local runs; `volcado`/`claves`/`ttl` let tests inspect what is kept. */
export function crearAlmacenEnMemoria() {
  const datos = new Map<string, { valor: string; ttl?: number }>();
  return {
    async get(clave: string) {
      return datos.get(clave)?.valor ?? null;
    },
    async put(clave: string, valor: string, opciones?: { expirationTtl?: number }) {
      datos.set(clave, { valor, ...(opciones?.expirationTtl ? { ttl: opciones.expirationTtl } : {}) });
    },
    claves: () => [...datos.keys()],
    volcado: () => Object.fromEntries([...datos].map(([k, v]) => [k, v.valor])),
    ttl: (clave: string) => datos.get(clave)?.ttl,
  } satisfies Almacen & Record<string, unknown>;
}
