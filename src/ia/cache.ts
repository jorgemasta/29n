// AI response cache: keyed by PDF hash + prompt version + task + input, so re-running
// the pipeline on the same PDF gives the same result (and costs nothing).
// The feasibility note (V13) and its source checks (V8) are keyed WITHOUT the PDF hash: they only
// see the neutral text and the quotes, so an unchanged text keeps its note even in a new PDF.
import { createHash } from 'node:crypto';
import type { AdaptadorIA, PeticionIA, Tarea } from './adaptador';

export interface AlmacenCache {
  leer(clave: string): Promise<unknown | undefined>;
  guardar(clave: string, valor: unknown): Promise<void>;
}

export function crearCacheEnMemoria(): AlmacenCache {
  const datos = new Map<string, string>();
  return {
    async leer(clave) {
      const v = datos.get(clave);
      return v === undefined ? undefined : JSON.parse(v);
    },
    async guardar(clave, valor) {
      datos.set(clave, JSON.stringify(valor));
    },
  };
}

export function claveCache(partes: { hashPdf: string; versionPrompt: string; tarea: string; instrucciones: string; entrada: unknown }): string {
  return createHash('sha256').update(JSON.stringify(partes)).digest('hex');
}

/** Tasks whose answer depends only on their input, never on which PDF it came from. */
const INDEPENDIENTES_DEL_PDF: ReadonlySet<Tarea> = new Set(['evaluar-viabilidad']);

/** Wraps an adapter so answers are read from / written to the cache. */
export function conCache(ia: AdaptadorIA, almacen: AlmacenCache, contexto: { hashPdf: string; versionPrompt: string }): AdaptadorIA {
  return {
    async completar<T>(p: PeticionIA<T>): Promise<T> {
      const hashPdf = INDEPENDIENTES_DEL_PDF.has(p.tarea) ? '' : contexto.hashPdf;
      const clave = claveCache({ ...contexto, hashPdf, tarea: p.tarea, instrucciones: p.instrucciones, entrada: p.entrada });
      const guardado = await almacen.leer(clave);
      if (guardado !== undefined) {
        const r = p.esquema.safeParse(guardado);
        if (r.success) return r.data;
      }
      const respuesta = await ia.completar(p);
      await almacen.guardar(clave, respuesta);
      return respuesta;
    },
  };
}

/**
 * Wraps a yes/no check (V8's HTTP 200) so its answer is cached alongside the AI answers:
 * re-running the same PDF (even offline) keeps the same sources.
 */
export function comprobacionConCache(
  comprobar: (url: string) => Promise<boolean>,
  almacen: AlmacenCache,
  contexto: { hashPdf: string; versionPrompt: string },
): (url: string) => Promise<boolean> {
  return async (url) => {
    const clave = claveCache({ ...contexto, hashPdf: '', tarea: 'comprobar-url', instrucciones: '', entrada: url });
    const guardado = await almacen.leer(clave);
    if (typeof guardado === 'boolean') return guardado;
    const respuesta = await comprobar(url);
    await almacen.guardar(clave, respuesta);
    return respuesta;
  };
}
