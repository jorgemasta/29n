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
  guessEvents,
  type AnalyticsEvent,
} from '../src/analytics/events';
import { createUmamiCounter, createGitHubPorts } from '../src/guesses/adapters';
import { checkGuesses, questionChances, MIN_GUESSES, type GuessPorts } from '../src/guesses';
import { topicsDataset } from './fixtures/topics-dataset';
import { themesDataset } from './fixtures/themes-dataset';

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

const PARTIES = [...topicsDataset.parties, ...themesDataset.parties].flatMap((p) => [p.id, p.name, p.acronym]).filter(Boolean) as string[];
/** No event may carry a party (id, name, acronym) or ranking data, anywhere. */
const noParties = (events: AnalyticsEvent[]) => {
  for (const e of events) {
    expect(isValidEvent(e), JSON.stringify(e)).toBe(true);
    const values = Object.values(e.data ?? {}).map(String);
    for (const v of values) for (const p of PARTIES) expect(v.toLowerCase()).not.toBe(p.toLowerCase());
    // field names: only 'topic' / 'variant' (the share variant 'ranking' names the card type, not its content)
    expect(Object.keys(e.data ?? {}).every((k) => k === 'topic' || k === 'question' || k === 'variant')).toBe(true);
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

  it('v1 bets send nothing any more: guesses are measured per question (v2)', () => {
    const { events } = confirm(newGame(), 'vivienda', 'uno', 'uno');
    expect(events.some((e) => e.name.startsWith('guess-'))).toBe(false);
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

describe('guess events (v2, #26)', () => {
  const fresh = () => createGame(themesDataset, null, 's');
  const letterOf = (game: P, questionId: string, what: string) => game.question(questionId).approaches.find((a) => a.what === what)!.letter;
  /** Chooses "control" (aaa full, bbb partial) in alquiler with a guess, "none" in compra, and reveals vivienda. */
  const reveal = (guess?: string) => {
    const game = fresh();
    return game
      .chooseApproach('alquiler', letterOf(game, 'alquiler', 'Enfoque uno'), guess ? { guess } : undefined)
      .chooseApproach('compra', NONE)
      .revealTheme('vivienda');
  };

  it('a guess sends only the question and hit or miss, never the party guessed or chosen', () => {
    const hit = guessEvents(reveal('bbb'), ['alquiler', 'compra']);
    expect(hit).toEqual([{ name: 'guess-hit', data: { question: 'alquiler' } }]);
    const miss = guessEvents(reveal('ccc'), ['alquiler', 'compra']);
    expect(miss).toEqual([{ name: 'guess-miss', data: { question: 'alquiler' } }]);
    noParties([...hit, ...miss]);
    expect(JSON.stringify([...hit, ...miss])).not.toMatch(/aaa|bbb|ccc|nada|control|uno/);
  });

  it('two different right guesses send the same event', () => {
    expect(guessEvents(reveal('aaa'), ['alquiler'])).toEqual(guessEvents(reveal('bbb'), ['alquiler']));
  });

  it('no guess, or a theme not revealed yet, sends nothing', () => {
    expect(guessEvents(reveal(), ['alquiler', 'compra'])).toEqual([]);
    const blind = fresh().chooseApproach('alquiler', 'A', { guess: 'aaa' });
    expect(guessEvents(blind, ['alquiler'])).toEqual([]);
  });

  it('the browser sends each question\'s guess outcome once, even if asked again (#18 review)', async () => {
    const tracked: unknown[] = [];
    const g = globalThis as { window?: unknown };
    const before = g.window;
    g.window = { umami: { track: (...args: unknown[]) => tracked.push(args) } };
    try {
      const { trackGuesses } = await import('../src/web/analytics');
      const game = reveal('bbb');
      trackGuesses(game, ['alquiler', 'compra']);
      trackGuesses(game, ['alquiler']);
      expect(tracked).toEqual([['guess-hit', { question: 'alquiler' }]]);
    } finally {
      g.window = before;
    }
  });

  it('a question id that is also a party id cannot be sent', () => {
    expect(isValidEvent({ name: 'guess-hit', data: { question: 'alquiler' } }, { parties: ['aaa'] })).toBe(true);
    expect(isValidEvent({ name: 'guess-hit', data: { question: 'aaa' } }, { parties: ['aaa'] })).toBe(false);
    expect(isValidEvent({ name: 'guess-hit', data: { topic: 'alquiler' } })).toBe(false);
    expect(isValidEvent({ name: 'guess-hit', data: { question: 'alquiler', party: 'aaa' } })).toBe(false);
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

describe('guess hit rate check, per question vs chance', () => {
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

  const QUESTIONS = [
    { id: 'alquiler', text: '¿Qué harían para que el alquiler sea asequible?', chance: 0.5 },
    { id: 'compra', text: '¿Qué harían para que comprar casa sea posible?', chance: 0.25 },
    { id: 'listas', text: '¿Qué harían con las listas de espera?', chance: 0.5 },
  ];

  it('compares each question with its own chance: the same hit rate can be chance on one and a leak on another', async () => {
    const { p, openedIssues } = ports({
      alquiler: { hits: 55, failures: 45 }, // 55 % vs 50 % chance → ok
      compra: { hits: 55, failures: 45 }, // 55 % vs 25 % chance → issue
    });
    const r = await checkGuesses(p, { questions: QUESTIONS });
    expect(openedIssues).toHaveLength(1);
    expect(openedIssues[0]!.title).toContain('comprar casa');
    expect(openedIssues[0]!.title).toContain('55 %');
    expect(openedIssues[0]!.body).toContain('25 %');
    expect(openedIssues[0]!.body).not.toMatch(/aaa|bbb|ccc/);
    expect(openedIssues[0]!.labels).toContain('reneutralizar');
    expect(r.questions.find((t) => t.question === 'compra')).toMatchObject({ guesses: 100, rate: 0.55, chance: 0.25, action: 'opened' });
    expect(r.questions.find((t) => t.question === 'alquiler')).toMatchObject({ chance: 0.5, action: 'ok' });
  });

  it('says nothing below the minimum number of guesses, however high the rate', async () => {
    const { p, openedIssues } = ports({ compra: { hits: MIN_GUESSES - 1, failures: 0 } });
    const r = await checkGuesses(p, { questions: QUESTIONS });
    expect(MIN_GUESSES).toBeGreaterThan(10);
    expect(openedIssues).toHaveLength(0);
    expect(r.questions[0]).toMatchObject({ question: 'compra', action: 'fewGuesses' });
  });

  it('a rate a little above chance is noise, not a leak', async () => {
    const { p, openedIssues } = ports({ compra: { hits: 9, failures: 21 } }); // 30 % of 30 vs 25 %
    await checkGuesses(p, { questions: QUESTIONS });
    expect(openedIssues).toHaveLength(0);
  });

  it('does not open a duplicate while an issue for that question is still open', async () => {
    const { p, openedIssues } = ports({ compra: { hits: 80, failures: 20 } }, ['Reneutralizar «¿Qué harían para que comprar casa sea posible?»: 70 % de acierto']);
    const r = await checkGuesses(p, { questions: QUESTIONS });
    expect(openedIssues).toHaveLength(0);
    expect(r.questions[0]).toMatchObject({ question: 'compra', action: 'alreadyOpen' });
  });

  it('ignores questions unknown to the dataset', async () => {
    const { p, openedIssues } = ports({ aaa: { hits: 100, failures: 0 } });
    expect((await checkGuesses(p, { questions: QUESTIONS })).questions).toEqual([]);
    expect(openedIssues).toHaveLength(0);
  });

  it('chance per question from the dataset: the most generous approach in the most generous province', () => {
    const chances = questionChances(themesDataset);
    // alquiler: 2 of 4 national parties defend "control"; in 08 (+bcn) 2/5, in 35 (+isla) 2/5 → 0.5.
    expect(chances.find((q) => q.id === 'alquiler')).toEqual({ id: 'alquiler', text: '¿Qué harían para que el alquiler sea asequible?', chance: 0.5 });
    expect(chances.find((q) => q.id === 'compra')!.chance).toBe(0.25);
    // ref (Canarias only): mantener has aaa+bbb of aaa, bbb, ccc, nada, isla → 0.4.
    expect(chances.find((q) => q.id === 'ref')!.chance).toBe(0.4);
  });
});

describe('bet check adapters', () => {
  it('reads per-question hit and miss counts from the Umami API', async () => {
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
        return { ok: true, status: 200, json: async () => (hit ? [{ value: 'alquiler', total: 7 }] : [{ value: 'alquiler', total: 3 }, { value: 'compra', total: 5 }]) };
      },
    });
    expect(await count()).toEqual({ alquiler: { hits: 7, failures: 3 }, compra: { hits: 0, failures: 5 } });
    expect(urls[0]).toMatch(/^https:\/\/api\.umami\.is\/v1\/websites\/web-1\/event-data\/values\?startAt=0&endAt=2592000000&/);
    expect(urls[0]).toContain('propertyName=question');
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
