// AI adapter: every model call goes through this minimal interface
// (structured request with a schema → validated response).
import type { z } from 'zod';

/** What the model is used for; production maps each to a model (see claude.ts). */
export type Task =
  | 'extract-position'
  | 'neutralize'
  /** V10: independent check that the neutral text is faithful to the quotes. */
  | 'verify-fidelity'
  /** V11: guess which party wrote each anonymous position of a topic. */
  | 'guess-party'
  /** V12: second, targeted pass before marking "proposes nothing". */
  | 'confirm-absence'
  /** V13: blind feasibility evaluation with the public rubric (run twice, independently). */
  | 'assess-feasibility'
  /** Answer a voter's question from one programme, with literal quotes (Preguntar). */
  | 'answer-question'
  /** Group every party's position on a question into 3 approaches (run twice, independently). */
  | 'settle-approaches'
  /** Rewrite an approach that failed a check (V3, V4, V5, V6, V10, V11), with what to fix. */
  | 'rewrite-approach';

export interface AIRequest<T> {
  task: Task;
  /** System-style instructions (versioned prompt text). */
  instructions: string;
  /** Structured input; serialised as JSON for the model. Also part of the cache key. */
  input: unknown;
  /** Expected output shape; the adapter must return a value that parses. */
  schema: z.ZodType<T>;
}

export interface AIAdapter {
  complete<T>(request: AIRequest<T>): Promise<T>;
}
