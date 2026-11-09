// Transparency data (#11): derived views of the dataset for the methodology, parties-and-programmes
// and verification-report pages, plus the prefilled GitHub issue links ("Reportar error", "Falta un partido").
// Pure functions: the pages only render what these return.
import type { Dataset, ReportEntry, Report, Party, Question, FeasibilityResult, PositionSummary, Topic, SourceType } from '../dataset/schema';
import { CHECKS } from '../registry/checks';
import { provinceByCode } from '../registry/territory';

export const REPO = 'https://github.com/jorgemasta/29n';
/** Link to a file of the public repository (main branch). */
export const repoLink = (path: string) => `${REPO}/blob/main/${path}`;

// --- Feasibility breakdown per party (story 42) -------------------------------------------------

export const FEASIBILITY_CATEGORIES: readonly FeasibilityResult[] = ['viable', 'viableWithCaveats', 'difficult', 'veryDifficult', 'notConcrete', 'noConsensus'];

/** What a party × topic cell shows: the published result, or why there is none. */
export type DistributionCell = FeasibilityResult | 'noNote' | 'noProposal' | 'unverified' | 'noData';

export interface DistributionRow {
  party: { id: string; name: string; acronym: string; test?: boolean };
  counts: Record<FeasibilityResult, number>;
  /** Proposals published without a feasibility note (older data). */
  noNote: number;
  /** Proposals published (cards), with or without a note. */
  total: number;
}

export interface FeasibilityDistribution {
  categories: readonly FeasibilityResult[];
  byParty: DistributionRow[];
  /** One cell per party, in byParty order. */
  byTopic: { topic: { id: string; title: string }; cells: DistributionCell[] }[];
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'es');

export function feasibilityDistribution(ds: Dataset): FeasibilityDistribution {
  const parties = ds.parties.filter((p) => p.manifesto.state === 'published').sort(byName);
  const topics = [...ds.topics].sort((a, b) => a.order - b.order);
  const cell = new Map<string, DistributionCell>();
  for (const p of ds.positions) {
    cell.set(`${p.party}/${p.topic}`, p.state === 'proposes' ? (p.feasibility?.result ?? 'noNote') : p.state);
  }
  const byParty = parties.map((p): DistributionRow => {
    const counts = Object.fromEntries(FEASIBILITY_CATEGORIES.map((c) => [c, 0])) as Record<FeasibilityResult, number>;
    let noNote = 0;
    let total = 0;
    for (const t of topics) {
      const c = cell.get(`${p.id}/${t.id}`);
      if (c === undefined || c === 'noProposal' || c === 'unverified' || c === 'noData') continue;
      total++;
      if (c === 'noNote') noNote++;
      else counts[c]++;
    }
    return { party: { id: p.id, name: p.name, acronym: p.acronym, ...(p.test ? { test: true } : {}) }, counts, noNote, total };
  });
  const byTopic = topics.map((t) => ({
    topic: { id: t.id, title: t.title },
    cells: parties.map((p) => cell.get(`${p.id}/${t.id}`) ?? 'noData'),
  }));
  return { categories: FEASIBILITY_CATEGORIES, byParty, byTopic };
}

// --- Parties and programmes (screen 13, story 43) -----------------------------------------------

export interface ManifestoRow {
  id: string;
  name: string;
  acronym: string;
  test: boolean;
  /** "Toda España" or the provinces where it runs. */
  scope: string;
  source: SourceType | null;
  title: string | null;
  url: string | null;
  date: string | null;
  /** A verification report is published for it. */
  report: boolean;
}

export const scopeText = (a: Party['scope']): string =>
  a.type === 'national' ? 'Toda España' : a.provinces.map((c) => provinceByCode(c)?.name ?? c).join(', ');

export function manifestos(ds: Dataset): { withManifesto: ManifestoRow[]; pending: ManifestoRow[] } {
  const withReport = new Set(ds.reports.map((i) => i.party));
  const rows = [...ds.parties].sort(byName).map((p): ManifestoRow => {
    const pub = p.manifesto.state === 'published' ? p.manifesto : null;
    return {
      id: p.id,
      name: p.name,
      acronym: p.acronym,
      test: p.test === true,
      scope: scopeText(p.scope),
      source: pub ? (pub.source ?? 'manifesto-29n') : null,
      title: pub?.title ?? null,
      url: pub?.url ?? null,
      date: pub?.date ?? null,
      report: withReport.has(p.id),
    };
  });
  return { withManifesto: rows.filter((f) => f.url !== null), pending: rows.filter((f) => f.url === null) };
}

// --- Verification report (story 45) -------------------------------------------------------------

export interface SummaryEntry extends ReportEntry {
  name: string;
}

export interface ReportSummary {
  report: Report;
  published: number;
  /** Programme-level entries (V7…). */
  manifesto: SummaryEntry[];
  topics: (Omit<PositionSummary, 'topic'> & { topic: { id: string; title: string }; entries: SummaryEntry[] })[];
  /** Checks of the precomputed answers to the suggested questions (Preguntar), per question. */
  questions: { question: { id: string; text: string }; entries: SummaryEntry[] }[];
}

export function reportSummary(report: Report, topics: Topic[], questions: Question[] = []): ReportSummary {
  const withName = (e: ReportEntry): SummaryEntry => ({ ...e, name: CHECKS[e.check].name });
  const order = new Map(topics.map((t) => [t.id, t]));
  const ids = [...new Set([...report.positions.map((p) => p.topic), ...report.entries.flatMap((e) => (e.topic ? [e.topic] : []))])];
  ids.sort((a, b) => (order.get(a)?.order ?? Infinity) - (order.get(b)?.order ?? Infinity) || a.localeCompare(b));
  return {
    report,
    published: report.positions.filter((p) => p.state === 'proposes').length,
    manifesto: report.entries.filter((e) => !e.topic && !e.question).map(withName),
    questions: [...new Set(report.entries.flatMap((e) => (e.question ? [e.question] : [])))]
      .map((id) => questions.find((p) => p.id === id) ?? { id, text: id, order: Infinity })
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      .map(({ id, text }) => ({ question: { id, text }, entries: report.entries.filter((e) => e.question === id).map(withName) })),
    topics: ids.map((id) => {
      const summary = report.positions.find((p) => p.topic === id);
      return {
        topic: { id, title: order.get(id)?.title ?? id },
        state: summary?.state ?? 'unverified',
        rewrites: summary?.rewrites ?? 0,
        ...(summary?.reason ? { reason: summary.reason } : {}),
        entries: report.entries.filter((e) => e.topic === id).map(withName),
      };
    }),
  };
}

// --- Prefilled GitHub issues (screen 8, story 27; screen 13 "Falta un partido") -------------------

export const REPORT_REASONS = [
  { id: 'meaning', text: 'La versión reescrita cambia el sentido' },
  { id: 'quote', text: 'La cita o la página no es correcta' },
  { id: 'feasibility', text: 'La viabilidad me parece equivocada' },
  { id: 'proposes', text: 'Sí hay propuesta de este partido' },
  { id: 'other', text: 'Otra cosa' },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]['id'];
export const MAX_COMMENT = 300;

export interface IssueContent {
  title: string;
  body: string;
  label: string;
}

const newIssue = ({ title, body, label }: IssueContent) =>
  `${REPO}/issues/new?${new URLSearchParams({ title: title, body: body, labels: label })}`;

export interface ReportErrorData {
  topic: { id: string; title: string };
  party: { id: string; name: string };
  /** Letter the card had for this voter (helps find it; not what they chose). */
  letter: string;
  pages: number[];
  reason: ReportReason;
  comment?: string;
}

/**
 * "Reportar error": a new public issue with the card context. Only the topic, the card and the
 * comment are sent; never what the voter chose or their province.
 */
export function reportErrorUrl(d: ReportErrorData): string {
  return newIssue(reportErrorIssue(d));
}

/** Title, body and label of a "Reportar error" issue (prefilled link or filed by the function). */
export function reportErrorIssue(d: ReportErrorData): IssueContent {
  const reason = REPORT_REASONS.find((m) => m.id === d.reason)!.text;
  const comment = (d.comment ?? '').trim().slice(0, MAX_COMMENT);
  const body = [
    `**Motivo:** ${reason}`,
    '',
    `- Tema: ${d.topic.title} (\`${d.topic.id}\`)`,
    `- Partido: ${d.party.name} (\`${d.party.id}\`)`,
    `- Tarjeta: ${d.letter}`,
    `- Páginas citadas: ${d.pages.join(', ') || '—'}`,
    '',
    '**Comentario:**',
    comment || '(sin comentario)',
  ].join('\n');
  return { title: `[Error] ${d.topic.title} · ${d.party.name}: ${reason}`, body, label: 'reporte' };
}

/** What the voter writes in "Falta un partido" (all optional in the prefilled link). */
export interface MissingPartyData {
  party?: string;
  provinces?: string;
  reason?: string;
  link?: string;
}

/** "Falta un partido": a new public issue asking which party and why it meets the criterion. */
export function missingPartyUrl(d: MissingPartyData = {}): string {
  return newIssue(missingPartyIssue(d));
}

export function missingPartyIssue(d: MissingPartyData = {}): IssueContent {
  const body = [
    `**Partido que falta:** ${d.party ?? ''}`,
    '',
    `**Provincia(s) donde se presenta:** ${d.provinces ?? ''}`,
    '',
    '**Por qué cumple el criterio de inclusión** (candidatura proclamada en esa provincia y representación actual en el Congreso o en su parlamento autonómico; enlace al BOE si puedes):',
    d.reason ?? '',
    '',
    `**Enlace a su programa (si ya lo ha publicado):** ${d.link ?? ''}`,
  ].join('\n');
  return { title: `[Falta un partido] ${d.party ?? ''}`, body, label: 'falta-partido' };
}

// --- Versioned prompts (methodology) ------------------------------------------------------------

/** Every AI task, what it does and the repository file holding its exact instructions. */
export const PROMPTS = [
  { task: 'extract-position', what: 'Extrae la propuesta de cada tema con sus citas literales', file: 'src/pipeline/prompts.ts' },
  { task: 'neutralize', what: 'Reescribe la propuesta en el estilo común, sin marcas del partido', file: 'src/pipeline/prompts.ts' },
  { task: 'verify-fidelity', what: 'V10: comprueba que la reescritura es fiel a las citas', file: 'src/pipeline/fidelity.ts' },
  { task: 'guess-party', what: 'V11: intenta adivinar de qué partido es cada texto', file: 'src/pipeline/recognizability.ts' },
  { task: 'confirm-absence', what: 'V12: confirma que un partido no propone nada sobre un tema', file: 'src/pipeline/absence.ts' },
  { task: 'assess-feasibility', what: 'V13: evalúa la viabilidad a ciegas, dos veces', file: 'src/pipeline/prompts-feasibility.ts' },
  { task: 'answer-question', what: 'Responde a las preguntas sugeridas con citas literales', file: 'src/questions/prompts.ts' },
] as const;

/** Live free question: same prompt, other models (src/ai/claude.ts FREE_QUESTION_MODELS). */
export const FREE_QUESTION_PROMPTS = [
  { task: 'answer-question', what: 'Pregunta libre: responde con citas literales', file: 'src/questions/prompts.ts' },
  { task: 'verify-fidelity', what: 'Pregunta libre: V10, comprueba que la respuesta es fiel a las citas', file: 'src/pipeline/fidelity.ts' },
] as const;
