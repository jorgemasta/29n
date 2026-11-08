// V11 (AI barrier): a guesser tries to assign the anonymous neutral posturas of a topic to parties.
// 3 rounds with different orders; a postura guessed 3/3 with mean confidence ≥ 0.7 is recognisable.
import { z } from 'zod';
import type { TextoNeutral } from '../dataset/esquema';
import type { AdaptadorIA } from '../ia/adaptador';
import { barajar } from '../juego/azar';

export const RONDAS_ADIVINAR = 3;
export const CONFIANZA_RECONOCIBLE = 0.7;

export const INSTRUCCIONES_ADIVINAR = `Eres un analista político que intenta adivinar de qué partido es cada propuesta.
Recibes un tema, la lista de partidos y varias propuestas anónimas identificadas por una letra.
Para cada letra, di qué partido crees que la escribió, tu confianza (0 a 1) y, en "pista",
qué rasgo concreto del texto te lo ha indicado (una palabra, un enfoque, una cifra…).`;

export const RespuestaAdivinar = z.object({
  asignaciones: z.array(
    z.object({ letra: z.string(), partido: z.string(), confianza: z.number().min(0).max(1), pista: z.string() }),
  ),
});

export interface PosturaAnonima {
  partido: string;
  texto: TextoNeutral;
}

export type ResultadoReconocibilidad =
  | { reconocible: false; detalle: string }
  | { reconocible: true; detalle: string; pistas: string[] };

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const aTexto = (t: TextoNeutral) => [t.que, t.como, t.cifra ? `Cifra: ${t.cifra}.` : ''].filter(Boolean).join(' ');

/** Checks whether `propia` (the postura of `partido`) is recognisable among all the topic's posturas. */
export async function comprobarReconocibilidad(
  ia: AdaptadorIA,
  args: {
    tema: { id: string; titulo: string; pregunta: string };
    partido: string;
    propia: TextoNeutral;
    otras: PosturaAnonima[];
    partidos: { id: string; nombre: string; siglas: string }[];
    semilla: string;
  },
): Promise<ResultadoReconocibilidad> {
  const todas: PosturaAnonima[] = [{ partido: args.partido, texto: args.propia }, ...args.otras];
  // One random order, then rotations of it: the rounds always see different orders.
  const base = barajar(todas, `${args.semilla}:${args.tema.id}`);
  const aciertos: { confianza: number; pista: string }[] = [];
  for (let ronda = 0; ronda < RONDAS_ADIVINAR; ronda++) {
    const desplazamiento = ronda % base.length;
    const orden = [...base.slice(desplazamiento), ...base.slice(0, desplazamiento)];
    const letraPropia = LETRAS[orden.findIndex((p) => p.partido === args.partido && p.texto === args.propia)]!;
    const r = await ia.completar({
      tarea: 'adivinar-partido',
      instrucciones: INSTRUCCIONES_ADIVINAR,
      entrada: {
        tema: args.tema,
        partidos: args.partidos,
        posturas: orden.map((p, i) => ({ letra: LETRAS[i]!, texto: aTexto(p.texto) })),
      },
      esquema: RespuestaAdivinar,
    });
    const a = r.asignaciones.find((x) => x.letra === letraPropia);
    if (a && a.partido === args.partido) aciertos.push({ confianza: a.confianza, pista: a.pista });
  }
  const media = aciertos.reduce((s, a) => s + a.confianza, 0) / RONDAS_ADIVINAR;
  const detalle = `acertada ${aciertos.length} de ${RONDAS_ADIVINAR} veces, confianza media ${media.toFixed(2)}`;
  if (aciertos.length === RONDAS_ADIVINAR && media >= CONFIANZA_RECONOCIBLE)
    return { reconocible: true, detalle, pistas: [...new Set(aciertos.map((a) => a.pista))] };
  return { reconocible: false, detalle };
}
