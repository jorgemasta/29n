// Chance of a blind guess per question (#26), for the periodic guess check (src/guesses). Lives in
// the engine because it plays the dataset in every province; it reads approaches and parties only,
// never anyone's choices or affinity.
import type { Dataset } from '../dataset/schema';
import { PROVINCES } from '../registry/territory';
import { createGame } from './index';

/** A question with the chance of a blind guess being right on it. */
export interface QuestionChance {
  id: string;
  text: string;
  chance: number;
}

/**
 * Chance per published question: in every province (and without one), each approach's defenders in
 * play over the parties offered; the most generous approach and province. Generous on purpose: an
 * issue means the rate beats chance whatever the voters chose and wherever they vote.
 */
export function questionChances(dataset: Dataset): QuestionChance[] {
  const chances = new Map<string, number>();
  for (const province of [null, ...PROVINCES.map((p) => p.code)]) {
    const game = createGame(dataset, province, 'chance');
    for (const t of game.themes()) {
      const v = game.theme(t.id);
      for (const { question } of [...v.questions, ...v.followUps])
        chances.set(question.id, Math.max(chances.get(question.id) ?? 0, game.guessChance(question.id)));
    }
  }
  return (dataset.questions ?? []).filter((q) => chances.has(q.id)).map((q) => ({ id: q.id, text: q.text, chance: chances.get(q.id)! }));
}
