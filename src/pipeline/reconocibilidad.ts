// V11 (AI barrier): a guesser tries to assign every anonymous neutral postura of a topic to a party.
// 3 rounds, each with a different order; a postura guessed 3/3 with mean confidence ≥ 0.7 is recognisable.
// One run judges every postura of the topic at once (the new one and those already published).
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

/**
 * `rondas` orders of `n` items, pairwise different while there are enough permutations
 * (n = 2 only has 2), each an independent shuffle (deterministic by seed).
 */
export function ordenesDistintas(n: number, rondas: number, semilla: string): number[][] {
  const posibles = n < 4 ? [1, 1, 2, 6][n]! : Infinity;
  const indices = Array.from({ length: n }, (_, i) => i);
  const vistas = new Set<string>();
  const ordenes: number[][] = [];
  for (let ronda = 0; ronda < rondas; ronda++) {
    let orden = barajar(indices, `${semilla}:${ronda}`);
    for (let k = 1; vistas.has(orden.join()) && vistas.size < posibles && k < 100; k++) orden = barajar(indices, `${semilla}:${ronda}:${k}`);
    vistas.add(orden.join());
    ordenes.push(orden);
  }
  return ordenes;
}

/** Runs the guesser over every postura of the topic; one verdict per party, in the order given. */
export async function comprobarReconocibilidad(
  ia: AdaptadorIA,
  args: {
    tema: { id: string; titulo: string; pregunta: string };
    posturas: PosturaAnonima[];
    partidos: { id: string; nombre: string; siglas: string }[];
    semilla: string;
  },
): Promise<Map<string, ResultadoReconocibilidad>> {
  const { posturas } = args;
  const aciertos = posturas.map(() => [] as { confianza: number; pista: string }[]);
  for (const orden of ordenesDistintas(posturas.length, RONDAS_ADIVINAR, `${args.semilla}:${args.tema.id}`)) {
    const r = await ia.completar({
      tarea: 'adivinar-partido',
      instrucciones: INSTRUCCIONES_ADIVINAR,
      entrada: {
        tema: args.tema,
        partidos: args.partidos,
        posturas: orden.map((i, posicion) => ({ letra: LETRAS[posicion]!, texto: aTexto(posturas[i]!.texto) })),
      },
      esquema: RespuestaAdivinar,
    });
    orden.forEach((i, posicion) => {
      const a = r.asignaciones.find((x) => x.letra === LETRAS[posicion]);
      if (a && a.partido === posturas[i]!.partido) aciertos[i]!.push({ confianza: a.confianza, pista: a.pista });
    });
  }
  return new Map(
    posturas.map((p, i): [string, ResultadoReconocibilidad] => {
      const lista = aciertos[i]!;
      const media = lista.reduce((s, a) => s + a.confianza, 0) / RONDAS_ADIVINAR;
      const detalle = `acertada ${lista.length} de ${RONDAS_ADIVINAR} veces, confianza media ${media.toFixed(2)}`;
      return [
        p.partido,
        lista.length === RONDAS_ADIVINAR && media >= CONFIANZA_RECONOCIBLE
          ? { reconocible: true, detalle, pistas: [...new Set(lista.map((a) => a.pista))] }
          : { reconocible: false, detalle },
      ];
    }),
  );
}
