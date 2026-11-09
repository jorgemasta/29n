// Real ports for checkGuesses: Umami's REST API (read-only, aggregated counts) and the `gh` CLI.
// Both take their transport as a parameter so tests run them against fakes.
import { LABEL, type GuessCount, type NewIssue, type GuessPorts } from './index';

export interface UmamiConfig {
  /** Self-hosted: https://<host>/api (Umami Cloud: https://api.umami.is/v1). */
  base: string;
  /** Umami Cloud API key, or the login of a self-hosted instance (which has no API keys). */
  auth: { apiKey: string } | { username: string; password: string };
  websiteId: string;
  /** Days counted back from `now`. */
  days: number;
  now: () => number;
  request: (
    url: string,
    init: { method?: 'GET' | 'POST'; headers: Record<string, string>; body?: string },
  ) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
}

const EVENT = { hits: 'guess-hit', failures: 'guess-miss' } as const;

/**
 * Per-topic counts from the event-data "values" endpoint: for one event name, how many times each
 * value of the `topic` property was sent. `event` is the current parameter name; `eventName` is
 * also sent for older Umami versions (unknown parameters are ignored).
 */
export function createUmamiCounter(c: UmamiConfig): GuessPorts['countGuesses'] {
  const base = c.base.replace(/\/$/, '');
  const authHeaders = async (): Promise<Record<string, string>> => {
    if ('apiKey' in c.auth) return { 'x-umami-api-key': c.auth.apiKey };
    // Self-hosted: POST /auth/login returns a bearer token.
    const r = await c.request(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ username: c.auth.username, password: c.auth.password }),
    });
    if (!r.ok) throw new Error(`Umami login ${r.status}`);
    const { token } = (await r.json()) as { token?: unknown };
    if (typeof token !== 'string') throw new Error('Umami login: respuesta sin token');
    return { authorization: `Bearer ${token}` };
  };
  return async () => {
    const auth = await authHeaders();
    const endAt = c.now();
    const startAt = endAt - c.days * 24 * 3600 * 1000;
    const counts: Record<string, GuessCount> = {};
    for (const [field, event] of Object.entries(EVENT) as [keyof GuessCount, string][]) {
      const q = new URLSearchParams({ startAt: String(startAt), endAt: String(endAt), event: event, eventName: event, propertyName: 'topic' });
      const url = `${base}/websites/${encodeURIComponent(c.websiteId)}/event-data/values?${q}`;
      const r = await c.request(url, { headers: { ...auth, accept: 'application/json' } });
      if (!r.ok) throw new Error(`Umami API ${r.status} (${event})`);
      const rows = await r.json();
      if (!Array.isArray(rows)) throw new Error(`Umami API: respuesta inesperada (${event})`);
      for (const f of rows as { value?: unknown; total?: unknown }[]) {
        if (typeof f.value !== 'string' || typeof f.total !== 'number') continue;
        counts[f.value] ??= { hits: 0, failures: 0 };
        counts[f.value]![field] += f.total;
      }
    }
    return counts;
  };
}

/** `run(args)` runs `gh <args>` and returns stdout. */
export function createGitHubPorts(run: (args: string[]) => string): Pick<GuessPorts, 'openIssues' | 'openIssue'> {
  let listLabel = false;
  return {
    openIssues: async () => {
      const output = run(['issue', 'list', '--label', LABEL, '--state', 'open', '--limit', '500', '--json', 'title']);
      return (JSON.parse(output) as { title: string }[]).map((i) => i.title);
    },
    openIssue: async (i: NewIssue) => {
      if (!listLabel) {
        // `gh issue create --label` fails if the label does not exist; --force makes this idempotent.
        run(['label', 'create', LABEL, '--color', 'D93F0B', '--description', 'Tema demasiado reconocible: volver a neutralizar', '--force']);
        listLabel = true;
      }
      run(['issue', 'create', '--title', i.title, '--body', i.body, ...i.labels.flatMap((e) => ['--label', e])]);
    },
  };
}
