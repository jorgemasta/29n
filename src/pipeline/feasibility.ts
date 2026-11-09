// V13 (double-blind feasibility) + V8 (feasibility sources).
// Two independent evaluations get ONLY the question, the concrete proposal and the quotes (with
// every party's identifying terms masked); never the party. Each source must be on an institutional
// domain and answer HTTP 200, else it is removed; an evaluation left without sources is repeated.
import type { Quote, ReportEntry, Assessment, Source, FeasibilityNote, Proposal } from '../dataset/schema';
import type { AIAdapter } from '../ai/adapter';
import { isInstitutionalDomain } from '../registry/institutional-domains';
import { RUBRIC_VERSION } from '../registry/rubric';
import type { IdentifyingTerms } from '../registry/terms';
import { normalizeTerm } from './normalize';
import { FEASIBILITY_INSTRUCTIONS, FeasibilityResponse, FEASIBILITY_PROMPT_VERSION } from './prompts-feasibility';

/** V8: does the URL answer HTTP 200? Injectable so tests never hit the network. */
export type CheckUrl = (url: string) => Promise<boolean>;

/** Max repetitions of an evaluation left without valid sources (V8). */
export const MAX_FEASIBILITY_REPEATS = 2;

/** Default V8 HTTP check: GET (many sites reject HEAD), redirects followed but must stay institutional. */
export const checkUrlHttp: CheckUrl = async (url) => {
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
      headers: { 'user-agent': '29n-verificador (+https://29n.jorgemasta.com/metodologia)' },
    });
    await r.body?.cancel();
    return r.status === 200 && isInstitutionalDomain(r.url || url);
  } catch {
    return false;
  }
};

type Annotate = (check: ReportEntry['check'], result: ReportEntry['result'], detail: string) => void;

export async function assessFeasibility(args: {
  ai: AIAdapter;
  question: { id: string; text: string };
  proposal: Proposal;
  quotes: Quote[];
  terms: IdentifyingTerms;
  checkUrl: CheckUrl;
  annotate: Annotate;
}): Promise<FeasibilityNote> {
  const { ai, question, terms, annotate } = args;
  const hide = (t: string) => hideMarks(t, terms);
  const p = args.proposal;
  const proposal = { what: hide(p.what), how: hide(p.how), figure: p.figure === null ? null : hide(p.figure) };
  const quotes = args.quotes.map((c) => ({ text: hideMarks(c.text, terms), page: c.page }));

  // One HTTP check per URL per run.
  const checked = new Map<string, Promise<boolean>>();
  const answers = (url: string) => {
    if (!checked.has(url)) checked.set(url, args.checkUrl(url).catch(() => false));
    return checked.get(url)!;
  };

  const assess = async (assessment: 1 | 2): Promise<Assessment> => {
    const rejected: string[] = [];
    let last: Assessment | null = null;
    for (let repeat = 0; repeat <= MAX_FEASIBILITY_REPEATS; repeat++) {
      const r = await ai.complete({
        task: 'assess-feasibility',
        instructions: FEASIBILITY_INSTRUCTIONS,
        // `assessment` keeps the two evaluations independent (and distinct in the AI cache).
        input: { question, proposal, quotes, assessment, ...(repeat ? { repeat, rejectedSources: rejected } : {}) },
        schema: FeasibilityResponse,
      });
      const sources: Source[] = [];
      for (const f of r.sources) {
        const reason = !isInstitutionalDomain(f.url)
          ? 'dominio no permitido'
          : !(await answers(f.url))
            ? 'no responde con HTTP 200'
            : null;
        if (reason) {
          rejected.push(f.url);
          annotate('V8', 'fix', `evaluación ${assessment}: fuente eliminada (${reason}): ${f.url}`);
        } else if (!sources.some((x) => x.url === f.url)) sources.push({ title: f.title || f.url, url: f.url });
      }
      last = { level: r.level, reasons: r.reasons, why: r.why, sources };
      if (sources.length > 0 || r.level === 'notConcrete') {
        annotate('V8', 'pass', `evaluación ${assessment}: ${sources.length} fuente(s) institucional(es) verificada(s)`);
        return last;
      }
      if (repeat < MAX_FEASIBILITY_REPEATS)
        annotate('V8', 'rewrite', `evaluación ${assessment}: el "por qué" se quedó sin fuentes; se repite`);
    }
    annotate('V8', 'fix', `evaluación ${assessment}: sin fuentes válidas tras ${MAX_FEASIBILITY_REPEATS} repeticiones; se publica sin fuentes`);
    return last!;
  };

  const e1 = await assess(1);
  const e2 = await assess(2);
  const versions = { prompt: FEASIBILITY_PROMPT_VERSION, rubric: RUBRIC_VERSION };

  if (e1.level !== e2.level) {
    annotate('V13', 'pass', `sin consenso: ${e1.level} / ${e2.level}`);
    return { result: 'noConsensus', why: null, sources: [], assessments: [e1, e2], versions };
  }
  // Agreement: publish the argument of the evaluation that kept its sources.
  const published = e1.sources.length > 0 || e2.sources.length === 0 ? e1 : e2;
  annotate('V13', 'pass', `consenso: ${e1.level}`);
  return { result: e1.level, why: published.why, sources: published.sources, assessments: [e1, e2], versions };
}

/**
 * Masks identifying terms of ANY party in a quote with "[partido]" (case/accent-insensitive,
 * whole words), keeping the rest of the original text untouched.
 */
export function hideMarks(text: string, terms: IdentifyingTerms): string {
  // Normalised copy + index of the original char behind each normalised char.
  let base = '';
  const origin: number[] = [];
  for (let i = 0; i < text.length; i++) {
    for (const ch of text[i]!.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()) {
      base += ch;
      origin.push(i);
    }
  }
  const ranges: [number, number][] = [];
  for (const term of Object.values(terms).flat()) {
    const pattern = normalizeTerm(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
    if (!pattern) continue;
    for (const m of base.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, 'gu')))
      ranges.push([origin[m.index]!, origin[m.index + m[0].length - 1]! + 1]);
  }
  if (ranges.length === 0) return text;
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let output = '';
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (end <= cursor) continue;
    output += text.slice(cursor, Math.max(cursor, start)) + (start >= cursor ? '[partido]' : '');
    cursor = end;
  }
  return output + text.slice(cursor);
}
