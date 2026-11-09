// The ONLY client module that sends anything: it hands validated events (src/analytics/events.ts)
// to the Umami script, which does the network. Without the script (UMAMI_WEBSITE_ID unset at build
// time, blocker, offline) every call is a no-op. tests/analytics.test.ts enforces both.
import type { Game } from '../game';
import {
  isValidEvent,
  sharedEvent,
  startedEvent,
  confirmEvents,
  sawResultEvent,
  type AnalyticsEvent,
  type ShareVariant,
} from '../analytics/events';

declare global {
  interface Window {
    umami?: { track(name: string, data?: Record<string, string>): unknown };
  }
}

let parties: readonly string[] = [];
const sent = new Set<string>();

function send(e: AnalyticsEvent): void {
  if (!isValidEvent(e, { parties })) return;
  try {
    window.umami?.track(e.name, e.data);
  } catch {
    // analytics must never break the game
  }
}
/** Funnel steps are counted once per page load. */
const once = (e: AnalyticsEvent) => {
  if (sent.has(e.name)) return;
  sent.add(e.name);
  send(e);
};

/** Party ids that must never appear as a value (defence in depth). */
export const setupAnalytics = (ids: readonly string[]) => {
  parties = ids;
};
/** A topic is on screen: a player with nothing done yet has started. */
export const trackViewTopic = (game: Game) => {
  if (game.done().length === 0) once(startedEvent());
};
export const trackConfirm = (before: Game, after: Game, topic: string) =>
  confirmEvents(before, after, topic).forEach(send);
export const trackResult = (game: Game) => {
  if (game.result().available) once(sawResultEvent());
};
/** For the share button (#9). */
export const trackShare = (variant: ShareVariant) => send(sharedEvent(variant));
