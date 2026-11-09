// Test point A: the data pipeline, exercised only through processManifesto.
import { describe, expect, it } from 'vitest';
import { processManifesto, type ProcessOptions } from '../src/pipeline';
import { mergeManifesto } from '../src/pipeline/publish';
import { createFakeAI, type FakeResponses } from '../src/ai/fake';
import { createMemoryCache } from '../src/ai/cache';
import { buildDataset, validateDataset } from '../src/dataset';
import { createTestPdf } from './fixtures/pdf';
import {
  testDomains,
  sampleParty,
  otherParty,
  otherPosition,
  thirdPosition,
  housingTopic,
  thirdParty,
  testTerms,
} from './fixtures/registry';
import { RUBRIC_VERSION } from '../src/registry/rubric';
import type { Report, Position, Topic } from '../src/dataset/schema';

/** Rewrites recorded in the verification report for a topic (default: the only one). */
const rewrites = (report: { positions: { topic: string; rewrites: number }[] }, topic = 'vivienda') =>
  report.positions.find((p) => p.topic === topic)?.rewrites;
/** Fake AI behaviour: answers `good` only once the request mentions `hint` (the feedback reached it), else `bad`. */
const fixesWith =
  <T,>(hint: string | RegExp, bad: T, good: T) =>
  (input: unknown) => {
    const received = JSON.stringify(input);
    return (typeof hint === 'string' ? received.includes(hint) : hint.test(received)) ? good : bad;
  };

const QUOTE =
  'Limitaremos el precio del alquiler en las zonas tensionadas y ampliaremos el parque público de vivienda.';

const pages = [
  ['Programa electoral 2026', 'Índice'],
  [
    'Vivienda',
    'Limitaremos el precio del alqui-',
    'ler en las zonas tensionadas y ampliaremos el parque público de vivienda.',
  ],
  ['Pensiones', 'Revalorizaremos las pensiones con el IPC cada año.'],
];

// 15 + 14 = 29 words: inside V5's 25–70 range.
const goodNeutral = {
  what: 'Limitar por ley el precio del alquiler de vivienda en las zonas tensionadas del país.',
  how: 'Declarando esas zonas y ampliando además el parque público de vivienda disponible para alquilar.',
  figure: null,
};

const INE_SOURCE = { title: 'INE: Índice de precios de vivienda en alquiler', url: 'https://www.ine.es/alquiler' };
const BOE_SOURCE = { title: 'BOE: Ley 12/2023 por el derecho a la vivienda', url: 'https://www.boe.es/eli/es/l/2023/05/24/12' };

const reasons = {
  competence: 'La vivienda es competencia autonómica; el Estado fija bases.',
  cost: 'Coste bajo para el Estado; el parque público requiere inversión.',
  legal: 'La ley estatal de vivienda ya prevé zonas tensionadas.',
  precedents: 'Hay precedentes en Cataluña y en otros países europeos.',
  majority: 'Basta una ley ordinaria.',
};

function assessment(level: string, extra: Record<string, unknown> = {}) {
  return { level, reasons, why: `Evaluada como ${level}. Depende de las comunidades.`, sources: [INE_SOURCE], ...extra };
}
const faithful = { adds: false, omits: false, changesMeaning: false, explanation: 'Fiel a la cita.' };

/** V12 does not confirm the absence: the second pass finds a proposal. */
const secondPassFinds = { 'confirm-absence': () => ({ proposes: true, quotes: [{ text: QUOTE, page: 2 }] }) };
/** A neutral text of exactly `n` words (V5). */
const textOf = (n: number) => ({ what: words(n - 1), how: 'fin.', figure: null });
/** A published position of another party on the topic, `n` words long. */
const publishedOf = (party: string, n: number): Position => ({ ...(otherPosition as Extract<Position, { state: 'proposes' }>), party, text: textOf(n) });
/** Minimal report of a party already in the published dataset. */
const reportOf = (party: string): Report => ({
  party,
  hashPdf: 'a'.repeat(64),
  promptVersion: 'v1',
  extracted: 1,
  discarded: 0,
  publishable: true,
  positions: [{ topic: 'vivienda', state: 'proposes', rewrites: 0 }],
  entries: [],
});
const words = (n: number) => Array.from({ length: n }, (_, i) => `palabra${String.fromCharCode(97 + (i % 26))}`).join(' ');

function answers(extra: Partial<FakeResponses> = {}): FakeResponses {
  return {
    'extract-position': () => ({ proposes: true, quotes: [{ text: QUOTE, page: 2 }] }),
    neutralize: () => goodNeutral,
    'assess-feasibility': () => assessment('viableWithCaveats'),
    'verify-fidelity': () => faithful,
    'guess-party': () => ({ assignments: [] }),
    'confirm-absence': () => ({ proposes: false, quotes: [] }),
    'answer-question': () => ({ mentions: false, what: '', how: '', figure: null, quotes: [] }),
    ...extra,
  };
}

const options = (o: Partial<ProcessOptions> = {}): ProcessOptions => ({
  topics: [housingTopic],
  terms: testTerms,
  // V8 checks HTTP 200; tests never hit the network.
  checkUrl: async () => true,
  domains: testDomains,
  // Suggested questions are tested on their own (see "suggested questions").
  questions: [],
  ...o,
});

async function runPipeline(r: FakeResponses, o: Partial<ProcessOptions> = {}) {
  const pdf = await createTestPdf(pages);
  const ai = createFakeAI(r);
  const result = await processManifesto(pdf, sampleParty, ai, options(o));
  return { ...result, ai };
}

describe('processManifesto', () => {
  it('turns a programme into a verified, neutral position with its literal quote', async () => {
    const { positions, report, publishable } = await runPipeline(answers());

    expect(publishable).toBe(true);
    expect(positions).toEqual([
      expect.objectContaining({
        party: 'pej',
        topic: 'vivienda',
        state: 'proposes',
        text: goodNeutral,
        quotes: [{ text: QUOTE, page: 2 }],
      }),
    ]);
    expect(report.party).toBe('pej');
    expect(report.hashPdf).toMatch(/^[0-9a-f]{64}$/);
    expect(report.discarded).toBe(0);
  });

  it('publishes the page text of the programme, for the live free question (#15)', async () => {
    const { text, report } = await runPipeline(answers());
    expect(text).toEqual({ party: 'pej', hashPdf: report.hashPdf, pages: expect.any(Array) });
    expect(text!.pages).toHaveLength(pages.length);
    expect(text!.pages[1]).toContain('Limitaremos el precio');
  });

  it('records when a party proposes nothing on a topic', async () => {
    const { positions, publishable } = await runPipeline(
      answers({ 'extract-position': () => ({ proposes: false, quotes: [] }) }),
    );
    expect(positions).toEqual([expect.objectContaining({ topic: 'vivienda', state: 'noProposal' })]);
    expect(publishable).toBe(true);
  });

  describe('V1: the quote exists in the PDF', () => {
    it('discards a position whose quote was invented by the AI', async () => {
      const { positions, report, publishable } = await runPipeline(
        answers({
          'extract-position': () => ({
            proposes: true,
            quotes: [{ text: 'Regalaremos una vivienda a cada joven que cumpla dieciocho años en todo el país.', page: 2 }],
          }),
          ...secondPassFinds,
        }),
      );
      expect(positions).toEqual([expect.objectContaining({ topic: 'vivienda', state: 'unverified' })]);
      expect(report.discarded).toBe(1);
      expect(report.entries).toContainEqual(
        expect.objectContaining({ topic: 'vivienda', check: 'V1', result: 'discard' }),
      );
      expect(publishable).toBe(false);
    });

    it('accepts a quote split by an end-of-line hyphen (the PDF reads "alqui-" / "ler")', async () => {
      const { positions } = await runPipeline(answers());
      expect(positions[0]?.state).toBe('proposes');
    });

    it('accepts a quote whose typographic quotes and spacing differ from the PDF', async () => {
      const pdf = await createTestPdf([
        ['Defenderemos el «derecho a la vivienda» como un', 'derecho   fundamental exigible ante los tribunales.'],
      ]);
      const ai = createFakeAI(
        answers({
          'extract-position': () => ({
            proposes: true,
            quotes: [
              {
                text: 'Defenderemos el "derecho a la vivienda" como un derecho fundamental exigible ante los tribunales.',
                page: 1,
              },
            ],
          }),
        }),
      );
      const { positions } = await processManifesto(pdf, sampleParty, ai, options());
      expect(positions[0]?.state).toBe('proposes');
    });

    it('rejects quotes shorter than 40 characters', async () => {
      const { positions } = await runPipeline(
        answers({
          'extract-position': () => ({ proposes: true, quotes: [{ text: 'parque público de vivienda', page: 2 }] }),
          ...secondPassFinds,
        }),
      );
      expect(positions[0]?.state).toBe('unverified');
    });

    it('fixes the page number when the quote is on another page', async () => {
      const { positions } = await runPipeline(
        answers({ 'extract-position': () => ({ proposes: true, quotes: [{ text: QUOTE, page: 3 }] }) }),
      );
      expect(positions[0]).toEqual(expect.objectContaining({ quotes: [{ text: QUOTE, page: 2 }] }));
    });
  });

  describe('V3: no identifying marks', () => {
    it('rewrites a neutral text that names any party leader, telling the AI what to avoid', async () => {
      // The fake AI only drops the leader's name once it is told to avoid it.
      const { positions, report } = await runPipeline(
        answers({
          neutralize: fixesWith('Bruno Jefe', { ...goodNeutral, how: 'Como propone Bruno Jefe, ampliando el parque público.' }, goodNeutral),
        }),
      );
      expect(positions[0]).toEqual(expect.objectContaining({ state: 'proposes', text: goodNeutral }));
      expect(rewrites(report)).toBe(1);
      expect(report.entries).toContainEqual(
        expect.objectContaining({ topic: 'vivienda', check: 'V3', result: 'rewrite' }),
      );
    });

    it('matches acronyms ignoring case and accents ("Ana Lider", "pej")', async () => {
      const { positions } = await runPipeline(
        answers({
          neutralize: (_e, attempt) =>
            attempt === 0
              ? { ...goodNeutral, what: 'Lo que pej y ana lider proponen para el alquiler.' }
              : goodNeutral,
        }),
      );
      expect(positions[0]?.state).toBe('proposes');
    });

    it('does not flag words that merely contain an acronym', async () => {
      const { report } = await runPipeline(
        answers({ neutralize: () => ({ ...goodNeutral, how: 'Con un plan espejo del modelo vienés y sin topes.' }) }),
      );
      expect(rewrites(report)).toBe(0);
    });

    it('discards the position after 2 failed rewrites', async () => {
      const { positions, report } = await runPipeline(
        answers({ neutralize: () => ({ ...goodNeutral, what: 'La propuesta de OTP sobre el alquiler.' }) }),
      );
      expect(rewrites(report)).toBe(2);
      expect(positions[0]?.state).toBe('unverified');
      expect(report.entries).toContainEqual(
        expect.objectContaining({ topic: 'vivienda', check: 'V3', result: 'discard' }),
      );
    });
  });

  describe('V13: double-blind feasibility', () => {
    const feasibility = async (r: FakeResponses, o: Partial<ProcessOptions> = {}) => {
      const res = await runPipeline(r, o);
      const p = res.positions[0];
      if (p?.state !== 'proposes' || !p.feasibility) throw new Error('sin nota de viabilidad');
      return { ...res, note: p.feasibility };
    };

    it('publishes the level when both evaluations agree, with reasons per criterion and versions', async () => {
      const { note } = await feasibility(answers());
      expect(note.result).toBe('viableWithCaveats');
      expect(note.why).toBe('Evaluada como viableWithCaveats. Depende de las comunidades.');
      expect(note.sources).toEqual([INE_SOURCE]);
      expect(note.assessments).toHaveLength(2);
      for (const e of note.assessments) expect(Object.keys(e.reasons).sort()).toEqual(['competence', 'cost', 'legal', 'majority', 'precedents']);
      expect(note.versions).toEqual({ prompt: expect.any(String), rubric: RUBRIC_VERSION });
    });

    it('never tells the evaluators which party the proposal is from', async () => {
      const quoteWithMark =
        'Partido Ejemplo limitará el precio del alquiler en las zonas tensionadas, como ha dicho Ana Líder.';
      const pdf = await createTestPdf([['Vivienda', quoteWithMark]]);
      const ai = createFakeAI(
        answers({ 'extract-position': () => ({ proposes: true, quotes: [{ text: quoteWithMark, page: 1 }] }) }),
      );
      await processManifesto(pdf, sampleParty, ai, options());
      const calls = ai.calls.filter((l) => l.task === 'assess-feasibility');
      expect(calls).toHaveLength(2);
      for (const l of calls) {
        const received = JSON.stringify(l.input) + l.instructions;
        expect(received).not.toMatch(/partido ejemplo|ana l[ií]der|\bpej\b/i);
        // It does get the neutral text and the (masked) quote.
        expect(received).toContain(goodNeutral.what);
        expect(received).toContain('limitará el precio del alquiler en las zonas tensionadas');
      }
    });

    it('publishes "sin concreción" when both evaluations say so', async () => {
      const { note } = await feasibility(
        answers({ 'assess-feasibility': () => assessment('notConcrete', { sources: [] }) }),
      );
      expect(note.result).toBe('notConcrete');
    });

    it('publishes "sin consenso" with both arguments when the evaluations disagree', async () => {
      const { note, report } = await feasibility(
        answers({ 'assess-feasibility': (e) => assessment(e.assessment === 1 ? 'viable' : 'difficult') }),
      );
      expect(note.result).toBe('noConsensus');
      expect(note.why).toBeNull();
      expect(note.assessments.map((e) => [e.level, e.why])).toEqual([
        ['viable', 'Evaluada como viable. Depende de las comunidades.'],
        ['difficult', 'Evaluada como difficult. Depende de las comunidades.'],
      ]);
      expect(report.entries).toContainEqual(expect.objectContaining({ check: 'V13', detail: expect.stringContaining('sin consenso') }));
    });

    it('keeps the two evaluations independent when answers come from the cache', async () => {
      const cache = createMemoryCache();
      const r = answers({ 'assess-feasibility': (e) => assessment(e.assessment === 1 ? 'viable' : 'difficult') });
      const first = await feasibility(r, { cache });
      const second = await feasibility(r, { cache });
      expect(second.ai.calls).toHaveLength(0);
      expect(second.note).toEqual(first.note);
      expect(second.note.result).toBe('noConsensus');
    });
  });

  describe('V8: feasibility sources', () => {
    const feasibility = async (r: FakeResponses, o: Partial<ProcessOptions> = {}) => {
      const res = await runPipeline(r, o);
      const p = res.positions[0];
      if (p?.state !== 'proposes' || !p.feasibility) throw new Error('sin nota de viabilidad');
      return { ...res, note: p.feasibility };
    };

    it('caches the HTTP check with the AI answers: re-running the same PDF offline keeps the sources', async () => {
      const cache = createMemoryCache();
      const r = answers({ 'assess-feasibility': () => assessment('viable', { sources: [INE_SOURCE, BOE_SOURCE] }) });
      const online = await feasibility(r, { cache, checkUrl: async () => true });
      const checked: string[] = [];
      const offline = await feasibility(r, {
        cache,
        checkUrl: async (url) => {
          checked.push(url);
          return false;
        },
      });
      expect(checked).toEqual([]);
      expect(offline.note).toEqual(online.note);
      expect(offline.note.sources).toEqual([INE_SOURCE, BOE_SOURCE]);
    });

    it('removes a source outside the institutional domain list', async () => {
      const { note, report } = await feasibility(
        answers({
          'assess-feasibility': () =>
            assessment('viable', { sources: [INE_SOURCE, { title: 'Un blog', url: 'https://blog.ejemplo.com/alquiler' }] }),
        }),
      );
      expect(note.sources).toEqual([INE_SOURCE]);
      for (const e of note.assessments) expect(e.sources).toEqual([INE_SOURCE]);
      expect(report.entries).toContainEqual(
        expect.objectContaining({ check: 'V8', detail: expect.stringContaining('blog.ejemplo.com') }),
      );
    });

    it('removes a source that does not answer HTTP 200 (checked through the injected function)', async () => {
      const checked: string[] = [];
      const { note } = await feasibility(
        answers({ 'assess-feasibility': () => assessment('viable', { sources: [INE_SOURCE, BOE_SOURCE] }) }),
        {
          checkUrl: async (url) => {
            checked.push(url);
            return url !== BOE_SOURCE.url;
          },
        },
      );
      expect(checked).toContain(BOE_SOURCE.url);
      expect(note.sources).toEqual([INE_SOURCE]);
    });

    it('repeats an evaluation whose "por qué" is left without sources', async () => {
      const { note, report } = await feasibility(
        answers({
          'assess-feasibility': (e) =>
            e.assessment === 2 && !e.repeat
              ? assessment('viable', { sources: [{ title: 'Wiki', url: 'https://es.wikipedia.org/wiki/Alquiler' }] })
              : assessment('viable', { sources: [BOE_SOURCE] }),
        }),
      );
      expect(report.entries.filter((e) => e.check === 'V8' && e.result === 'rewrite')).toHaveLength(1);
      expect(note.assessments[1].sources).toEqual([BOE_SOURCE]);
      expect(note.result).toBe('viable');
      expect(report.entries).toContainEqual(expect.objectContaining({ check: 'V8', result: 'rewrite' }));
    });

    it('gives up repeating after 2 attempts and publishes the note without sources', async () => {
      const { note, report } = await feasibility(
        answers({ 'assess-feasibility': () => assessment('difficult', { sources: [{ title: 'X', url: 'http://www.ine.es/x' }] }) }),
      );
      // 2 repetitions per evaluation, then published without sources (and the report says so).
      expect(report.entries.filter((e) => e.check === 'V8' && e.result === 'rewrite')).toHaveLength(4);
      expect(report.entries).toContainEqual(expect.objectContaining({ check: 'V8', detail: expect.stringContaining('se publica sin fuentes') }));
      expect(note.result).toBe('difficult');
      expect(note.sources).toEqual([]);
    });

    it('does not repeat a "sin concreción" evaluation that has no sources', async () => {
      const { report } = await feasibility(answers({ 'assess-feasibility': () => assessment('notConcrete', { sources: [] }) }));
      expect(report.entries.filter((e) => e.check === 'V8' && e.result !== 'pass')).toEqual([]);
    });
  });

  describe('V10: fidelity to the quote', () => {
    it('an independent verifier gets the quotes and the neutral text, and an addition forces a rewrite', async () => {
      const added = { ...goodNeutral, how: `${goodNeutral.how.slice(0, -1)} y con ayudas.` };
      // The verifier compares the text with the quotes; the writer fixes the text once told why.
      const { positions, report } = await runPipeline(
        answers({
          neutralize: fixesWith('Las ayudas no están en la cita.', added, goodNeutral),
          'verify-fidelity': (input) =>
            input.text.how.includes('ayudas') && input.quotes.every((c: { text: string }) => !c.text.includes('ayudas'))
              ? { adds: true, omits: false, changesMeaning: false, explanation: 'Las ayudas no están en la cita.' }
              : faithful,
        }),
      );
      expect(rewrites(report)).toBe(1);
      expect(positions[0]).toEqual(expect.objectContaining({ state: 'proposes', text: goodNeutral }));
      expect(report.entries).toContainEqual(expect.objectContaining({ topic: 'vivienda', check: 'V10', result: 'rewrite' }));
      expect(report.entries).toContainEqual(expect.objectContaining({ topic: 'vivienda', check: 'V10', result: 'pass' }));
    });

    it.each([
      ['omits an essential condition', { omits: true }],
      ['changes the meaning', { changesMeaning: true }],
    ])('discards the postura when the text still %s after 2 rewrites', async (_case, failure) => {
      const { positions, report } = await runPipeline(
        answers({ 'verify-fidelity': () => ({ ...faithful, ...failure, explanation: 'No es fiel.' }) }),
      );
      expect(rewrites(report)).toBe(2);
      expect(positions[0]?.state).toBe('unverified');
      expect(report.entries).toContainEqual(expect.objectContaining({ topic: 'vivienda', check: 'V10', result: 'discard' }));
    });

    it('never verifies a text that still has identifying marks (V3 first)', async () => {
      // This verifier would reject any text with a party acronym: it must never see one.
      const { positions, report } = await runPipeline(
        answers({
          neutralize: (_e, attempt) => (attempt === 0 ? { ...goodNeutral, what: 'La propuesta de OTP sobre el alquiler.' } : goodNeutral),
          'verify-fidelity': (e) => (JSON.stringify(e.text).includes('OTP') ? { ...faithful, adds: true, explanation: 'OTP' } : faithful),
        }),
      );
      expect(positions[0]).toEqual(expect.objectContaining({ state: 'proposes', text: goodNeutral }));
      expect(report.entries.filter((e) => e.check === 'V10' && e.result !== 'pass')).toEqual([]);
      expect(report.entries).toContainEqual(expect.objectContaining({ check: 'V3', result: 'rewrite' }));
    });
  });

  describe('V11: recognisability', () => {
    const published = { parties: [otherParty, thirdParty], positions: [otherPosition, thirdPosition] };
    /** Guesser that spots our position (the one whose text is `giveaway`) with confidence `confidence`. */
    const guesser =
      (giveaway: string, confidence: number, rounds = Infinity) =>
      (input: any, attempt: number) => ({
        assignments: input.positions.map((p: { letter: string; text: string }) => ({
          letter: p.letter,
          party: p.text.includes(giveaway) && attempt < rounds ? 'pej' : 'otp',
          confidence,
          hint: 'Menciona las zonas tensionadas.',
        })),
      });

    it('the guesser gets every neutral position of the topic and the party list', async () => {
      // This guesser can only spot our position by comparing it with the other two.
      const comparing = (input: any) => ({
        assignments: input.positions.map((p: { letter: string; text: string }) => ({
          letter: p.letter,
          party:
            input.positions.length === 3 &&
            ['otp', 'pej', 'ter'].every((id) => input.parties.some((x: { id: string }) => x.id === id)) &&
            p.text.includes('zonas tensionadas')
              ? 'pej'
              : 'otp',
          confidence: 0.9,
          hint: 'Es la única que habla de zonas tensionadas.',
        })),
      });
      const { report } = await runPipeline(answers({ 'guess-party': comparing }), { published });
      expect(report.entries).toContainEqual(expect.objectContaining({ check: 'V11', result: 'warning' }));
    });

    it('the positions are anonymous: a guesser looking for party names finds none', async () => {
      const cheater = (input: any) => ({
        assignments: input.positions.map((p: any) => ({
          letter: p.letter,
          party: /pej|Partido Ejemplo/i.test(JSON.stringify(p)) ? 'pej' : 'otp',
          confidence: 1,
          hint: 'El nombre.',
        })),
      });
      const { report } = await runPipeline(answers({ 'guess-party': cheater }), { published });
      expect(report.entries).toContainEqual(expect.objectContaining({ check: 'V11', result: 'pass' }));
      expect(rewrites(report)).toBe(0);
    });

    it('the 3 rounds use different orders: a guesser that only goes by position never flags a position', async () => {
      const byPosition = (input: any) => ({
        assignments: input.positions.map((p: { letter: string }) => ({
          letter: p.letter,
          party: p.letter === 'A' ? 'pej' : 'otp',
          confidence: 1,
          hint: 'Va primera.',
        })),
      });
      const { report } = await runPipeline(answers({ 'guess-party': byPosition }), { published });
      expect(report.entries).toContainEqual(expect.objectContaining({ check: 'V11', result: 'pass' }));
    });

    it('rewrites a position guessed 3 of 3 times with mean confidence ≥ 0.7, passing the clue', async () => {
      const otherVersion = { ...goodNeutral, what: 'Poner por ley un tope al precio del alquiler de vivienda en las zonas con precios más altos.' };
      const { positions, report } = await runPipeline(
        answers({
          neutralize: fixesWith('Menciona las zonas tensionadas.', goodNeutral, otherVersion),
          'guess-party': guesser('zonas tensionadas', 0.8),
        }),
        { published },
      );
      expect(rewrites(report)).toBe(1);
      expect(positions[0]).toEqual(expect.objectContaining({ state: 'proposes', text: otherVersion }));
      expect(report.entries).toContainEqual(expect.objectContaining({ check: 'V11', result: 'rewrite' }));
      expect(report.entries).toContainEqual(expect.objectContaining({ check: 'V11', result: 'pass' }));
    });

    it('publishes with an internal warning when the position is still recognisable after the rewrites', async () => {
      const { positions, report, publishable } = await runPipeline(
        answers({ 'guess-party': guesser('alquiler', 0.9) }),
        { published },
      );
      expect(rewrites(report)).toBe(2);
      expect(positions[0]?.state).toBe('proposes');
      expect(report.entries).toContainEqual(expect.objectContaining({ check: 'V11', result: 'warning' }));
      expect(report.discarded).toBe(0);
      expect(publishable).toBe(true);
    });

    it.each([
      ['mean confidence is below 0.7', guesser('alquiler', 0.6)],
      ['it is guessed only 2 of 3 times', guesser('alquiler', 0.9, 2)],
    ])('does not flag the postura when %s', async (_case, guesser) => {
      const { report } = await runPipeline(answers({ 'guess-party': guesser }), { published });
      expect(rewrites(report)).toBe(0);
      expect(report.entries).toContainEqual(expect.objectContaining({ check: 'V11', result: 'pass' }));
    });

    it('checks the first party to publish too, against the list of registered parties', async () => {
      const { report } = await runPipeline(answers({ 'guess-party': guesser('alquiler', 0.9) }), {
        parties: [otherParty, thirdParty],
      });
      expect(report.entries).toContainEqual(expect.objectContaining({ check: 'V11', result: 'warning' }));
    });

    it('skips the guesser when there is no other party to choose from', async () => {
      const { ai, report } = await runPipeline(answers(), { parties: [] });
      expect(ai.calls.filter((l) => l.task === 'guess-party')).toHaveLength(0);
      expect(report.entries).toContainEqual(expect.objectContaining({ check: 'V11', result: 'pass' }));
    });

    it('re-checks the parties already published: a recognisable one gets a warning in its own report, its text untouched', async () => {
      const givesAwayVat = (input: any) => ({
        assignments: input.positions.map((p: { letter: string; text: string }) => ({
          letter: p.letter,
          party: p.text.includes('IVA') ? 'otp' : 'nadie',
          confidence: 0.9,
          hint: 'Habla del IVA.',
        })),
      });
      const previous = buildDataset({
        parties: [otherParty, thirdParty],
        topics: [housingTopic],
        results: [
          { report: reportOf('otp'), positions: [otherPosition] },
          { report: reportOf('ter'), positions: [thirdPosition] },
        ],
        generated: '2026-11-08T00:00:00.000Z',
        origin: 'real',
      });
      const result = await runPipeline(answers({ 'guess-party': givesAwayVat }), { published: previous });
      // Our own position is not recognised.
      expect(result.report.entries).toContainEqual(expect.objectContaining({ check: 'V11', result: 'pass' }));
      const publish = (ds: typeof previous) =>
        mergeManifesto(ds, sampleParty, result, { topics: [housingTopic], questions: [], generated: '2026-11-08T00:00:00.000Z' });
      const merge = publish(previous);
      if (!merge.ok) throw new Error(merge.reason);
      const feedbackOtp = merge.dataset.reports.find((i) => i.party === 'otp')!.entries;
      expect(feedbackOtp).toEqual([
        expect.objectContaining({ topic: 'vivienda', check: 'V11', result: 'warning', detail: expect.stringContaining('Partido Ejemplo') }),
      ]);
      expect(merge.dataset.reports.find((i) => i.party === 'ter')!.entries).toEqual([]);
      // Never silently rewritten: the published text and note stay as they were.
      expect(merge.dataset.positions.find((p) => p.party === 'otp')).toEqual(otherPosition);
      // Publishing the same programme again replaces the warning instead of piling it up.
      const again = publish(merge.dataset);
      if (!again.ok) throw new Error(again.reason);
      expect(again.dataset.reports.find((i) => i.party === 'otp')!.entries).toHaveLength(1);
    });
  });

  describe('V12: confirmed absence', () => {
    const noProposal = { 'extract-position': () => ({ proposes: false, quotes: [] }) };

    it('extracts the position when the second pass finds a proposal the first one missed', async () => {
      const { positions, report } = await runPipeline(answers({ ...noProposal, ...secondPassFinds }));
      expect(positions[0]).toEqual(expect.objectContaining({ state: 'proposes', quotes: [{ text: QUOTE, page: 2 }] }));
      expect(report.entries).toContainEqual(expect.objectContaining({ check: 'V12', result: 'extract' }));
    });

    it('marks "proposes nothing" when the targeted question confirms it, recording the terms searched', async () => {
      const { positions, report } = await runPipeline(answers(noProposal));
      expect(positions[0]?.state).toBe('noProposal');
      const input = report.entries.find((e) => e.check === 'V12')!;
      expect(input.result).toBe('pass');
      expect(input.detail).toContain('alquiler');
    });

    it('confirms the absence without asking the AI when no keyword appears in the programme', async () => {
      const pdf = await createTestPdf([['Pensiones', 'Revalorizaremos las pensiones con el IPC cada año.']]);
      const ai = createFakeAI(answers({ ...noProposal, ...secondPassFinds }));
      const { positions } = await processManifesto(pdf, sampleParty, ai, options());
      expect(ai.calls.filter((l) => l.task === 'confirm-absence')).toHaveLength(0);
      expect(positions[0]?.state).toBe('noProposal');
    });

    it('shows a discarded position as "proposes nothing" only when V12 confirms it', async () => {
      const invented = {
        'extract-position': () => ({
          proposes: true,
          quotes: [{ text: 'Regalaremos una vivienda a cada joven que cumpla dieciocho años en todo el país.', page: 2 }],
        }),
      };
      const confirmed = await runPipeline(answers(invented));
      expect(confirmed.positions[0]?.state).toBe('noProposal');
      expect(confirmed.report.discarded).toBe(1);

      const unconfirmed = await runPipeline(answers({ ...invented, ...secondPassFinds }));
      expect(unconfirmed.positions[0]?.state).toBe('unverified');
    });

    it('a position discarded after its quotes were verified stays "could not verify" (it does exist)', async () => {
      // The default fake V12 would confirm an absence: it is not asked.
      const { positions } = await runPipeline(
        answers({ neutralize: () => ({ ...goodNeutral, what: 'La propuesta de OTP sobre el alquiler.' }) }),
      );
      expect(positions[0]?.state).toBe('unverified');
    });
  });

  describe('V2: correct page', () => {
    it('fixes the declared page automatically and records the correction', async () => {
      const { positions, report } = await runPipeline(
        answers({ 'extract-position': () => ({ proposes: true, quotes: [{ text: QUOTE, page: 1 }] }) }),
      );
      expect(positions[0]).toEqual(expect.objectContaining({ state: 'proposes', quotes: [{ text: QUOTE, page: 2 }] }));
      expect(report.entries).toContainEqual(
        expect.objectContaining({ topic: 'vivienda', check: 'V2', result: 'fix', detail: expect.stringContaining('1 → 2') }),
      );
    });

    it('records a pass when the declared page is right', async () => {
      const { report } = await runPipeline(answers());
      expect(report.entries).toContainEqual(expect.objectContaining({ topic: 'vivienda', check: 'V2', result: 'pass' }));
    });

    it('discards the position when the quote is on no page at all', async () => {
      const { positions } = await runPipeline(
        answers({
          'extract-position': () => ({
            proposes: true,
            quotes: [{ text: 'Limitaremos el precio del alquiler en todas las ciudades del país sin excepción alguna.', page: 7 }],
          }),
          ...secondPassFinds,
        }),
      );
      expect(positions[0]?.state).toBe('unverified');
    });
  });

  describe('V4: traceable figures', () => {
    const QUOTE_FIGURES =
      'Construiremos 50.000 viviendas públicas al año y limitaremos el alquiler al 30 % de los ingresos del hogar.';
    const figurePages = [['Vivienda', QUOTE_FIGURES]];
    const extractFigures = () => ({ proposes: true, quotes: [{ text: QUOTE_FIGURES, page: 1 }] });
    const withFigures = {
      what: 'Construir vivienda pública cada año y limitar por ley lo que pagan los hogares de alquiler.',
      how: 'El alquiler de esas viviendas no podría superar el 30% de los ingresos de cada hogar inquilino.',
      figure: '50000 viviendas al año',
    };

    async function processFigures(r: FakeResponses, o: Partial<ProcessOptions> = {}) {
      const pdf = await createTestPdf(figurePages);
      const ai = createFakeAI(r);
      return { ...(await processManifesto(pdf, sampleParty, ai, options(o))), ai };
    }

    it('accepts figures that appear in a quote, whatever their format ("50000" vs "50.000", "30%" vs "30 %")', async () => {
      const { positions, report } = await processFigures(answers({ 'extract-position': extractFigures, neutralize: () => withFigures }));
      expect(positions[0]).toEqual(expect.objectContaining({ state: 'proposes', text: withFigures }));
      expect(rewrites(report)).toBe(0);
      expect(report.entries).toContainEqual(expect.objectContaining({ check: 'V4', result: 'pass' }));
    });

    it('rewrites a text with a figure that is in none of its quotes, telling the AI which one', async () => {
      const { positions, report } = await processFigures(
        answers({
          'extract-position': extractFigures,
          neutralize: fixesWith(/no aparecen en las citas[^"]*40/, { ...withFigures, how: withFigures.how.replace('30%', '40 %') }, withFigures),
        }),
      );
      expect(positions[0]).toEqual(expect.objectContaining({ state: 'proposes', text: withFigures }));
      expect(rewrites(report)).toBe(1);
      expect(report.entries).toContainEqual(
        expect.objectContaining({ topic: 'vivienda', check: 'V4', result: 'rewrite', detail: expect.stringContaining('40') }),
      );
    });

    it('checks the figure field too, and discards after 2 failed rewrites', async () => {
      const { positions, report } = await processFigures(
        answers({ 'extract-position': extractFigures, neutralize: () => ({ ...withFigures, figure: '2030' }) }),
      );
      expect(rewrites(report)).toBe(2);
      expect(positions[0]?.state).toBe('unverified');
      expect(report.entries).toContainEqual(expect.objectContaining({ check: 'V4', result: 'discard' }));
    });
  });

  describe('V5: equal length', () => {
    it('rewrites a text shorter than 25 words', async () => {
      const short = { what: 'Limitar el alquiler.', how: 'Con más vivienda pública.', figure: null };
      const { positions, report } = await runPipeline(
        answers({ neutralize: (_e, attempt) => (attempt === 0 ? short : goodNeutral) }),
      );
      expect(positions[0]).toEqual(expect.objectContaining({ state: 'proposes', text: goodNeutral }));
      expect(rewrites(report)).toBe(1);
      expect(report.entries).toContainEqual(
        expect.objectContaining({ check: 'V5', result: 'rewrite', detail: expect.stringContaining('7 palabras') }),
      );
    });

    it('rewrites a text longer than 70 words', async () => {
      const long = { ...goodNeutral, how: `${goodNeutral.how} ${words(60)}` };
      const { report } = await runPipeline(answers({ neutralize: (_e, attempt) => (attempt === 0 ? long : goodNeutral) }));
      expect(rewrites(report)).toBe(1);
      expect(report.entries).toContainEqual(expect.objectContaining({ check: 'V5', result: 'rewrite' }));
    });

    it('rewrites a text outside ±25 % of the topic median, giving the AI the target range', async () => {
      // Topic: 38, 40 and 42 words published + this 29-word text → median 39: out. Target: 30–50 (±25 % of 40).
      const long = { ...goodNeutral, how: `${goodNeutral.how} ${words(15)}` }; // 44 words
      const published = { parties: [], positions: [publishedOf('otp', 40), publishedOf('ter', 38), publishedOf('cua', 42)] };
      const { positions, report } = await runPipeline(
        answers({ neutralize: fixesWith(/entre 30 y 50 palabras/, goodNeutral, long) }),
        { published },
      );
      expect(positions[0]).toEqual(expect.objectContaining({ state: 'proposes', text: long }));
      expect(rewrites(report)).toBe(1);
      expect(report.entries).toContainEqual(
        expect.objectContaining({ check: 'V5', result: 'rewrite', detail: expect.stringContaining('mediana') }),
      );
    });

    it('the first party on a topic is only held to the 25–70 range (the median is its own length)', async () => {
      const long = textOf(65);
      const { positions } = await runPipeline(answers({ neutralize: () => long, 'extract-position': () => ({ proposes: true, quotes: [{ text: QUOTE, page: 2 }] }) }));
      expect(positions[0]).toEqual(expect.objectContaining({ state: 'proposes', text: long }));
    });

    it('the median counts the new text: published parties now outside ±25 % get a warning in their report', async () => {
      // 29 (this one), 30 and 60 words → median 30: this text passes, the 60-word one is flagged.
      const published = { parties: [otherParty, thirdParty], positions: [publishedOf('otp', 30), publishedOf('ter', 60)] };
      const result = await runPipeline(answers(), { published });
      expect(result.positions[0]).toEqual(expect.objectContaining({ state: 'proposes', text: goodNeutral }));
      expect(rewrites(result.report)).toBe(0);
      const previous = buildDataset({
        parties: [otherParty, thirdParty],
        topics: [housingTopic],
        results: published.positions.map((p) => ({ report: reportOf(p.party), positions: [p] })),
        generated: '2026-11-08T00:00:00.000Z',
        origin: 'real',
      });
      const merge = mergeManifesto(previous, sampleParty, result, { topics: [housingTopic], questions: [], generated: '2026-11-08T00:00:00.000Z' });
      if (!merge.ok) throw new Error(merge.reason);
      expect(merge.dataset.reports.find((i) => i.party === 'ter')!.entries).toEqual([
        expect.objectContaining({ topic: 'vivienda', check: 'V5', result: 'warning', detail: expect.stringContaining('60 palabras') }),
      ]);
      expect(merge.dataset.reports.find((i) => i.party === 'otp')!.entries).toEqual([]);
    });

    it('discards after 2 failed rewrites', async () => {
      const short = { what: 'Limitar el alquiler.', how: 'Con más vivienda pública.', figure: null };
      const { positions, report } = await runPipeline(answers({ neutralize: () => short }));
      expect(rewrites(report)).toBe(2);
      expect(positions[0]?.state).toBe('unverified');
    });
  });

  describe('V6: template', () => {
    it('rewrites a text whose "what" field is missing', async () => {
      const { positions, report } = await runPipeline(
        answers({ neutralize: (_e, attempt) => (attempt === 0 ? { ...goodNeutral, what: '  ' } : goodNeutral) }),
      );
      expect(positions[0]).toEqual(expect.objectContaining({ state: 'proposes', text: goodNeutral }));
      expect(rewrites(report)).toBe(1);
      expect(report.entries).toContainEqual(
        expect.objectContaining({ check: 'V6', result: 'rewrite', detail: expect.stringContaining('qué') }),
      );
    });

    it('rewrites a text whose "how" field is missing, and discards it if it never arrives', async () => {
      const { positions, report } = await runPipeline(answers({ neutralize: () => ({ ...goodNeutral, how: '' }) }));
      expect(rewrites(report)).toBe(2);
      expect(positions[0]?.state).toBe('unverified');
      expect(report.entries).toContainEqual(expect.objectContaining({ check: 'V6', result: 'discard', detail: expect.stringContaining('cómo') }));
    });

    it('treats the figure as optional (an empty figure becomes null)', async () => {
      const { positions, report } = await runPipeline(answers({ neutralize: () => ({ ...goodNeutral, figure: '' }) }));
      expect(rewrites(report)).toBe(0);
      expect(positions[0]).toEqual(expect.objectContaining({ state: 'proposes', text: { ...goodNeutral, figure: null } }));
    });
  });

  describe('V7: official source', () => {
    it('records the source URL, PDF hash and date of an allowed domain (subdomains included)', async () => {
      const party = { ...sampleParty, manifesto: { ...sampleParty.manifesto, url: 'https://www.ejemplo.org/docs/p.pdf' } };
      const pdf = await createTestPdf(pages);
      const { report, publishable } = await processManifesto(pdf, party, createFakeAI(answers()), options({ date: '2026-11-08' }));
      expect(publishable).toBe(true);
      expect(report).toEqual(
        expect.objectContaining({ url: 'https://www.ejemplo.org/docs/p.pdf', hashPdf: expect.stringMatching(/^[0-9a-f]{64}$/), date: '2026-11-08' }),
      );
      expect(report.entries).toContainEqual(expect.objectContaining({ check: 'V7', result: 'pass' }));
    });

    it('blocks a programme whose PDF comes from a domain not allowed for that party', async () => {
      for (const url of ['https://otro-partido.es/programa.pdf', 'https://ejemplo.org.malo.com/p.pdf', 'https://falsoejemplo.org/p.pdf']) {
        const party = { ...sampleParty, manifesto: { ...sampleParty.manifesto, url } };
        const pdf = await createTestPdf(pages);
        const ai = createFakeAI(answers());
        const { report, publishable, positions } = await processManifesto(pdf, party, ai, options({ date: '2026-11-08' }));
        expect(publishable).toBe(false);
        expect(report.reason).toContain('V7');
        expect(report).toEqual(expect.objectContaining({ url, hashPdf: expect.stringMatching(/^[0-9a-f]{64}$/), date: '2026-11-08' }));
        expect(report.entries).toContainEqual(expect.objectContaining({ check: 'V7', result: 'block' }));
        expect(positions).toEqual([]);
        expect(ai.calls).toHaveLength(0);
        expect((await processManifesto(pdf, party, ai, options())).text).toBeNull();
      }
    });

    it('blocks a party with no allowed domains', async () => {
      const { publishable } = await runPipeline(answers(), { domains: {} });
      expect(publishable).toBe(false);
    });
  });

  describe('publication rule', () => {
    const topics: Topic[] = ['vivienda', 'empleo', 'sanidad', 'energia'].map((id, i) => ({ ...housingTopic, id, order: i + 1 }));
    const invented = { text: 'Regalaremos una vivienda a cada joven que cumpla dieciocho años en todo el país.', page: 2 };
    const extract = (bad: string[]) => (input: any) => ({
      proposes: true,
      quotes: [bad.includes(input.topic.id) ? invented : { text: QUOTE, page: 2 }],
    });

    it('publishes a programme with ≤ 30 % of its extracted positions discarded', async () => {
      const { publishable, report } = await runPipeline(answers({ 'extract-position': extract(['empleo']) }), { topics });
      expect(report).toEqual(expect.objectContaining({ extracted: 4, discarded: 1 }));
      expect(publishable).toBe(true);
    });

    it('blocks the whole programme when more than 30 % is discarded', async () => {
      const { publishable, report } = await runPipeline(answers({ 'extract-position': extract(['empleo']) }), { topics: topics.slice(0, 3) });
      expect(report).toEqual(expect.objectContaining({ extracted: 3, discarded: 1, publishable: false }));
      expect(publishable).toBe(false);
      expect(report.reason).toContain('33 %');
    });
  });

  describe('verification report', () => {
    it('summarises every position: its final state, rewrites and why it was discarded', async () => {
      const topics: Topic[] = ['vivienda', 'empleo', 'sanidad', 'energia'].map((id, i) => ({ ...housingTopic, id, order: i + 1 }));
      const { report } = await runPipeline(
        answers({
          'extract-position': (e) =>
            e.topic.id === 'energia'
              ? { proposes: false, quotes: [] }
              : { proposes: true, quotes: [{ text: QUOTE, page: 2 }] },
          neutralize: (e, attempt) =>
            e.topic.id === 'empleo'
              ? { ...goodNeutral, what: '' }
              : e.topic.id === 'sanidad' && attempt === 0
                ? { ...goodNeutral, figure: '99 %' }
                : goodNeutral,
        }),
        { topics },
      );
      expect(report.positions).toEqual([
        { topic: 'vivienda', state: 'proposes', rewrites: 0 },
        { topic: 'empleo', state: 'unverified', rewrites: 2, reason: expect.stringMatching(/V6.*qué/) },
        { topic: 'sanidad', state: 'proposes', rewrites: 1 },
        { topic: 'energia', state: 'noProposal', rewrites: 0 },
      ]);
      // Every check leaves a trace for a position that passed them all.
      const checks = report.entries.filter((e) => e.topic === 'vivienda').map((e) => e.check);
      expect(new Set(checks)).toEqual(new Set(['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V8', 'V10', 'V11', 'V13']));
      expect(report.entries.filter((e) => e.check === 'V7')).toHaveLength(1);
    });
  });

  describe('determinism', () => {
    it('two runs over the same PDF with the cache give an identical result, rewrites included', async () => {
      const cache = createMemoryCache();
      const r = answers({ neutralize: (_e, attempt) => (attempt === 0 ? { ...goodNeutral, figure: '12 %' } : goodNeutral) });
      const published = { parties: [otherParty, thirdParty], positions: [otherPosition, thirdPosition] };
      const { ai: _ai1, ...first } = await runPipeline(r, { cache, date: '2026-11-08', published });
      const { ai: ai2, ...second } = await runPipeline(r, { cache, date: '2026-11-08', published });
      expect(rewrites(first.report)).toBe(1);
      expect(ai2.calls.map((l) => l.task)).toEqual([]);
      expect(second).toEqual(first);
    });
  });

  describe('V9: schema', () => {
    it('produces a dataset that validates against the schema', async () => {
      const { positions, report } = await runPipeline(answers());
      const dataset = buildDataset({
        parties: [sampleParty],
        topics: [housingTopic],
        results: [{ positions, report }],
        generated: '2026-11-08T00:00:00.000Z',
        origin: 'test',
      });
      expect(validateDataset(dataset)).toEqual({ valid: true, errors: [] });
    });

    it('rejects a dataset with two states for the same party and topic', async () => {
      const { positions, report } = await runPipeline(answers());
      const dataset = buildDataset({
        parties: [sampleParty],
        topics: [housingTopic],
        results: [{ positions: [...positions, ...positions], report }],
        generated: '2026-11-08T00:00:00.000Z',
        origin: 'test',
      });
      expect(validateDataset(dataset).valid).toBe(false);
    });

    it('rejects malformed data', () => {
      expect(validateDataset({ parties: 'nope' }).valid).toBe(false);
    });
  });

  describe('AI cache', () => {
    it('reuses cached AI answers keyed by PDF hash, prompt version and input', async () => {
      const cache = createMemoryCache();
      const first = await runPipeline(answers(), { cache });
      expect(first.ai.calls.length).toBeGreaterThan(0);

      const second = await runPipeline(answers(), { cache });
      expect(second.ai.calls).toHaveLength(0);
      expect(second.positions).toEqual(first.positions);
      expect(second.report).toEqual(first.report);
    });

    it('misses the cache when the prompt version changes', async () => {
      const cache = createMemoryCache();
      await runPipeline(answers(), { cache });
      const other = await runPipeline(answers(), { cache, promptVersion: 'otra' });
      expect(other.ai.calls.length).toBeGreaterThan(0);
    });

    it('keeps the feasibility note of an unchanged neutral text when the PDF changes (V13 is keyed by text and quotes)', async () => {
      const cache = createMemoryCache();
      const first = await runPipeline(answers(), { cache });
      const pdf = await createTestPdf([...pages, ['Una página más']]);
      const ai = createFakeAI(answers({ 'assess-feasibility': () => assessment('veryDifficult') }));
      const second = await processManifesto(pdf, sampleParty, ai, options({ cache }));
      expect(second.positions[0]).toEqual(first.positions[0]);
      expect(ai.calls.filter((l) => l.task === 'assess-feasibility')).toHaveLength(0);
    });

    it('misses the cache when the PDF changes', async () => {
      const cache = createMemoryCache();
      await runPipeline(answers(), { cache });
      const pdf = await createTestPdf([...pages, ['Una página más']]);
      const ai = createFakeAI(answers());
      await processManifesto(pdf, sampleParty, ai, options({ cache }));
      expect(ai.calls.length).toBeGreaterThan(0);
    });
  });
  describe('suggested questions (Preguntar): precomputed answers', () => {
    const QUOTE_PENSIONS = 'Revalorizaremos las pensiones con el IPC cada año.';
    const jubilacion = { id: 'jubilacion', text: '¿Qué pasa con la edad de jubilación?', keywords: ['jubilación', 'pensiones'], order: 1 };
    const mili = { id: 'mili', text: '¿Qué dicen sobre el servicio militar?', keywords: ['servicio militar', 'mili'], order: 2 };
    // 13 + 21 = 34 words, no figures, no marks.
    const goodAnswer = {
      mentions: true,
      what: 'Subir todas las pensiones cada año al mismo ritmo que suben los precios de consumo.',
      how: 'La subida sería automática y anual, ligada a los precios, para que las personas jubiladas no pierdan poder de compra con el tiempo.',
      figure: null,
      quotes: [{ text: QUOTE_PENSIONS, page: 3 }],
    };
    const questionCalls = (ai: { calls: { task: string; input: any }[] }, id: string) =>
      ai.calls.filter((l) => l.task === 'answer-question' && l.input.question.id === id);

    it('answers each suggested question with a neutral text and a verified literal quote', async () => {
      const { answers: rs, report } = await runPipeline(answers({ 'answer-question': () => goodAnswer }), { questions: [jubilacion] });
      expect(rs).toEqual([
        expect.objectContaining({
          party: 'pej',
          question: 'jubilacion',
          state: 'answers',
          text: { what: goodAnswer.what, how: goodAnswer.how, figure: null },
          quotes: [{ text: QUOTE_PENSIONS, page: 3 }],
        }),
      ]);
      for (const b of ['V1', 'V3', 'V10'])
        expect(report.entries).toContainEqual(expect.objectContaining({ question: 'jubilacion', check: b, result: 'pass' }));
    });

    it('answers with the suggested questions of the registry by default', async () => {
      const { answers: rs } = await runPipeline(answers(), { questions: undefined });
      expect(rs.length).toBe(7);
    });

    it('a programme with no page about the question "does not mention it", without asking the AI', async () => {
      const { answers: rs, ai } = await runPipeline(answers({ 'answer-question': () => goodAnswer }), { questions: [mili] });
      expect(rs).toEqual([expect.objectContaining({ question: 'mili', state: 'notMentioned' })]);
      expect(questionCalls(ai, 'mili')).toHaveLength(0);
    });

    it('"does not mention it" when the AI finds nothing in the candidate pages', async () => {
      const { answers: rs } = await runPipeline(answers(), { questions: [jubilacion] });
      expect(rs).toEqual([expect.objectContaining({ question: 'jubilacion', state: 'notMentioned' })]);
    });

    it('removes an invented quote and keeps the verified one (V1)', async () => {
      const invented = { text: 'Bajaremos la edad de jubilación a los sesenta años para todo el mundo.', page: 3 };
      const { answers: rs, report } = await runPipeline(
        answers({ 'answer-question': () => ({ ...goodAnswer, quotes: [invented, ...goodAnswer.quotes] }) }),
        { questions: [jubilacion] },
      );
      expect(rs).toEqual([expect.objectContaining({ state: 'answers', quotes: [{ text: QUOTE_PENSIONS, page: 3 }] })]);
      expect(report.entries).toContainEqual(expect.objectContaining({ question: 'jubilacion', check: 'V1', result: 'discard' }));
    });

    it('an answer whose quotes are all invented is asked again, then not published (V1)', async () => {
      const invented = { text: 'Bajaremos la edad de jubilación a los sesenta años para todo el mundo.', page: 3 };
      const { answers: rs, report, publishable } = await runPipeline(
        answers({ 'answer-question': () => ({ ...goodAnswer, quotes: [invented] }) }),
        { questions: [jubilacion] },
      );
      expect(rs).toEqual([expect.objectContaining({ question: 'jubilacion', state: 'unverified' })]);
      expect(rs[0]).not.toHaveProperty('quotes');
      // Asked 3 times: the invented quote is removed each time.
      expect(report.entries.filter((e) => e.question === 'jubilacion' && e.detail.startsWith('cita eliminada'))).toHaveLength(3);
      // Answers never block the programme.
      expect(publishable).toBe(true);
    });

    it('rewrites an answer with identifying marks and, if they persist after 2 retries, does not publish it (V3)', async () => {
      const { answers: rs, report } = await runPipeline(
        answers({ 'answer-question': () => ({ ...goodAnswer, what: `Como propone OTP, ${goodAnswer.what}` }) }),
        { questions: [jubilacion] },
      );
      expect(report.entries.filter((e) => e.question === 'jubilacion' && e.check === 'V3' && e.result === 'rewrite')).toHaveLength(2);
      expect(report.entries).toContainEqual(expect.objectContaining({ question: 'jubilacion', check: 'V3', result: 'discard' }));
      expect(rs).toEqual([expect.objectContaining({ state: 'unverified' })]);
    });

    it('a rewrite that removes the marks is published (V3)', async () => {
      // The fake AI drops the name only once it is told to avoid it.
      const { answers: rs } = await runPipeline(
        answers({
          'answer-question': fixesWith(/"avoid":\[[^\]]*Bruno Jefe/, { ...goodAnswer, what: `Bruno Jefe quiere ${goodAnswer.what}` }, goodAnswer),
        }),
        { questions: [jubilacion] },
      );
      expect(rs).toEqual([expect.objectContaining({ state: 'answers', text: expect.objectContaining({ what: goodAnswer.what }) })]);
      expect(JSON.stringify(rs)).not.toMatch(/Bruno Jefe/);
    });

    it('rewrites an answer the independent verifier finds unfaithful to the quote (V10)', async () => {
      const noPurchasingPower = { ...goodAnswer, how: 'La subida sería automática y anual, ligada a los precios, para que las personas jubiladas mantengan su pensión al día con el tiempo.' };
      const { answers: rs, report } = await runPipeline(
        answers({
          'answer-question': fixesWith('Habla de poder de compra.', goodAnswer, noPurchasingPower),
          'verify-fidelity': (e) =>
            e.text.how.includes('poder de compra') ? { ...faithful, adds: true, explanation: 'Habla de poder de compra.' } : faithful,
        }),
        { questions: [jubilacion] },
      );
      expect(rs[0]).toEqual(expect.objectContaining({ state: 'answers', text: expect.objectContaining({ how: noPurchasingPower.how }) }));
      expect(report.entries).toContainEqual(expect.objectContaining({ question: 'jubilacion', check: 'V10', result: 'rewrite' }));
      expect(rs[0]!.state).toBe('answers');
    });

    it('answers go into a dataset that validates (V9)', async () => {
      const { positions, report, answers: rs } = await runPipeline(
        answers({ 'answer-question': () => goodAnswer }),
        { questions: [jubilacion, mili] },
      );
      const dataset = buildDataset({
        parties: [sampleParty],
        topics: [housingTopic],
        questions: [jubilacion, mili],
        results: [{ positions, report, answers: rs }],
        generated: '2026-11-08T00:00:00.000Z',
        origin: 'test',
      });
      expect(validateDataset(dataset)).toEqual({ valid: true, errors: [] });
      expect(validateDataset({ ...dataset, answers: [...rs, ...rs] }).valid).toBe(false);
      expect(validateDataset({ ...dataset, answers: rs.map((r) => ({ ...r, question: 'otra' })) }).valid).toBe(false);
    });

    it('two runs with the cache give identical answers', async () => {
      const cache = createMemoryCache();
      const r = answers({ 'answer-question': () => goodAnswer });
      const first = await runPipeline(r, { cache, questions: [jubilacion, mili] });
      const second = await runPipeline(r, { cache, questions: [jubilacion, mili] });
      expect(second.ai.calls).toHaveLength(0);
      expect(second.answers).toEqual(first.answers);
    });
  });
});
