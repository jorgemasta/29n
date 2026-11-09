// V9: the dataset schema (validateDataset), v2 themes, questions and approaches.
import { describe, expect, it } from 'vitest';
import { applyMode, validateDataset } from '../src/dataset';
import type { Dataset } from '../src/dataset/schema';
import { themesDataset } from './fixtures/themes-dataset';
import publishedDataset from '../data/dataset.json';

/** themesDataset with the first question changed. */
const withFirstQuestion = (change: (q: NonNullable<Dataset['questions']>[number]) => object): unknown => ({
  ...themesDataset,
  questions: themesDataset.questions!.map((q, i) => (i === 0 ? change(q) : q)),
});

describe('V9: v2 dataset schema', () => {
  it('accepts themes with questions of 3 approaches', () => {
    expect(validateDataset(themesDataset)).toEqual({ valid: true, errors: [] });
  });

  it('the published simulated dataset validates and every question has exactly 3 approaches', () => {
    expect(validateDataset(publishedDataset)).toEqual({ valid: true, errors: [] });
    const d = publishedDataset as Dataset;
    expect(d.themes!.length).toBeGreaterThanOrEqual(1);
    expect(d.questions!.length).toBeGreaterThanOrEqual(1);
    for (const q of d.questions!) expect(q.approaches).toHaveLength(3);
  });

  it('rejects a question with 2 or 4 approaches', () => {
    expect(validateDataset(withFirstQuestion((q) => ({ ...q, approaches: q.approaches.slice(0, 2) }))).valid).toBe(false);
    expect(validateDataset(withFirstQuestion((q) => ({ ...q, approaches: [...q.approaches, { ...q.approaches[0], id: 'otro' }] }))).valid).toBe(false);
  });

  it('rejects a full or partial stance without a quote', () => {
    const r = validateDataset(
      withFirstQuestion((q) => ({
        ...q,
        approaches: q.approaches.map((a, i) => (i === 0 ? { ...a, stances: [{ party: 'aaa', stance: 'partial' }] } : a)),
      })),
    );
    expect(r.valid).toBe(false);
  });

  it('accepts a "none" stance without a quote', () => {
    const r = validateDataset(
      withFirstQuestion((q) => ({
        ...q,
        approaches: q.approaches.map((a, i) => (i === 0 ? { ...a, stances: [...a.stances, { party: 'ccc', stance: 'none' }] } : a)),
      })),
    );
    expect(r).toEqual({ valid: true, errors: [] });
  });

  it('rejects two stances of one party on the same approach', () => {
    const r = validateDataset(
      withFirstQuestion((q) => ({
        ...q,
        approaches: q.approaches.map((a, i) => (i === 0 ? { ...a, stances: [...a.stances, a.stances[0]] } : a)),
      })),
    );
    expect(r.valid).toBe(false);
  });

  it('rejects a filler approach that some party defends', () => {
    const r = validateDataset(
      withFirstQuestion((q) => ({
        ...q,
        approaches: q.approaches.map((a) => (a.filler ? { ...a, stances: q.approaches[0]!.stances } : a)),
      })),
    );
    expect(r.valid).toBe(false);
  });

  it('rejects unknown parties, unknown themes and repeated ids', () => {
    expect(validateDataset(withFirstQuestion((q) => ({ ...q, theme: 'nope' }))).valid).toBe(false);
    expect(validateDataset(withFirstQuestion((q) => ({ ...q, otherProposals: [{ ...q.otherProposals[0], party: 'nope' }] }))).valid).toBe(false);
    expect(validateDataset(withFirstQuestion((q) => ({ ...q, id: 'compra' }))).valid).toBe(false);
    expect(
      validateDataset(withFirstQuestion((q) => ({ ...q, approaches: q.approaches.map((a) => ({ ...a, id: 'mismo' })) }))).valid,
    ).toBe(false);
  });

  it('rejects a party that both defends an approach and proposes something else', () => {
    const r = validateDataset(withFirstQuestion((q) => ({ ...q, otherProposals: [{ party: 'aaa', quote: q.otherProposals[0]!.quote }] })));
    expect(r.valid).toBe(false);
  });
});

describe('applyMode: provisional sources in v2 questions', () => {
  // aaa's only document becomes a provisional source (2023 programme).
  const provisional: Dataset = {
    ...themesDataset,
    parties: themesDataset.parties.map((p) =>
      p.id === 'aaa' && p.manifesto.state === 'published' ? { ...p, manifesto: { ...p.manifesto, source: 'manifesto-2023' } } : p,
    ),
    questions: themesDataset.questions!.map((q) =>
      q.id === 'listas' ? { ...q, otherProposals: [{ party: 'aaa', quote: { text: 'Cita literal del programa de aaa con más de cuarenta caracteres.', page: 3 } }], approaches: q.approaches.map((a, i) => (i === 0 ? { ...a, stances: [{ party: 'ccc', stance: 'full' as const, quote: { text: 'Cita literal del programa de ccc con más de cuarenta caracteres.', page: 2 } }] } : a)) } : q,
    ),
    approachReports: [
      { question: 'alquiler', promptVersion: 'enfoques-v1', rounds: 1, publishable: true, entries: [
        { check: 'agreement', result: 'retry', detail: 'ronda 1: las pasadas clasifican distinto: [aaa:full, bbb:partial] frente a [bbb:full]' },
        { check: 'agreement', result: 'pass', detail: 'las dos pasadas coinciden (ronda 2)' },
      ] },
    ],
  };
  const stancesOf = (d: Dataset) => (d.questions ?? []).flatMap((q) => [...q.approaches.flatMap((a) => a.stances.map((s) => s.party)), ...q.otherProposals.map((o) => o.party)]);

  it('public mode drops their stances and "propone otra cosa" from every question', () => {
    expect(validateDataset(provisional)).toEqual({ valid: true, errors: [] });
    expect(stancesOf(provisional)).toContain('aaa');
    const pub = applyMode(provisional, 'public');
    expect(stancesOf(pub)).not.toContain('aaa');
    expect(validateDataset(pub)).toEqual({ valid: true, errors: [] });
  });

  it('an approach only they defended becomes filler (defended by nobody in play)', () => {
    const pub = applyMode(provisional, 'public');
    const compra = pub.questions!.find((q) => q.id === 'compra')!;
    expect(compra.approaches.find((a) => a.id === 'avales')!.filler).toBe(true);
    expect(compra.approaches.find((a) => a.id === 'suelo')!.filler).toBe(false);
  });

  it('settle report entries that name them are not published', () => {
    const pub = applyMode(provisional, 'public');
    expect(JSON.stringify(pub.approachReports)).not.toMatch(/\baaa\b/);
    expect(pub.approachReports![0]!.entries).toHaveLength(1);
  });

  it('private mode keeps everything', () => {
    expect(applyMode(provisional, 'private')).toBe(provisional);
  });
});
