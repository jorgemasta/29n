// Live free question (#15, test point C): the handler behind POST /api/ask.
//
//   createFreeQuestion(ports, config).ask({ question, session }) → FreeQuestionResponse
//
// Order: flag → validation → search terms (none = out of scope, no AI) → FAQ cache (served even over
// the limits, costs nothing) → per-session limit → monthly spending cap → one `answerQuestion`
// per published party (same V1/V2, V3–V6 and V10 checks as the precomputed answers) → cache.
//
// Privacy: nothing here logs. The session id (random, generated in the voter's browser) is only
// stored hashed, as a bare counter that expires; cached answers are keyed by the normalised question
// and never carry a session. No IP is ever received. No Node-only dependency: runs in a Worker.
import type { Dataset, Party, SuggestedAnswer } from '../dataset/schema';
import type { AIAdapter, Task } from '../ai/adapter';
import { normalizeTerm } from '../pipeline/normalize';
import type { IdentifyingTerms } from '../registry/terms';
import { MAX_RETRIES, pagesToAnswer, answerQuestion, QUESTION_PROMPT_VERSION } from './index';
import { SESSION_LIMIT, MAX_CHARS, MIN_CHARS } from './limits';
import type { ManifestoText } from './texts';

/** Minimal key-value store, compatible with a Cloudflare KV namespace. */
export interface Store {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface FreeQuestionPorts {
  ai: AIAdapter;
  store: Store;
  /** Page text of a party's programme, or null if none is published. */
  texts: (party: string) => Promise<ManifestoText | null>;
  now: () => Date;
}

export interface FreeQuestionConfig {
  /** Feature flag (off by default; spec: the free text box opens around 18-nov). */
  enabled: boolean;
  /** Dataset already filtered by mode (public/private). */
  dataset: Dataset;
  terms: IdentifyingTerms;
  /** AI-answered questions per session (cached ones are free). */
  sessionLimit?: number;
  /** Monthly cap in euros; once reached only cached questions are served. */
  monthlyCap?: number;
  /** Estimated cost in euros of one AI call of this task, charged when the call is made. */
  callCost?: (task: Task) => number;
  /** Max candidate pages sent to the AI per party. */
  maxPages?: number;
}

export { SESSION_LIMIT, MAX_CHARS, MIN_CHARS };
export const MONTHLY_CAP = 150;
export const MAX_PAGES = 4;
/** Session counters expire after a day. */
const SESSION_TTL = 24 * 3600;
/** Cached answers expire after 14 days (and change key whenever a programme or the prompt changes). */
const TTL_CACHE = 14 * 24 * 3600;
const MAX_FREQUENT = 20;

/**
 * Conservative estimates (euros ≈ USD) with the public prices of Nov 2026: Haiku 5.5 $0.10/$0.50
 * per million input/output tokens answers (~8k in, ~4k out incl. thinking); Sonnet 5.5 $2/$10
 * runs the independent V10 check (~3k in, ~1.5k out at low effort).
 */
export const ESTIMATED_COST: Partial<Record<Task, number>> = {
  'answer-question': 0.005,
  'verify-fidelity': 0.025,
};
const defaultCost = (t: Task) => ESTIMATED_COST[t] ?? 0.03;

export type FreeQuestionResponse =
  | { state: 'ok'; question: { id: string; text: string }; answers: SuggestedAnswer[]; remaining: number; fromCache: boolean }
  | { state: 'closed'; message: string }
  | { state: 'invalid'; message: string }
  | { state: 'offTopic'; message: string }
  | { state: 'limit'; message: string; frequent: string[] }
  | { state: 'frequentOnly'; message: string; frequent: string[] }
  | { state: 'error'; message: string };

export interface FreeQuestionRequest {
  question: string;
  /** Random id kept in the voter's browser for this session. */
  session: string;
}

// Words that say nothing about the subject of a question (question words, verbs about proposing,
// "party", "programme", articles, pronouns…). Compared without accents.
const STOP_WORDS = new Set(
  `a al algo algun alguna alguno ante como con contra cual cuales cuando cuanto cuantos de del desde donde el ella ellos
  en entre es esa ese eso esta este esto estos estas ha han hay hace hacen hacer haran hara harian haria la las le les lo los
  mas me mi muy nada ni no nos nosotros o os otra otro para pero piensa piensan poco por porque propone proponen propuesta
  propuestas proponeis que quien quienes quiere quieren se segun ser si sin sobre son su sus tambien te tiene tienen todo
  todos tu un una unas uno unos usted ustedes va vais van vamos vosotros y ya yo dice dicen opina opinan plantea plantean
  partido partidos programa programas politica politicas medida medidas gobierno hacer pasa pasara piensa cosa cosas
  respecto tema temas vuestro vuestra deberia debe`.split(/\s+/),
);

/**
 * Search terms for a free question: its content words, without accents, plural-insensitive and cut
 * to a 7-letter prefix (the retrieval matches word prefixes: "pension" finds "pensiones").
 */
export function questionWords(text: string): string[] {
  const words = normalizeTerm(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((p) => p.length >= 3 && !STOP_WORDS.has(p));
  const root = (p: string) => {
    let r = p;
    if (r.length > 5 && /[^aeiou]es$/.test(r)) r = r.slice(0, -2);
    else if (r.length > 4 && r.endsWith('s')) r = r.slice(0, -1);
    return r.slice(0, 7);
  };
  return [...new Set(words.map(root))];
}

/** Cache key text: same question regardless of case, accents, punctuation and spacing. */
const normalizeQuestion = (text: string) =>
  normalizeTerm(text)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export async function sha256(text: string): Promise<string> {
  const data = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(data)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type PublishedParty = Party & { manifesto: Extract<Party['manifesto'], { state: 'published' }> };
// Privacy (/privacidad/): the cache keeps answers under a hash of the question, never its words.
// A question's wording is stored only once a second person asks it (it becomes "frecuente").
interface Cached {
  answers: SuggestedAnswer[];
}
interface Frequent {
  key: string;
  text?: string;
  times: number;
}

export function createFreeQuestion(ports: FreeQuestionPorts, config: FreeQuestionConfig) {
  const sessionLimit = config.sessionLimit ?? SESSION_LIMIT;
  const cap = config.monthlyCap ?? MONTHLY_CAP;
  const cost = config.callCost ?? defaultCost;
  const maxPages = config.maxPages ?? MAX_PAGES;
  const { store } = ports;
  const published = config.dataset.parties.filter((p): p is PublishedParty => p.manifesto.state === 'published');
  // Any new programme or prompt version invalidates every cached answer.
  const version = sha256(
    [QUESTION_PROMPT_VERSION, ...published.map((p) => `${p.id}:${p.manifesto.hashPdf ?? ''}`).sort()].join('|'),
  ).then((h) => h.slice(0, 16));

  const month = () => ports.now().toISOString().slice(0, 7);
  const readNumber = async (key: string) => Number((await store.get(key)) ?? 0) || 0;
  const spendKey = () => `spend:${month()}`;

  const frequent = async (): Promise<Frequent[]> => {
    try {
      return JSON.parse((await store.get(`frequent:${await version}`)) ?? '[]') as Frequent[];
    } catch {
      return [];
    }
  };
  const frequentList = async () =>
    (await frequent()).flatMap((f) => (f.times >= 2 && f.text ? [f.text] : []));
  const countFrequent = async (key: string, text: string) => {
    const list = await frequent();
    const f = list.find((x) => x.key === key);
    if (f) {
      f.times++;
      f.text ??= text;
    } else list.push({ key, times: 1 });
    list.sort((a, b) => b.times - a.times);
    await store.put(`frequent:${await version}`, JSON.stringify(list.slice(0, MAX_FREQUENT)), { expirationTtl: TTL_CACHE });
  };

  /**
   * Spending: a question first RESERVES its worst case (every party with pages answered and checked
   * by V10 on every attempt), then settles to what its calls actually cost. KV has no atomic
   * increment, so two questions arriving in the same few milliseconds can both read the old total;
   * the reservation keeps that window to one read-write (not the whole AI round), and the Anthropic
   * workspace spend limit is the hard backstop (docs/decisions.md).
   */
  const addSpend = async (key: string, amount: number) =>
    store.put(key, String(Math.max(0, (await readNumber(key)) + amount)), { expirationTtl: 40 * 24 * 3600 });
  const worstCasePerParty = () => (MAX_RETRIES + 1) * (cost('answer-question') + cost('verify-fidelity'));

  return {
    async ask(request: FreeQuestionRequest): Promise<FreeQuestionResponse> {
      if (!config.enabled) return { state: 'closed', message: 'Muy pronto. De momento, elige una de las preguntas sugeridas.' };
      const text = (request.question ?? '').trim().replace(/\s+/g, ' ');
      if (text.length < MIN_CHARS || text.length > MAX_CHARS)
        return { state: 'invalid', message: `Escribe una pregunta de entre ${MIN_CHARS} y ${MAX_CHARS} caracteres.` };
      if (!request.session || typeof request.session !== 'string' || request.session.length > 100)
        return { state: 'invalid', message: 'Recarga la página e inténtalo de nuevo.' };

      const words = questionWords(text);
      if (words.length === 0)
        return {
          state: 'offTopic',
          message: 'Solo podemos buscar lo que dicen los programas sobre un tema concreto. Prueba con algo como «¿Qué proponen sobre el alquiler?».',
        };

      const normalized = normalizeQuestion(text);
      const key = await sha256(normalized);
      const cacheKey = `cache:${await version}:${key}`;
      const sessionKey = `session:${await sha256(`29n:${request.session}`)}`;
      const used = await readNumber(sessionKey);
      const question = { id: `libre-${key.slice(0, 12)}`, text };

      const saved = await store.get(cacheKey);
      if (saved) {
        const cached = JSON.parse(saved) as Cached;
        await countFrequent(key, text);
        return {
          state: 'ok',
          question,
          answers: cached.answers,
          remaining: Math.max(0, sessionLimit - used),
          fromCache: true,
        };
      }

      if (used >= sessionLimit)
        return {
          state: 'limit',
          message: `Has llegado al límite de ${sessionLimit} preguntas por sesión. Puedes seguir con las preguntas sugeridas y las frecuentes, ya respondidas.`,
          frequent: await frequentList(),
        };

      // Load texts and pick the candidate pages before spending anything.
      const withText = await Promise.all(
        published.map(async (party) => {
          const t = await ports.texts(party.id).catch(() => null);
          const current = t && t.party === party.id && t.hashPdf === party.manifesto.hashPdf ? t : null;
          return { party, text: current };
        }),
      );
      const withCandidates = withText.filter((x) => x.text && pagesToAnswer(x.text.pages, words, 1).length > 0).length;
      const monthKey = spendKey();
      const reserve = withCandidates * worstCasePerParty();
      const spent = await readNumber(monthKey);
      if (spent >= cap || spent + reserve > cap)
        return {
          state: 'frequentOnly',
          message: 'Hemos llegado al gasto máximo de este mes para preguntas nuevas. Mientras tanto, solo respondemos las preguntas sugeridas y las frecuentes.',
          frequent: await frequentList(),
        };

      await addSpend(monthKey, reserve);
      let realSpend = 0;
      const aiWithSpend: AIAdapter = {
        complete(p) {
          realSpend += cost(p.task);
          return ports.ai.complete(p);
        },
      };
      let answers: SuggestedAnswer[];
      try {
        answers = await Promise.all(
          withText.map(async ({ party, text: t }): Promise<SuggestedAnswer> => {
            const base = { party: party.id, question: question.id, versions: { prompt: QUESTION_PROMPT_VERSION } };
            // No text published for this programme (or a stale one): we cannot check any quote.
            if (!t) return { ...base, state: 'unverified' };
            const r = await answerQuestion(aiWithSpend, { id: question.id, text, keywords: words }, t.pages, {
              terms: config.terms,
              maxPages,
            });
            return r.state === 'answers' ? { ...base, state: 'answers', text: r.text, quotes: r.quotes } : { ...base, state: r.state };
          }),
        );
      } catch {
        return { state: 'error', message: 'No hemos podido responder ahora. Inténtalo de nuevo en un rato.' };
      } finally {
        await addSpend(monthKey, realSpend - reserve);
      }

      await store.put(sessionKey, String(used + 1), { expirationTtl: SESSION_TTL });
      await store.put(cacheKey, JSON.stringify({ answers } satisfies Cached), { expirationTtl: TTL_CACHE });
      await countFrequent(key, text);
      return { state: 'ok', question, answers, remaining: Math.max(0, sessionLimit - used - 1), fromCache: false };
    },
  };
}

/** In-memory store for tests and local runs; `dump`/`keys`/`ttl` let tests inspect what is kept. */
export function createMemoryStore() {
  const data = new Map<string, { value: string; ttl?: number }>();
  return {
    async get(key: string) {
      return data.get(key)?.value ?? null;
    },
    async put(key: string, value: string, options?: { expirationTtl?: number }) {
      data.set(key, { value, ...(options?.expirationTtl ? { ttl: options.expirationTtl } : {}) });
    },
    keys: () => [...data.keys()],
    dump: () => Object.fromEntries([...data].map(([k, v]) => [k, v.value])),
    ttl: (key: string) => data.get(key)?.ttl,
  } satisfies Store & Record<string, unknown>;
}
