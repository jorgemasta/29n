// V10 (AI barrier): an independent verifier checks that the neutral text is faithful to the quotes.
import { z } from 'zod';
import type { Cita, TextoNeutral } from '../dataset/esquema';
import type { AdaptadorIA } from '../ia/adaptador';

export const INSTRUCCIONES_FIDELIDAD = `Eres un verificador independiente. No escribiste el texto que vas a revisar.
Recibes las citas literales de un programa electoral y un texto neutralizado (que, como, cifra) que las resume.
Responde con sí o no a cada pregunta:
- anade: ¿el texto añade algo que NO está en las citas (una cifra, un plazo, un instrumento, un colectivo)?
- omite: ¿el texto omite una condición o un matiz esencial de las citas?
- cambiaSentido: ¿el texto cambia el sentido de la propuesta?
En "explicacion", di en una o dos frases qué falla exactamente (o "Fiel a la cita." si nada falla).`;

export const RespuestaFidelidad = z.object({
  anade: z.boolean(),
  omite: z.boolean(),
  cambiaSentido: z.boolean(),
  explicacion: z.string(),
});

export type ResultadoFidelidad = { fiel: true } | { fiel: false; motivo: string };

export async function verificarFidelidad(
  ia: AdaptadorIA,
  tema: { id: string; titulo: string; pregunta: string },
  citas: Cita[],
  texto: TextoNeutral,
): Promise<ResultadoFidelidad> {
  const r = await ia.completar({
    tarea: 'verificar-fidelidad',
    instrucciones: INSTRUCCIONES_FIDELIDAD,
    entrada: { tema, citas, texto },
    esquema: RespuestaFidelidad,
  });
  const fallos = [r.anade && 'añade algo', r.omite && 'omite una condición esencial', r.cambiaSentido && 'cambia el sentido'].filter(Boolean);
  return fallos.length === 0 ? { fiel: true } : { fiel: false, motivo: `${fallos.join(', ')}: ${r.explicacion}` };
}
