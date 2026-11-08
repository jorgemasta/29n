// AI adapter: every model call goes through this minimal interface
// (structured request with a schema → validated response).
import type { z } from 'zod';

/** What the model is used for; production maps each to a model (see claude.ts). */
export type Tarea =
  | 'extraer-postura'
  | 'neutralizar'
  /** V10: independent check that the neutral text is faithful to the quotes. */
  | 'verificar-fidelidad'
  /** V11: guess which party wrote each anonymous postura of a topic. */
  | 'adivinar-partido'
  /** V12: second, targeted pass before marking "proposes nothing". */
  | 'confirmar-ausencia';

export interface PeticionIA<T> {
  tarea: Tarea;
  /** System-style instructions (versioned prompt text). */
  instrucciones: string;
  /** Structured input; serialised as JSON for the model. Also part of the cache key. */
  entrada: unknown;
  /** Expected output shape; the adapter must return a value that parses. */
  esquema: z.ZodType<T>;
}

export interface AdaptadorIA {
  completar<T>(peticion: PeticionIA<T>): Promise<T>;
}
