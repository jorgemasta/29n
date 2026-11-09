// Fake AI adapter for tests and scripted runs: canned answers per task.
import type { AIAdapter, AIRequest, Task } from './adapter';

/** `attempt` counts previous calls for the same task with the same topic or question (0 = first). */
export type FakeResponse = (input: any, attempt: number) => unknown;
/** Canned answer per task; calling a task without one throws. */
export type FakeResponses = Partial<Record<Task, FakeResponse>>;

export interface AICall {
  task: Task;
  instructions: string;
  input: unknown;
}

export function createFakeAI(answers: FakeResponses): AIAdapter & { calls: AICall[] } {
  const calls: AICall[] = [];
  return {
    calls,
    async complete<T>(p: AIRequest<T>): Promise<T> {
      type Input = { topic?: { id?: string }; question?: { id?: string } };
      const key = (e: unknown) => (e as Input)?.topic?.id ?? (e as Input)?.question?.id;
      const topic = key(p.input);
      const attempt = calls.filter((l) => l.task === p.task && key(l.input) === topic).length;
      calls.push({ task: p.task, instructions: p.instructions, input: structuredClone(p.input) });
      // Validate like the real adapter, so canned answers can't drift from the schema.
      const answer = answers[p.task];
      if (!answer) throw new Error(`fake AI: no canned answer for task ${p.task}`);
      return p.schema.parse(answer(p.input, attempt));
    },
  };
}
