// Transparency data (#11): derived views of the dataset for the methodology, parties-and-programmes
// and verification-report pages, plus the prefilled GitHub issue links ("Reportar error", "Falta un partido").
// Pure functions: the pages only render what these return.
import type { Dataset, ReportEntry, Report, Party, SuggestedQuestion, FeasibilityResult, PositionSummary, Topic, SourceType, Question, Theme, Approach } from '../dataset/schema';
import type { Pulse } from '../pulse';
import { linkQuote, type LinkedQuote } from '../game/party';
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
  suggestedQuestions: { question: { id: string; text: string }; entries: SummaryEntry[] }[];
}

export function reportSummary(report: Report, topics: Topic[], questions: SuggestedQuestion[] = []): ReportSummary {
  const withName = (e: ReportEntry): SummaryEntry => ({ ...e, name: CHECKS[e.check].name });
  const order = new Map(topics.map((t) => [t.id, t]));
  const ids = [...new Set([...report.positions.map((p) => p.topic), ...report.entries.flatMap((e) => (e.topic ? [e.topic] : []))])];
  ids.sort((a, b) => (order.get(a)?.order ?? Infinity) - (order.get(b)?.order ?? Infinity) || a.localeCompare(b));
  return {
    report,
    published: report.positions.filter((p) => p.state === 'proposes').length,
    manifesto: report.entries.filter((e) => !e.topic && !e.suggestedQuestion).map(withName),
    suggestedQuestions: [...new Set(report.entries.flatMap((e) => (e.suggestedQuestion ? [e.suggestedQuestion] : [])))]
      .map((id) => questions.find((p) => p.id === id) ?? { id, text: id, order: Infinity })
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      .map(({ id, text }) => ({ question: { id, text }, entries: report.entries.filter((e) => e.suggestedQuestion === id).map(withName) })),
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
  { task: 'take-pulse', what: 'Pulso: propone temáticas y preguntas a partir del CIS y de los programas, en dos pasadas', file: 'src/pulse/prompt.ts' },
  { task: 'extract-position', what: 'Extrae la propuesta de cada partido con sus citas literales', file: 'src/pipeline/prompts.ts' },
  { task: 'settle-approaches', what: 'Agrupa las propuestas de cada pregunta en 3 enfoques y sitúa a cada partido, en dos pasadas', file: 'src/pipeline/prompts-settle.ts' },
  { task: 'rewrite-approach', what: 'Reescribe un enfoque que no pasó una comprobación', file: 'src/pipeline/prompts-approach.ts' },
  { task: 'verify-fidelity', what: 'V10: comprueba que cada enfoque es fiel a las citas de quien lo defiende de lleno', file: 'src/pipeline/prompts-approach.ts' },
  { task: 'guess-party', what: 'V11: intenta adivinar qué partidos defienden cada enfoque', file: 'src/pipeline/prompts-approach.ts' },
  { task: 'neutralize', what: 'Reescribe la propuesta concreta de cada partido en el estilo común', file: 'src/pipeline/prompts.ts' },
  { task: 'confirm-absence', what: 'V12: confirma que un partido no propone nada sobre una pregunta', file: 'src/pipeline/absence.ts' },
  { task: 'assess-feasibility', what: 'V13: evalúa la viabilidad a ciegas, dos veces', file: 'src/pipeline/prompts-feasibility.ts' },
  { task: 'answer-question', what: 'Responde a las preguntas sugeridas con citas literales', file: 'src/questions/prompts.ts' },
] as const;

/** Live free question: same prompt, other models (src/ai/claude.ts FREE_QUESTION_MODELS). */
export const FREE_QUESTION_PROMPTS = [
  { task: 'answer-question', what: 'Pregunta libre: responde con citas literales', file: 'src/questions/prompts.ts' },
  { task: 'verify-fidelity', what: 'Pregunta libre: V10, comprueba que la respuesta es fiel a las citas', file: 'src/pipeline/fidelity.ts' },
] as const;

// --- v2 (#29): pulse, question list, unpublished questions, stances per party ----------------------

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;
const sortQuestions = (qs: readonly Question[]) => [...qs].sort((a, b) => Number(a.followUp) - Number(b.followUp) || byOrder(a, b));

export interface PulseSummary {
  frozenAt: string;
  promptVersion: string;
  cis: { barometer: string; url: string };
  /** Manifestos whose topics were read. */
  manifestos: number;
  /** Open-network candidates per source (discovery only; X is never one). */
  networks: { source: Pulse['sources']['networks'][number]['source']; count: number }[];
  questions: number;
  rejected: number;
}

/** What the methodology says about the pulse; null until data/pulse.json exists. */
export function pulseSummary(pulse: Pulse | null): PulseSummary | null {
  if (!pulse) return null;
  const networks = new Map<PulseSummary['networks'][number]['source'], number>();
  for (const n of pulse.sources.networks) networks.set(n.source, (networks.get(n.source) ?? 0) + 1);
  return {
    frozenAt: pulse.frozenAt,
    promptVersion: pulse.promptVersion,
    cis: { barometer: pulse.sources.cis.barometer, url: pulse.sources.cis.url },
    manifestos: pulse.sources.manifestos.length,
    networks: [...networks].map(([source, count]) => ({ source, count })),
    questions: pulse.questions.length,
    rejected: pulse.rejected.length,
  };
}

/** Where the CIS datum is explained when the barometer link is unknown. */
export const PULSE_ANCHOR = '/metodologia/#pulso';

export interface OriginLink {
  text: string;
  href: string;
}

export interface ListedQuestion {
  id: string;
  text: string;
  followUp: boolean;
  origin: OriginLink[];
}

/** Why a question was picked, as links: the CIS barometer and/or the manifestos that address it. */
export function originLinks(origin: Question['origin'], pulse: Pulse | null): OriginLink[] {
  const links: OriginLink[] = [];
  if (origin.cis) links.push({ text: `CIS: ${origin.cis}`, href: pulse?.sources.cis.url ?? PULSE_ANCHOR });
  if (origin.manifestos > 0)
    links.push({ text: origin.manifestos === 1 ? 'La trata 1 programa' : `La tratan ${origin.manifestos} programas`, href: '/partidos/' });
  if (links.length === 0) links.push({ text: 'Pulso', href: PULSE_ANCHOR });
  return links;
}

/** Published questions by theme (theme order; base questions first), each with its origin. */
export function questionList(ds: Dataset, pulse: Pulse | null): { theme: Theme; questions: ListedQuestion[] }[] {
  const questions = ds.questions ?? [];
  return [...(ds.themes ?? [])]
    .sort(byOrder)
    .map((theme) => ({
      theme,
      questions: sortQuestions(questions.filter((q) => q.theme === theme.id)).map((q) => ({
        id: q.id,
        text: q.text,
        followUp: q.followUp,
        origin: originLinks(q.origin, pulse),
      })),
    }))
    .filter((t) => t.questions.length > 0);
}

export interface UnpublishedQuestion {
  id: string;
  text: string;
  /** Theme title (or id when the theme itself did not enter). */
  theme: string;
  /** `pulse`: it did not enter the list. `approaches`: its 3 approaches could not be settled. */
  stage: 'pulse' | 'approaches';
  reason: string;
}

/** Questions that were not published and why: approach-stage ones first, then pulse rejections. */
export function unpublishedQuestions(ds: Dataset, pulse: Pulse | null): UnpublishedQuestion[] {
  const published = new Set((ds.questions ?? []).map((q) => q.id));
  const titles = new Map([...(pulse?.themes ?? []), ...(ds.themes ?? [])].map((t) => [t.id, t.title]));
  const pulseQuestion = new Map((pulse?.questions ?? []).map((q) => [q.id, q]));
  const approaches = (ds.approachReports ?? [])
    .filter((r) => !r.publishable && !published.has(r.question))
    .map((r): UnpublishedQuestion => {
      const theme = r.theme ?? pulseQuestion.get(r.question)?.theme ?? '';
      return {
        id: r.question,
        text: r.text ?? pulseQuestion.get(r.question)?.text ?? r.question,
        theme: titles.get(theme) ?? theme,
        stage: 'approaches',
        reason: r.reason ?? 'No pasó las comprobaciones.',
      };
    });
  const rejected = (pulse?.rejected ?? []).map((r): UnpublishedQuestion => ({
    id: r.id,
    text: r.text,
    theme: titles.get(r.theme) ?? r.theme,
    stage: 'pulse',
    reason: r.detail,
  }));
  return [...approaches, ...rejected];
}

export type PartyStanceRow =
  | { kind: 'approach'; approach: Pick<Approach, 'id' | 'what' | 'how' | 'figure'>; stance: 'full' | 'partial'; quote: LinkedQuote }
  | { kind: 'otherProposal'; quote: LinkedQuote };

/**
 * Per-party report: for every published question, the approach(es) the party defends with their level
 * and quote, or its "propone otra cosa" with its quote; empty when it is in neither.
 */
export function partyStances(ds: Dataset, partyId: string): { theme: Theme; questions: { id: string; text: string; followUp: boolean; stances: PartyStanceRow[] }[] }[] {
  const party = ds.parties.find((p) => p.id === partyId);
  const link = (q: { text: string; page: number }): LinkedQuote => (party ? linkQuote(party, q) : { ...q, link: '' });
  const questions = ds.questions ?? [];
  return [...(ds.themes ?? [])]
    .sort(byOrder)
    .map((theme) => ({
      theme,
      questions: sortQuestions(questions.filter((q) => q.theme === theme.id)).map((q) => {
        const stances: PartyStanceRow[] = [];
        for (const a of q.approaches) {
          if (a.filler) continue;
          for (const s of a.stances)
            if (s.party === partyId && s.stance !== 'none')
              stances.push({ kind: 'approach', approach: { id: a.id, what: a.what, how: a.how, figure: a.figure }, stance: s.stance, quote: link(s.quote) });
        }
        for (const o of q.otherProposals) if (o.party === partyId) stances.push({ kind: 'otherProposal', quote: link(o.quote) });
        return { id: q.id, text: q.text, followUp: q.followUp, stances };
      }),
    }))
    .filter((t) => t.questions.length > 0);
}

/** Parties with a stance or an "other proposal" in some published question. */
export function partiesWithStances(ds: Dataset): string[] {
  const ids = new Set<string>();
  for (const q of ds.questions ?? []) {
    for (const a of q.approaches) for (const s of a.stances) if (s.stance !== 'none' && !a.filler) ids.add(s.party);
    for (const o of q.otherProposals) ids.add(o.party);
  }
  return [...ids].sort();
}
