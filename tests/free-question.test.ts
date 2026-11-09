// Test point C: the live free question ("Pregunta libre", #15). The endpoint's handler runs with the
// fake AI adapter and in-memory stores (rate limit, spending, FAQ cache): no network, no secrets.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Dataset } from '../src/dataset/schema';
import { createFakeAI, type FakeResponses } from '../src/ai/fake';
import { createGame } from '../src/game';
import { createMemoryStore, createFreeQuestion, type FreeQuestionConfig } from '../src/questions/free';
import type { ManifestoText } from '../src/questions/texts';
import { sampleDataset } from './fixtures/sample-dataset';

const QUOTE = 'Revalorizaremos las pensiones con el IPC cada año para proteger a los jubilados.';
const texts: Record<string, ManifestoText> = {
  // aaa talks about pensions on page 2; bbb never does; ccc has no published text yet.
  aaa: { party: 'aaa', hashPdf: 'h-aaa', pages: ['Portada del programa.', `Pensiones. ${QUOTE}`, 'Vivienda y alquiler.'] },
  bbb: { party: 'bbb', hashPdf: 'h-bbb', pages: ['Portada.', 'Vivienda y alquiler asequible para todos.'] },
  nada: { party: 'nada', hashPdf: 'h-viejo', pages: [`Pensiones. ${QUOTE}`] },
  isla: { party: 'isla', hashPdf: 'h-isla', pages: ['Pensiones. Las pensiones canarias subirán con un complemento insular cada año.'] },
};
// The dataset records which PDF each text must come from: a stale text is never used.
const dataset: Dataset = {
  ...sampleDataset,
  parties: sampleDataset.parties.map((p) =>
    p.manifesto.state === 'published' ? { ...p, manifesto: { ...p.manifesto, hashPdf: `h-${p.id}` } } : p,
  ),
};

// 13 + 21 = 34 words, no figures, no marks.
const goodAnswer = {
  mentions: true,
  what: 'Subir todas las pensiones cada año al mismo ritmo que suben los precios de consumo.',
  how: 'La subida sería automática y anual, ligada a los precios, para que las personas jubiladas no pierdan poder de compra con el tiempo.',
  figure: null,
  quotes: [{ text: QUOTE, page: 2 }],
};

function fakeAi(over: Partial<FakeResponses> = {}) {
  return createFakeAI({
    'extract-position': () => ({ proposes: false, quotes: [] }),
    neutralize: () => ({ what: '', how: '', figure: null }),
    'verify-fidelity': () => ({ adds: false, omits: false, changesMeaning: false, explanation: '' }),
    'guess-party': () => ({ assignments: [] }),
    'confirm-absence': () => ({ proposes: false, quotes: [] }),
    'assess-feasibility': () => {
      throw new Error('no se usa');
    },
    'answer-question': (e) =>
      e.pages.some((p: { text: string }) => p.text.includes(QUOTE)) ? goodAnswer : { mentions: false, what: '', how: '', figure: null, quotes: [] },
    ...over,
  });
}

function mount(config: Partial<FreeQuestionConfig> = {}, ai = fakeAi()) {
  const store = createMemoryStore();
  let now = new Date('2026-11-18T10:00:00Z');
  const read: string[] = [];
  const service = createFreeQuestion(
    {
      ai,
      store,
      texts: async (id) => {
        read.push(id);
        return texts[id] ?? null;
      },
      now: () => now,
    },
    { enabled: true, dataset, terms: { aaa: ['Partido AAA', 'AAA'], bbb: ['Partido BBB'] }, ...config },
  );
  return { service, ai, store, read, goTo: (d: string) => (now = new Date(d)) };
}

const answerCalls = (ai: ReturnType<typeof fakeAi>) => ai.calls.filter((l) => l.task === 'answer-question');
const QUESTION = '¿Qué harán con las pensiones?';

afterEach(() => vi.restoreAllMocks());

describe('free question: answers', () => {
  it('is off unless the flag is on, without touching the AI or the stores', async () => {
    const { service, ai, store } = mount({ enabled: false });
    expect(await service.ask({ question: QUESTION, session: 's1' })).toMatchObject({ state: 'closed' });
    expect(ai.calls).toHaveLength(0);
    expect(store.keys()).toEqual([]);
  });

  it('answers per published party with a verified quote, or says it does not mention it', async () => {
    const { service } = mount();
    const r = await service.ask({ question: QUESTION, session: 's1' });
    if (r.state !== 'ok') throw new Error(r.state);
    expect(r.question.text).toBe(QUESTION);
    const byParty = (id: string) => r.answers.find((x) => x.party === id);
    expect(byParty('aaa')).toMatchObject({ state: 'answers', quotes: [{ text: QUOTE, page: 2 }], text: { what: goodAnswer.what } });
    expect(byParty('bbb')).toMatchObject({ state: 'notMentioned' });
    // No text published for ccc, and nada's text is from an older PDF: never answered from it.
    expect(byParty('ccc')).toMatchObject({ state: 'unverified' });
    expect(byParty('nada')).toMatchObject({ state: 'unverified' });
    // Pending parties have no programme to answer from.
    expect(r.answers.map((x) => x.party)).not.toContain('pend');
  });

  it('the answers are anonymised by the game engine like the suggested questions', async () => {
    const { service } = mount();
    const r = await service.ask({ question: QUESTION, session: 's1' });
    if (r.state !== 'ok') throw new Error(r.state);
    const game = createGame(dataset, '35', 'semilla');
    const view = game.question(r.question, r.answers);
    expect(view.cards.map((t) => t.headline)).toContain(goodAnswer.what);
    expect(JSON.stringify(view)).not.toMatch(/aaa|AAA/);
    const revealed = game.revealQuestion(r.question, r.answers);
    expect(revealed.cards.map((t) => t.party.id)).toEqual(['aaa']);
    expect(revealed.notMentioned.map((p) => p.id)).toEqual(['bbb', 'isla']);
  });

  it('says when no programme talks about it', async () => {
    const { service, ai } = mount();
    const r = await service.ask({ question: '¿Qué dicen del servicio militar obligatorio?', session: 's1' });
    if (r.state !== 'ok') throw new Error(r.state);
    expect(r.answers.every((x) => x.state !== 'answers')).toBe(true);
    // ccc and nada have no usable text: unverified, so it cannot claim that no programme talks about it.
    expect(createGame(dataset, null, 's').question(r.question, r.answers)).toMatchObject({ cards: [], noneAtAll: false, unverified: 2 });
    expect(answerCalls(ai)).toHaveLength(0);
  });

  it('an invented quote is removed and the verified one kept (V1)', async () => {
    const invented = { text: 'Bajaremos la edad de jubilación a los sesenta años para todo el mundo.', page: 2 };
    const ai = fakeAi({ 'answer-question': () => ({ ...goodAnswer, quotes: [invented, ...goodAnswer.quotes] }) });
    const { service } = mount({}, ai);
    const r = await service.ask({ question: QUESTION, session: 's1' });
    if (r.state !== 'ok') throw new Error(r.state);
    expect(r.answers.find((x) => x.party === 'aaa')).toMatchObject({ state: 'answers', quotes: [{ text: QUOTE, page: 2 }] });
  });

  it('an answer with identifying marks is rewritten, then not shown if they persist (V3)', async () => {
    const ai = fakeAi({ 'answer-question': () => ({ ...goodAnswer, what: `Partido AAA quiere ${goodAnswer.what}` }) });
    const { service } = mount({}, ai);
    const r = await service.ask({ question: QUESTION, session: 's1' });
    if (r.state !== 'ok') throw new Error(r.state);
    expect(r.answers.find((x) => x.party === 'aaa')).toMatchObject({ state: 'unverified' });
    expect(r.answers.find((x) => x.party === 'aaa')).not.toHaveProperty('quotes');
  });

  it('an answer with identifying marks is shown once a rewrite drops them (V3)', async () => {
    // The fake AI drops the name only when told to avoid it.
    const ai = fakeAi({
      'answer-question': (e) =>
        e.avoid?.includes('Partido AAA') ? goodAnswer : { ...goodAnswer, what: `Partido AAA quiere ${goodAnswer.what}` },
    });
    const { service } = mount({}, ai);
    const r = await service.ask({ question: QUESTION, session: 's1' });
    if (r.state !== 'ok') throw new Error(r.state);
    expect(r.answers.find((x) => x.party === 'aaa')).toMatchObject({ state: 'answers', text: { what: goodAnswer.what } });
  });

  it('only sends the AI a few pages, the ones that match the most search terms', async () => {
    const many = Array.from({ length: 12 }, (_, i) => `Página ${i + 1}: pensiones.`);
    many[7] = `Pensiones y jubilados. ${QUOTE}`;
    texts.bbb = { party: 'bbb', hashPdf: 'h-bbb', pages: many };
    try {
      // This AI only answers when the page with the quote arrives within a context of at most 3 pages.
      const ai = fakeAi({
        'answer-question': (e) =>
          e.pages.length <= 3 && e.pages.some((p: { text: string }) => p.text.includes(QUOTE))
            ? { ...goodAnswer, quotes: [{ text: QUOTE, page: e.pages.find((p: { text: string }) => p.text.includes(QUOTE)).page }] }
            : { mentions: false, what: '', how: '', figure: null, quotes: [] },
      });
      const { service } = mount({ maxPages: 3 }, ai);
      const r = await service.ask({ question: '¿Qué harán con las pensiones de los jubilados?', session: 's1' });
      if (r.state !== 'ok') throw new Error(r.state);
      expect(r.answers.find((x) => x.party === 'bbb')).toMatchObject({ state: 'answers', quotes: [{ text: QUOTE, page: 8 }] });
    } finally {
      texts.bbb = { party: 'bbb', hashPdf: 'h-bbb', pages: ['Portada.', 'Vivienda y alquiler asequible para todos.'] };
    }
  });
});

describe('free question: what is accepted', () => {
  it('rejects an empty, too short or too long question without calling the AI', async () => {
    const { service, ai } = mount();
    for (const question of ['', '¿y?', 'x'.repeat(301)])
      expect(await service.ask({ question, session: 's1' })).toMatchObject({ state: 'invalid', message: expect.any(String) });
    expect(await service.ask({ question: QUESTION, session: '' })).toMatchObject({ state: 'invalid' });
    expect(ai.calls).toHaveLength(0);
  });

  it('a question with nothing to search for is out of scope, without calling the AI', async () => {
    const { service, ai } = mount();
    expect(await service.ask({ question: '¿Qué es lo que vais a hacer vosotros?', session: 's1' })).toMatchObject({
      state: 'offTopic',
      message: expect.stringMatching(/programas/),
    });
    expect(ai.calls).toHaveLength(0);
  });

  it('finds the programme pages whatever the case, accents or number of the question words', async () => {
    const { service } = mount();
    // "PENSIÓN" (singular, capitals, accent) still reaches the page about "pensiones".
    const r = await service.ask({ question: '¿Qué proponen los partidos sobre la PENSIÓN?', session: 's1' });
    if (r.state !== 'ok') throw new Error(r.state);
    expect(r.answers.find((x) => x.party === 'aaa')).toMatchObject({ state: 'answers' });
  });
});

describe('free question: limits, cache and spending cap', () => {
  it('limits questions per session, with a clear message and the frequent questions', async () => {
    const { service } = mount({ sessionLimit: 2 });
    expect(await service.ask({ question: QUESTION, session: 's1' })).toMatchObject({ state: 'ok', remaining: 1 });
    expect(await service.ask({ question: '¿Y con la vivienda?', session: 's1' })).toMatchObject({ state: 'ok', remaining: 0 });
    const r = await service.ask({ question: '¿Y con el alquiler?', session: 's1' });
    expect(r).toMatchObject({ state: 'limit', message: expect.stringMatching(/límite/i), frequent: expect.any(Array) });
    // Another session is not affected.
    expect(await service.ask({ question: '¿Y con el alquiler?', session: 's2' })).toMatchObject({ state: 'ok' });
  });

  it('caches frequent questions without tying them to any session; a cached answer costs nothing', async () => {
    const { service, ai, store } = mount({ sessionLimit: 1 });
    await service.ask({ question: QUESTION, session: 'sesion-secreta-1' });
    const calls = ai.calls.length;
    // Same question, different spelling: served from the cache, no AI call, not counted.
    const r = await service.ask({ question: '  ¿que haran con las PENSIONES ', session: 'sesion-secreta-2' });
    expect(r).toMatchObject({ state: 'ok', fromCache: true });
    expect(ai.calls.length).toBe(calls);
    // Even over the session limit.
    expect(await service.ask({ question: QUESTION, session: 'sesion-secreta-1' })).toMatchObject({ state: 'ok', fromCache: true });
    // Nothing stored links a question to a session.
    const everything = JSON.stringify(store.dump());
    expect(everything).not.toContain('sesion-secreta');
    for (const [key, value] of Object.entries(store.dump()))
      if (key.startsWith('session:')) expect(value).toMatch(/^\d+$/);
  });

  it('session counters expire and are keyed by a hash, never by the raw session id', async () => {
    const { service, store } = mount();
    await service.ask({ question: QUESTION, session: 'abc' });
    const sessions = store.keys().filter((c) => c.startsWith('session:'));
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).not.toContain('abc');
    expect(store.ttl(sessions[0]!)).toBeGreaterThan(0);
  });

  it('a question asked only once leaves no trace of its text; only repeated ones are kept in words', async () => {
    const { service, store } = mount();
    const unique = '¿Qué proponen sobre las pensiones de mi abuela Carmen?';
    await service.ask({ question: unique, session: 's1' });
    expect(JSON.stringify(store.dump())).not.toMatch(/abuela|Carmen/);
    // Asked again by someone else: now it is frequent, and its wording may be stored and shown.
    await service.ask({ question: unique, session: 's2' });
    expect(JSON.stringify(store.dump())).toMatch(/abuela Carmen/);
  });

  it('lists a question as frequent once it has been asked more than once', async () => {
    const { service } = mount({ sessionLimit: 1 });
    await service.ask({ question: QUESTION, session: 's1' });
    await service.ask({ question: QUESTION, session: 's2' });
    const r = await service.ask({ question: '¿Y con la vivienda?', session: 's1' });
    expect(r).toMatchObject({ state: 'limit', frequent: [QUESTION] });
  });

  it('when the monthly spending cap is reached, only frequent (cached) questions are served, with a notice', async () => {
    // 0.01 € per call. A question reserves its worst case first: 2 parties with pages × 3 attempts ×
    // (answer + V10) = 0.12 €. It actually spends 3 calls (aaa: answer + V10, isla: answer) = 0.03 €.
    const { service, ai, goTo } = mount({ monthlyCap: 0.14, callCost: () => 0.01 });
    expect(await service.ask({ question: QUESTION, session: 's1' })).toMatchObject({ state: 'ok' });
    // 0.03 spent + 0.12 reserved > 0.14.
    const calls = ai.calls.length;
    const r = await service.ask({ question: '¿Y con la vivienda?', session: 's1' });
    expect(r).toMatchObject({ state: 'frequentOnly', message: expect.stringMatching(/frecuentes/), frequent: expect.any(Array) });
    expect(ai.calls.length).toBe(calls);
    expect(await service.ask({ question: QUESTION, session: 's3' })).toMatchObject({ state: 'ok', fromCache: true });
    // A new month starts from zero.
    goTo('2026-12-01T00:00:01Z');
    expect(await service.ask({ question: '¿Y con la vivienda?', session: 's1' })).toMatchObject({ state: 'ok' });
  });

  it('reserves the worst case (every rewrite and its V10 check) before starting a question', async () => {
    // Would really cost 0.03 €, but in the worst case 0.12 €: not started with 0.10 € left.
    const { service, ai } = mount({ monthlyCap: 0.1, callCost: () => 0.01 });
    expect(await service.ask({ question: QUESTION, session: 's1' })).toMatchObject({ state: 'frequentOnly' });
    expect(ai.calls).toHaveLength(0);
  });

  it('only what was actually spent stays charged once the question is answered', async () => {
    // 0.03 € spent of a 0.12 € reservation: a second question (0.03 + 0.12 ≤ 0.2) still fits.
    const { service } = mount({ monthlyCap: 0.2, callCost: () => 0.01 });
    expect(await service.ask({ question: QUESTION, session: 's1' })).toMatchObject({ state: 'ok' });
    expect(await service.ask({ question: '¿Y con la vivienda?', session: 's1' })).toMatchObject({ state: 'ok' });
  });

  it('a question that would go over the cap mid-way is not started', async () => {
    const { service, ai } = mount({ monthlyCap: 0.015, callCost: () => 0.01 });
    // Needs at least 2 calls (0.02 €) and only 0.015 € are left.
    expect(await service.ask({ question: QUESTION, session: 's1' })).toMatchObject({ state: 'frequentOnly' });
    expect(ai.calls).toHaveLength(0);
  });

  it('an AI failure is a clear error and is not cached', async () => {
    const ai = fakeAi({
      'answer-question': () => {
        throw new Error('caído');
      },
    });
    const { service, store } = mount({}, ai);
    expect(await service.ask({ question: QUESTION, session: 's1' })).toMatchObject({ state: 'error', message: expect.any(String) });
    expect(store.keys().filter((c) => c.startsWith('cache:'))).toEqual([]);
  });

  it('never logs the question or the session', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const { service } = mount();
    await service.ask({ question: QUESTION, session: 's1' });
    for (const e of spies) expect(e).not.toHaveBeenCalled();
  });
});

describe('Cloudflare function (src/worker)', () => {
  const ORIGIN = 'https://29n.jorgemasta.com';
  const assets = {
    requested: [] as string[],
    async fetch(input: Request | string) {
      const path = new URL(typeof input === 'string' ? input : input.url).pathname;
      assets.requested.push(path);
      const { readFile } = await import('node:fs/promises');
      try {
        return new Response(await readFile(`public${path}`, 'utf8'), { status: 200 });
      } catch {
        return new Response('404', { status: 404 });
      }
    },
  };
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    new Request(`${ORIGIN}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers }, body: JSON.stringify(body) });

  async function handler(deps: Parameters<typeof import('../src/worker').createHandler>[0] = {}) {
    const { createHandler } = await import('../src/worker');
    return createHandler({ ai: () => fakeAi(), ...deps });
  }

  it('the free question is closed unless FREE_QUESTION=1 and the KV store is bound', async () => {
    const f = await handler();
    const r = await f(post('/api/ask', { question: QUESTION, session: 's1' }), { ASSETS: assets, QUESTIONS: createMemoryStore() });
    expect(await r.json()).toMatchObject({ state: 'closed' });
    const noKv = await f(post('/api/ask', { question: QUESTION, session: 's1' }), { ASSETS: assets, FREE_QUESTION: '1' });
    expect(await noKv.json()).toMatchObject({ state: 'closed' });
  });

  it('answers from the published page texts when open', async () => {
    const f = await handler();
    const r = await f(post('/api/ask', { question: '¿Qué proponen sobre el alquiler?', session: 's1' }), {
      ASSETS: assets,
      QUESTIONS: createMemoryStore(),
      FREE_QUESTION: '1',
    });
    const body = (await r.json()) as any;
    expect(body.state).toBe('ok');
    expect(r.headers.get('cache-control')).toBe('no-store');
    // Public mode: the provisional-source party (prueba-d) is not asked.
    expect(body.answers.map((x: any) => x.party).sort()).toEqual(['prueba-a', 'prueba-b', 'prueba-c', 'prueba-e']);
    expect(assets.requested).toContain('/texts/prueba-a.json');
  });

  it('never serves the page texts directly, and passes everything else to the static site', async () => {
    const f = await handler();
    expect((await f(new Request(`${ORIGIN}/texts/prueba-a.json`), { ASSETS: assets })).status).toBe(404);
    // robots.txt is generated at build time now (#16): use a file that lives in public/.
    expect((await f(new Request(`${ORIGIN}/og.png`), { ASSETS: assets })).status).toBe(200);
  });

  it('keeps the /?r=reto link preview (#9): only the og title of "/" changes', async () => {
    const { OG } = await import('../src/share');
    const html = `<meta property="og:title" content="${OG.title}">`;
    const env = { ASSETS: { fetch: async () => new Response(html, { headers: { 'content-type': 'text/html' } }) } };
    const f = await handler();
    expect(await (await f(new Request(`${ORIGIN}/?r=reto`), env)).text()).toContain(OG.challengeTitle);
    expect(await (await f(new Request(`${ORIGIN}/`), env)).text()).toBe(html);
  });

  it('rejects requests from another site, non-JSON and oversized bodies', async () => {
    const f = await handler();
    const env = { ASSETS: assets, QUESTIONS: createMemoryStore(), FREE_QUESTION: '1' };
    expect((await f(post('/api/ask', { question: QUESTION, session: 's' }, { origin: 'https://malo.example' }), env)).status).toBe(400);
    expect((await f(post('/api/ask', { question: 'x'.repeat(9000), session: 's' }), env)).status).toBe(400);
    expect((await f(new Request(`${ORIGIN}/api/ask`), env)).status).toBe(400);
  });

  it('"Reportar error" files the issue with the token, or falls back to the GitHub link without it', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchGitHub = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ html_url: 'https://github.com/jorgemasta/29n/issues/99' }), { status: 201 });
    }) as unknown as typeof fetch;
    const f = await handler({ fetchGitHub });
    const feedback = { type: 'missing-party', party: 'Partido Nuevo' };
    const without = await f(post('/api/feedback', { feedback, session: 's1' }), { ASSETS: assets });
    expect(await without.json()).toMatchObject({ state: 'unavailable', fallbackUrl: expect.stringContaining('github.com') });
    expect(calls).toHaveLength(0);
    const withChanges = await f(post('/api/feedback', { feedback, session: 's1' }, { 'cf-connecting-ip': '203.0.113.9' }), { ASSETS: assets, GITHUB_TOKEN: 't0k3n' });
    expect(await withChanges.json()).toEqual({ state: 'created', url: 'https://github.com/jorgemasta/29n/issues/99' });
    expect(calls[0]!.url).toBe('https://api.github.com/repos/jorgemasta/29n/issues');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer t0k3n');
    expect(String(calls[0]!.init.body)).not.toContain('203.0.113.9');
  });
});
