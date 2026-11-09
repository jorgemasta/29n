// The only network calls of the page, kept out of src/web and src/game (which must stay offline:
// tests/game.test.ts "privacy"). They send only what the voter typed: the free question, or the
// content of a "Reportar error" / "Falta un partido" notice. Never a choice, bet, ranking or province.
//
// The session id is random, lives in sessionStorage (gone when the tab closes) and is only used by
// the function for the per-session limits; it is not linked to anything else.
import type { FreeQuestionResponse } from '../questions/free';
import type { FeedbackRequest, FeedbackResult } from '../transparency/feedback';

export type { FreeQuestionResponse, FeedbackResult };
export type Offline = { state: 'network'; message: string };

/** Free question flag, fixed at build time (PUBLIC_FREE_QUESTION=1); the function has its own. */
export const FREE_QUESTION_OPEN = import.meta.env.PUBLIC_FREE_QUESTION === '1';

let inMemory: string | null = null;
function session(): string {
  const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^\w-]/g, '');
  try {
    let id = sessionStorage.getItem('29n:session');
    if (!id) sessionStorage.setItem('29n:session', (id = newId()));
    return id;
  } catch {
    return (inMemory ??= newId());
  }
}

async function send<T>(path: string, body: Record<string, unknown>): Promise<T | Offline> {
  try {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, session: session() }),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    const data = (await r.json().catch(() => null)) as T | null;
    return data ?? { state: 'network', message: 'No hemos podido conectar. Comprueba tu conexión e inténtalo de nuevo.' };
  } catch {
    return { state: 'network', message: 'No hemos podido conectar. Comprueba tu conexión e inténtalo de nuevo.' };
  }
}

export const askLive = (question: string) => send<FreeQuestionResponse>('/api/ask', { question });

export const sendFeedback = (feedback: FeedbackRequest) => send<FeedbackResult>('/api/feedback', { feedback });
