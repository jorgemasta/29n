// The programme watcher, exercised only through `watch` with fakes for fetching, the AI,
// git/deploy (`save`) and the phone notification (`sendFeedback`). No network.
import { describe, expect, it } from 'vitest';
import { buildDataset, Dataset, type Party, type Question } from '../src/dataset';
import type { QuestionToProcess } from '../src/pipeline';
import { createFakeAI, type FakeResponses } from '../src/ai/fake';
import { createMemoryCache } from '../src/ai/cache';
import { watch, type Alert, type Change, type Download, type WatcherState, type WatchedSource } from '../src/watcher';
import { createIssueAlert, WATCHER_LABEL } from '../src/watcher/issue';
import { createTestPdf } from './fixtures/pdf';
import { testDomains, sampleParty, housingQuestion, otherParty, testTerms } from './fixtures/registry';
import { samplePulse } from './fixtures/pulse';
import type { Pulse } from '../src/pulse';
import { estimateSettle, settleAll, settleCache } from '../src/pipeline/settle-all';

const QUOTE =
  'Limitaremos el precio del alquiler en las zonas tensionadas y ampliaremos el parque público de vivienda.';
const pages = [['Programa electoral 2026'], ['Vivienda', QUOTE]];
const proposal = {
  what: 'Limitar el precio del alquiler en las zonas tensionadas.',
  how: 'Declarando zonas tensionadas y ampliando el parque público de vivienda.',
  figure: null,
};
const reasons = { competence: 'a', cost: 'b', legal: 'c', precedents: 'd', majority: 'e' };
const INE_SOURCE = { title: 'INE', url: 'https://www.ine.es/alquiler' };

function answers(extra: Partial<FakeResponses> = {}): FakeResponses {
  return {
    'extract-position': () => ({ proposes: true, quotes: [{ text: QUOTE, page: 2 }], proposal }),
    neutralize: () => proposal,
    'assess-feasibility': () => ({ level: 'viable', reasons, why: 'Es viable con una ley ordinaria.', sources: [INE_SOURCE] }),
    'verify-fidelity': () => ({ adds: false, omits: false, changesMeaning: false, explanation: '' }),
    'guess-party': () => ({ assignments: [] }),
    'confirm-absence': () => ({ proposes: false, quotes: [], proposal: null }),
    'answer-question': () => ({ mentions: false, what: '', how: '', figure: null, quotes: [] }),
    ...extra,
  };
}
/** An AI that invents the quote: V1 discards the only position ⇒ the programme is blocked. */
const inventedAnswers = () =>
  answers({
    'extract-position': () => ({
      proposes: true,
      quotes: [{ text: 'Regalaremos una vivienda a cada joven que cumpla dieciocho años en todo el país.', page: 2 }],
      proposal,
    }),
  });

const { manifesto: _, ...pejRegistry } = sampleParty;
const PEJ_PAGE = 'https://ejemplo.org/elecciones';
const PDF_PEJ = 'https://ejemplo.org/docs/programa-29n.pdf';
const AGGREGATOR = 'https://agregador.example/programas-29n';

const initialDataset = (): Dataset =>
  buildDataset({ parties: [], results: [], generated: '2026-11-01T00:00:00.000Z', origin: 'simulated' });

function html(...links: string[]) {
  return `<html><body>${links.map((e) => `<a href="${e}">enlace</a>`).join('\n')}</body></html>`;
}

/** Fake web: url → page or PDF; anything else fails like a network error. */
function createWeb(webPages: Record<string, string | Uint8Array>) {
  const requested: string[] = [];
  const download = async (url: string): Promise<Download> => {
    requested.push(url);
    const r = webPages[url];
    if (r === undefined) throw new Error(`HTTP 404 ${url}`);
    return typeof r === 'string' ? { type: 'html', text: r } : { type: 'pdf', bytes: r };
  };
  return { download, requested, pages: webPages };
}

async function mount(o: {
  web: Record<string, string | Uint8Array>;
  answers?: FakeResponses;
  sources?: WatchedSource[];
  saveFails?: boolean;
  alertFails?: boolean;
  dataset?: Dataset;
  parties?: Record<string, Omit<Party, 'manifesto'>>;
  questions?: QuestionToProcess[];
  pulse?: Pulse;
}) {
  const web = createWeb(o.web);
  const saved: Change[] = [];
  const alerts: Alert[] = [];
  const ai = createFakeAI(o.answers ?? answers());
  const cache = createMemoryCache();
  let dataset = o.dataset ?? initialDataset();
  let state: WatcherState = {};
  const run = async (opts: { party?: string; force?: boolean } = {}) => {
    const r = await watch(
      { dataset, state, sources: o.sources ?? [{ party: 'pej', url: PEJ_PAGE }], parties: o.parties ?? { pej: pejRegistry }, ...(o.pulse ? { pulse: o.pulse } : {}) },
      {
        download: web.download,
        ai,
        cache,
        save: async (c) => {
          if (o.saveFails && c.deploy) throw new Error('wrangler deploy: 500');
          saved.push(c);
        },
        sendAlert: async (a) => {
          if (o.alertFails) throw new Error('GitHub caído');
          alerts.push(a);
        },
        now: () => new Date('2026-11-08T10:00:00Z'),
      },
      {
        ...opts,
        // With a pulse, the question list comes from it (unless given).
        processResult: { ...(o.pulse && !o.questions ? {} : { questions: o.questions ?? [housingQuestion] }), terms: testTerms, domains: testDomains, checkUrl: async () => true },
      },
    );
    dataset = r.dataset;
    state = r.state;
    return r;
  };
  return { run, web, saved, alerts, ai, get dataset() { return dataset; }, get state() { return state; } };
}

const pdf = () => createTestPdf(pages);
const json = (c: Change | undefined, path: string) => JSON.parse(c?.files[path] ?? 'null');

/** A frozen pulse with these questions: the first in "vivienda", the rest in "economia". */
const pulseOf = (questions: QuestionToProcess[]): Pulse => ({
  ...samplePulse,
  themes: [{ id: 'vivienda', title: 'Vivienda', order: 1 }, { id: 'economia', title: 'Economía', order: 2 }],
  questions: questions.map((q, i) => ({ id: q.id, theme: i === 0 ? 'vivienda' : 'economia', text: q.text, followUp: false, order: 1, origin: { cis: null, manifestos: 2 } })),
});
/** A settle pass: 3 approaches, the first defended in full by these parties with their first quote. */
const threeOn = (...parties: string[]) => (input: { positions: { party: string; quotes: string[] }[] }) => ({
  approaches: [
    { what: 'Primer enfoque de la pregunta.', how: 'Con una ley en todo el país.', figure: null, filler: false, stances: parties.map((party) => ({ party, stance: 'full', quote: input.positions.find((p) => p.party === party)!.quotes[0]! })) },
    { what: 'Segundo enfoque de la pregunta.', how: 'Con ayudas directas a las familias.', figure: null, filler: true, stances: [] },
    { what: 'Tercer enfoque de la pregunta.', how: 'Con un acuerdo con las comunidades.', figure: null, filler: true, stances: [] },
  ],
});

describe('watch', () => {
  it('detects a new programme linked from the official page, publishes it and notifies', async () => {
    const m = await mount({ web: { [PEJ_PAGE]: html('/docs/programa-29n.pdf', '/estatutos.html'), [PDF_PEJ]: await pdf() } });
    const r = await m.run();

    expect(r.results).toEqual([expect.objectContaining({ party: 'pej', result: 'published', url: PDF_PEJ })]);
    expect(m.saved).toHaveLength(1);
    const change = m.saved[0]!;
    expect(change.deploy).toBe(true);
    const ds = Dataset.parse(json(change, 'data/dataset.json'));
    expect(ds.origin).toBe('real');
    expect(ds.parties).toEqual([
      expect.objectContaining({ id: 'pej', manifesto: expect.objectContaining({ url: PDF_PEJ, hashPdf: expect.stringMatching(/^[0-9a-f]{64}$/) }) }),
    ]);
    expect(ds.positions).toEqual([expect.objectContaining({ party: 'pej', question: 'vivienda-asequible', state: 'proposes', proposal })]);
    expect(json(change, 'data/reports/pej.json')).toEqual(expect.objectContaining({ party: 'pej', publishable: true }));
    // Page text for the live free question, from the same PDF.
    expect(json(change, 'public/texts/pej.json')).toEqual({ party: 'pej', hashPdf: ds.parties[0]!.manifesto.state === 'published' ? ds.parties[0]!.manifesto.hashPdf : '', pages: expect.any(Array) });
    expect(m.dataset).toEqual(ds);
    expect(m.alerts).toEqual([expect.objectContaining({ type: 'published', title: expect.stringContaining('PEJ') })]);
  });

  it('does nothing when the PDF has not changed (same hash)', async () => {
    const m = await mount({ web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() } });
    await m.run();
    const calls = m.ai.calls.length;
    const r = await m.run();

    expect(r.results).toEqual([expect.objectContaining({ party: 'pej', result: 'unchanged' })]);
    expect(m.ai.calls).toHaveLength(calls);
    expect(m.saved).toHaveLength(1);
    expect(m.alerts).toHaveLength(1);
  });

  it('reprocesses a programme whose PDF changed', async () => {
    const m = await mount({ web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() } });
    await m.run();
    const hashBefore = m.state.pej?.hash;
    m.web.pages[PDF_PEJ] = await createTestPdf([...pages, ['Anexo: fe de erratas']]);
    const r = await m.run();

    expect(r.results[0]?.result).toBe('published');
    expect(m.state.pej?.hash).not.toBe(hashBefore);
    expect(m.saved).toHaveLength(2);
  });

  it('accepts a source that is the PDF itself', async () => {
    const m = await mount({ web: { [PDF_PEJ]: await pdf() }, sources: [{ party: 'pej', url: PDF_PEJ }] });
    const r = await m.run();
    expect(r.results[0]?.result).toBe('published');
  });

  it('finds the programme on an aggregator, ignoring links outside the party’s official domains', async () => {
    const m = await mount({
      web: {
        [AGGREGATOR]: html('https://agregador.example/copias/pej.pdf', 'https://otro-partido.es/programa.pdf', PDF_PEJ),
        [PDF_PEJ]: await pdf(),
      },
      sources: [{ party: 'pej', url: AGGREGATOR }],
    });
    const r = await m.run();
    expect(r.results[0]).toEqual(expect.objectContaining({ result: 'published', url: PDF_PEJ }));
    expect(m.web.requested).not.toContain('https://agregador.example/copias/pej.pdf');
    expect(m.web.requested).not.toContain('https://otro-partido.es/programa.pdf');
  });

  it('uses the source’s pattern to pick the programme among several PDFs', async () => {
    const m = await mount({
      web: { [PEJ_PAGE]: html('https://ejemplo.org/docs/estatutos.pdf', PDF_PEJ), [PDF_PEJ]: await pdf() },
      sources: [{ party: 'pej', url: PEJ_PAGE, pattern: 'programa' }],
    });
    const r = await m.run();
    expect(r.results[0]?.url).toBe(PDF_PEJ);
    expect(m.web.requested).not.toContain('https://ejemplo.org/docs/estatutos.pdf');
  });

  it('reports a party with no programme found yet without notifying', async () => {
    const m = await mount({ web: { [PEJ_PAGE]: html('/noticias.html') } });
    const r = await m.run();
    expect(r.results).toEqual([expect.objectContaining({ party: 'pej', result: 'noManifesto' })]);
    expect(m.alerts).toEqual([]);
    expect(m.saved).toEqual([]);
  });

  describe('a blocked programme', () => {
    it('publishes nothing of that party, keeps the previous state and notifies the reason', async () => {
      const m = await mount({ web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() }, answers: inventedAnswers() });
      const before = m.dataset;
      const r = await m.run();

      expect(r.results[0]?.result).toBe('blocked');
      expect(m.dataset).toEqual(before);
      expect(m.saved).toHaveLength(1);
      expect(m.saved[0]?.deploy).toBe(false);
      expect(Object.keys(m.saved[0]!.files)).not.toContain('data/dataset.json');
      expect(Object.keys(m.saved[0]!.files)).not.toContain('data/reports/pej.json');
      expect(Object.keys(m.saved[0]!.files)).not.toContain('public/texts/pej.json');
      expect(json(m.saved[0], 'data/reports/blocked/pej.json')).toEqual(expect.objectContaining({ publishable: false }));
      expect(m.alerts).toEqual([expect.objectContaining({ type: 'failure', message: expect.stringContaining('descart') })]);
    });

    it('keeps an already published version of the party intact', async () => {
      let invents = false;
      const goodAnswers = answers();
      const badAnswers = inventedAnswers();
      const m = await mount({
        web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() },
        answers: { ...goodAnswers, 'extract-position': (e, i) => (invents ? badAnswers : goodAnswers)['extract-position']!(e, i) },
      });
      await m.run();
      const published = m.dataset;
      // A new PDF whose extraction now fails verification.
      m.web.pages[PDF_PEJ] = await createTestPdf([...pages, ['Versión 2']]);
      invents = true;
      const r = await m.run();

      expect(r.results[0]?.result).toBe('blocked');
      expect(m.dataset).toEqual(published);
    });

    it('is not reprocessed (nor notified again) until its PDF changes', async () => {
      const m = await mount({ web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() }, answers: inventedAnswers() });
      await m.run();
      const r = await m.run();
      expect(r.results[0]?.result).toBe('unchanged');
      expect(m.alerts).toHaveLength(1);
    });
  });

  it('notifies a failure with its reason and retries on the next run when the pipeline crashes', async () => {
    let down = true;
    const base = answers();
    const m = await mount({
      web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() },
      answers: {
        ...base,
        'extract-position': (e, i) => {
          if (down) throw new Error('API de Anthropic: 529 overloaded');
          return base['extract-position']!(e, i);
        },
      },
    });
    const r = await m.run();
    expect(r.results[0]?.result).toBe('error');
    expect(m.alerts).toEqual([expect.objectContaining({ type: 'failure', message: expect.stringContaining('529 overloaded') })]);
    expect(m.saved).toEqual([]);
    expect(m.state).toEqual({});

    down = false;
    expect((await m.run()).results[0]?.result).toBe('published');
  });

  it('notifies a failed deploy and leaves the previous dataset', async () => {
    const m = await mount({ web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() }, saveFails: true });
    const before = m.dataset;
    const r = await m.run();
    expect(r.results[0]?.result).toBe('error');
    expect(m.dataset).toEqual(before);
    expect(m.state).toEqual({});
    expect(m.alerts).toEqual([expect.objectContaining({ type: 'failure', message: expect.stringContaining('wrangler deploy: 500') })]);
  });

  it('still publishes when the phone notification cannot be delivered', async () => {
    const m = await mount({ web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() }, alertFails: true });
    const r = await m.run();
    expect(r.results[0]?.result).toBe('published');
    expect(r.alertErrors).toEqual([expect.stringContaining('GitHub caído')]);
  });

  it('keeps watching the other parties when one source is unreachable', async () => {
    const m = await mount({
      web: { [PDF_PEJ]: await pdf() },
      sources: [
        { party: 'pej', url: 'https://ejemplo.org/caida' },
        { party: 'pej', url: PDF_PEJ },
      ],
    });
    const r = await m.run();
    expect(r.results).toEqual([expect.objectContaining({ party: 'pej', result: 'published' })]);
    expect(r.sourceErrors).toEqual([expect.objectContaining({ url: 'https://ejemplo.org/caida', error: expect.stringContaining('404') })]);
  });

  it("extracts one position per question of the current dataset when no question list is given", async () => {
    const m = await mount({ web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() } });
    const questions = [
      { ...housingQuestion, theme: 'vivienda', followUp: false, order: 1, origin: { cis: null, manifestos: 1 }, otherProposals: [] },
    ].map((q) => ({ ...q, approaches: ['a', 'b', 'c'].map((id) => ({ id, what: id, how: id, figure: null, filler: true, stances: [] })) }));
    const dataset = { ...initialDataset(), themes: [{ id: 'vivienda', title: 'Vivienda', order: 1 }], questions };
    const r = await watch(
      { dataset, state: {}, sources: [{ party: 'pej', url: PEJ_PAGE }], parties: { pej: pejRegistry } },
      { download: m.web.download, ai: createFakeAI(answers()), save: async () => {}, sendAlert: async () => {}, now: () => new Date('2026-11-08T10:00:00Z') },
      { processResult: { terms: testTerms, domains: testDomains, checkUrl: async () => true } },
    );
    expect(r.dataset.positions).toEqual([expect.objectContaining({ party: 'pej', question: 'vivienda-asequible', state: 'proposes' })]);
  });

  describe('a late manifesto: approaches already frozen (#28)', () => {
    // Published (real) dataset: OTP processed and the housing question settled with its 3 approaches.
    // Approaches present in the published dataset's `questions` are frozen. PEJ's manifesto arrives late.
    const OTP_QUOTE = 'Construiremos vivienda pública en alquiler social en suelo del Estado en todas las provincias.';
    const { manifesto: __, ...otpRegistry } = otherParty;
    const registry = { pej: pejRegistry, otp: otpRegistry };
    const approach = (n: number, what: string, how: string, filler: boolean, stances: Question['approaches'][number]['stances']) => ({
      id: `vivienda-asequible-${n}`, what, how, figure: null, filler, stances,
    });
    const frozenQuestion: Question = {
      id: housingQuestion.id, theme: 'vivienda', text: housingQuestion.text, keywords: housingQuestion.keywords,
      followUp: false, order: 1, origin: { cis: null, manifestos: 2 },
      approaches: [
        approach(1, 'Construir vivienda pública para alquilar a precio social.', 'En suelo público, en todas las provincias.', false, [{ party: 'otp', stance: 'full', quote: { text: OTP_QUOTE, page: 4 } }]),
        approach(2, 'Limitar el precio del alquiler en las zonas más caras.', 'Con un tope legal durante varios años.', true, [{ party: 'otp', stance: 'none' }]),
        approach(3, 'Bajar impuestos a quien compra su primera vivienda.', 'Con una rebaja del IVA de la vivienda nueva.', true, [{ party: 'otp', stance: 'none' }]),
      ],
      otherProposals: [],
    };
    const unpublished: QuestionToProcess = { id: 'pensiones', text: '¿Qué harían con las pensiones?', keywords: ['pensiones'] };
    const otpPositions = [
      { party: 'otp', question: housingQuestion.id, versions: { prompt: 'v2' }, state: 'proposes' as const, proposal: { what: 'Vivienda pública.', how: 'En suelo del Estado.', figure: null }, quotes: [{ text: OTP_QUOTE, page: 4 }] },
      { party: 'otp', question: 'pensiones', versions: { prompt: 'v2' }, state: 'proposes' as const, proposal: { what: 'Subir pensiones.', how: 'Con el IPC.', figure: null }, quotes: [{ text: 'Subiremos todas las pensiones cada año según el IPC real.', page: 6 }] },
    ];
    // Settle reports (#29): the housing question's original one, and the unpublished pensions question's.
    const approachReports = [
      { question: housingQuestion.id, promptVersion: 'enfoques-v1', rounds: 1, publishable: true, entries: [] },
      { question: 'pensiones', theme: 'economia', text: unpublished.text, promptVersion: 'enfoques-v1', rounds: 2, publishable: false, reason: 'las dos pasadas no coinciden tras 2 rondas', entries: [] },
    ];
    const publishedDataset = (): Dataset =>
      Dataset.parse({ approachReports, ...buildDataset({
        parties: [{ ...otherParty, manifesto: { ...otherParty.manifesto, state: 'published', hashPdf: 'a'.repeat(64) } } as Party, { ...pejRegistry, manifesto: { state: 'pending' } }],
        themes: [{ id: 'vivienda', title: 'Vivienda', order: 1 }],
        questions: [frozenQuestion],
        results: [{
          positions: otpPositions,
          report: { party: 'otp', hashPdf: 'a'.repeat(64), promptVersion: 'v2', extracted: 2, discarded: 0, publishable: true, positions: [], entries: [] },
        }],
        generated: '2026-11-01T00:00:00.000Z',
        origin: 'real',
      }) });
    /** A pass that keeps the frozen texts and puts PEJ in approach `at` (or nowhere). */
    const placing = (at?: number) => (input: { frozenApproaches: { what: string; how: string; figure: string | null; filler: boolean }[] }) => ({
      approaches: input.frozenApproaches.map((a, i) => ({ ...a, stances: i === at ? [{ party: 'pej', stance: 'partial', quote: QUOTE }] : [] })),
    });
    const lateMount = async (settle: NonNullable<FakeResponses['settle-approaches']>, o: { questions?: QuestionToProcess[]; pulse?: Pulse } = {}) =>
      mount({
        web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() },
        answers: answers({ 'settle-approaches': settle }),
        dataset: publishedDataset(),
        parties: registry,
        ...o,
      });
    const texts = (q: Question) => q.approaches.map(({ id, what, how, figure }) => ({ id, what, how, figure }));
    const published = (ds: Dataset) => ds.questions!.find((q) => q.id === housingQuestion.id)!;

    it('keeps the theme of a published question that is no longer in the pulse', async () => {
      // A later pulse without "vivienda": the frozen housing question stays published, with its theme.
      const later: Pulse = {
        ...pulseOf([unpublished]),
        themes: [{ id: 'economia', title: 'Economía', order: 1 }],
        questions: pulseOf([unpublished]).questions.map((q) => ({ ...q, theme: 'economia' })),
      };
      const m = await lateMount(placing(1), { pulse: later });
      const r = await m.run();

      expect(r.results).toEqual([expect.objectContaining({ party: 'pej', result: 'published' })]);
      expect(m.dataset.themes!.map((t) => t.id).sort()).toEqual(['economia', 'vivienda']);
    });

    it('classifies the new party into the frozen approaches and publishes on its own', async () => {
      const m = await lateMount(placing(1));
      const r = await m.run();

      expect(r.results).toEqual([expect.objectContaining({ party: 'pej', result: 'published' })]);
      const change = m.saved.at(-1)!;
      expect(change.deploy).toBe(true);
      const ds = Dataset.parse(json(change, 'data/dataset.json'));
      const q = published(ds);
      expect(texts(q)).toEqual(texts(frozenQuestion));
      expect(q.approaches[1]!.stances).toContainEqual({ party: 'pej', stance: 'partial', quote: { text: QUOTE, page: 2 } });
      expect(q.approaches[1]!.filler).toBe(false);
      // OTP stays exactly where it was published.
      expect(q.approaches.map((a) => a.stances.filter((s) => s.party === 'otp'))).toEqual(frozenQuestion.approaches.map((a) => a.stances));
      expect(ds.positions).toContainEqual(expect.objectContaining({ party: 'otp', question: housingQuestion.id }));
      expect(m.dataset).toEqual(ds);
      // The question's settle report is replaced by the late classification; the others are kept.
      expect(ds.approachReports).toEqual([
        approachReports[1],
        expect.objectContaining({ question: housingQuestion.id, publishable: true, entries: expect.arrayContaining([expect.objectContaining({ check: 'agreement', result: 'pass' })]) }),
      ]);
      // The AI only saw PEJ's quotes, with the frozen approaches.
      const settle = m.ai.calls.filter((c) => c.task === 'settle-approaches').map((c) => c.input as { positions: { party: string }[]; frozenApproaches: unknown[] });
      expect(settle.length).toBeGreaterThan(0);
      for (const input of settle) {
        expect(input.positions.map((p) => p.party)).toEqual(['pej']);
        expect(input.frozenApproaches).toHaveLength(3);
      }
    });

    it('a new party that fits no frozen approach is published as proposing something else', async () => {
      const m = await lateMount(placing());
      await m.run();

      const q = published(m.dataset);
      expect(texts(q)).toEqual(texts(frozenQuestion));
      expect(q.otherProposals).toEqual([{ party: 'pej', quote: { text: QUOTE, page: 2 } }]);
      expect(q.approaches.every((a) => a.stances.some((s) => s.party === 'pej' && s.stance === 'none'))).toBe(true);
    });

    it('blocks the manifesto when the classification cannot be settled, and keeps the published dataset', async () => {
      let n = 0;
      // The two passes never agree.
      const m = await lateMount((input: Parameters<ReturnType<typeof placing>>[0]) => placing(n++ % 2)(input));
      const before = m.dataset;
      const r = await m.run();

      expect(r.results).toEqual([expect.objectContaining({ party: 'pej', result: 'blocked', reason: expect.stringContaining(housingQuestion.id) })]);
      expect(m.dataset).toEqual(before);
      expect(m.saved.every((c) => !c.deploy && !c.files['data/dataset.json'])).toBe(true);
      expect(json(m.saved.at(-1), 'data/reports/blocked/pej-approaches.json')).toEqual([
        expect.objectContaining({ question: housingQuestion.id, publishable: false }),
      ]);
      expect(m.alerts).toEqual([expect.objectContaining({ type: 'failure', message: expect.stringContaining(housingQuestion.id) })]);
    });

    it('an unpublished question stays unpublished: the new position is kept for the operator, no approach is settled', async () => {
      const m = await lateMount(placing(0), { questions: [housingQuestion, unpublished] });
      await m.run();

      expect(m.dataset.questions!.map((q) => q.id)).toEqual([housingQuestion.id]);
      expect(m.dataset.approachReports).toContainEqual(approachReports[1]);
      expect(m.dataset.positions).toContainEqual(expect.objectContaining({ party: 'pej', question: 'pensiones' }));
      const settled = m.ai.calls.filter((c) => c.task === 'settle-approaches').map((c) => (c.input as { question: { id: string } }).question.id);
      expect(new Set(settled)).toEqual(new Set([housingQuestion.id]));
    });

    it('with the frozen pulse, every pulse question is processed by default: the position on an unpublished one is kept for the operator', async () => {
      const m = await lateMount(placing(0), { pulse: pulseOf([housingQuestion, unpublished]) });
      await m.run();

      expect(m.dataset.questions!.map((q) => q.id)).toEqual([housingQuestion.id]);
      expect(m.dataset.positions).toContainEqual(expect.objectContaining({ party: 'pej', question: 'pensiones' }));
      // The operator settles it later from every party's position (npm run settle): the frozen one is left alone.
      const ai = createFakeAI(answers({ 'settle-approaches': threeOn('pej', 'otp') }));
      const settled = await settleAll(m.dataset, pulseOf([housingQuestion, unpublished]), ai);
      if (!settled.ok) throw new Error(settled.reason);
      const asked = ai.calls.filter((c) => c.task === 'settle-approaches').map((c) => (c.input as { question: { id: string } }).question.id);
      expect(new Set(asked)).toEqual(new Set(['pensiones']));
      expect(settled.dataset.questions!.map((q) => q.id).sort()).toEqual([housingQuestion.id, 'pensiones'].sort());
      expect(published(settled.dataset)).toEqual(published(m.dataset));
      expect(settled.dataset.approachReports!.find((r) => r.question === 'pensiones')).toMatchObject({ publishable: true });
    });

    it('classifies the new party into every published question concurrently, keeping their order', async () => {
      const pensionsQuestion: Question = {
        ...frozenQuestion, id: 'pensiones', text: unpublished.text, keywords: unpublished.keywords, order: 2,
        approaches: frozenQuestion.approaches.map((a, i) => ({ ...a, id: `pensiones-${i + 1}` })),
      };
      const m = await lateMount(placing(0), { questions: [housingQuestion, unpublished] });
      const dataset = Dataset.parse({ ...publishedDataset(), questions: [frozenQuestion, pensionsQuestion], approachReports: [approachReports[0]] });
      const run = await mount({ web: m.web.pages, answers: answers({ 'settle-approaches': placing(0) }), dataset, parties: registry, questions: [housingQuestion, unpublished] });
      await run.run();

      // Both questions' passes go out before any approach check.
      const from = run.ai.calls.findIndex((c) => c.task === 'settle-approaches');
      expect(run.ai.calls.slice(from, from + 4).map((c) => [c.task, (c.input as { question: { id: string } }).question.id])).toEqual([
        ['settle-approaches', housingQuestion.id], ['settle-approaches', housingQuestion.id], ['settle-approaches', 'pensiones'], ['settle-approaches', 'pensiones'],
      ]);
      expect(run.dataset.questions!.map((q) => q.id)).toEqual([housingQuestion.id, 'pensiones']);
      expect(run.dataset.questions!.every((q) => q.approaches[0]!.stances.some((s) => s.party === 'pej' && s.stance === 'partial'))).toBe(true);
    });

    it('a run without a published question blocks the party, naming that question (it would lose its position there)', async () => {
      const m = await lateMount(placing(0), { questions: [unpublished] });
      const before = m.dataset;
      const r = await m.run();

      expect(r.results).toEqual([expect.objectContaining({ party: 'pej', result: 'blocked', reason: expect.stringMatching(new RegExp(`^sin postura de pej en la pregunta publicada ${housingQuestion.id}`)) })]);
      expect(m.dataset).toEqual(before);
      expect(m.ai.calls.some((c) => c.task === 'settle-approaches')).toBe(false);
    });

    it('a changed manifesto moves only that party, and a forced re-run gives the same result', async () => {
      const m = await lateMount(placing(1));
      await m.run();
      const first = m.dataset;
      await m.run({ party: 'pej', force: true });

      expect(m.dataset.questions).toEqual(first.questions);
      expect(published(m.dataset).approaches.flatMap((a) => a.stances.filter((s) => s.party === 'pej' && s.stance !== 'none'))).toHaveLength(1);
    });
  });

  describe('the frozen pulse: themes and questions of the first real dataset (#18 review)', () => {
    const pensions: QuestionToProcess = { id: 'pensiones', text: '¿Qué harían con las pensiones?', keywords: ['pensiones'] };

    it('the first manifesto over the simulated dataset brings the pulse themes and a position on every pulse question; nothing is settled yet', async () => {
      const pulse = pulseOf([housingQuestion, pensions]);
      const m = await mount({ web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() }, pulse });
      await m.run();

      expect(m.dataset.origin).toBe('real');
      expect(m.dataset.themes).toEqual(pulse.themes);
      expect(m.dataset.questions ?? []).toEqual([]);
      expect(m.dataset.positions.map((p) => p.question).sort()).toEqual(['pensiones', housingQuestion.id].sort());
      expect(m.ai.calls.some((c) => c.task === 'settle-approaches')).toBe(false);
    });

    it('npm run settle: settles every pulse question from all parties\' positions and publishes them (V9 checked)', async () => {
      const pulse = pulseOf([housingQuestion, pensions]);
      const m = await mount({ web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() }, pulse });
      await m.run();
      const ai = createFakeAI(answers({ 'settle-approaches': threeOn('pej') }));
      const r = await settleAll(m.dataset, pulse, ai);
      if (!r.ok) throw new Error(r.reason);

      expect(r.dataset.questions!.map((q) => q.id).sort()).toEqual(['pensiones', housingQuestion.id].sort());
      const q = r.dataset.questions!.find((x) => x.id === housingQuestion.id)!;
      // The pulse fields come along: theme, order, origin, follow-up flag.
      expect(q).toMatchObject({ theme: 'vivienda', followUp: false, order: 1, origin: { cis: null, manifestos: 2 } });
      expect(q.approaches[0]!.stances).toContainEqual(expect.objectContaining({ party: 'pej', stance: 'full' }));
      expect(r.reports.map((x) => x.question).sort()).toEqual(['pensiones', housingQuestion.id].sort());
      expect(Dataset.safeParse(r.dataset).success).toBe(true);
      // Only the questions given with `only`.
      const one = await settleAll(m.dataset, pulse, createFakeAI(answers({ 'settle-approaches': threeOn('pej') })), { only: ['pensiones'] });
      expect(one.ok && one.dataset.questions!.map((x) => x.id)).toEqual(['pensiones']);
    });

    /** The dataset with OTP published too, with a position only on these questions. */
    const withOtp = (ds: Dataset, questions: string[], state: 'proposes' | 'noProposal' = 'noProposal', hashPdf = 'a'.repeat(64)): Dataset =>
      Dataset.parse({
        ...ds,
        parties: [...ds.parties, { ...otherParty, manifesto: { ...otherParty.manifesto, state: 'published', hashPdf } }],
        positions: [
          ...ds.positions,
          ...questions.map((question) =>
            state === 'proposes'
              ? { party: 'otp', question, versions: { prompt: 'v2' }, state, proposal: { what: 'Vivienda pública.', how: 'En suelo del Estado.', figure: null }, quotes: [{ text: 'Construiremos vivienda pública en alquiler social en suelo del Estado en todas las provincias.', page: 4 }] }
              : { party: 'otp', question, versions: { prompt: 'v2' }, state },
          ),
        ],
        reports: [...ds.reports, { party: 'otp', hashPdf, promptVersion: 'v2', extracted: 0, discarded: 0, publishable: true, positions: [], entries: [] }],
      });
    const settledIds = (ai: { calls: { task: string; input: unknown }[] }) =>
      new Set(ai.calls.filter((c) => c.task === 'settle-approaches').map((c) => (c.input as { question: { id: string } }).question.id));

    it('npm run settle holds back a question a published party has no position on, says which party to reprocess, and publishes the rest', async () => {
      const pulse = pulseOf([housingQuestion, pensions]);
      const m = await mount({ web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() }, pulse });
      await m.run();
      const dataset = withOtp(m.dataset, [housingQuestion.id]);
      const ai = createFakeAI(answers({ 'settle-approaches': threeOn('pej') }));
      const r = await settleAll(dataset, pulse, ai);
      if (!r.ok) throw new Error(r.reason);

      expect(r.dataset.questions!.map((q) => q.id)).toEqual([housingQuestion.id]);
      expect(r.held).toEqual([{ question: 'pensiones', parties: ['otp'] }]);
      expect(settledIds(ai)).toEqual(new Set([housingQuestion.id]));
      // The dry run says it too, before any cost.
      expect(estimateSettle(dataset, pulse).held).toEqual([{ question: 'pensiones', parties: ['otp'] }]);
      // Once OTP is reprocessed against the whole pulse, the held question settles.
      const again = await settleAll(withOtp(m.dataset, [housingQuestion.id, 'pensiones']), pulse, createFakeAI(answers({ 'settle-approaches': threeOn('pej') })));
      expect(again.ok && again.dataset.questions!.map((q) => q.id).sort()).toEqual(['pensiones', housingQuestion.id].sort());
    });

    it('npm run settle keeps the theme of a published question that is no longer in the pulse', async () => {
      const m = await mount({ web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() }, pulse: pulseOf([housingQuestion, pensions]) });
      await m.run();
      const first = await settleAll(m.dataset, pulseOf([housingQuestion, pensions]), createFakeAI(answers({ 'settle-approaches': threeOn('pej') })), { only: [housingQuestion.id] });
      if (!first.ok) throw new Error(first.reason);
      // A later pulse without "vivienda": the housing question stays published, with its theme.
      const later: Pulse = { ...pulseOf([pensions]), themes: [{ id: 'economia', title: 'Economía', order: 1 }], questions: pulseOf([pensions]).questions.map((q) => ({ ...q, theme: 'economia' })) };
      const r = await settleAll(first.dataset, later, createFakeAI(answers({ 'settle-approaches': threeOn('pej') })));
      if (!r.ok) throw new Error(r.reason);

      expect(r.dataset.questions!.map((q) => q.id).sort()).toEqual(['pensiones', housingQuestion.id].sort());
      expect(r.dataset.themes!.map((t) => t.id).sort()).toEqual(['economia', 'vivienda']);
    });

    it('npm run settle settles the questions concurrently, with the same result as one by one', async () => {
      const pulse = pulseOf([housingQuestion, pensions]);
      const m = await mount({ web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() }, pulse });
      await m.run();
      const ai = createFakeAI(answers({ 'settle-approaches': threeOn('pej') }));
      const r = await settleAll(m.dataset, pulse, ai);
      if (!r.ok) throw new Error(r.reason);

      // Both questions' first passes go out before any approach check.
      expect(ai.calls.slice(0, 4).map((c) => [c.task, (c.input as { question: { id: string } }).question.id])).toEqual([
        ['settle-approaches', housingQuestion.id],
        ['settle-approaches', housingQuestion.id],
        ['settle-approaches', 'pensiones'],
        ['settle-approaches', 'pensiones'],
      ]);
      const one = await settleAll(m.dataset, pulse, createFakeAI(answers({ 'settle-approaches': threeOn('pej') })), { only: [housingQuestion.id] });
      const two = one.ok && (await settleAll(one.dataset, pulse, createFakeAI(answers({ 'settle-approaches': threeOn('pej') })), { only: ['pensiones'] }));
      expect(two && two.ok && two.dataset.questions).toEqual(r.dataset.questions);
      expect(r.reports.map((x) => x.question)).toEqual([housingQuestion.id, 'pensiones']);
    });

    it('npm run settle cache: a new manifesto of a party with nothing to say on the questions costs no AI call', async () => {
      const pulse = pulseOf([housingQuestion, pensions]);
      const m = await mount({ web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() }, pulse });
      await m.run();
      const store = createMemoryCache();
      const ids = [housingQuestion.id, 'pensiones'];
      const first = await settleAll(withOtp(m.dataset, ids), pulse, settleCache(createFakeAI(answers({ 'settle-approaches': threeOn('pej') })), store));
      const ai = createFakeAI(answers({ 'settle-approaches': threeOn('pej') }));
      const second = await settleAll(withOtp(m.dataset, ids, 'noProposal', 'b'.repeat(64)), pulse, settleCache(ai, store));

      expect(ai.calls).toEqual([]);
      expect(second.ok && second.dataset.questions).toEqual(first.ok && first.dataset.questions);
    });

    it('npm run settle refuses a simulated dataset (nothing real to settle)', async () => {
      const r = await settleAll(initialDataset(), pulseOf([housingQuestion]), createFakeAI({}));
      expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/simulad/) });
    });

    it('npm run settle -- --dry-run: the estimate counts the AI calls per question, without calling it', async () => {
      const pulse = pulseOf([housingQuestion, pensions]);
      const m = await mount({ web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() }, pulse });
      await m.run();
      const estimate = estimateSettle(m.dataset, pulse);
      expect(estimate.questions.map((x) => [x.id, x.proposing])).toEqual([[housingQuestion.id, 1], ['pensiones', 1]]);
      expect(estimate.calls.min).toBeGreaterThan(0);
      expect(estimate.calls.max).toBeGreaterThan(estimate.calls.min);
      expect(estimate.frozen).toEqual([]);
    });
  });

  describe('manual relaunch', () => {
    it('reprocesses one party on demand even if its PDF has not changed, with the same result', async () => {
      const m = await mount({ web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() } });
      await m.run();
      const first = m.dataset;
      const r = await m.run({ party: 'pej', force: true });

      expect(r.results[0]?.result).toBe('published');
      expect(m.saved).toHaveLength(2);
      // Cached AI answers ⇒ same positions and notes.
      expect(m.dataset.positions).toEqual(first.positions);
    });

    it('only looks at that party’s sources', async () => {
      const m = await mount({
        web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() },
        sources: [
          { party: 'pej', url: PEJ_PAGE },
          { party: 'otro', url: 'https://otro-partido.es/programa' },
        ],
      });
      await m.run({ party: 'pej' });
      expect(m.web.requested).not.toContain('https://otro-partido.es/programa');
    });

    it('rejects an unknown party', async () => {
      const m = await mount({ web: {} });
      await expect(m.run({ party: 'nadie' })).rejects.toThrow(/nadie/);
    });
  });
});

describe('createIssueAlert', () => {
  const fakeGh = (openTitles: string[] = []) => {
    const calls: string[][] = [];
    const run = (args: string[]) => {
      calls.push(args);
      if (args[0] === 'issue' && args[1] === 'list') return JSON.stringify(openTitles.map((title) => ({ title })));
      if (args[0] === 'issue' && args[1] === 'create') return 'https://github.com/jorgemasta/29n/issues/99\n';
      return '';
    };
    return { run, calls };
  };
  const created = (calls: string[][]) => calls.filter((c) => c[0] === 'issue' && c[1] === 'create');

  it('opens a labelled issue assigned to the maintainer for a failure, and leaves it open', async () => {
    const gh = fakeGh();
    const sendAlert = createIssueAlert({ run: gh.run, assignee: 'jorgemasta' });
    await sendAlert({ type: 'failure', title: '29N: programa de PEJ bloqueado', message: 'V1: cita inventada' });

    const [create] = created(gh.calls);
    expect(create).toEqual(expect.arrayContaining(['--title', '29N: programa de PEJ bloqueado', '--label', WATCHER_LABEL, '--assignee', 'jorgemasta']));
    expect(create?.[create.indexOf('--body') + 1]).toContain('V1: cita inventada');
    expect(gh.calls.some((c) => c[1] === 'close')).toBe(false);
  });

  it('closes a publication notice right away, so it notifies without staying open', async () => {
    const gh = fakeGh();
    await createIssueAlert({ run: gh.run })({ type: 'published', title: '29N: publicado el programa de PEJ', message: '3 posturas' });
    expect(gh.calls).toContainEqual(['issue', 'close', 'https://github.com/jorgemasta/29n/issues/99', '--reason', 'completed']);
  });

  it('does not repeat a failure that already has an open issue', async () => {
    const gh = fakeGh(['29N: fallo al procesar PEJ']);
    await createIssueAlert({ run: gh.run })({ type: 'failure', title: '29N: fallo al procesar PEJ', message: 'timeout' });
    expect(created(gh.calls)).toHaveLength(0);
  });

  it('fails loudly when gh fails', async () => {
    const sendAlert = createIssueAlert({
      run: () => {
        throw new Error('gh: HTTP 403');
      },
    });
    await expect(sendAlert({ type: 'published', title: 't', message: 'm' })).rejects.toThrow(/403/);
  });
});
