// V11 (AI check): a guesser tries to assign every anonymous neutral position of a topic to a party.
// 3 rounds, each with a different order; a position guessed 3/3 with mean confidence ≥ 0.7 is recognisable.
// One run judges every position of the topic at once (the new one and those already published).
import { z } from 'zod';
import type { NeutralText } from '../dataset/schema';
import type { AIAdapter } from '../ai/adapter';
import { shuffle } from '../game/random';

export const GUESS_ROUNDS = 3;
export const RECOGNIZABLE_CONFIDENCE = 0.7;

export const GUESS_INSTRUCTIONS = `Eres un analista político que intenta adivinar de qué partido es cada propuesta.
Recibes un tema, la lista de partidos y varias propuestas anónimas identificadas por una letra.
Para cada letra, di qué partido crees que la escribió, tu confianza (0 a 1) y, en "hint",
qué rasgo concreto del texto te lo ha indicado (una palabra, un enfoque, una cifra…).`;

export const GuessResponse = z.object({
  assignments: z.array(
    z.object({ letter: z.string(), party: z.string(), confidence: z.number().min(0).max(1), hint: z.string() }),
  ),
});

export interface AnonymousPosition {
  party: string;
  text: NeutralText;
}

export type RecognizabilityResult =
  | { recognizable: false; detail: string }
  | { recognizable: true; detail: string; hints: string[] };

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const toText = (t: NeutralText) => [t.what, t.how, t.figure ? `Cifra: ${t.figure}.` : ''].filter(Boolean).join(' ');

/**
 * `rounds` orders of `n` items, pairwise different while there are enough permutations
 * (n = 2 only has 2), each an independent shuffle (deterministic by seed).
 */
export function distinctOrders(n: number, rounds: number, seed: string): number[][] {
  const possible = n < 4 ? [1, 1, 2, 6][n]! : Infinity;
  const indices = Array.from({ length: n }, (_, i) => i);
  const seen = new Set<string>();
  const orders: number[][] = [];
  for (let round = 0; round < rounds; round++) {
    let order = shuffle(indices, `${seed}:${round}`);
    for (let k = 1; seen.has(order.join()) && seen.size < possible && k < 100; k++) order = shuffle(indices, `${seed}:${round}:${k}`);
    seen.add(order.join());
    orders.push(order);
  }
  return orders;
}

/** Runs the guesser over every position of the topic; one verdict per party, in the order given. */
export async function checkRecognizability(
  ai: AIAdapter,
  args: {
    topic: { id: string; title: string; question: string };
    positions: AnonymousPosition[];
    parties: { id: string; name: string; acronym: string }[];
    seed: string;
  },
): Promise<Map<string, RecognizabilityResult>> {
  const { positions } = args;
  const hits = positions.map(() => [] as { confidence: number; hint: string }[]);
  for (const order of distinctOrders(positions.length, GUESS_ROUNDS, `${args.seed}:${args.topic.id}`)) {
    const r = await ai.complete({
      task: 'guess-party',
      instructions: GUESS_INSTRUCTIONS,
      input: {
        topic: args.topic,
        parties: args.parties,
        positions: order.map((i, slot) => ({ letter: LETTERS[slot]!, text: toText(positions[i]!.text) })),
      },
      schema: GuessResponse,
    });
    order.forEach((i, slot) => {
      const a = r.assignments.find((x) => x.letter === LETTERS[slot]);
      if (a && a.party === positions[i]!.party) hits[i]!.push({ confidence: a.confidence, hint: a.hint });
    });
  }
  return new Map(
    positions.map((p, i): [string, RecognizabilityResult] => {
      const list = hits[i]!;
      const mean = list.reduce((s, a) => s + a.confidence, 0) / GUESS_ROUNDS;
      const detail = `acertada ${list.length} de ${GUESS_ROUNDS} veces, confianza media ${mean.toFixed(2)}`;
      return [
        p.party,
        list.length === GUESS_ROUNDS && mean >= RECOGNIZABLE_CONFIDENCE
          ? { recognizable: true, detail, hints: [...new Set(list.map((a) => a.hint))] }
          : { recognizable: false, detail },
      ];
    }),
  );
}
