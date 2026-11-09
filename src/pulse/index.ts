// Pulse (#23): the frozen list of themes and questions, from the CIS barometer, the topics the
// manifestos address and open-network candidates (never X), proposed by the AI in two independent
// passes. Deterministic rules decide what enters: backed by the CIS or ≥ 3 manifestos (checked
// against the sources, not taken from the AI), present in both passes, neutral wording, sizes.
import { z } from 'zod';
import type { AIAdapter } from '../ai/adapter';
import { Question, Theme, type Party, type QuestionOrigin } from '../dataset/schema';
import { provinceByCode } from '../registry/territory';
import { REGION_NAMES } from '../registry/regions';
import { PULSE_INSTRUCTIONS, PULSE_PROMPT_VERSION, PulseResponse } from './prompt';

export { PulseResponse, PULSE_PROMPT_VERSION } from './prompt';

/** Minimum number of manifestos addressing a question for it to enter without a CIS datum. */
export const MIN_MANIFESTOS = 3;

/** Questions per theme: base ones (at least / at most) and follow-up ones (at most). */
export const SIZE = {
  national: { minBase: 3, maxBase: 3, maxFollowUp: 2 },
  /** "Tu comunidad": 2–4 questions, all base. */
  regional: { minBase: 2, maxBase: 4, maxFollowUp: 0 },
};

const SURPLUS: Refusal = { reason: 'surplus', detail: 'Sobra: la temática ya tiene todas sus preguntas, que van por orden de importancia.' };

export const PulseSources = z.object({
  cis: z.object({
    /** Which barometer, as shown in the methodology ("Barómetro del CIS de octubre de 2026"). */
    barometer: z.string().min(1),
    url: z.string().url(),
    /** Main concerns: % of people naming each one. */
    items: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), percent: z.number().min(0).max(100) })),
  }),
  /** Topics each manifesto addresses. */
  manifestos: z.array(z.object({ party: z.string().min(1), topics: z.array(z.string().min(1)) })),
  /** Open-network candidates (discovery only). */
  networks: z.array(
    z.object({
      id: z.string().min(1),
      source: z.enum(['reddit', 'google-trends', 'web']),
      label: z.string().min(1),
      url: z
        .string()
        .url()
        .refine((u) => !isX(u), 'X (Twitter) no es una fuente admitida')
        .optional(),
    }),
  ),
});

/** X / Twitter is never a source: too easy to manipulate with a coordinated campaign. */
function isX(url: string): boolean {
  const host = new URL(url).hostname.replace(/^(www\.|mobile\.)/, '');
  return ['x.com', 'twitter.com', 't.co'].includes(host);
}
export type PulseSources = z.infer<typeof PulseSources>;

export interface PulseOptions {
  /** Freeze date (YYYY-MM-DD), published in the methodology. */
  frozenAt: string;
  /** Parties in the election; regional ones (scope by provinces) decide the regional themes. */
  parties: Pick<Party, 'id' | 'scope'>[];
}

/** A question of the frozen list: a dataset `Question` before its approaches are settled. */
export const PulseQuestion = Question.pick({ id: true, theme: true, text: true, followUp: true, order: true, origin: true });
export type PulseQuestion = z.infer<typeof PulseQuestion>;

export const RejectionReason = z.enum([
  /** Only in one of the two passes (or in another theme / role in the other). */
  'passesDisagree',
  /** Only open networks pointed to it: no CIS datum and no manifesto. */
  'networksOnly',
  /** No CIS datum and fewer than MIN_MANIFESTOS manifestos. */
  'notEnoughSources',
  /** Not an open "¿Qué harían…?" question, or it carries figures. */
  'notNeutral',
  /** A regional theme for a community without regional parties. */
  'noRegionalParties',
  /** Its theme was left with too few base questions, so the whole theme is out. */
  'themeIncomplete',
  /** The theme already had all its questions. */
  'surplus',
]);
export type RejectionReason = z.infer<typeof RejectionReason>;

/** A candidate that did not enter the list ("preguntas que no se publicaron y por qué"). */
export const RejectedQuestion = z.object({
  id: z.string(),
  theme: z.string(),
  text: z.string(),
  reason: RejectionReason,
  /** Why, in plain Spanish (published in the methodology). */
  detail: z.string().min(1),
});
export type RejectedQuestion = z.infer<typeof RejectedQuestion>;

/** The frozen list (data/pulse.json): replaces the hand-made topic list. */
export const Pulse = z.object({
  /** Freeze date (YYYY-MM-DD), published in the methodology. */
  frozenAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** What the pulse was taken from (published in the methodology). */
  sources: PulseSources,
  promptVersion: z.string(),
  /** National themes, then regional ones, in their published order. */
  themes: z.array(Theme),
  questions: z.array(PulseQuestion),
  rejected: z.array(RejectedQuestion),
});
export type Pulse = z.infer<typeof Pulse>;

export async function takePulse(input: PulseSources, ai: AIAdapter, options: PulseOptions): Promise<Pulse> {
  const sources = PulseSources.parse(input);
  const regions = regionsWithRegionalParties(options.parties);
  const pass = (n: number) =>
    ai.complete({
      task: 'take-pulse',
      instructions: PULSE_INSTRUCTIONS,
      input: { pass: n, ...sources, regions },
      schema: PulseResponse,
    });
  // Sequential on purpose: two independent calls, never one answer reused for both.
  const first = await pass(1);
  const second = await pass(2);
  const themes: Theme[] = [];
  const questions: PulseQuestion[] = [];
  const rejected: RejectedQuestion[] = [];
  const reject = (theme: string, x: { id: string; text: string }, r: Refusal) => rejected.push({ id: x.id, theme, text: x.text, ...r });

  const inSecond = new Map(second.themes.flatMap((t) => t.questions.map((x) => [matchKey(t.id, x), x] as const)));
  const inFirst = new Set(first.themes.flatMap((t) => t.questions.map((x) => matchKey(t.id, x))));
  for (const t of first.themes) {
    const entered: PulseQuestion[] = [];
    for (const x of t.questions) {
      const twin = inSecond.get(matchKey(t.id, x));
      const origin = originOf(x, sources);
      const refusal = !twin
        ? DISAGREE
        : (regionRefusal(t.region, regions) ??
          wordingRefusal(x.text) ??
          entryRefusal(origin, x) ??
          entryRefusal(originOf(twin, sources), twin));
      if (refusal) reject(t.id, x, refusal);
      else entered.push({ id: x.id, theme: t.id, text: x.text, followUp: x.followUp, order: 0, origin });
    }
    const size = t.region === null ? SIZE.national : SIZE.regional;
    const base = entered.filter((x) => !x.followUp);
    const followUps = entered.filter((x) => x.followUp);
    if (entered.length > 0 && base.length < size.minBase) {
      const detail = `La temática se queda con ${base.length} preguntas base válidas (hacen falta ${size.minBase}).`;
      for (const x of entered) reject(t.id, x, { reason: 'themeIncomplete', detail });
      continue;
    }
    if (entered.length === 0) continue;
    for (const x of [...base.slice(size.maxBase), ...followUps.slice(size.maxFollowUp)]) reject(t.id, x, SURPLUS);
    themes.push({ id: t.id, title: t.title, order: themes.length + 1, ...(t.region === null ? {} : { region: t.region }) });
    [...base.slice(0, size.maxBase), ...followUps.slice(0, size.maxFollowUp)].forEach((x, i) => questions.push({ ...x, order: i + 1 }));
  }
  for (const t of second.themes) for (const x of t.questions) if (!inFirst.has(matchKey(t.id, x))) reject(t.id, x, DISAGREE);
  return { frozenAt: options.frozenAt, sources, promptVersion: PULSE_PROMPT_VERSION, themes, questions, rejected };
}

type Refusal = Pick<RejectedQuestion, 'reason' | 'detail'>;

export interface Region {
  /** INE autonomous-community code (CODAUTO). */
  region: string;
  name: string;
  parties: string[];
}

/** Communities where a regional party (one that runs only in some provinces) is in the election. */
function regionsWithRegionalParties(parties: PulseOptions['parties']): Region[] {
  const byRegion = new Map<string, Set<string>>();
  for (const p of parties) {
    if (p.scope.type !== 'provinces') continue;
    for (const code of p.scope.provinces) {
      const region = provinceByCode(code)?.regionCode;
      if (!region) throw new Error(`provincia desconocida en el ámbito de ${p.id}: ${code}`);
      byRegion.set(region, (byRegion.get(region) ?? new Set()).add(p.id));
    }
  }
  return [...byRegion]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([region, ids]) => ({ region, name: REGION_NAMES[region] ?? region, parties: [...ids].sort() }));
}

function regionRefusal(region: string | null, regions: Region[]): Refusal | null {
  if (region === null || regions.some((r) => r.region === region)) return null;
  return { reason: 'noRegionalParties', detail: '«Tu comunidad» solo existe en comunidades con partidos regionales con representación.' };
}

const DISAGREE: Refusal = { reason: 'passesDisagree', detail: 'Solo la propuso una de las dos pasadas independientes.' };

/** Two passes agree on a question when both put the same id in the same theme with the same role. */
const matchKey = (theme: string, x: { id: string; followUp: boolean }) => `${theme}/${x.id}/${x.followUp ? 'followUp' : 'base'}`;

type ResponseQuestion = PulseResponse['themes'][number]['questions'][number];

/** The origin the sources confirm: the AI's claimed backing counts only if the sources contain it. */
function originOf(x: ResponseQuestion, sources: PulseSources): QuestionOrigin {
  const item = sources.cis.items.find((i) => i.id === x.cis);
  const percent = item?.percent.toLocaleString('es-ES', { maximumFractionDigits: 1 });
  const parties = new Set(
    x.manifestos
      .filter((m) => sources.manifestos.some((s) => s.party === m.party && s.topics.includes(m.topic)))
      .map((m) => m.party),
  );
  return { cis: item ? `${item.label}: ${percent} % (${sources.cis.barometer})` : null, manifestos: parties.size };
}

function entryRefusal(origin: QuestionOrigin, x: ResponseQuestion): Refusal | null {
  if (origin.cis !== null || origin.manifestos >= MIN_MANIFESTOS) return null;
  if (origin.manifestos === 0 && x.networks.length > 0)
    return { reason: 'networksOnly', detail: 'Solo sale de redes abiertas: no está en el CIS ni la trata ningún programa.' };
  return {
    reason: 'notEnoughSources',
    detail: `No está en el CIS y solo la ${origin.manifestos === 1 ? 'trata 1 programa' : `tratan ${origin.manifestos} programas`} (hacen falta ${MIN_MANIFESTOS}).`,
  };
}

/**
 * Neutrality rules of the v1 topics, checked on the published wording: an open "¿Qué harían…?"
 * question and no figures (choosing a datum already frames it). One-side vocabulary is left to the
 * prompt: no word list can catch it.
 */
function wordingRefusal(text: string): Refusal | null {
  const t = text.trim();
  if (!t.startsWith('¿Qué harían') || !t.endsWith('?'))
    return { reason: 'notNeutral', detail: 'No es una pregunta abierta del tipo «¿Qué harían…?».' };
  if (/\d/.test(t)) return { reason: 'notNeutral', detail: 'Lleva cifras o datos de contexto, que ya enmarcan la pregunta.' };
  return null;
}
