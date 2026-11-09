// Analytics (#13): funnel + bet hit rate per topic, never the chosen party or the ranking.
import { describe, expect, it } from 'vitest';
import { createGame, NONE } from '../src/game';
import {
  EVENTS,
  isValidEvent,
  sharedEvent,
  startedEvent,
  sawResultEvent,
  confirmEvents,
  type AnalyticsEvent,
} from '../src/analytics/events';
import { createUmamiCounter, createGitHubPorts } from '../src/guesses/adapters';
import { checkGuesses, HIT_THRESHOLD, MIN_GUESSES, type GuessPorts } from '../src/guesses';
import { topicsDataset } from './fixtures/topics-dataset';

type P = ReturnType<typeof createGame>;
const newGame = () => createGame(topicsDataset, null, 's', undefined, { mode: 'private' });
const letterOf = (p: P, topic: string, party: string) =>
  p.choose(topic, NONE).reveal(topic)!.cards.find((t) => t.party.id === party)!.letter;
/** Confirm a party's card, returning the game before and after (what the app hook sees). */
const confirm = (before: P, topic: string, party: string | null, guess?: string) => {
  const letter = party ? letterOf(before, topic, party) : NONE;
  const after = before.choose(topic, letter, guess ? { guess } : undefined);
  return { after, events: confirmEvents(before, after, topic) };
};

const PARTIES = topicsDataset.parties.flatMap((p) => [p.id, p.name, p.acronym]).filter(Boolean) as string[];
/** No event may carry a party (id, name, acronym) or ranking data, anywhere. */
const noParties = (events: AnalyticsEvent[]) => {
  for (const e of events) {
    expect(isValidEvent(e), JSON.stringify(e)).toBe(true);
    const values = Object.values(e.data ?? {}).map(String);
    for (const v of values) for (const p of PARTIES) expect(v.toLowerCase()).not.toBe(p.toLowerCase());
    // field names: only 'topic' / 'variant' (the share variant 'ranking' names the card type, not its content)
    expect(Object.keys(e.data ?? {}).every((k) => k === 'topic' || k === 'variant')).toBe(true);
    expect(e.name).not.toMatch(/ranking|porcentaje|puntos|partido|eleccion|letra|provincia/i);
  }
};

describe('analytics events', () => {
  it('confirming a topic sends "topic completed" with the topic only', () => {
    const { events } = confirm(newGame(), 'vivienda', 'uno');
    expect(events).toEqual([{ name: 'topic-completed', data: { topic: 'vivienda' } }]);
    noParties(events);
  });

  it('"Ninguna me convence" is indistinguishable from any other choice', () => {
    const { events } = confirm(newGame(), 'vivienda', null);
    expect(events).toEqual([{ name: 'topic-completed', data: { topic: 'vivienda' } }]);
  });

  it('a bet sends the topic and hit/miss, never the party chosen or bet on', () => {
    const hit = confirm(newGame(), 'vivienda', 'uno', 'uno').events;
    expect(hit).toContainEqual({ name: 'guess-hit', data: { topic: 'vivienda' } });
    const failure = confirm(newGame(), 'vivienda', 'uno', 'dos').events;
    expect(failure).toContainEqual({ name: 'guess-miss', data: { topic: 'vivienda' } });
    expect(failure.some((e) => e.name === 'guess-hit')).toBe(false);
    noParties([...hit, ...failure]);
  });

  it('the bet event is the same whatever party was chosen (only hit/miss varies)', () => {
    const a = confirm(newGame(), 'vivienda', 'uno', 'uno').events;
    const b = confirm(newGame(), 'vivienda', 'dos', 'dos').events;
    expect(a).toEqual(b);
  });

  it('sends "5 topics completed" exactly when the fifth topic is done', () => {
    let p = newGame();
    const all: AnalyticsEvent[] = [];
    for (const topic of ['vivienda', 'empleo', 'sanidad', 'pensiones', 'impuestos', 'transporte']) {
      const r = confirm(p, topic, 'uno', 'dos');
      all.push(...r.events);
      if (topic === 'impuestos') expect(r.events).toContainEqual({ name: 'five-topics' });
      else expect(r.events.some((e) => e.name === 'five-topics')).toBe(false);
      p = r.after;
    }
    noParties(all);
    // no event carries the result
    noParties([sawResultEvent()]);
  });

  it('start, result viewed and share carry no choice data', () => {
    expect(startedEvent()).toEqual({ name: 'started' });
    expect(sawResultEvent()).toEqual({ name: 'saw-result' });
    expect(sharedEvent('neutral')).toEqual({ name: 'shared', data: { variant: 'neutral' } });
    expect(sharedEvent('ranking')).toEqual({ name: 'shared', data: { variant: 'ranking' } });
    noParties([startedEvent(), sawResultEvent(), sharedEvent('ranking')]);
  });

  it('the shape is fixed: unknown events, extra fields or free values are rejected', () => {
    expect(Object.keys(EVENTS).sort()).toEqual(
      ['guess-hit', 'guess-miss', 'five-topics', 'shared', 'started', 'topic-completed', 'saw-result'].sort(),
    );
    expect(isValidEvent({ name: 'eleccion', data: { topic: 'vivienda' } })).toBe(false);
    expect(isValidEvent({ name: 'topic-completed', data: { topic: 'vivienda', party: 'uno' } })).toBe(false);
    expect(isValidEvent({ name: 'topic-completed' })).toBe(false);
    expect(isValidEvent({ name: 'started', data: { topic: 'vivienda' } })).toBe(false);
    expect(isValidEvent({ name: 'shared', data: { variant: 'Partido uno' } })).toBe(false);
    expect(isValidEvent({ name: 'topic-completed', data: { topic: 'Mi voto: Partido uno' } })).toBe(false);
  });

  it('a topic id that is also a party id cannot be sent as a topic', () => {
    expect(isValidEvent({ name: 'topic-completed', data: { topic: 'vivienda' } }, { parties: ['uno'] })).toBe(true);
    expect(isValidEvent({ name: 'topic-completed', data: { topic: 'uno' } }, { parties: ['uno'] })).toBe(false);
  });
});

describe('client privacy', () => {
  it('the engine and the client app make no network calls; only src/web/analitica.ts talks to Umami', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    for (const d of ['src/game', 'src/web', 'src/analytics'])
      for (const f of readdirSync(d)) {
        const code = readFileSync(`${d}/${f}`, 'utf8');
        expect(code, `${d}/${f}`).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
        if (`${d}/${f}` !== 'src/web/analytics.ts' && d !== 'src/analytics') expect(code, `${d}/${f}`).not.toMatch(/umami/i);
      }
    const adapter = readFileSync('src/web/analytics.ts', 'utf8');
    // The only exception: it calls umami.track and nothing else, always with a validated event.
    expect(adapter.match(/umami\??\.\w+/g)).toEqual(['umami?.track']);
    expect(adapter).toMatch(/isValidEvent\(/);
  });
});

describe('bet hit rate check', () => {
  const ports = (counts: Record<string, { hits: number; failures: number }>, opened: string[] = []) => {
    const openedIssues: { title: string; body: string; labels: string[] }[] = [];
    const p: GuessPorts = {
      countGuesses: async () => counts,
      openIssues: async () => opened,
      openIssue: async (i) => {
        openedIssues.push(i);
      },
    };
    return { p, openedIssues };
  };

  it('opens one issue per topic whose hit rate is above 60 % with enough bets', async () => {
    const { p, openedIssues } = ports({
      vivienda: { hits: 70, failures: 30 }, // 70 % → issue
      empleo: { hits: 60, failures: 40 }, // exactly 60 % → not above
      sanidad: { hits: 9, failures: 1 }, // 90 % but too few bets
    });
    const r = await checkGuesses(p, { topics: topicsDataset.topics });
    expect(HIT_THRESHOLD).toBe(0.6);
    expect(MIN_GUESSES).toBeGreaterThan(10);
    expect(openedIssues).toHaveLength(1);
    expect(openedIssues[0]!.title).toContain('Vivienda');
    expect(openedIssues[0]!.title).toContain('70 %');
    expect(openedIssues[0]!.body).toMatch(/neutraliz/i);
    expect(openedIssues[0]!.labels).toContain('reneutralizar');
    expect(r.topics.find((t) => t.topic === 'vivienda')).toMatchObject({ guesses: 100, rate: 0.7, action: 'opened' });
    expect(r.topics.find((t) => t.topic === 'sanidad')).toMatchObject({ action: 'fewGuesses' });
    expect(r.topics.find((t) => t.topic === 'empleo')).toMatchObject({ action: 'ok' });
  });

  it('does not open a duplicate while an issue for that topic is still open', async () => {
    const { p, openedIssues } = ports({ vivienda: { hits: 80, failures: 20 } }, ['Reneutralizar «Vivienda y alquiler»: 75 % de acierto']);
    const r = await checkGuesses(p, { topics: topicsDataset.topics });
    expect(openedIssues).toHaveLength(0);
    expect(r.topics[0]).toMatchObject({ topic: 'vivienda', action: 'alreadyOpen' });
  });

  it('ignores topics unknown to the dataset', async () => {
    const { p, openedIssues } = ports({ 'uno': { hits: 100, failures: 0 } });
    await checkGuesses(p, { topics: topicsDataset.topics });
    expect(openedIssues).toHaveLength(0);
  });
});

describe('bet check adapters', () => {
  it('reads per-topic hit and miss counts from the Umami API', async () => {
    const urls: string[] = [];
    const count = createUmamiCounter({
      base: 'https://api.umami.is/v1/',
      apiKey: 'clave',
      websiteId: 'web-1',
      days: 30,
      now: () => 30 * 86_400_000,
      request: async (url, init) => {
        urls.push(url);
        expect(init.headers['x-umami-api-key']).toBe('clave');
        const hit = url.includes('event=guess-hit');
        return { ok: true, status: 200, json: async () => (hit ? [{ value: 'vivienda', total: 7 }] : [{ value: 'vivienda', total: 3 }, { value: 'empleo', total: 5 }]) };
      },
    });
    expect(await count()).toEqual({ vivienda: { hits: 7, failures: 3 }, empleo: { hits: 0, failures: 5 } });
    expect(urls[0]).toMatch(/^https:\/\/api\.umami\.is\/v1\/websites\/web-1\/event-data\/values\?startAt=0&endAt=2592000000&/);
    expect(urls[0]).toContain('propertyName=topic');
  });

  it('sends the key as a bearer token to a self-hosted instance', async () => {
    const headers: Record<string, string>[] = [];
    const count = createUmamiCounter({ base: 'https://stats.example.com/api', apiKey: 'clave', websiteId: 'w', days: 1, now: () => 0,
      request: async (_url, init) => {
        headers.push(init.headers);
        return { ok: true, status: 200, json: async () => [] };
      } });
    await count();
    expect(headers[0]?.authorization).toBe('Bearer clave');
    expect(headers[0]?.['x-umami-api-key']).toBeUndefined();
  });

  it('fails loudly on an API error instead of reporting zero bets', async () => {
    const count = createUmamiCounter({ base: 'https://x', apiKey: 'k', websiteId: 'w', days: 1, now: () => 0,
      request: async () => ({ ok: false, status: 401, json: async () => ({}) }) });
    await expect(count()).rejects.toThrow(/401/);
  });

  it('lists open issues and opens new ones with gh, creating the label first', async () => {
    const calls: string[][] = [];
    const gh = createGitHubPorts((args) => {
      calls.push(args);
      return args[1] === 'list' ? JSON.stringify([{ title: 'Reneutralizar «Sanidad»: 70 % de acierto' }]) : '';
    });
    expect(await gh.openIssues()).toEqual(['Reneutralizar «Sanidad»: 70 % de acierto']);
    expect(calls[0]).toEqual(expect.arrayContaining(['issue', 'list', '--label', 'reneutralizar', '--state', 'open']));
    await gh.openIssue({ title: 'T', body: 'C', labels: ['reneutralizar'] });
    await gh.openIssue({ title: 'T2', body: 'C2', labels: ['reneutralizar'] });
    expect(calls.filter((a) => a[0] === 'label')).toHaveLength(1);
    expect(calls.at(-1)).toEqual(['issue', 'create', '--title', 'T2', '--body', 'C2', '--label', 'reneutralizar']);
  });
});
