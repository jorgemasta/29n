// Analytics events (#13), built as pure data. The only things that may leave the browser:
// funnel steps and, per topic, whether a bet was right. Never the chosen card or party, the party bet
// on, the province or the ranking. Every event is checked against this fixed shape before sending
// (src/web/analytics.ts is the only module that talks to Umami).
import { GOAL_TOPICS, type Game } from '../game';

/** Event name → the only data fields it may carry. */
export const EVENTS = {
  started: [],
  'topic-completed': ['topic'],
  'five-topics': [],
  'saw-result': [],
  shared: ['variant'],
  'guess-hit': ['topic'],
  'guess-miss': ['topic'],
} as const satisfies Record<string, readonly string[]>;

export type EventName = keyof typeof EVENTS;
export type ShareVariant = 'neutral' | 'ranking';
export interface AnalyticsEvent {
  name: string;
  data?: Record<string, string>;
}

const VARIANTS: readonly string[] = ['neutral', 'ranking'] satisfies ShareVariant[];
/** Topic ids are slugs ("vivienda", "ref-canarias"); anything else (free text, names) is refused. */
const TOPIC_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** True only for a known event with exactly its allowed fields and allowed values. `parties`: ids never allowed as a value. */
export function isValidEvent(e: AnalyticsEvent, { parties = [] as readonly string[] } = {}): boolean {
  if (!Object.hasOwn(EVENTS, e.name)) return false;
  const allowed: readonly string[] = EVENTS[e.name as EventName];
  const data = e.data ?? {};
  const keys = Object.keys(data);
  if (keys.length !== allowed.length || !allowed.every((k) => keys.includes(k))) return false;
  if (allowed.length === 0 && e.data !== undefined) return false;
  for (const [k, v] of Object.entries(data)) {
    if (typeof v !== 'string' || v.length > 40) return false;
    if (k === 'topic' && (!TOPIC_ID.test(v) || parties.includes(v))) return false;
    if (k === 'variant' && !VARIANTS.includes(v)) return false;
  }
  return true;
}

export const startedEvent = (): AnalyticsEvent => ({ name: 'started' });
export const sawResultEvent = (): AnalyticsEvent => ({ name: 'saw-result' });
export const sharedEvent = (variant: ShareVariant): AnalyticsEvent => ({ name: 'shared', data: { variant } });

/**
 * Events for a confirmed choice, from the game before and after `choose`: topic completed, the
 * 5th topic, and the bet's hit/miss (read from the engine's reveal; the party itself is dropped here).
 */
export function confirmEvents(before: Game, after: Game, topic: string): AnalyticsEvent[] {
  if (!after.done().includes(topic)) return [];
  const events: AnalyticsEvent[] = [{ name: 'topic-completed', data: { topic } }];
  if (before.done().length < GOAL_TOPICS && after.done().length >= GOAL_TOPICS) events.push({ name: 'five-topics' });
  const guess = after.reveal(topic)?.guess;
  if (guess) events.push({ name: guess.correct ? 'guess-hit' : 'guess-miss', data: { topic } });
  return events;
}
