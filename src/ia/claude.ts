// Production AI adapter: Claude via the Anthropic SDK, structured outputs validated with zod.
// Not exercised by tests (they use ia/falsa.ts). Needs ANTHROPIC_API_KEY (or an `ant auth login`
// profile). Optional AI_GATEWAY_URL routes through Cloudflare AI Gateway:
//   https://gateway.ai.cloudflare.com/v1/<account_id>/<gateway>/anthropic
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { AdaptadorIA, PeticionIA, Tarea } from './adaptador';

/** Model per task (spec: Sonnet to extract and neutralise; Opus for feasibility (V13)). */
export const MODELOS: Record<Tarea, string> = {
  'extraer-postura': 'claude-sonnet-5-5',
  neutralizar: 'claude-sonnet-5-5',
  'evaluar-viabilidad': 'claude-opus-5-5',
};

export function crearIAClaude(opciones: { apiKey?: string; baseURL?: string } = {}): AdaptadorIA {
  const baseURL = opciones.baseURL ?? process.env.AI_GATEWAY_URL;
  const client = new Anthropic({ ...(opciones.apiKey ? { apiKey: opciones.apiKey } : {}), ...(baseURL ? { baseURL } : {}) });

  return {
    async completar<T>(p: PeticionIA<T>): Promise<T> {
      const respuesta = await client.messages.parse({
        model: MODELOS[p.tarea],
        max_tokens: 16000,
        // Deterministic-ish and cheap: these are extraction/rewrite tasks.
        output_config: { effort: 'medium', format: zodOutputFormat(p.esquema as any) },
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
