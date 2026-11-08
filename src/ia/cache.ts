// AI response cache: keyed by PDF hash + prompt version + task + input, so re-running
// the pipeline on the same PDF gives the same result (and costs nothing).
import { createHash } from 'node:crypto';
import type { AdaptadorIA, PeticionIA } from './adaptador';

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

/** Wraps an adapter so answers are read from / written to the cache. */
export function conCache(ia: AdaptadorIA, almacen: AlmacenCache, contexto: { hashPdf: string; versionPrompt: string }): AdaptadorIA {
  return {
    async completar<T>(p: PeticionIA<T>): Promise<T> {
      const clave = claveCache({ ...contexto, tarea: p.tarea, instrucciones: p.instrucciones, entrada: p.entrada });
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
