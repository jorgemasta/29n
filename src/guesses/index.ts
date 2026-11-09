// Periodic guess check (#13, #26; story 63): a question where people guess who defends the chosen
// approach clearly more often than chance has approaches that give their parties away, so an issue is
// opened to rewrite them. Not an automatic check: a human decides.
// Chance differs per question (how many parties defend each approach among those offered), so each
// question is compared with its own chance, and only from MIN_GUESSES guesses on.
// Ports: the Umami API (counts of 'guess-hit' / 'guess-miss' per question) and GitHub (`gh`).
import type { Dataset } from '../dataset/schema';
import { createGame } from '../game';
import { PROVINCES } from '../registry/territory';

/** Below this many guesses on a question the rate is noise (a few friends testing), so nothing is opened. */
export const MIN_GUESSES = 30;
/** One-sided z score above chance needed to open an issue (≈ 1 % false alarms per question). */
export const Z_THRESHOLD = 2.33;
export const LABEL = 'reneutralizar';

export interface GuessCount {
  hits: number;
  failures: number;
}
export interface NewIssue {
  title: string;
  body: string;
  labels: string[];
}
export interface GuessPorts {
  /** question id → counts over the checked period. */
  countGuesses(): Promise<Record<string, GuessCount>>;
  /** Titles of the open issues labelled LABEL. */
  openIssues(): Promise<string[]>;
  openIssue(issue: NewIssue): Promise<void>;
}
/** A question with the chance of a blind guess being right on it. */
export interface QuestionChance {
  id: string;
  text: string;
  chance: number;
}
export type QuestionAction = 'opened' | 'alreadyOpen' | 'ok' | 'fewGuesses';
export interface QuestionResult {
  question: string;
  guesses: number;
  rate: number;
  chance: number;
  action: QuestionAction;
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

/** Clearly above chance: a one-sided binomial z test. */
const aboveChance = (hits: number, n: number, chance: number) => {
  if (chance >= 1) return false;
  if (chance <= 0) return hits > 0;
  return (hits / n - chance) / Math.sqrt((chance * (1 - chance)) / n) > Z_THRESHOLD;
};

const prefix = (q: QuestionChance) => `Reneutralizar «${q.text}»`;
const percent = (x: number) => `${Math.round(x * 100)} %`;

export async function checkGuesses(
  ports: GuessPorts,
  { questions, period = 'los últimos 30 días' }: { questions: QuestionChance[]; period?: string },
): Promise<{ questions: QuestionResult[] }> {
  const counts = await ports.countGuesses();
  const opened = await ports.openIssues();
  const results: QuestionResult[] = [];
  for (const question of questions) {
    const c = counts[question.id];
    if (!c) continue;
    const guesses = c.hits + c.failures;
    const rate = guesses ? c.hits / guesses : 0;
    const { chance } = question;
    let action: QuestionAction = 'ok';
    if (guesses < MIN_GUESSES) action = 'fewGuesses';
    else if (aboveChance(c.hits, guesses, chance)) {
      if (opened.some((t) => t.startsWith(prefix(question)))) action = 'alreadyOpen';
      else {
        await ports.openIssue({
          title: `${prefix(question)}: ${percent(rate)} de acierto`,
          body: [
            `En ${period}, quienes apostaron qué partido defiende el enfoque elegido en **${question.text}** (\`${question.id}\`)`,
            `acertaron el ${percent(rate)} de las veces (${c.hits} de ${guesses} apuestas). Al azar se acertaría como mucho`,
            `el ${percent(chance)} (el enfoque con más partidos que lo defienden, sobre los partidos que se ofrecen en la apuesta).`,
            '',
            'Los enfoques de esta pregunta probablemente delatan a sus partidos: hay que reescribirlos',
            '(revisar estilo, términos identificativos y cifras) y relanzar el proceso de datos.',
            '',
            'Datos agregados de Umami (eventos `guess-hit` / `guess-miss`): no incluyen qué partido eligió ni apostó nadie.',
            'Abierto automáticamente por `.github/workflows/guesses.yml`.',
          ].join('\n'),
          labels: [LABEL],
        });
        action = 'opened';
      }
    }
    results.push({ question: question.id, guesses, rate, chance, action });
  }
  return { questions: results };
}
