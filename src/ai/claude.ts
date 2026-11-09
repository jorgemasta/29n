// Production AI adapter: Claude via the Anthropic SDK, structured outputs validated with zod.
// Not exercised by tests (they use ai/fake.ts). Needs ANTHROPIC_API_KEY (or an `ant auth login`
// profile). Optional AI_GATEWAY_URL routes through Cloudflare AI Gateway:
//   https://gateway.ai.cloudflare.com/v1/<account_id>/<gateway>/anthropic
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { AIAdapter, AIRequest, Task } from './adapter';

/**
 * Model per task (spec: Sonnet to extract and neutralise; Opus for feasibility (V13)).
 * AI checks must run on a different model or instance than the one that generated the
 * content: V10/V11 judge Sonnet's rewrite with Opus; V12 is a fresh call with its own prompt.
 */
export const MODELS: Record<Task, string> = {
  'extract-position': 'claude-sonnet-5-5',
  neutralize: 'claude-sonnet-5-5',
  'verify-fidelity': 'claude-opus-5-5',
  'guess-party': 'claude-opus-5-5',
  'confirm-absence': 'claude-sonnet-5-5',
  'assess-feasibility': 'claude-opus-5-5',
  // Precomputed suggested questions. The live free question uses FREE_QUESTION_MODELS (Haiku 5.5).
  'answer-question': 'claude-sonnet-5-5',
  'settle-approaches': 'claude-opus-5-5',
  // Generates text: a different model from the V10/V11 judges (Opus).
  'rewrite-approach': 'claude-sonnet-5-5',
};

/**
 * Live free question (#15, Cloudflare function): Haiku 5.5 answers (spec); the independent V10
 * check runs on a different model (Sonnet 5.5, low effort), as every AI check must.
 */
export const FREE_QUESTION_MODELS: Partial<Record<Task, { model: string; effort: Effort }>> = {
  'answer-question': { model: 'claude-haiku-5-5', effort: 'low' },
  'verify-fidelity': { model: 'claude-sonnet-5-5', effort: 'low' },
};

type Effort = 'low' | 'medium' | 'high';

export interface ClaudeOptions {
  apiKey?: string;
  /** Cloudflare AI Gateway URL (…/anthropic). Defaults to the AI_GATEWAY_URL env var (Node). */
  baseURL?: string;
  /** Extra headers on every request, e.g. AI Gateway's `cf-aig-collect-log: false`. */
  headers?: Record<string, string>;
  /** Model and effort per task, overriding MODELOS / 'medium'. */
  models?: Partial<Record<Task, { model: string; effort: Effort }>>;
  maxTokens?: number;
}

export function createClaudeAI(options: ClaudeOptions = {}): AIAdapter {
  // `process` does not exist in a Worker without nodejs_compat: the function passes everything explicitly.
  const baseURL = options.baseURL ?? (typeof process !== 'undefined' ? process.env.AI_GATEWAY_URL : undefined);
  const client = new Anthropic({
    ...(options.apiKey ? { apiKey: options.apiKey } : {}),
    ...(baseURL ? { baseURL } : {}),
    ...(options.headers ? { defaultHeaders: options.headers } : {}),
  });

  return {
    async complete<T>(p: AIRequest<T>): Promise<T> {
      const answer = await client.messages.parse({
        model: options.models?.[p.task]?.model ?? MODELS[p.task],
        max_tokens: options.maxTokens ?? 16000,
        // Deterministic-ish and cheap: these are extraction/rewrite tasks.
        output_config: { effort: options.models?.[p.task]?.effort ?? 'medium', format: zodOutputFormat(p.schema as any) },
        system: p.instructions,
        messages: [{ role: 'user', content: JSON.stringify(p.input) }],
      });
      if (answer.stop_reason === 'refusal') throw new Error(`Claude rechazó la tarea ${p.task}`);
      if (answer.parsed_output == null) throw new Error(`Respuesta sin salida estructurada válida (${p.task}, ${answer.stop_reason})`);
      // Re-validate with our schema (refinements the JSON Schema can't express).
      return p.schema.parse(answer.parsed_output);
    },
  };
}
