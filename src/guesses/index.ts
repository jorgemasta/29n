// Periodic bet check (#13, story 55): a topic where people guess the party too often (> 60 %) is not
// neutral enough, so an issue is opened to re-neutralise it. Not an automatic check: a human decides.
// Ports: the Umami API (counts of 'guess-hit' / 'guess-miss' per topic) and GitHub (`gh`).
import type { Topic } from '../dataset/schema';

export const HIT_THRESHOLD = 0.6;
/** Below this many bets on a topic the rate is noise (a few friends testing), so nothing is opened. */
export const MIN_GUESSES = 30;
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
  /** topic id → counts over the checked period. */
  countGuesses(): Promise<Record<string, GuessCount>>;
  /** Titles of the open issues labelled ETIQUETA. */
  openIssues(): Promise<string[]>;
  openIssue(issue: NewIssue): Promise<void>;
}
export type TopicAction = 'opened' | 'alreadyOpen' | 'ok' | 'fewGuesses';
export interface TopicResult {
  topic: string;
  guesses: number;
  rate: number;
  action: TopicAction;
}

const prefix = (t: Topic) => `Reneutralizar «${t.title}»`;
const percent = (x: number) => `${Math.round(x * 100)} %`;

export async function checkGuesses(
  ports: GuessPorts,
  { topics, period = 'los últimos 30 días' }: { topics: Topic[]; period?: string },
): Promise<{ topics: TopicResult[] }> {
  const counts = await ports.countGuesses();
  const opened = await ports.openIssues();
  const results: TopicResult[] = [];
  for (const topic of topics) {
    const c = counts[topic.id];
    if (!c) continue;
    const guesses = c.hits + c.failures;
    const rate = guesses ? c.hits / guesses : 0;
    let action: TopicAction = 'ok';
    if (guesses < MIN_GUESSES) action = 'fewGuesses';
    else if (rate > HIT_THRESHOLD) {
      if (opened.some((t) => t.startsWith(prefix(topic)))) action = 'alreadyOpen';
      else {
        await ports.openIssue({
          title: `${prefix(topic)}: ${percent(rate)} de acierto`,
          body: [
            `En ${period}, quienes apostaron de quién era la postura elegida en **${topic.title}** (\`${topic.id}\`) acertaron`,
            `el ${percent(rate)} de las veces (${c.hits} de ${guesses} apuestas). El umbral es ${percent(HIT_THRESHOLD)}.`,
            '',
            'Las posturas de este tema probablemente siguen siendo reconocibles: hay que volver a neutralizarlas',
            '(revisar estilo, términos identificativos y el resultado de V11 en los informes) y relanzar el proceso de datos.',
            '',
            'Datos agregados de Umami (eventos `guess-hit` / `guess-miss`): no incluyen qué partido eligió ni apostó nadie.',
            'Abierto automáticamente por `.github/workflows/guesses.yml`.',
          ].join('\n'),
          labels: [LABEL],
        });
        action = 'opened';
      }
    }
    results.push({ topic: topic.id, guesses, rate, action });
  }
  return { topics: results };
}
