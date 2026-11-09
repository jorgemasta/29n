// AI response cache: keyed by PDF hash + prompt version + task + input, so re-running
// the pipeline on the same PDF gives the same result (and costs nothing).
// The feasibility note (V13) and its source checks (V8) are keyed WITHOUT the PDF hash: they only
// see the neutral text and the quotes, so an unchanged text keeps its note even in a new PDF.
import { createHash } from 'node:crypto';
import type { AIAdapter, AIRequest, Task } from './adapter';

export interface CacheStore {
  read(key: string): Promise<unknown | undefined>;
  save(key: string, value: unknown): Promise<void>;
}

export function createMemoryCache(): CacheStore {
  const data = new Map<string, string>();
  return {
    async read(key) {
      const v = data.get(key);
      return v === undefined ? undefined : JSON.parse(v);
    },
    async save(key, value) {
      data.set(key, JSON.stringify(value));
    },
  };
}

export function cacheKey(parts: { hashPdf: string; promptVersion: string; task: string; instructions: string; input: unknown }): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

/** Tasks whose answer depends only on their input, never on which PDF it came from. */
const PDF_INDEPENDENT: ReadonlySet<Task> = new Set(['assess-feasibility']);

/** Wraps an adapter so answers are read from / written to the cache. */
export function withCache(ai: AIAdapter, store: CacheStore, context: { hashPdf: string; promptVersion: string }): AIAdapter {
  return {
    async complete<T>(p: AIRequest<T>): Promise<T> {
      const hashPdf = PDF_INDEPENDENT.has(p.task) ? '' : context.hashPdf;
      const key = cacheKey({ ...context, hashPdf, task: p.task, instructions: p.instructions, input: p.input });
      const saved = await store.read(key);
      if (saved !== undefined) {
        const r = p.schema.safeParse(saved);
        if (r.success) return r.data;
      }
      const answer = await ai.complete(p);
      await store.save(key, answer);
      return answer;
    },
  };
}

/**
 * Wraps a yes/no check (V8's HTTP 200) so its answer is cached alongside the AI answers:
 * re-running the same PDF (even offline) keeps the same sources.
 */
export function cachedCheck(
  check: (url: string) => Promise<boolean>,
  store: CacheStore,
  context: { hashPdf: string; promptVersion: string },
): (url: string) => Promise<boolean> {
  return async (url) => {
    const key = cacheKey({ ...context, hashPdf: '', task: 'check-url', instructions: '', input: url });
    const saved = await store.read(key);
    if (typeof saved === 'boolean') return saved;
    const answer = await check(url);
    await store.save(key, answer);
    return answer;
  };
}
