// Production AI adapter: Claude via the Anthropic SDK, structured outputs validated with zod.
// Not exercised by tests (they use ia/falsa.ts). Needs ANTHROPIC_API_KEY (or an `ant auth login`
// profile). Optional AI_GATEWAY_URL routes through Cloudflare AI Gateway:
//   https://gateway.ai.cloudflare.com/v1/<account_id>/<gateway>/anthropic
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { AdaptadorIA, PeticionIA, Tarea } from './adaptador';

/**
 * Model per task (spec: Sonnet to extract and neutralise; Opus for feasibility (V13)).
 * AI barriers must run on a different model or instance than the one that generated the
 * content: V10/V11 judge Sonnet's rewrite with Opus; V12 is a fresh call with its own prompt.
 */
export const MODELOS: Record<Tarea, string> = {
  'extraer-postura': 'claude-sonnet-5-5',
  neutralizar: 'claude-sonnet-5-5',
  'verificar-fidelidad': 'claude-opus-5-5',
  'adivinar-partido': 'claude-opus-5-5',
  'confirmar-ausencia': 'claude-sonnet-5-5',
  'evaluar-viabilidad': 'claude-opus-5-5',
  // Precomputed suggested questions. The live free question uses MODELOS_PREGUNTA_LIBRE (Haiku 5.5).
  'responder-pregunta': 'claude-sonnet-5-5',
};

/**
 * Live free question (#15, Cloudflare function): Haiku 5.5 answers (spec); the independent V10
 * check runs on a different model (Sonnet 5.5, low effort), as every AI barrier must.
 */
export const MODELOS_PREGUNTA_LIBRE: Partial<Record<Tarea, { modelo: string; esfuerzo: Esfuerzo }>> = {
  'responder-pregunta': { modelo: 'claude-haiku-5-5', esfuerzo: 'low' },
  'verificar-fidelidad': { modelo: 'claude-sonnet-5-5', esfuerzo: 'low' },
};

type Esfuerzo = 'low' | 'medium' | 'high';

export interface OpcionesClaude {
  apiKey?: string;
  /** Cloudflare AI Gateway URL (…/anthropic). Defaults to the AI_GATEWAY_URL env var (Node). */
  baseURL?: string;
  /** Extra headers on every request, e.g. AI Gateway's `cf-aig-collect-log: false`. */
  cabeceras?: Record<string, string>;
  /** Model and effort per task, overriding MODELOS / 'medium'. */
  modelos?: Partial<Record<Tarea, { modelo: string; esfuerzo: Esfuerzo }>>;
  maxTokens?: number;
}

export function crearIAClaude(opciones: OpcionesClaude = {}): AdaptadorIA {
  // `process` does not exist in a Worker without nodejs_compat: the function passes everything explicitly.
  const baseURL = opciones.baseURL ?? (typeof process !== 'undefined' ? process.env.AI_GATEWAY_URL : undefined);
  const client = new Anthropic({
    ...(opciones.apiKey ? { apiKey: opciones.apiKey } : {}),
    ...(baseURL ? { baseURL } : {}),
    ...(opciones.cabeceras ? { defaultHeaders: opciones.cabeceras } : {}),
  });

  return {
    async completar<T>(p: PeticionIA<T>): Promise<T> {
      const respuesta = await client.messages.parse({
        model: opciones.modelos?.[p.tarea]?.modelo ?? MODELOS[p.tarea],
        max_tokens: opciones.maxTokens ?? 16000,
        // Deterministic-ish and cheap: these are extraction/rewrite tasks.
        output_config: { effort: opciones.modelos?.[p.tarea]?.esfuerzo ?? 'medium', format: zodOutputFormat(p.esquema as any) },
        system: p.instrucciones,
        messages: [{ role: 'user', content: JSON.stringify(p.entrada) }],
      });
      if (respuesta.stop_reason === 'refusal') throw new Error(`Claude rechazó la tarea ${p.tarea}`);
      if (respuesta.parsed_output == null) throw new Error(`Respuesta sin salida estructurada válida (${p.tarea}, ${respuesta.stop_reason})`);
      // Re-validate with our schema (refinements the JSON Schema can't express).
      return p.esquema.parse(respuesta.parsed_output);
    },
  };
}
