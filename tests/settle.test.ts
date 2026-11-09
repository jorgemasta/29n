// Test point A': settleApproaches (settle the 3 approaches of a question), with the fake AI.
import { describe, expect, it } from 'vitest';
import { createFakeAI, type FakeResponse } from '../src/ai/fake';
import { Dataset, Question } from '../src/dataset/schema';
import { settleApproaches, type ApproachCheck, type QuestionSpec, type SettlePosition } from '../src/pipeline/settle';

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

function fakeAi(settle: FakeResponse) {
  return createFakeAI({ 'settle-approaches': settle });
}

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
    expect(JSON.stringify(ai.calls.map((c) => c.input))).not.toMatch(/"qui"|"sex"/);
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

      const passes = ai.calls.filter((c) => c.task === 'settle-approaches').map((c) => c.input as { positions: { party: string }[] });
      expect(passes).toHaveLength(2);
      expect(passes[1]!.positions.map((p) => p.party)).not.toEqual(passes[0]!.positions.map((p) => p.party));
      expect(result.publishable).toBe(true);
      expect(result.report.rounds).toBe(1);
      expect(result.question!.approaches[0]!.what).toBe(capRent.what);
    });

    it('retries once when the passes disagree, and publishes if the retry agrees', async () => {
      const ai = fakeAi((_, attempt) => (attempt === 1 ? disagreeing : threeApproaches));
      const result = await settleApproaches({ question, positions }, ai);

      expect(ai.calls).toHaveLength(4);
      expect(result.publishable).toBe(true);
      expect(result.report.rounds).toBe(2);
      expect(result.report.entries.map((e) => [e.check, e.result])).toEqual([['agreement', 'retry'], ['agreement', 'pass']]);
    });

    it('is not publishable after the retry still disagrees, and says why in the report', async () => {
      const ai = fakeAi((_, attempt) => (attempt % 2 === 0 ? threeApproaches : disagreeing));
      const result = await settleApproaches({ question, positions }, ai);

      expect(ai.calls).toHaveLength(4);
      expect(result.publishable).toBe(false);
      expect(result.question).toBeNull();
      expect(result.report).toMatchObject({ question: 'alquiler', publishable: false, rounds: 2 });
      expect(result.report.reason).toMatch(/no coinciden/);
      const last = result.report.entries.at(-1)!;
      expect(last).toMatchObject({ check: 'agreement', result: 'block' });
      expect(last.detail).toMatch(/cua:partial/);
    });
  });

  it('runs every approach check on the settled approaches; a discard blocks the question (seam for #22)', async () => {
    const seen: string[] = [];
    const v3: ApproachCheck = async (approach) => {
      seen.push(approach.id);
      return approach.what.includes('impuestos') ? [{ check: 'V3', result: 'discard', detail: 'marca de partido' }] : [{ check: 'V3', result: 'pass', detail: 'sin marcas' }];
    };
    const result = await settleApproaches({ question, positions }, fakeAi(() => threeApproaches), { checks: [v3] });

    expect(seen).toHaveLength(3);
    expect(result.publishable).toBe(false);
    expect(result.report.entries).toContainEqual({ check: 'V3', approach: result.report.entries.find((e) => e.result === 'discard')!.approach, result: 'discard', detail: 'marca de partido' });
    expect(result.report.reason).toMatch(/V3/);
  });

  it('keeps frozen approaches as published and only classifies the parties (seam for #28)', async () => {
    const first = await settleApproaches({ question, positions }, fakeAi(() => threeApproaches));
    const frozen = first.question!.approaches;
    const reworded = { approaches: threeApproaches.approaches.map((a) => ({ ...a, what: 'Texto distinto que no debe publicarse.' })) };
    const ai = fakeAi(() => reworded);
    const result = await settleApproaches({ question, positions, frozen }, ai);

    expect(result.question!.approaches.map(({ id, what, how, figure, filler }) => ({ id, what, how, figure, filler }))).toEqual(
      frozen.map(({ id, what, how, figure, filler }) => ({ id, what, how, figure, filler })),
    );
    expect((ai.calls[0]!.input as { frozenApproaches: unknown[] }).frozenApproaches).toHaveLength(3);
  });

  it('the settled question plays in a valid v2 dataset (V9)', async () => {
    const { question: q } = await settleApproaches({ question, positions: [...positions, proposes('qui')] }, fakeAi(() => threeApproaches));
    const parties = (['pej', 'otp', 'ter', 'cua', 'qui'] as const).map((id) => ({
      id, name: `Partido ${id}`, acronym: id.toUpperCase(), scope: { type: 'national' as const }, manifesto: { state: 'pending' as const },
    }));
    const dataset = {
      version: 2, generated: '2026-11-09', origin: 'test', parties,
      topics: [{ id: 'vivienda', title: 'Vivienda', question: '¿Qué harían con la vivienda?', scope: 'national', order: 1 }],
      positions: [], reports: [],
      themes: [{ id: 'vivienda', title: 'Vivienda', order: 1 }],
      questions: [q],
    };
    expect(Dataset.safeParse(dataset).error?.issues).toBeUndefined();
  });
});
