// Prompt and response shape of `settle-approaches` (settleApproaches, #20). Prompt text is Spanish
// because the manifestos are.
import { z } from 'zod';

export const SETTLE_PROMPT_VERSION = 'enfoques-v2';

export const SETTLE_INSTRUCTIONS = `Recibes una pregunta de unas elecciones generales y, para cada partido que propone algo sobre ella, las citas literales de su programa ("quotes") y, si la hay, su propuesta concreta resumida ("proposal": qué, cómo y cifra exacta), sacada de esas mismas citas.

Agrupa las propuestas en exactamente 3 enfoques. Un enfoque es una forma de abordar el problema que pueden defender uno o varios partidos.
- Redacta cada enfoque con la plantilla: "what" (qué se propone), "how" (cómo) y "figure" (una cifra redondeada a un orden de magnitud común, por ejemplo "decenas de miles de viviendas", o null). Nunca copies la cifra exacta de un partido ni uses nombres, siglas, líderes o lemas de partidos. Los 3 enfoques deben tener una redacción y una longitud parecidas.
- Para cada partido y enfoque indica su nivel: "full" si lo defiende de lleno, "partial" si lo defiende en parte. Si no lo defiende, no lo pongas. Todo nivel lleva "quote": una de las citas de ese partido, copiada literalmente.
- Un partido que no encaja en ningún enfoque no aparece en ninguno: se mostrará como "propone otra cosa".
- Si las propuestas no dan para 3 enfoques distintos, completa hasta 3 con enfoques inventados verosímiles, marcados con "filler": true y sin ningún partido.
- Si recibes "frozenApproaches", los enfoques ya están fijados: devuelve esos mismos 3, en el mismo orden y con el mismo texto, y solo clasifica a los partidos.
Básate solo en las citas y en "proposal": no uses lo que sepas de los partidos. La cita de cada nivel sale siempre de "quotes", nunca de "proposal".`;

const PassStance = z.object({ party: z.string(), stance: z.enum(['full', 'partial']), quote: z.string() });

/** One pass. Deliberately lenient (any number of approaches): settleApproaches validates it. */
export const SettleResponse = z.object({
  approaches: z.array(
    z.object({
      what: z.string(),
      how: z.string(),
      figure: z.string().nullable(),
      filler: z.boolean(),
      stances: z.array(PassStance),
    }),
  ),
});
export type SettleResponse = z.infer<typeof SettleResponse>;
