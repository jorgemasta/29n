// Real ports for comprobarApuestas: Umami's REST API (read-only, aggregated counts) and the `gh` CLI.
// Both take their transport as a parameter so tests run them against fakes.
import { ETIQUETA, type ConteoApuestas, type IssueNuevo, type PuertosApuestas } from './index';

export interface ConfigUmami {
  /** Umami Cloud: https://api.umami.is/v1 (self-hosted: https://<host>/api). */
  base: string;
  apiKey: string;
  websiteId: string;
  /** Days counted back from `ahora`. */
  dias: number;
  ahora: () => number;
  pedir: (url: string, init: { headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
}

const EVENTO = { aciertos: 'apuesta-acierto', fallos: 'apuesta-fallo' } as const;

/**
 * Per-topic counts from the event-data "values" endpoint: for one event name, how many times each
 * value of the `tema` property was sent. `event` is the current parameter name; `eventName` is
 * also sent for older Umami versions (unknown parameters are ignored).
 */
export function crearContadorUmami(c: ConfigUmami): PuertosApuestas['contarApuestas'] {
  return async () => {
    const endAt = c.ahora();
    const startAt = endAt - c.dias * 24 * 3600 * 1000;
    const conteos: Record<string, ConteoApuestas> = {};
    for (const [campo, evento] of Object.entries(EVENTO) as [keyof ConteoApuestas, string][]) {
      const q = new URLSearchParams({ startAt: String(startAt), endAt: String(endAt), event: evento, eventName: evento, propertyName: 'tema' });
      const url = `${c.base.replace(/\/$/, '')}/websites/${encodeURIComponent(c.websiteId)}/event-data/values?${q}`;
      const r = await c.pedir(url, { headers: { 'x-umami-api-key': c.apiKey, accept: 'application/json' } });
      if (!r.ok) throw new Error(`Umami API ${r.status} (${evento})`);
      const filas = await r.json();
      if (!Array.isArray(filas)) throw new Error(`Umami API: respuesta inesperada (${evento})`);
      for (const f of filas as { value?: unknown; total?: unknown }[]) {
        if (typeof f.value !== 'string' || typeof f.total !== 'number') continue;
        conteos[f.value] ??= { aciertos: 0, fallos: 0 };
        conteos[f.value]![campo] += f.total;
      }
    }
    return conteos;
  };
}

/** `ejecutar(args)` runs `gh <args>` and returns stdout. */
export function crearPuertosGitHub(ejecutar: (args: string[]) => string): Pick<PuertosApuestas, 'issuesAbiertos' | 'abrirIssue'> {
  let etiquetaLista = false;
  return {
    issuesAbiertos: async () => {
      const salida = ejecutar(['issue', 'list', '--label', ETIQUETA, '--state', 'open', '--limit', '500', '--json', 'title']);
      return (JSON.parse(salida) as { title: string }[]).map((i) => i.title);
    },
    abrirIssue: async (i: IssueNuevo) => {
      if (!etiquetaLista) {
        // `gh issue create --label` fails if the label does not exist; --force makes this idempotent.
        ejecutar(['label', 'create', ETIQUETA, '--color', 'D93F0B', '--description', 'Tema demasiado reconocible: volver a neutralizar', '--force']);
        etiquetaLista = true;
      }
      ejecutar(['issue', 'create', '--title', i.titulo, '--body', i.cuerpo, ...i.etiquetas.flatMap((e) => ['--label', e])]);
    },
  };
}
