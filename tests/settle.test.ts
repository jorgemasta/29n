// Test point A': settleApproaches (settle the 3 approaches of a question), with the fake AI.
import { describe, expect, it } from 'vitest';
import { createFakeAI, type FakeResponse, type FakeResponses } from '../src/ai/fake';
import { Dataset, Question } from '../src/dataset/schema';
import { GUESS_ROUNDS, MAX_REWRITES } from '../src/pipeline/approach-checks';
import { publishSettled, settleApproaches, type ApproachCheck, type QuestionSpec, type SettlePosition } from '../src/pipeline/settle';

const question: QuestionSpec = {
  id: 'alquiler',
  theme: 'vivienda',
  text: '¿Qué harían con el precio del alquiler?',
  followUp: false,
  order: 1,
  origin: { cis: 'Barómetro de octubre: la vivienda es el primer problema', manifestos: 4 },
};

const QUOTES = {
  pej: 'Limitaremos por ley el precio del alquiler en las zonas tensionadas durante cinco años.',
  otp: 'Rebajaremos el IVA de la vivienda nueva para los compradores de primera vivienda.',
  ter: 'Construiremos vivienda pública en alquiler social en suelo del Estado en todas las provincias.',
  cua: 'Pondremos topes temporales a las subidas del alquiler y ayudas directas a inquilinos jóvenes.',
  qui: 'Crearemos una lotería nacional cuyos beneficios se destinen íntegramente a pagar alquileres.',
};
type Id = keyof typeof QUOTES;
const proposes = (party: Id): SettlePosition => ({ party, state: 'proposes', quotes: [{ text: QUOTES[party], page: 3 }] });

const capRent = { what: 'Limitar el precio del alquiler en las zonas más caras.', how: 'Con un tope legal durante varios años.', figure: null };
const taxCut = { what: 'Bajar impuestos a quien compra su primera vivienda.', how: 'Con una rebaja del IVA de la vivienda nueva.', figure: null };
const publicHousing = { what: 'Construir vivienda pública para alquilar a precio social.', how: 'En suelo público, en todas las provincias.', figure: 'Decenas de miles de viviendas' };
const filler = { what: 'Dejar que el mercado fije el precio sin intervenir.', how: 'Retirando ayudas y regulaciones del alquiler.', figure: null };

const stance = (party: Id, level: 'full' | 'partial' = 'full') => ({ party, stance: level, quote: QUOTES[party] });

/** A pass answer: 3 approaches with their defenders. */
const threeApproaches = {
  approaches: [
    { ...capRent, filler: false, stances: [stance('pej'), stance('cua', 'partial')] },
    { ...taxCut, filler: false, stances: [stance('otp')] },
    { ...publicHousing, filler: false, stances: [stance('ter')] },
  ],
};

const positions = [proposes('pej'), proposes('otp'), proposes('ter'), proposes('cua')];

/** V10 finds every approach faithful; V11 always guesses a party that defends nothing. */
const passingChecks: FakeResponses = {
  'verify-fidelity': () => ({ adds: false, omits: false, changesMeaning: false, explanation: 'Fiel a la cita.' }),
  'guess-party': (input: { approaches: { letter: string }[] }) => ({ assignments: input.approaches.map((a) => ({ letter: a.letter, party: 'nadie', hint: 'ninguna' })) }),
};

function fakeAi(settle: FakeResponse, extra: FakeResponses = {}) {
  return createFakeAI({ ...passingChecks, 'settle-approaches': settle, ...extra });
}

const settleCalls = (ai: { calls: { task: string; input: unknown }[] }) => ai.calls.filter((c) => c.task === 'settle-approaches');

describe("settleApproaches (test point A')", () => {
  it('settles exactly 3 approaches, each party at its stance with its quote', async () => {
    const ai = fakeAi(() => threeApproaches);
    const result = await settleApproaches({ question, positions }, ai);

    expect(result.publishable).toBe(true);
    const q = result.question!;
    expect(Question.safeParse(q).success).toBe(true);
    expect(q.approaches).toHaveLength(3);
    expect(q.approaches.map((a) => a.what)).toEqual([capRent.what, taxCut.what, publicHousing.what]);
    expect(q.approaches[0]!.stances).toContainEqual({ party: 'pej', stance: 'full', quote: { text: QUOTES.pej, page: 3 } });
    expect(q.approaches[0]!.stances).toContainEqual({ party: 'cua', stance: 'partial', quote: { text: QUOTES.cua, page: 3 } });
    expect(q.approaches[0]!.stances).toContainEqual({ party: 'otp', stance: 'none' });
    expect(q.otherProposals).toEqual([]);
  });

  it('adds a filler approach, defended by nobody, when the manifestos do not give 3', async () => {
    const twoReal = {
      approaches: [
        { ...capRent, filler: false, stances: [stance('pej'), stance('cua')] },
        { ...taxCut, filler: false, stances: [stance('otp'), stance('ter')] },
        { ...filler, filler: true, stances: [] },
      ],
    };
    const result = await settleApproaches({ question, positions }, fakeAi(() => twoReal));

    expect(result.publishable).toBe(true);
    const approaches = result.question!.approaches;
    expect(approaches).toHaveLength(3);
    expect(approaches.map((a) => a.filler)).toEqual([false, false, true]);
    expect(approaches[2]!.stances.every((s) => s.stance === 'none')).toBe(true);
  });

  it('marks an approach nobody defends as filler even if the AI forgot to', async () => {
    const unflagged = { approaches: [threeApproaches.approaches[0], threeApproaches.approaches[1], { ...filler, filler: false, stances: [] }] };
    const ai = fakeAi(() => unflagged);
    const result = await settleApproaches({ question, positions: positions.filter((p) => p.party !== 'ter') }, ai);

    expect(result.question!.approaches[2]!.filler).toBe(true);
  });

  it('a party that fits no approach proposes something else, with its quote', async () => {
    const result = await settleApproaches({ question, positions: [...positions, proposes('qui')] }, fakeAi(() => threeApproaches));

    expect(result.publishable).toBe(true);
    expect(result.question!.otherProposals).toEqual([{ party: 'qui', quote: { text: QUOTES.qui, page: 3 } }]);
    expect(result.question!.approaches.every((a) => a.stances.some((s) => s.party === 'qui' && s.stance === 'none'))).toBe(true);
  });

  it('parties without a proposal are neither classified nor sent to the AI', async () => {
    const ai = fakeAi(() => threeApproaches);
    const silent: SettlePosition[] = [{ party: 'qui', state: 'noProposal' }, { party: 'sex', state: 'unverified' }];
    const result = await settleApproaches({ question, positions: [...positions, ...silent] }, ai);

    const parties = result.question!.approaches.flatMap((a) => a.stances.map((s) => s.party));
    expect(parties).not.toContain('qui');
    expect(result.question!.otherProposals).toEqual([]);
    expect(ai.calls.some((c) => c.task === 'guess-party')).toBe(true);
    expect(JSON.stringify(ai.calls.map((c) => c.input))).not.toMatch(/"qui"|"sex"/);
  });

  it('sends the AI each party\'s own proposal (what / how / figure) with its quotes (#18 review)', async () => {
    const ai = fakeAi(() => threeApproaches);
    const proposal = { what: 'Limitar el alquiler', how: 'Por ley en zonas tensionadas', figure: '5 años' };
    await settleApproaches({ question, positions: [{ ...proposes('pej'), proposal }, ...positions.slice(1)] }, ai);

    for (const call of settleCalls(ai)) {
      const input = call.input as { positions: { party: string; quotes: string[]; proposal?: unknown }[] };
      expect(input.positions.find((p) => p.party === 'pej')).toEqual({ party: 'pej', quotes: [QUOTES.pej], proposal });
      expect(input.positions.find((p) => p.party === 'otp')).toEqual({ party: 'otp', quotes: [QUOTES.otp] });
    }
    expect(ai.calls.find((c) => c.task === 'settle-approaches')!.instructions).toMatch(/proposal/);
  });

  it('is not publishable, without calling the AI, when no party proposes anything', async () => {
    const ai = fakeAi(() => threeApproaches);
    const result = await settleApproaches({ question, positions: [{ party: 'pej', state: 'noProposal' }] }, ai);

    expect(result.publishable).toBe(false);
    expect(result.question).toBeNull();
    expect(result.report.reason).toMatch(/ningún partido/);
    expect(ai.calls).toHaveLength(0);
  });

  describe('every stance carries a quote from the party', () => {
    it('keeps the page of the party quote the AI quoted (even a literal fragment of it)', async () => {
      const fragment = { approaches: [{ ...capRent, filler: false, stances: [{ party: 'pej', stance: 'full', quote: 'el precio del alquiler en las zonas tensionadas durante cinco años' }] }, threeApproaches.approaches[1], threeApproaches.approaches[2]] };
      const result = await settleApproaches({ question, positions: [proposes('pej'), proposes('otp'), proposes('ter')] }, fakeAi(() => fragment));

      expect(result.question!.approaches[0]!.stances[0]!).toEqual({ party: 'pej', stance: 'full', quote: { text: QUOTES.pej, page: 3 } });
    });

    it('a quote that is not in the party position invalidates the pass', async () => {
      const invented = { approaches: [{ ...capRent, filler: false, stances: [{ party: 'pej', stance: 'full', quote: 'Prohibiremos todos los pisos turísticos en las capitales de provincia.' }] }, threeApproaches.approaches[1], threeApproaches.approaches[2]] };
      const result = await settleApproaches({ question, positions }, fakeAi(() => invented));

      expect(result.publishable).toBe(false);
      expect(result.report.entries.map((e) => e.detail).join(' ')).toMatch(/cita de pej/);
    });
  });

  it('never publishes other than exactly 3 approaches', async () => {
    const two = { approaches: threeApproaches.approaches.slice(0, 2) };
    const result = await settleApproaches({ question, positions }, fakeAi(() => two));

    expect(result.publishable).toBe(false);
    expect(result.question).toBeNull();
    expect(result.report.entries.at(-1)!.detail).toMatch(/2 enfoques en vez de 3/);
  });

  describe('two independent passes that must agree', () => {
    /** Second pass puts cua fully in the public-housing approach instead of partially in rent caps. */
    const disagreeing = {
      approaches: [
        { ...capRent, filler: false, stances: [stance('pej')] },
        threeApproaches.approaches[1],
        { ...publicHousing, filler: false, stances: [stance('ter'), stance('cua')] },
      ],
    };

    it('runs two passes that see the parties in a different order, and agree whatever the wording', async () => {
      const reworded = { approaches: [...threeApproaches.approaches].reverse().map((a) => ({ ...a, what: `${a.what} (otra redacción)` })) };
      const ai = fakeAi((_, attempt) => (attempt === 0 ? threeApproaches : reworded));
      const result = await settleApproaches({ question, positions }, ai);

      const passes = settleCalls(ai).map((c) => c.input as { positions: { party: string }[] });
      expect(passes).toHaveLength(2);
      expect(passes[1]!.positions.map((p) => p.party)).not.toEqual(passes[0]!.positions.map((p) => p.party));
      expect(result.publishable).toBe(true);
      expect(result.report.rounds).toBe(1);
      expect(result.question!.approaches[0]!.what).toBe(capRent.what);
    });

    it('retries once when the passes disagree, and publishes if the retry agrees', async () => {
      const ai = fakeAi((_, attempt) => (attempt === 1 ? disagreeing : threeApproaches));
      const result = await settleApproaches({ question, positions }, ai);

      expect(settleCalls(ai)).toHaveLength(4);
      expect(result.publishable).toBe(true);
      expect(result.report.rounds).toBe(2);
      expect(result.report.entries.filter((e) => e.check === 'agreement').map((e) => e.result)).toEqual(['retry', 'pass']);
    });

    it('is not publishable after the retry still disagrees, and says why in the report', async () => {
      const ai = fakeAi((_, attempt) => (attempt % 2 === 0 ? threeApproaches : disagreeing));
      const result = await settleApproaches({ question, positions }, ai);

      expect(settleCalls(ai)).toHaveLength(4);
      expect(result.publishable).toBe(false);
      expect(result.question).toBeNull();
      expect(result.report).toMatchObject({ question: 'alquiler', publishable: false, rounds: 2 });
      expect(result.report.reason).toMatch(/no coinciden/);
      const last = result.report.entries.at(-1)!;
      expect(last).toMatchObject({ check: 'agreement', result: 'block' });
      expect(last.detail).toMatch(/cua:partial/);
    });
  });

  it('runs every approach check on the settled approaches; a block finding makes the question unpublishable without rewriting', async () => {
    const seen: string[] = [];
    const v3: ApproachCheck = async (approach) => {
      seen.push(approach.id);
      return approach.what.includes('impuestos') ? [{ check: 'V3', result: 'block', detail: 'marca de partido' }] : [{ check: 'V3', result: 'pass', detail: 'sin marcas' }];
    };
    const ai = fakeAi(() => threeApproaches);
    const result = await settleApproaches({ question, positions }, ai, { checks: [v3] });

    expect(seen).toHaveLength(3);
    expect(result.publishable).toBe(false);
    expect(result.report.entries).toContainEqual({ check: 'V3', approach: 'alquiler-2', result: 'block', detail: 'marca de partido' });
    expect(result.report.reason).toMatch(/V3/);
    expect(ai.calls.filter((c) => c.task === 'rewrite-approach')).toHaveLength(0);
  });

  describe('late manifesto: frozen approaches, only the new party is classified (#28)', () => {
    /** The question as published with pej, otp, ter and cua (qui and sex arrive late). */
    const published = async () => (await settleApproaches({ question, positions }, fakeAi(() => threeApproaches))).question!;
    const frozenOf = (q: Question, parties: string[]) => ({ approaches: q.approaches, otherProposals: q.otherProposals, parties });
    const texts = (q: Pick<Question, 'approaches'>) => q.approaches.map(({ id, what, how, figure }) => ({ id, what, how, figure }));
    /** A pass answer that keeps the frozen texts and places only `party` (or nobody). */
    const placing = (q: Question, party?: Id, at?: number, level: 'full' | 'partial' = 'full') => ({
      approaches: q.approaches.map((a, i) => ({ what: a.what, how: a.how, figure: a.figure, filler: a.filler, stances: party && i === at ? [stance(party, level)] : [] })),
    });

    it('classifies the new party into a frozen approach; approaches and the other parties stay as published', async () => {
      const q = await published();
      const result = await settleApproaches({ question, positions: [...positions, proposes('qui')], frozen: frozenOf(q, ['qui']) }, fakeAi(() => placing(q, 'qui', 2, 'partial')));

      expect(result.publishable).toBe(true);
      expect(texts(result.question!)).toEqual(texts(q));
      expect(result.question!.approaches[2]!.stances).toContainEqual({ party: 'qui', stance: 'partial', quote: { text: QUOTES.qui, page: 3 } });
      expect(result.question!.approaches[0]!.stances).toContainEqual({ party: 'qui', stance: 'none' });
      // Everyone else keeps exactly the stance they had.
      for (const [i, a] of q.approaches.entries()) {
        expect(result.question!.approaches[i]!.stances.filter((s) => s.party !== 'qui')).toEqual(a.stances);
      }
      expect(result.question!.otherProposals).toEqual(q.otherProposals);
    });

    it('sends the AI the frozen approaches and only the new party', async () => {
      const q = await published();
      const ai = fakeAi(() => placing(q, 'qui', 0));
      await settleApproaches({ question, positions: [...positions, proposes('qui')], frozen: frozenOf(q, ['qui']) }, ai);

      const calls = settleCalls(ai).map((c) => c.input as { positions: { party: string }[]; frozenApproaches: { what: string }[] });
      expect(calls).toHaveLength(2);
      for (const input of calls) {
        expect(input.positions.map((p) => p.party)).toEqual(['qui']);
        expect(input.frozenApproaches.map((a) => a.what)).toEqual(q.approaches.map((a) => a.what));
      }
    });

    it('a new party that fits no frozen approach proposes something else', async () => {
      const q = await published();
      const result = await settleApproaches({ question, positions: [...positions, proposes('qui')], frozen: frozenOf(q, ['qui']) }, fakeAi(() => placing(q)));

      expect(result.publishable).toBe(true);
      expect(texts(result.question!)).toEqual(texts(q));
      expect(result.question!.otherProposals).toEqual([{ party: 'qui', quote: { text: QUOTES.qui, page: 3 } }]);
      expect(result.question!.approaches.every((a) => a.stances.some((s) => s.party === 'qui' && s.stance === 'none'))).toBe(true);
    });

    it('ignores rewordings: the published text is kept whatever the AI writes', async () => {
      const q = await published();
      const reworded = { approaches: placing(q, 'qui', 1).approaches.map((a) => ({ ...a, what: 'Texto distinto que no debe publicarse.' })) };
      const result = await settleApproaches({ question, positions: [...positions, proposes('qui')], frozen: frozenOf(q, ['qui']) }, fakeAi(() => reworded));

      expect(texts(result.question!)).toEqual(texts(q));
      expect(result.question!.approaches[1]!.stances).toContainEqual(expect.objectContaining({ party: 'qui', stance: 'full' }));
    });

    it('a new party without a proposal leaves the question as published, without calling the AI', async () => {
      const q = await published();
      const ai = fakeAi(() => placing(q));
      const result = await settleApproaches({ question, positions: [...positions, { party: 'qui', state: 'noProposal' }], frozen: frozenOf(q, ['qui']) }, ai);

      expect(result.publishable).toBe(true);
      expect(result.question).toEqual(q);
      expect(ai.calls).toHaveLength(0);
    });

    it('a changed manifesto moves only that party; the others keep their place', async () => {
      const q = await published();
      const result = await settleApproaches({ question, positions, frozen: frozenOf(q, ['otp']) }, fakeAi(() => placing(q, 'otp', 2)));

      expect(result.question!.approaches[1]!.stances).toContainEqual({ party: 'otp', stance: 'none' });
      expect(result.question!.approaches[2]!.stances).toContainEqual(expect.objectContaining({ party: 'otp', stance: 'full' }));
      expect(result.question!.approaches[0]!.stances).toEqual(q.approaches[0]!.stances);
    });

    it('a frozen filler approach the new party defends stops being filler, with the same text', async () => {
      const withFiller = { approaches: [threeApproaches.approaches[0]!, threeApproaches.approaches[1]!, { ...filler, filler: true, stances: [] }] };
      const q = (await settleApproaches({ question, positions: positions.filter((p) => p.party !== 'ter') }, fakeAi(() => withFiller))).question!;
      expect(q.approaches[2]!.filler).toBe(true);
      const result = await settleApproaches({ question, positions: [...positions, proposes('qui')], frozen: frozenOf(q, ['qui']) }, fakeAi(() => placing(q, 'qui', 2)));

      expect(result.publishable).toBe(true);
      expect(texts(result.question!)).toEqual(texts(q));
      expect(result.question!.approaches[2]!.filler).toBe(false);
      expect(Question.safeParse(result.question).success).toBe(true);
    });

    it('a frozen approach that loses its last defender becomes filler, keeps its text and figures, and the party is not blocked', async () => {
      const q = await published();
      // taxCut, defended only by otp, was published with a figure backed by otp's quote back then.
      const withFigure: Question = { ...q, approaches: q.approaches.map((a, i) => (i === 1 ? { ...a, figure: 'Unos 10.000 euros por comprador' } : a)) };
      const result = await settleApproaches({ question, positions, frozen: frozenOf(withFigure, ['otp']) }, fakeAi(() => placing(withFigure)));

      expect(result.report.reason).toBeUndefined();
      expect(result.publishable).toBe(true);
      expect(texts(result.question!)).toEqual(texts(withFigure));
      expect(result.question!.approaches[1]!.filler).toBe(true);
      expect(result.question!.approaches.filter((a) => a.filler)).toHaveLength(1);
      expect(result.question!.otherProposals).toEqual([{ party: 'otp', quote: { text: QUOTES.otp, page: 3 } }]);
      expect(result.report.entries).toContainEqual(expect.objectContaining({ check: 'V4', approach: withFigure.approaches[1]!.id, result: 'pass' }));
    });

    it('a pass that classifies an already-published party is not valid (it is not sent to the AI)', async () => {
      const q = await published();
      const meddling = { approaches: placing(q, 'qui', 0).approaches.map((a, i) => (i === 1 ? { ...a, stances: [stance('pej')] } : a)) };
      const result = await settleApproaches({ question, positions: [...positions, proposes('qui')], frozen: frozenOf(q, ['qui']) }, fakeAi(() => meddling));

      expect(result.publishable).toBe(false);
      expect(result.report.reason).toMatch(/no coinciden/);
    });

    it('two passes that put the new party in different frozen approaches disagree, even when the approaches look alike (#18 review)', async () => {
      // Two frozen fillers: the party in the first or in the second gives the same multiset of defenders.
      const base = await published();
      const q: Question = {
        ...base,
        approaches: [
          base.approaches[0]!,
          { ...base.approaches[1]!, ...taxCut, filler: true, stances: base.approaches[1]!.stances.map((s) => ({ party: s.party, stance: 'none' as const })) },
          { ...base.approaches[2]!, ...filler, filler: true, stances: base.approaches[2]!.stances.map((s) => ({ party: s.party, stance: 'none' as const })) },
        ],
      };
      const late = [...positions.filter((p) => p.party === 'pej' || p.party === 'cua'), proposes('qui')];
      const result = await settleApproaches({ question, positions: late, frozen: frozenOf(q, ['qui']) }, fakeAi((_: unknown, attempt: number) => placing(q, 'qui', 1 + (attempt % 2))));

      expect(result.publishable).toBe(false);
      expect(result.report.reason).toMatch(/no coinciden/);
    });
  });

  it('runs the two passes, and the checks of every approach, concurrently (#18 review)', async () => {
    const inner = fakeAi(() => threeApproaches);
    const flight = { now: 0, max: new Map<string, number>() };
    const track = async <T>(key: string, run: () => Promise<T>) => {
      flight.now++;
      flight.max.set(key, Math.max(flight.max.get(key) ?? 0, flight.now));
      await new Promise((r) => setTimeout(r, 5));
      try {
        return await run();
      } finally {
        flight.now--;
      }
    };
    const ai = { complete: (r: Parameters<typeof inner.complete>[0]) => track(r.task, () => inner.complete(r)) } as typeof inner;
    const slow: ApproachCheck = (approach) => track('check', async () => [{ check: 'V6', result: 'pass', detail: approach.id }]);
    const result = await settleApproaches({ question, positions }, ai, { checks: [slow, slow] });

    expect(result.publishable).toBe(true);
    expect(flight.max.get('settle-approaches')).toBe(2);
    expect(flight.max.get('check')).toBe(6);
    // Same report as one after another: approach by approach, check by check.
    expect(result.report.entries.filter((e) => e.check === 'V6').map((e) => e.detail)).toEqual(['alquiler-1', 'alquiler-1', 'alquiler-2', 'alquiler-2', 'alquiler-3', 'alquiler-3']);
  });

  it('the settled question plays in a valid v2 dataset (V9)', async () => {
    const { question: q } = await settleApproaches({ question, positions: [...positions, proposes('qui')] }, fakeAi(() => threeApproaches));
    const parties = (['pej', 'otp', 'ter', 'cua', 'qui'] as const).map((id) => ({
      id, name: `Partido ${id}`, acronym: id.toUpperCase(), scope: { type: 'national' as const }, manifesto: { state: 'pending' as const },
    }));
    const dataset = {
      version: 2, generated: '2026-11-09', origin: 'test', parties,
      topics: [{ id: 'vivienda', title: 'Vivienda', question: '¿Qué harían con la vivienda?', scope: 'national', order: 1 }],
      topicPositions: [], positions: [], reports: [],
      themes: [{ id: 'vivienda', title: 'Vivienda', order: 1 }],
      questions: [q],
    };
    expect(Dataset.safeParse(dataset).error?.issues).toBeUndefined();
  });
});
describe('approach checks (V3, V4, V5, V6, V10, V11)', () => {
  type Text = { what: string; how: string; figure: string | null };
  /** The pass answer with the taxCut approach (otp's, `alquiler-2`) written as `text`. */
  const withTaxCut = (text: Text) => ({ approaches: [threeApproaches.approaches[0], { ...threeApproaches.approaches[1], ...text }, threeApproaches.approaches[2]] });
  const rewriteCalls = (ai: { calls: { task: string; input: unknown }[] }) => ai.calls.filter((c) => c.task === 'rewrite-approach').map((c) => c.input as { approach: Text; fixes: string[]; quotes: string[] });
  const entriesOf = (r: { report: { entries: { check: string; approach?: string; result: string }[] } }, check: string) => r.report.entries.filter((e) => e.check === check);

  it('every approach passes every check when it is clean', async () => {
    const result = await settleApproaches({ question, positions }, fakeAi(() => threeApproaches));

    expect(result.publishable).toBe(true);
    for (const check of ['V3', 'V4', 'V5', 'V6', 'V10', 'V11']) {
      expect(entriesOf(result, check).map((e) => [e.approach, e.result])).toEqual([
        ['alquiler-1', 'pass'],
        ['alquiler-2', 'pass'],
        ['alquiler-3', 'pass'],
      ]);
    }
  });

  describe('a failing approach is rewritten, a limited number of times', () => {
    const marked = { ...taxCut, what: 'Bajar impuestos como propone el Partido Popular a quien compra.' };

    it('rewrites the failing approach with what to fix, and publishes the rewrite when it passes', async () => {
      const ai = fakeAi(() => withTaxCut(marked), { 'rewrite-approach': () => taxCut });
      const result = await settleApproaches({ question, positions }, ai);

      expect(result.publishable).toBe(true);
      expect(result.question!.approaches[1]!.what).toBe(taxCut.what);
      const [rewrite] = rewriteCalls(ai);
      expect(rewriteCalls(ai)).toHaveLength(1);
      expect(rewrite!.approach.what).toBe(marked.what);
      expect(rewrite!.fixes.join(' ')).toMatch(/Partido Popular/);
      expect(rewrite!.quotes).toEqual([QUOTES.otp]);
      expect(entriesOf(result, 'V3').map((e) => [e.approach, e.result])).toContainEqual(['alquiler-2', 'rewrite']);
    });

    it('is not publishable when the rewrites keep failing, and the report says which check', async () => {
      const ai = fakeAi(() => withTaxCut(marked), { 'rewrite-approach': () => marked });
      const result = await settleApproaches({ question, positions }, ai);

      expect(result.publishable).toBe(false);
      expect(result.question).toBeNull();
      expect(rewriteCalls(ai)).toHaveLength(MAX_REWRITES);
      expect(result.report.entries.find((e) => e.result === 'block')).toMatchObject({ check: 'V3', approach: 'alquiler-2' });
      expect(result.report.reason).toMatch(/V3 en alquiler-2/);
    });

    it('never rewrites a frozen approach: the question is not publishable', async () => {
      const first = await settleApproaches({ question, positions }, fakeAi(() => threeApproaches));
      const approaches = first.question!.approaches.map((a, i) => (i === 1 ? { ...a, ...marked } : a));
      const late = { approaches: approaches.map(({ what, how, figure, filler }) => ({ what, how, figure, filler, stances: [] })) };
      const ai = fakeAi(() => late, { 'rewrite-approach': () => taxCut });
      const frozen = { approaches, otherProposals: [], parties: ['qui'] };
      const result = await settleApproaches({ question, positions: [...positions, proposes('qui')], frozen }, ai);

      expect(result.publishable).toBe(false);
      expect(rewriteCalls(ai)).toHaveLength(0);
    });
  });

  describe('V3: no party names, acronyms or brands', () => {
    it('fails an approach naming a party (any party, case and accents ignored)', async () => {
      const result = await settleApproaches({ question, positions }, fakeAi(() => withTaxCut({ ...taxCut, how: 'Con la rebaja del IVA que defiende feijoo.' }), { 'rewrite-approach': () => taxCut }));

      expect(entriesOf(result, 'V3').find((e) => e.result === 'rewrite')!).toMatchObject({ approach: 'alquiler-2' });
      expect(result.publishable).toBe(true);
    });

    it('passes words that only contain a mark inside them', async () => {
      const result = await settleApproaches({ question, positions }, fakeAi(() => withTaxCut({ ...taxCut, how: 'Con una rebaja del IVA, con apoyo popular.' })));

      expect(entriesOf(result, 'V3').every((e) => e.result === 'pass')).toBe(true);
    });
  });

  describe('V4: every figure is a rounding compatible with the defenders’ figures', () => {
    const housingQuote = 'Construiremos 47.300 viviendas públicas en alquiler social en suelo del Estado antes de 2030.';
    const withFigures: SettlePosition[] = [proposes('pej'), proposes('cua'), proposes('otp'), { party: 'ter', state: 'proposes', quotes: [{ text: housingQuote, page: 7 }] }];
    const housing = (figure: string | null, how = publicHousing.how) => ({
      approaches: [threeApproaches.approaches[0], threeApproaches.approaches[1], { ...publicHousing, how, figure, filler: false, stances: [{ party: 'ter', stance: 'full', quote: housingQuote }] }],
    });
    const run = (answer: unknown, rewrite?: Text) => settleApproaches({ question, positions: withFigures }, fakeAi(() => answer, rewrite ? { 'rewrite-approach': () => rewrite } : {}));
    const v4 = async (figure: string | null, how?: string) => entriesOf(await run(housing(figure, how), { ...publicHousing, figure: 'Decenas de miles de viviendas' }), 'V4').find((e) => e.approach === 'alquiler-3')!.result;

    it('passes a rounded figure close to the defender’s figure', async () => {
      expect(await v4('Unas 50.000 viviendas')).toBe('pass');
      expect(await v4('Cerca de 45 mil viviendas')).toBe('pass');
      expect(await v4('Decenas de miles de viviendas')).toBe('pass');
    });

    it('passes a year the defenders give', async () => {
      expect(await v4('Decenas de miles de viviendas', 'En suelo público, en todas las provincias, antes de 2030.')).toBe('pass');
    });

    it('fails the defender’s exact figure, which would give the party away', async () => {
      expect(await v4('47.300 viviendas')).toBe('rewrite');
    });

    it('fails a rounding not compatible with any defender’s figure', async () => {
      expect(await v4('Unas 200.000 viviendas')).toBe('rewrite');
      expect(await v4('Decenas de miles de viviendas', 'En suelo público, en todas las provincias, antes de 2028.')).toBe('rewrite');
    });

    it('fails a figure in a filler approach, which no party backs', async () => {
      const answer = { approaches: [threeApproaches.approaches[0], threeApproaches.approaches[1], { ...filler, figure: 'Unos 100 euros al mes', filler: true, stances: [] }] };
      const result = await run(answer, filler);

      expect(entriesOf(result, 'V4').find((e) => e.approach === 'alquiler-3')!.result).toBe('rewrite');
      expect(result.publishable).toBe(true);
    });

    it('asks the rewrite for an order of magnitude compatible with the quotes', async () => {
      const ai = fakeAi(() => housing('47.300 viviendas'), { 'rewrite-approach': () => publicHousing });
      await settleApproaches({ question, positions: withFigures }, ai);

      expect(rewriteCalls(ai)[0]!.fixes.join(' ')).toMatch(/47\.300/);
    });
  });

  describe('V5: the 3 approaches have a similar length', () => {
    const long = { ...taxCut, how: 'Con una rebaja del IVA de la vivienda nueva para quien compra por primera vez, con deducciones en la renta, avales públicos para la entrada y un plan de ayudas a la compra.' };

    it('fails an approach much longer than the others, and asks for the length of the others', async () => {
      const ai = fakeAi(() => withTaxCut(long), { 'rewrite-approach': () => taxCut });
      const result = await settleApproaches({ question, positions }, ai);

      expect(entriesOf(result, 'V5').filter((e) => e.result === 'rewrite').map((e) => e.approach)).toEqual(['alquiler-2']);
      expect(rewriteCalls(ai)[0]!.fixes.join(' ')).toMatch(/palabras/);
      expect(result.publishable).toBe(true);
    });

    it('passes approaches a few words apart', async () => {
      const result = await settleApproaches({ question, positions }, fakeAi(() => withTaxCut({ ...taxCut, how: 'Con una rebaja del IVA de la vivienda nueva y usada.' })));

      expect(entriesOf(result, 'V5').every((e) => e.result === 'pass')).toBe(true);
    });
  });

  describe('V6: the what/how template is complete', () => {
    it('fails an approach without "how"', async () => {
      const ai = fakeAi(() => withTaxCut({ ...taxCut, how: '  ' }), { 'rewrite-approach': () => taxCut });
      const result = await settleApproaches({ question, positions }, ai);

      expect(entriesOf(result, 'V6').find((e) => e.result === 'rewrite')).toMatchObject({ approach: 'alquiler-2' });
      expect(rewriteCalls(ai)[0]!.fixes.join(' ')).toMatch(/how/);
      expect(result.publishable).toBe(true);
    });

    it('passes without a figure (the figure is optional)', async () => {
      const result = await settleApproaches({ question, positions }, fakeAi(() => withTaxCut({ ...taxCut, figure: null })));

      expect(entriesOf(result, 'V6').every((e) => e.result === 'pass')).toBe(true);
    });
  });

  describe('V10: faithful to the quotes of the parties classified in full', () => {
    type FidelityInput = { approach: Text; quotes: string[] };
    const unfaithfulIfTaxCut = (input: FidelityInput) =>
      input.approach.what === taxCut.what
        ? { adds: true, omits: false, changesMeaning: false, explanation: 'Añade un colectivo que no está en la cita.' }
        : { adds: false, omits: false, changesMeaning: false, explanation: 'Fiel a la cita.' };
    const rewritten = { ...taxCut, what: 'Rebajar impuestos a quien compra su primera vivienda.' };

    it('fails an unfaithful approach and rewrites it with the verifier’s explanation', async () => {
      const ai = fakeAi(() => threeApproaches, { 'verify-fidelity': unfaithfulIfTaxCut, 'rewrite-approach': () => rewritten });
      const result = await settleApproaches({ question, positions }, ai);

      expect(entriesOf(result, 'V10').find((e) => e.result === 'rewrite')).toMatchObject({ approach: 'alquiler-2' });
      expect(rewriteCalls(ai)[0]!.fixes.join(' ')).toMatch(/Añade un colectivo/);
      expect(result.publishable).toBe(true);
    });

    it('checks against the quotes of full defenders only, and skips approaches without any', async () => {
      const ai = fakeAi(() => threeApproaches);
      const result = await settleApproaches({ question, positions }, ai);

      const verified = ai.calls.filter((c) => c.task === 'verify-fidelity').map((c) => (c.input as FidelityInput).quotes);
      expect(verified).toEqual([[QUOTES.pej], [QUOTES.otp], [QUOTES.ter]]);
      expect(entriesOf(result, 'V10').every((e) => e.result === 'pass')).toBe(true);
    });

    it('does not verify a filler approach', async () => {
      const answer = { approaches: [threeApproaches.approaches[0], threeApproaches.approaches[1], { ...filler, filler: true, stances: [] }] };
      const ai = fakeAi(() => answer);
      const result = await settleApproaches({ question, positions: positions.filter((p) => p.party !== 'ter') }, ai);

      expect(ai.calls.filter((c) => c.task === 'verify-fidelity')).toHaveLength(2);
      expect(entriesOf(result, 'V10').find((e) => e.approach === 'alquiler-3')!.result).toBe('pass');
    });
  });

  describe('V11: a guesser does not find the defenders above chance', () => {
    type GuessInput = { parties: { id: string }[]; approaches: { letter: string; text: string }[] };
    /** Names `party` for every approach whose text matches `pattern`, and a non-defender otherwise. */
    const guesser = (pattern: RegExp, party: string) => (input: GuessInput) => ({
      assignments: input.approaches.map((a) => (pattern.test(a.text) ? { letter: a.letter, party, hint: 'habla del IVA' } : { letter: a.letter, party: 'nadie', hint: 'ninguna' })),
    });
    const noVat = { ...taxCut, how: 'Con una rebaja fiscal en la vivienda nueva.' };

    it('guesses with the anonymous approaches, shuffled, and the parties that propose something', async () => {
      const ai = fakeAi(() => threeApproaches);
      await settleApproaches({ question, positions }, ai);

      const rounds = ai.calls.filter((c) => c.task === 'guess-party').map((c) => c.input as GuessInput);
      expect(rounds).toHaveLength(GUESS_ROUNDS);
      expect(rounds[0]!.parties.map((p) => p.id).sort()).toEqual(['cua', 'otp', 'pej', 'ter']);
      expect(new Set(rounds.map((r) => r.approaches.map((a) => a.text).join('|'))).size).toBeGreaterThan(1);
      expect(JSON.stringify(rounds)).not.toMatch(/alquiler-\d/);
    });

    it('rewrites an approach whose only defender is guessed every time (1 in 4 by chance)', async () => {
      const ai = fakeAi(() => threeApproaches, { 'guess-party': guesser(/IVA/, 'otp'), 'rewrite-approach': () => noVat });
      const result = await settleApproaches({ question, positions }, ai);

      expect(entriesOf(result, 'V11').find((e) => e.result === 'rewrite')).toMatchObject({ approach: 'alquiler-2' });
      expect(rewriteCalls(ai)[0]!.fixes.join(' ')).toMatch(/habla del IVA/);
      expect(result.publishable).toBe(true);
      expect(result.question!.approaches[1]!.how).toBe(noVat.how);
    });

    it('is not publishable when the rewrites are still guessed', async () => {
      const ai = fakeAi(() => threeApproaches, { 'guess-party': guesser(/IVA/, 'otp'), 'rewrite-approach': () => taxCut });
      const result = await settleApproaches({ question, positions }, ai);

      expect(result.publishable).toBe(false);
      expect(result.report.reason).toMatch(/V11 en alquiler-2/);
    });

    it('passes a guess every time when half the parties defend the approach (that is chance)', async () => {
      const ai = fakeAi(() => threeApproaches, { 'guess-party': guesser(/alquiler/, 'pej') });
      const result = await settleApproaches({ question, positions }, ai);

      expect(entriesOf(result, 'V11').find((e) => e.approach === 'alquiler-1')!.result).toBe('pass');
      expect(result.publishable).toBe(true);
    });

    it('passes a party guessed that does not defend the approach', async () => {
      const result = await settleApproaches({ question, positions }, fakeAi(() => threeApproaches, { 'guess-party': guesser(/IVA/, 'pej') }));

      expect(entriesOf(result, 'V11').every((e) => e.result === 'pass')).toBe(true);
    });
  });

  it('runs by default, with the registry party names for the guesser', async () => {
    const pp: SettlePosition = { party: 'pp', state: 'proposes', quotes: [{ text: QUOTES.pej, page: 3 }] };
    const answer = { approaches: [{ ...capRent, filler: false, stances: [{ party: 'pp', stance: 'full', quote: QUOTES.pej }] }, threeApproaches.approaches[1], threeApproaches.approaches[2]] };
    const ai = fakeAi(() => answer);
    await settleApproaches({ question, positions: [pp, proposes('otp'), proposes('ter')] }, ai);

    const parties = (ai.calls.find((c) => c.task === 'guess-party')!.input as { parties: { id: string; name: string }[] }).parties;
    expect(parties).toContainEqual(expect.objectContaining({ id: 'pp', name: 'Partido Popular' }));
    expect(parties).toContainEqual(expect.objectContaining({ id: 'otp', name: 'otp' }));
  });
});

describe('publishSettled: the settled question and its report go into the dataset (#29)', () => {
  const base = Dataset.parse({
    version: 2, generated: '2026-11-09', origin: 'test',
    parties: Object.keys(QUOTES).map((id) => ({ id, name: id, acronym: id, scope: { type: 'national' }, manifesto: { state: 'pending' } })),
    topics: [{ id: 'vivienda', title: 'Vivienda', question: '¿Qué?', scope: 'national', order: 1 }],
    topicPositions: [], positions: [], reports: [],
    themes: [{ id: 'vivienda', title: 'Vivienda', order: 1 }],
    questions: [],
  });
  const ai = () => createFakeAI({ 'settle-approaches': () => threeApproaches });
  const positions = (Object.keys(QUOTES) as Id[]).map(proposes);

  it('keeps the report with the question text and theme, and the question when publishable', async () => {
    const result = await settleApproaches({ question, positions }, ai(), { checks: [] });
    const ds = Dataset.parse(publishSettled(base, result));
    expect(ds.questions!.map((q) => q.id)).toEqual(['alquiler']);
    expect(ds.approachReports).toEqual([expect.objectContaining({ question: 'alquiler', theme: 'vivienda', text: question.text, publishable: true })]);
  });

  it('an unpublishable question leaves the dataset with its reason, and replaces an earlier report', async () => {
    const first = publishSettled(base, await settleApproaches({ question, positions }, ai(), { checks: [] }));
    const failed = await settleApproaches({ question, positions: [] }, ai(), { checks: [] });
    const ds = Dataset.parse(publishSettled(first, failed));
    expect(ds.questions).toEqual([]);
    expect(ds.approachReports).toHaveLength(1);
    expect(ds.approachReports![0]).toMatchObject({ question: 'alquiler', publishable: false, reason: expect.any(String) });
  });
});
