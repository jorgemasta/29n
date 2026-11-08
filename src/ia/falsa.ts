// Fake AI adapter for tests and scripted runs: canned answers per task.
import type { AdaptadorIA, PeticionIA, Tarea } from './adaptador';

/** `intento` counts previous calls for the same task with the same tema or pregunta (0 = first). */
export type RespuestaFalsa = (entrada: any, intento: number) => unknown;
export type RespuestasFalsas = Record<Tarea, RespuestaFalsa>;

export interface LlamadaIA {
  tarea: Tarea;
  instrucciones: string;
  entrada: unknown;
}

export function crearIAFalsa(respuestas: RespuestasFalsas): AdaptadorIA & { llamadas: LlamadaIA[] } {
  const llamadas: LlamadaIA[] = [];
  return {
    llamadas,
    async completar<T>(p: PeticionIA<T>): Promise<T> {
      type Entrada = { tema?: { id?: string }; pregunta?: { id?: string } };
      const clave = (e: unknown) => (e as Entrada)?.tema?.id ?? (e as Entrada)?.pregunta?.id;
      const tema = clave(p.entrada);
      const intento = llamadas.filter((l) => l.tarea === p.tarea && clave(l.entrada) === tema).length;
      llamadas.push({ tarea: p.tarea, instrucciones: p.instrucciones, entrada: structuredClone(p.entrada) });
      // Validate like the real adapter, so canned answers can't drift from the schema.
      return p.esquema.parse(respuestas[p.tarea](p.entrada, intento));
    },
  };
}
