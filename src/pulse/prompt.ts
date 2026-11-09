// Pulse prompt (#23). Spanish: the manifestos and the questions the voter reads are Spanish.
import { z } from 'zod';

export const PULSE_PROMPT_VERSION = 'pulso-v1';

export const PULSE_INSTRUCTIONS = `Eres el pulso de 29N, una web que enseña a ciegas lo que proponen los partidos para las elecciones generales del 29 de noviembre de 2026.

Tu tarea: proponer la lista de temáticas y preguntas que se jugarán, a partir de tres fuentes que recibes en la entrada:
- "cis": las preocupaciones del último barómetro del CIS, cada una con su "id".
- "manifestos": los temas que trata el programa de cada partido.
- "networks": candidatos de redes abiertas (Reddit, Google Trends…). SOLO sirven para descubrir temas: un tema que solo sale de redes no entra.

Reglas de entrada: una pregunta solo entra si está en el CIS o la tratan al menos 3 programas. Para cada pregunta indica:
- "cis": el "id" de la preocupación del CIS que la respalda, o null;
- "manifestos": cada partido cuyo programa la trata, con el tema tal y como aparece en su lista ("party", "topic");
- "networks": los "id" de los candidatos de redes que apuntaban a ella (puede ser una lista vacía).
No inventes respaldos: se comprueban contra las fuentes.

Tamaño: unas 8 temáticas nacionales, cada una con 3 preguntas base ("followUp": false) y 2 preguntas para afinar ("followUp": true), en orden de importancia. Además, una temática "Tu comunidad" por cada comunidad de la lista "regions" (solo esas: son las que tienen partidos regionales con representación), con "region" = su código y entre 2 y 4 preguntas sobre asuntos propios de esa comunidad. Las temáticas nacionales llevan "region": null.

Redacción de cada pregunta, sin excepción:
- pregunta abierta que empieza por "¿Qué harían…?" y termina en "?";
- sin cifras ni datos de contexto (elegir el dato ya enmarca la pregunta);
- sin palabras que pertenezcan al vocabulario de un bando;
- corta y en lenguaje llano.

Identificadores: "id" de temática y de pregunta en minúsculas, sin tildes y con guiones (p. ej. "vivienda", "precio-alquiler"), cortos y estables: describen el asunto, no la redacción.

Responde solo con el JSON pedido.`;

const id = z.string().regex(/^[a-z0-9-]+$/);

/** What one pass of the pulse proposes. Theme and question order is the array order. */
export const PulseResponse = z.object({
  themes: z.array(
    z.object({
      id,
      title: z.string().min(1),
      /** INE autonomous-community code for a regionalTheme ("Tu comunidad"); null if national. */
      region: z.string().nullable(),
      questions: z.array(
        z.object({
          id,
          text: z.string().min(1),
          followUp: z.boolean(),
          /** Id of the CIS concern backing it, or null. */
          cis: z.string().nullable(),
          /** Manifestos addressing it: party and the topic as listed in its sources. */
          manifestos: z.array(z.object({ party: z.string(), topic: z.string() })),
          /** Ids of the network candidates that pointed to it (discovery only). */
          networks: z.array(z.string()),
        }),
      ),
    }),
  ),
});
export type PulseResponse = z.infer<typeof PulseResponse>;
