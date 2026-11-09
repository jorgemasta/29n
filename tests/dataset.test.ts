// V9: the dataset schema (validateDataset), v2 themes, questions and approaches.
import { describe, expect, it } from 'vitest';
import { validateDataset } from '../src/dataset';
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
