// Test point A: the data pipeline, exercised only through processManifesto.
import { describe, expect, it } from 'vitest';
import { processManifesto, type ProcessOptions, type QuestionToProcess } from '../src/pipeline';
import { mergeManifesto } from '../src/pipeline/publish';
import { settleApproaches } from '../src/pipeline/settle';
import { createFakeAI, type FakeResponses } from '../src/ai/fake';
import { createMemoryCache } from '../src/ai/cache';
import { buildDataset, validateDataset } from '../src/dataset';
import { createTestPdf } from './fixtures/pdf';
import { testDomains, sampleParty, otherParty, housingQuestion, testTerms } from './fixtures/registry';
import { RUBRIC_VERSION } from '../src/registry/rubric';
import { Position as PositionSchema, type Position, type Proposal } from '../src/dataset/schema';

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

/** The party's concrete proposal in its own terms (exact figures, not neutralised): shown at the reveal. */
const proposal: Proposal = {
  what: 'Limitar el precio del alquiler en las zonas tensionadas.',
  how: 'Declarando zonas tensionadas y ampliando el parque público de vivienda.',
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

const found = (quotes: { text: string; page: number }[], p: typeof proposal | null = proposal) => ({ proposes: true, quotes, proposal: p });
const nothing = { proposes: false, quotes: [], proposal: null };
const INVENTED = { text: 'Regalaremos una vivienda a cada joven que cumpla dieciocho años en todo el país.', page: 2 };
/** V12 does not confirm the absence: the second pass finds a proposal. */
const secondPassFinds = { 'confirm-absence': () => found([{ text: QUOTE, page: 2 }]) };

function answers(extra: Partial<FakeResponses> = {}): FakeResponses {
  return {
    'extract-position': () => found([{ text: QUOTE, page: 2 }]),
    'assess-feasibility': () => assessment('viableWithCaveats'),
    'confirm-absence': () => nothing,
    // Not used for positions any more (approaches are written by settleApproaches); suggested answers use V10.
    neutralize: () => {
      throw new Error('processManifesto no neutraliza');
    },
    'guess-party': () => {
      throw new Error('processManifesto no pasa el adivinador');
    },
    'verify-fidelity': () => faithful,
    'answer-question': () => ({ mentions: false, what: '', how: '', figure: null, quotes: [] }),
    ...extra,
  };
}

const options = (o: Partial<ProcessOptions> = {}): ProcessOptions => ({
  questions: [housingQuestion],
  terms: testTerms,
  // V8 checks HTTP 200; tests never hit the network.
  checkUrl: async () => true,
  domains: testDomains,
  // Suggested questions are tested on their own (see "suggested questions").
  suggestedQuestions: [],
  ...o,
});

async function runPipeline(r: FakeResponses, o: Partial<ProcessOptions> = {}) {
  const pdf = await createTestPdf(pages);
  const ai = createFakeAI(r);
  const result = await processManifesto(pdf, sampleParty, ai, options(o));
  return { ...result, ai };
}

const questionsOf = (ids: string[]): QuestionToProcess[] => ids.map((id) => ({ ...housingQuestion, id }));

describe('processManifesto', () => {
  it("returns one position per question: the party's proposal with its verified literal quote", async () => {
    const { positions, report, publishable } = await runPipeline(answers());

    expect(publishable).toBe(true);
    expect(positions).toEqual([
      {
        party: 'pej',
        question: 'vivienda-asequible',
        state: 'proposes',
        proposal,
        quotes: [{ text: QUOTE, page: 2 }],
        feasibility: expect.objectContaining({ result: 'viableWithCaveats' }),
        versions: { prompt: expect.any(String) },
      },
    ]);
    expect(report.party).toBe('pej');
    expect(report.hashPdf).toMatch(/^[0-9a-f]{64}$/);
    expect(report.discarded).toBe(0);
  });

  it('asks the AI about each question, with the question text and the programme page by page', async () => {
    const questions = questionsOf(['vivienda-asequible', 'pensiones-futuro']);
    const { positions, ai } = await runPipeline(answers(), { questions });
    expect(positions.map((p) => p.question)).toEqual(['vivienda-asequible', 'pensiones-futuro']);
    const calls = ai.calls.filter((c) => c.task === 'extract-position');
    expect(calls.map((c) => (c.input as any).question)).toEqual([
      { id: 'vivienda-asequible', text: housingQuestion.text },
      { id: 'pensiones-futuro', text: housingQuestion.text },
    ]);
    expect((calls[0]!.input as any).pages).toEqual(expect.arrayContaining([{ page: 2, text: expect.stringContaining('Limitaremos') }]));
  });

  it("keeps the party's own wording and exact figures: nothing is neutralised (only approaches are shown blind)", async () => {
    const exact = { what: 'Construir 50.000 viviendas públicas al año.', how: 'Con el plan Hogar Ya de Partido Ejemplo.', figure: '50.000 viviendas al año' };
    const { positions, ai } = await runPipeline(answers({ 'extract-position': () => found([{ text: QUOTE, page: 2 }], exact) }));
    expect(positions[0]).toEqual(expect.objectContaining({ state: 'proposes', proposal: exact }));
    expect(ai.calls.map((c) => c.task)).not.toContain('neutralize');
    expect(ai.calls.map((c) => c.task)).not.toContain('guess-party');
    expect(ai.calls.map((c) => c.task)).not.toContain('verify-fidelity');
  });

  it('every position fits the dataset Position schema, the input of settleApproaches', async () => {
    const questions = questionsOf(['vivienda-asequible', 'pensiones-futuro', 'sanidad-esperas']);
    const { positions } = await runPipeline(
      answers({
        'extract-position': (e) =>
          e.question.id === 'pensiones-futuro' ? nothing : e.question.id === 'sanidad-esperas' ? found([INVENTED]) : found([{ text: QUOTE, page: 2 }]),
        'confirm-absence': (e) => (e.question.id === 'sanidad-esperas' ? found([{ text: QUOTE, page: 2 }]) : nothing),
      }),
      { questions },
    );
    expect(positions.map((p) => p.state)).toEqual(['proposes', 'noProposal', 'unverified']);
    for (const p of positions) expect(PositionSchema.parse(p)).toEqual(p);
    // Only "proposes" carries proposal, quotes and feasibility; the others carry no text at all.
    expect(Object.keys(positions[1]!).sort()).toEqual(['party', 'question', 'state', 'versions']);
    expect(Object.keys(positions[2]!).sort()).toEqual(['party', 'question', 'state', 'versions']);
  });

  it('publishes the page text of the programme, for the live free question (#15)', async () => {
    const { text, report } = await runPipeline(answers());
    expect(text).toEqual({ party: 'pej', hashPdf: report.hashPdf, pages: expect.any(Array) });
    expect(text!.pages).toHaveLength(pages.length);
    expect(text!.pages[1]).toContain('Limitaremos el precio');
  });

  it('records when a party proposes nothing on a question', async () => {
    const { positions, publishable } = await runPipeline(answers({ 'extract-position': () => nothing }));
    expect(positions).toEqual([expect.objectContaining({ question: 'vivienda-asequible', state: 'noProposal' })]);
    expect(publishable).toBe(true);
  });

  it('discards a proposal whose "what" or "how" is missing (V6): it cannot be shown at the reveal', async () => {
    for (const p of [{ ...proposal, what: ' ' }, { ...proposal, how: '' }, null]) {
      const { positions, report } = await runPipeline(answers({ 'extract-position': () => found([{ text: QUOTE, page: 2 }], p) }));
      expect(positions[0]?.state).toBe('unverified');
      expect(report.entries).toContainEqual(expect.objectContaining({ question: 'vivienda-asequible', check: 'V6', result: 'discard' }));
    }
  });

  it('an empty figure becomes null', async () => {
    const { positions } = await runPipeline(answers({ 'extract-position': () => found([{ text: QUOTE, page: 2 }], { ...proposal, figure: ' ' } as any) }));
    expect(positions[0]).toEqual(expect.objectContaining({ proposal: { ...proposal, figure: null } }));
  });

  describe('V1: the quote exists in the PDF', () => {
    it('discards a position whose quote was invented by the AI', async () => {
      const { positions, report, publishable } = await runPipeline(
        answers({ 'extract-position': () => found([INVENTED]), ...secondPassFinds }),
      );
      expect(positions).toEqual([expect.objectContaining({ question: 'vivienda-asequible', state: 'unverified' })]);
      expect(report.discarded).toBe(1);
      expect(report.entries).toContainEqual(
        expect.objectContaining({ question: 'vivienda-asequible', check: 'V1', result: 'discard' }),
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
          'extract-position': () =>
            found([{ text: 'Defenderemos el "derecho a la vivienda" como un derecho fundamental exigible ante los tribunales.', page: 1 }]),
        }),
      );
      const { positions } = await processManifesto(pdf, sampleParty, ai, options());
      expect(positions[0]?.state).toBe('proposes');
    });

    it('rejects quotes shorter than 40 characters', async () => {
      const { positions } = await runPipeline(
        answers({ 'extract-position': () => found([{ text: 'parque público de vivienda', page: 2 }]), ...secondPassFinds }),
      );
      expect(positions[0]?.state).toBe('unverified');
    });
  });

  describe('V13: double-blind feasibility of the concrete proposal', () => {
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

    it('never tells the evaluators which party the proposal is from, not even through its own wording', async () => {
      const quoteWithMark =
        'Partido Ejemplo limitará el precio del alquiler en las zonas tensionadas, como ha dicho Ana Líder.';
      const pdf = await createTestPdf([['Vivienda', quoteWithMark]]);
      const marked = { what: 'Limitar el alquiler, como promete Ana Líder.', how: 'Con la ley de vivienda del PEJ.', figure: null };
      const ai = createFakeAI(answers({ 'extract-position': () => found([{ text: quoteWithMark, page: 1 }], marked) }));
      const { positions } = await processManifesto(pdf, sampleParty, ai, options());
      const calls = ai.calls.filter((l) => l.task === 'assess-feasibility');
      expect(calls).toHaveLength(2);
      for (const l of calls) {
        const received = JSON.stringify(l.input) + l.instructions;
        expect(received).not.toMatch(/partido ejemplo|ana l[ií]der|\bpej\b/i);
        // It does get the question, the (masked) proposal and the (masked) quote.
        expect(received).toContain(housingQuestion.text);
        expect(received).toContain('Limitar el alquiler, como promete');
        expect(received).toContain('limitará el precio del alquiler en las zonas tensionadas');
      }
      // The published proposal keeps its own words: it is only shown at the reveal.
      expect(positions[0]).toEqual(expect.objectContaining({ proposal: marked }));
    });

    it('publishes "sin concreción" when both evaluations say so', async () => {
      const { note } = await feasibility(answers({ 'assess-feasibility': () => assessment('notConcrete', { sources: [] }) }));
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
      expect(report.entries).toContainEqual(
        expect.objectContaining({ question: 'vivienda-asequible', check: 'V13', detail: expect.stringContaining('sin consenso') }),
      );
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

  describe('V12: confirmed absence', () => {
    const noProposal = { 'extract-position': () => nothing };

    it('extracts the position when the second pass finds a proposal the first one missed', async () => {
      const { positions, report } = await runPipeline(answers({ ...noProposal, ...secondPassFinds }));
      expect(positions[0]).toEqual(expect.objectContaining({ state: 'proposes', proposal, quotes: [{ text: QUOTE, page: 2 }] }));
      expect(report.entries).toContainEqual(expect.objectContaining({ question: 'vivienda-asequible', check: 'V12', result: 'extract' }));
    });

    it("marks \"proposes nothing\" when the targeted question confirms it, recording the question's keywords", async () => {
      const { positions, report, ai } = await runPipeline(answers(noProposal));
      expect(positions[0]?.state).toBe('noProposal');
      const entry = report.entries.find((e) => e.check === 'V12')!;
      expect(entry).toEqual(expect.objectContaining({ question: 'vivienda-asequible', result: 'pass' }));
      expect(entry.detail).toContain('vivienda, alquiler');
      // The second pass gets the question and only the pages with its keywords.
      const [call] = ai.calls.filter((l) => l.task === 'confirm-absence');
      expect(call!.input).toEqual({ question: { id: 'vivienda-asequible', text: housingQuestion.text }, pages: [expect.objectContaining({ page: 2 })] });
    });

    it('searches the keywords of each question, not of another one', async () => {
      const questions: QuestionToProcess[] = [
        { id: 'pensiones-futuro', text: '¿Qué harían con las pensiones?', keywords: ['pensiones'] },
        { id: 'defensa-gasto', text: '¿Cuánto gastarían en defensa?', keywords: ['OTAN', 'militar'] },
      ];
      const { ai, report } = await runPipeline(answers(noProposal), { questions });
      const calls = ai.calls.filter((l) => l.task === 'confirm-absence');
      expect(calls.map((c) => (c.input as any).question.id)).toEqual(['pensiones-futuro']);
      expect((calls[0]!.input as any).pages).toEqual([expect.objectContaining({ page: 3 })]);
      expect(report.entries).toContainEqual(
        expect.objectContaining({ question: 'defensa-gasto', check: 'V12', result: 'pass', detail: expect.stringContaining('ninguna página') }),
      );
    });

    it('without keywords, searches the words of the question itself', async () => {
      const { report } = await runPipeline(answers(noProposal), {
        questions: [{ id: 'pensiones-futuro', text: '¿Qué harían con las pensiones?' }],
      });
      const entry = report.entries.find((e) => e.check === 'V12')!;
      expect(entry.detail).toContain('pensiones');
      expect(entry.detail).toContain('revisadas las páginas 3');
    });

    it('confirms the absence without asking the AI when no keyword appears in the programme', async () => {
      const pdf = await createTestPdf([['Pensiones', 'Revalorizaremos las pensiones con el IPC cada año.']]);
      const ai = createFakeAI(answers({ ...noProposal, ...secondPassFinds }));
      const { positions } = await processManifesto(pdf, sampleParty, ai, options());
      expect(ai.calls.filter((l) => l.task === 'confirm-absence')).toHaveLength(0);
      expect(positions[0]?.state).toBe('noProposal');
    });

    it('shows a discarded position as "proposes nothing" only when V12 confirms it', async () => {
      const invented = { 'extract-position': () => found([INVENTED]) };
      const confirmed = await runPipeline(answers(invented));
      expect(confirmed.positions[0]?.state).toBe('noProposal');
      expect(confirmed.report.discarded).toBe(1);

      const unconfirmed = await runPipeline(answers({ ...invented, ...secondPassFinds }));
      expect(unconfirmed.positions[0]?.state).toBe('unverified');
    });

    it('a position discarded after its quotes were verified stays "could not verify" (it does exist)', async () => {
      // The default fake V12 would confirm an absence: it is not asked.
      const { positions, ai } = await runPipeline(answers({ 'extract-position': () => found([{ text: QUOTE, page: 2 }], null) }));
      expect(positions[0]?.state).toBe('unverified');
      expect(ai.calls.filter((l) => l.task === 'confirm-absence')).toHaveLength(0);
    });
  });

  describe('V2: correct page', () => {
    it('fixes the declared page automatically and records the correction', async () => {
      const { positions, report } = await runPipeline(answers({ 'extract-position': () => found([{ text: QUOTE, page: 1 }]) }));
      expect(positions[0]).toEqual(expect.objectContaining({ state: 'proposes', quotes: [{ text: QUOTE, page: 2 }] }));
      expect(report.entries).toContainEqual(
        expect.objectContaining({ question: 'vivienda-asequible', check: 'V2', result: 'fix', detail: expect.stringContaining('1 → 2') }),
      );
    });

    it('records a pass when the declared page is right', async () => {
      const { report } = await runPipeline(answers());
      expect(report.entries).toContainEqual(expect.objectContaining({ question: 'vivienda-asequible', check: 'V2', result: 'pass' }));
    });

    it('discards the position when the quote is on no page at all', async () => {
      const { positions } = await runPipeline(
        answers({
          'extract-position': () => found([{ text: 'Limitaremos el precio del alquiler en todas las ciudades del país sin excepción alguna.', page: 7 }]),
          ...secondPassFinds,
        }),
      );
      expect(positions[0]?.state).toBe('unverified');
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
    const questions = questionsOf(['vivienda', 'empleo', 'sanidad', 'energia']);
    const extract = (bad: string[]) => (input: any) => found([bad.includes(input.question.id) ? INVENTED : { text: QUOTE, page: 2 }]);

    it('publishes a programme with ≤ 30 % of its extracted positions discarded', async () => {
      const { publishable, report } = await runPipeline(answers({ 'extract-position': extract(['empleo']) }), { questions });
      expect(report).toEqual(expect.objectContaining({ extracted: 4, discarded: 1 }));
      expect(publishable).toBe(true);
    });

    it('blocks the whole programme when more than 30 % is discarded', async () => {
      const { publishable, report } = await runPipeline(answers({ 'extract-position': extract(['empleo']) }), { questions: questions.slice(0, 3) });
      expect(report).toEqual(expect.objectContaining({ extracted: 3, discarded: 1, publishable: false }));
      expect(publishable).toBe(false);
      expect(report.reason).toContain('33 %');
    });
  });

  describe('verification report', () => {
    it('summarises every position per question: its final state and why it was discarded', async () => {
      const questions = questionsOf(['vivienda', 'empleo', 'sanidad']);
      const { report } = await runPipeline(
        answers({
          'extract-position': (e) =>
            e.question.id === 'sanidad' ? nothing : e.question.id === 'empleo' ? found([{ text: QUOTE, page: 2 }], null) : found([{ text: QUOTE, page: 2 }]),
        }),
        { questions },
      );
      expect(report.positions).toEqual([
        { question: 'vivienda', state: 'proposes' },
        { question: 'empleo', state: 'unverified', reason: expect.stringMatching(/V6/) },
        { question: 'sanidad', state: 'noProposal' },
      ]);
      // Every check leaves a trace for a position that passed them all.
      const checks = report.entries.filter((e) => e.question === 'vivienda').map((e) => e.check);
      expect(new Set(checks)).toEqual(new Set(['V1', 'V2', 'V8', 'V13']));
      expect(report.entries.filter((e) => e.check === 'V7')).toHaveLength(1);
    });
  });

  describe('determinism', () => {
    it('two runs over the same PDF with the cache give an identical result', async () => {
      const cache = createMemoryCache();
      const { ai: _ai1, ...first } = await runPipeline(answers(), { cache, date: '2026-11-08' });
      const { ai: ai2, ...second } = await runPipeline(answers(), { cache, date: '2026-11-08' });
      expect(ai2.calls.map((l) => l.task)).toEqual([]);
      expect(second).toEqual(first);
    });
  });

  describe('V9: schema', () => {
    const dataset = (positions: Position[], report: Awaited<ReturnType<typeof runPipeline>>['report']) =>
      buildDataset({ parties: [sampleParty], results: [{ positions, report }], generated: '2026-11-08T00:00:00.000Z', origin: 'test' });

    it('produces a dataset that validates against the schema', async () => {
      const { positions, report } = await runPipeline(answers());
      expect(validateDataset(dataset(positions, report))).toEqual({ valid: true, errors: [] });
    });

    it('rejects a dataset with two states for the same party and question', async () => {
      const { positions, report } = await runPipeline(answers());
      expect(validateDataset(dataset([...positions, ...positions], report)).valid).toBe(false);
    });

    it('rejects malformed data', () => {
      expect(validateDataset({ parties: 'nope' }).valid).toBe(false);
    });
  });

  describe('feeding settleApproaches', () => {
    it("every party's positions go into settleApproaches as they come out, and settle a publishable question", async () => {
      const PENSIONS = 'Revalorizaremos las pensiones con el IPC cada año.';
      const pej = await runPipeline(answers());
      const otp = await processManifesto(
        await createTestPdf(pages),
        otherParty,
        createFakeAI(answers({ 'extract-position': () => found([{ text: PENSIONS, page: 3 }]) })),
        options({ domains: { otp: ['ejemplo.org'] } }),
      );
      const silent = await processManifesto(
        await createTestPdf(pages),
        { ...otherParty, id: 'ter' },
        createFakeAI(answers({ 'extract-position': () => nothing })),
        options({ domains: { ter: ['ejemplo.org'] } }),
      );
      const approach = (what: string, stances: { party: string; stance: 'full'; quote: string }[]) => ({ what, how: `Cómo: ${what}`, figure: null, filler: stances.length === 0, stances });
      const ai = createFakeAI({
        'settle-approaches': () => ({
          approaches: [
            approach('Limitar el alquiler', [{ party: 'pej', stance: 'full', quote: QUOTE }]),
            approach('Otra cosa', [{ party: 'otp', stance: 'full', quote: PENSIONS }]),
            approach('Inventado', []),
          ],
        }),
      });
      const question = { ...housingQuestion, theme: 'vivienda', followUp: false, order: 1, origin: { cis: null, manifestos: 2 } };
      // The approach checks (#22) are tested with settleApproaches: here only the grouping.
      const settled = await settleApproaches({ question, positions: [...pej.positions, ...otp.positions, ...silent.positions] }, ai, { checks: [] });

      expect(settled.publishable).toBe(true);
      expect(settled.question!.approaches[0]!.stances).toContainEqual({ party: 'pej', stance: 'full', quote: { text: QUOTE, page: 2 } });
      expect(settled.question!.approaches[1]!.stances).toContainEqual({ party: 'otp', stance: 'full', quote: { text: PENSIONS, page: 3 } });
      // Only proposing parties are grouped.
      const input = ai.calls[0]!.input as { positions: { party: string }[] };
      expect(input.positions.map((p) => p.party).sort()).toEqual(['otp', 'pej']);
    });
  });

  describe('publishing into the dataset', () => {
    const settled = {
      id: 'vivienda-asequible',
      theme: 'vivienda',
      text: housingQuestion.text,
      followUp: false,
      order: 1,
      origin: { cis: null, manifestos: 2 },
      approaches: ['a', 'b', 'c'].map((id) => ({ id, what: `Enfoque ${id}`, how: `Cómo ${id}`, figure: null, filler: id === 'c', stances: [] })),
      otherProposals: [],
    };

    it("replaces the party's positions and keeps the other parties' and the settled questions", async () => {
      const first = await runPipeline(answers());
      const real = buildDataset({
        parties: [{ ...otherParty }, sampleParty],
        themes: [{ id: 'vivienda', title: 'Vivienda', order: 1 }],
        questions: [settled],
        results: [
          { positions: [{ party: 'otp', question: 'vivienda-asequible', state: 'noProposal', versions: { prompt: 'v3' } }], report: { ...first.report, party: 'otp' } },
          { positions: first.positions, report: first.report },
        ],
        generated: '2026-11-08T00:00:00.000Z',
        origin: 'real',
      });
      const again = await runPipeline(answers({ 'extract-position': () => nothing }));
      const merge = mergeManifesto(real, sampleParty, again, { generated: '2026-11-09T00:00:00.000Z', suggestedQuestions: [] });
      if (!merge.ok) throw new Error(merge.reason);
      expect(merge.dataset.questions).toEqual([settled]);
      expect(merge.dataset.themes).toEqual(real.themes);
      expect(merge.dataset.positions.map((p) => [p.party, p.state])).toEqual([
        ['otp', 'noProposal'],
        ['pej', 'noProposal'],
      ]);
    });

    it('a blocked programme is not merged', async () => {
      const blocked = await runPipeline(answers({ 'extract-position': () => found([INVENTED]), ...secondPassFinds }));
      const empty = buildDataset({ parties: [], results: [], generated: '2026-11-08T00:00:00.000Z', origin: 'simulated' });
      expect(mergeManifesto(empty, sampleParty, blocked, { generated: '2026-11-09T00:00:00.000Z' }).ok).toBe(false);
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

    it('misses the cache for a new question only', async () => {
      const cache = createMemoryCache();
      await runPipeline(answers(), { cache });
      const more = await runPipeline(answers(), { cache, questions: [housingQuestion, ...questionsOf(['pensiones-futuro'])] });
      expect(more.ai.calls.filter((c) => c.task === 'extract-position').map((c) => (c.input as any).question.id)).toEqual(['pensiones-futuro']);
    });

    it('keeps the feasibility note of an unchanged proposal when the PDF changes (V13 is keyed by proposal and quotes)', async () => {
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
      const { answers: rs, report } = await runPipeline(answers({ 'answer-question': () => goodAnswer }), { suggestedQuestions: [jubilacion] });
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
        expect(report.entries).toContainEqual(expect.objectContaining({ suggestedQuestion: 'jubilacion', check: b, result: 'pass' }));
    });

    it('answers with the suggested questions of the registry by default', async () => {
      const { answers: rs } = await runPipeline(answers(), { suggestedQuestions: undefined });
      expect(rs.length).toBe(7);
    });

    it('a programme with no page about the question "does not mention it", without asking the AI', async () => {
      const { answers: rs, ai } = await runPipeline(answers({ 'answer-question': () => goodAnswer }), { suggestedQuestions: [mili] });
      expect(rs).toEqual([expect.objectContaining({ question: 'mili', state: 'notMentioned' })]);
      expect(questionCalls(ai, 'mili')).toHaveLength(0);
    });

    it('"does not mention it" when the AI finds nothing in the candidate pages', async () => {
      const { answers: rs } = await runPipeline(answers(), { suggestedQuestions: [jubilacion] });
      expect(rs).toEqual([expect.objectContaining({ question: 'jubilacion', state: 'notMentioned' })]);
    });

    it('removes an invented quote and keeps the verified one (V1)', async () => {
      const invented = { text: 'Bajaremos la edad de jubilación a los sesenta años para todo el mundo.', page: 3 };
      const { answers: rs, report } = await runPipeline(
        answers({ 'answer-question': () => ({ ...goodAnswer, quotes: [invented, ...goodAnswer.quotes] }) }),
        { suggestedQuestions: [jubilacion] },
      );
      expect(rs).toEqual([expect.objectContaining({ state: 'answers', quotes: [{ text: QUOTE_PENSIONS, page: 3 }] })]);
      expect(report.entries).toContainEqual(expect.objectContaining({ suggestedQuestion: 'jubilacion', check: 'V1', result: 'discard' }));
    });

    it('an answer whose quotes are all invented is asked again, then not published (V1)', async () => {
      const invented = { text: 'Bajaremos la edad de jubilación a los sesenta años para todo el mundo.', page: 3 };
      const { answers: rs, report, publishable } = await runPipeline(
        answers({ 'answer-question': () => ({ ...goodAnswer, quotes: [invented] }) }),
        { suggestedQuestions: [jubilacion] },
      );
      expect(rs).toEqual([expect.objectContaining({ question: 'jubilacion', state: 'unverified' })]);
      expect(rs[0]).not.toHaveProperty('quotes');
      // Asked 3 times: the invented quote is removed each time.
      expect(report.entries.filter((e) => e.suggestedQuestion === 'jubilacion' && e.detail.startsWith('cita eliminada'))).toHaveLength(3);
      // Answers never block the programme.
      expect(publishable).toBe(true);
    });

    it('rewrites an answer with identifying marks and, if they persist after 2 retries, does not publish it (V3)', async () => {
      const { answers: rs, report } = await runPipeline(
        answers({ 'answer-question': () => ({ ...goodAnswer, what: `Como propone OTP, ${goodAnswer.what}` }) }),
        { suggestedQuestions: [jubilacion] },
      );
      expect(report.entries.filter((e) => e.suggestedQuestion === 'jubilacion' && e.check === 'V3' && e.result === 'rewrite')).toHaveLength(2);
      expect(report.entries).toContainEqual(expect.objectContaining({ suggestedQuestion: 'jubilacion', check: 'V3', result: 'discard' }));
      expect(rs).toEqual([expect.objectContaining({ state: 'unverified' })]);
    });

    it('a rewrite that removes the marks is published (V3)', async () => {
      // The fake AI drops the name only once it is told to avoid it.
      const { answers: rs } = await runPipeline(
        answers({
          'answer-question': fixesWith(/"avoid":\[[^\]]*Bruno Jefe/, { ...goodAnswer, what: `Bruno Jefe quiere ${goodAnswer.what}` }, goodAnswer),
        }),
        { suggestedQuestions: [jubilacion] },
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
        { suggestedQuestions: [jubilacion] },
      );
      expect(rs[0]).toEqual(expect.objectContaining({ state: 'answers', text: expect.objectContaining({ how: noPurchasingPower.how }) }));
      expect(report.entries).toContainEqual(expect.objectContaining({ suggestedQuestion: 'jubilacion', check: 'V10', result: 'rewrite' }));
      expect(rs[0]!.state).toBe('answers');
    });

    it('answers go into a dataset that validates (V9)', async () => {
      const { positions, report, answers: rs } = await runPipeline(
        answers({ 'answer-question': () => goodAnswer }),
        { suggestedQuestions: [jubilacion, mili] },
      );
      const dataset = buildDataset({
        parties: [sampleParty],
        suggestedQuestions: [jubilacion, mili],
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
      const first = await runPipeline(r, { cache, suggestedQuestions: [jubilacion, mili] });
      const second = await runPipeline(r, { cache, suggestedQuestions: [jubilacion, mili] });
      expect(second.ai.calls).toHaveLength(0);
      expect(second.answers).toEqual(first.answers);
    });
  });
});
