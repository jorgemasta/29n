// Prompts and response shapes of the approach checks (#22): V10 fidelity, V11 guesser and the
// rewrite of an approach that fails a check. Prompt text is Spanish because the manifestos are.
import { z } from 'zod';

export const APPROACH_FIDELITY_INSTRUCTIONS = `Eres un verificador independiente. No escribiste el texto que vas a revisar.
Recibes una pregunta de unas elecciones generales, un enfoque (what, how, figure) que resume una forma de abordarla y las citas literales de los programas de los partidos que defienden ese enfoque de lleno.
El enfoque es común a todos esos partidos: no tiene que recoger el detalle de cada uno, y sus cifras van redondeadas a un orden de magnitud.
Responde con sí o no a cada pregunta:
- adds: ¿el enfoque añade algo que NO está en ninguna cita (un instrumento, un plazo, un colectivo, una cifra)?
- omits: ¿el enfoque omite una condición esencial que comparten las citas?
- changesMeaning: ¿el enfoque cambia el sentido de lo que proponen las citas?
En "explanation", di en una o dos frases qué falla exactamente (o "Fiel a las citas." si nada falla).`;

export const APPROACH_GUESS_INSTRUCTIONS = `Eres un analista político que intenta adivinar qué partido defiende cada enfoque.
Recibes una pregunta de unas elecciones generales, la lista de partidos que proponen algo sobre ella y 3 enfoques anónimos identificados por una letra.
Para cada letra, di el partido (su "id") que crees que con más probabilidad lo defiende y, en "hint",
qué rasgo concreto del texto te lo ha indicado (una palabra, un instrumento, una cifra…).`;

export const GuessApproachResponse = z.object({
  assignments: z.array(z.object({ letter: z.string(), party: z.string(), hint: z.string() })),
});

export const REWRITE_APPROACH_INSTRUCTIONS = `Reescribes un enfoque de una pregunta de unas elecciones generales que no ha pasado las comprobaciones de calidad.
Recibes la pregunta, el enfoque (what: qué se propone; how: cómo; figure: una cifra redondeada a un orden de magnitud común, o null), las citas literales de los partidos que lo defienden y la lista de "fixes": lo que hay que corregir.
Corrige todo lo que piden los "fixes" y no cambies nada más del sentido del enfoque.
- No uses nombres, siglas, líderes, lemas ni rasgos que delaten a un partido.
- Ninguna cifra exacta de un partido: redondéala a un orden de magnitud compatible con las de las citas (por ejemplo, "decenas de miles de viviendas").
- Rellena siempre "what" y "how". Básate solo en las citas.
Si "filler" es true, el enfoque no lo defiende ningún partido: no lleva cifras.`;

export const RewriteApproachResponse = z.object({ what: z.string(), how: z.string(), figure: z.string().nullable() });
