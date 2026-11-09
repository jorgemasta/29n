// V10 (AI check): an independent verifier checks that the neutral text is faithful to the quotes.
import { z } from 'zod';
import type { Quote, NeutralText } from '../dataset/schema';
import type { AIAdapter } from '../ai/adapter';

export const FIDELITY_INSTRUCTIONS = `Eres un verificador independiente. No escribiste el texto que vas a revisar.
Recibes las citas literales de un programa electoral y un texto neutralizado (what, how, figure) que las resume.
Responde con sí o no a cada pregunta:
- adds: ¿el texto añade algo que NO está en las citas (una cifra, un plazo, un instrumento, un colectivo)?
- omits: ¿el texto omite una condición o un matiz esencial de las citas?
- changesMeaning: ¿el texto cambia el sentido de la propuesta?
En "explanation", di en una o dos frases qué falla exactamente (o "Fiel a la cita." si nada falla).`;

export const FidelityResponse = z.object({
  adds: z.boolean(),
  omits: z.boolean(),
  changesMeaning: z.boolean(),
  explanation: z.string(),
});

export type FidelityResult = { faithful: true } | { faithful: false; reason: string };

export async function verifyFidelity(
  ai: AIAdapter,
  topic: { id: string; title: string; question: string },
  quotes: Quote[],
  text: NeutralText,
): Promise<FidelityResult> {
  const r = await ai.complete({
    task: 'verify-fidelity',
    instructions: FIDELITY_INSTRUCTIONS,
    input: { topic, quotes, text },
    schema: FidelityResponse,
  });
  const failures = [r.adds && 'añade algo', r.omits && 'omite una condición esencial', r.changesMeaning && 'cambia el sentido'].filter(Boolean);
  return failures.length === 0 ? { faithful: true } : { faithful: false, reason: `${failures.join(', ')}: ${r.explanation}` };
}
