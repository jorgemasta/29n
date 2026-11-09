// A party's concrete proposal on a v2 question, as shown at the reveal: its own text with the exact
// figures (never shown blind) and its feasibility note. Read from the party's position.
import type { Dataset, FeasibilityNote, Position, Proposal } from '../dataset/schema';

export interface PartyProposal extends Proposal {
  /** Blind feasibility note (V13); null if the position has none. */
  feasibility: FeasibilityNote | null;
  /** The note's argument was published without verifiable sources (V8 gave up after its repeats). */
  noSources: boolean;
}

/** Positions of one question by party id. */
export function positionsOf(dataset: Dataset, questionId: string): Map<string, Position> {
  return new Map(dataset.positions.filter((p) => p.question === questionId).map((p) => [p.party, p]));
}

/** The concrete proposal of a position, or null if it proposes nothing (or there is no position). */
export function proposalOf(p: Position | undefined): PartyProposal | null {
  if (p?.state !== 'proposes') return null;
  return {
    ...p.proposal,
    feasibility: p.feasibility ?? null,
    noSources: p.feasibility ? noSources(p.feasibility) : false,
  };
}

/**
 * The published argument lacks verifiable sources: V8 gave up after its repeats. With consensus,
 * the published argument has none; without it, one of the two evaluations has none.
 * "Sin concreción" never needs sources.
 */
export function noSources(note: FeasibilityNote): boolean {
  if (note.result === 'notConcrete') return false;
  if (note.result === 'noConsensus') return note.assessments.some((e) => e.level !== 'notConcrete' && e.sources.length === 0);
  return note.sources.length === 0;
}
