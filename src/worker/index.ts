// Cloudflare Worker in front of the static site (wrangler.jsonc `main`). Only two endpoints; every
// other request goes straight to the static assets (dist/):
//   POST /api/ask       live free question (#15) — behind the FREE_QUESTION flag, off by default
//   POST /api/feedback  "Reportar error" / "Falta un partido" without a GitHub account
//   /texts/*            programme page texts: read internally through ASSETS, never served
//   /?r=reto            challenge og:title so the shared link's preview changes (#9; nothing about
//                       the user is in the link)
//
// No logs: this code never calls console.*, Workers observability is off in wrangler.jsonc, the
// client IP is never read, and AI Gateway is told not to log each request (`cf-aig-collect-log`).
// Secrets and bindings it needs: docs/deploy.md ("Pregunta libre y avisos").
import data from '../../data/dataset.json';
import { applyMode, type Dataset } from '../dataset';
import type { AIAdapter } from '../ai/adapter';
import { createClaudeAI, FREE_QUESTION_MODELS } from '../ai/claude';
import { createFreeQuestion, type Store } from '../questions/free';
import { ManifestoText, textPath } from '../questions/texts';
import { TERMS } from '../registry/terms';
import { createFeedback } from '../transparency/feedback';
import { applyChallenge, isChallenge } from '../share';

/** Minimal shapes of the Cloudflare bindings used here (no workers-types dependency). */
interface Fetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

export interface Env {
  ASSETS: Fetcher;
  /** KV namespace: session counters, monthly spending and the FAQ cache. */
  QUESTIONS?: Store;
  /** "1" opens the free question (spec: around 18-nov). Anything else: closed. */
  FREE_QUESTION?: string;
  /** 'private' = private prototype dataset (provisional sources included). */
  SITE_MODE?: string;
  ANTHROPIC_API_KEY?: string;
  /** https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/anthropic */
  AI_GATEWAY_URL?: string;
  /** Only for an authenticated gateway. */
  CF_AIG_TOKEN?: string;
  /** Monthly cap in euros (default 150). */
  MONTHLY_CAP?: string;
  /** Fine-grained token with "Issues: read and write" on jorgemasta/29n only. */
  GITHUB_TOKEN?: string;
}

export interface Dependencies {
  /** Tests inject the fake adapter; production builds the Claude one from the environment. */
  ai?: (env: Env) => AIAdapter;
  /** Tests inject a fake GitHub. */
  fetchGitHub?: typeof fetch;
  now?: () => Date;
}

const MAX_BODY = 8 * 1024;
const REPO_API = 'https://api.github.com/repos/jorgemasta/29n/issues';

const json = (body: unknown, state = 200) =>
  new Response(JSON.stringify(body), {
    status: state,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });

function realAi(env: Env): AIAdapter {
  return createClaudeAI({
    apiKey: env.ANTHROPIC_API_KEY,
    ...(env.AI_GATEWAY_URL ? { baseURL: env.AI_GATEWAY_URL } : {}),
    headers: {
      // AI Gateway: do not log this request (prompt, response or metadata).
      'cf-aig-collect-log': 'false',
      ...(env.CF_AIG_TOKEN ? { 'cf-aig-authorization': `Bearer ${env.CF_AIG_TOKEN}` } : {}),
    },
    models: FREE_QUESTION_MODELS,
    maxTokens: 8000,
  });
}

/** Reads a small JSON body from the same site; null if it is not one. */
async function readRequest(request: Request): Promise<Record<string, unknown> | null> {
  if (request.method !== 'POST') return null;
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return null;
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) return null;
  const text = await request.text();
  if (text.length > MAX_BODY) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function createHandler(deps: Dependencies = {}) {
  return async function fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/texts/')) return new Response('No encontrado', { status: 404 });

    if (url.pathname === '/api/ask') {
      const body = await readRequest(request);
      if (!body) return json({ state: 'invalid', message: 'Petición no válida.' }, 400);
      const enabled = env.FREE_QUESTION === '1' && !!env.QUESTIONS && (!!env.ANTHROPIC_API_KEY || !!deps.ai);
      const dataset = applyMode(data as Dataset, env.SITE_MODE === 'private' ? 'private' : 'public');
      const service = createFreeQuestion(
        {
          ai: enabled ? (deps.ai ?? realAi)(env) : { complete: async () => { throw new Error('closed'); } },
          store: env.QUESTIONS ?? { get: async () => null, put: async () => {} },
          texts: async (party) => {
            const r = await env.ASSETS.fetch(new Request(new URL(`/${textPath(party)}`, url.origin)));
            if (!r.ok) return null;
            const t = ManifestoText.safeParse(await r.json().catch(() => null));
            return t.success ? t.data : null;
          },
          now: deps.now ?? (() => new Date()),
        },
        {
          enabled,
          dataset,
          terms: TERMS,
          ...(Number(env.MONTHLY_CAP) > 0 ? { monthlyCap: Number(env.MONTHLY_CAP) } : {}),
        },
      );
      const r = await service.ask({ question: String(body.question ?? ''), session: String(body.session ?? '') });
      return json(r, r.state === 'invalid' ? 400 : r.state === 'error' ? 502 : 200);
    }

    if (url.pathname === '/api/feedback') {
      const body = await readRequest(request);
      if (!body) return json({ state: 'invalid', message: 'Petición no válida.' }, 400);
      const call = deps.fetchGitHub ?? globalThis.fetch.bind(globalThis);
      const feedback = createFeedback({
        ...(env.QUESTIONS ? { store: env.QUESTIONS } : {}),
        ...(env.GITHUB_TOKEN
          ? {
              createIssue: async ({ title, body: body, labels }) => {
                const r = await call(REPO_API, {
                  method: 'POST',
                  headers: {
                    authorization: `Bearer ${env.GITHUB_TOKEN}`,
                    accept: 'application/vnd.github+json',
                    'user-agent': '29n-feedback',
                    'x-github-api-version': '2022-11-28',
                    'content-type': 'application/json',
                  },
                  body: JSON.stringify({ title: title, body, labels: labels }),
                });
                if (!r.ok) throw new Error(`GitHub ${r.status}`);
                return { url: ((await r.json()) as { html_url: string }).html_url };
              },
            }
          : {}),
      });
      const r = await feedback.send(body.feedback, String(body.session ?? ''));
      return json(r, r.state === 'invalid' ? 400 : 200);
    }

    const res = await env.ASSETS.fetch(request);
    if (url.pathname === '/' && isChallenge(url.search) && res.headers.get('content-type')?.includes('text/html'))
      return new Response(applyChallenge(await res.text()), res);
    return res;
  };
}

export default { fetch: createHandler() };
