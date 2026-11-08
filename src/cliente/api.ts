// The only network calls of the page, kept out of src/web and src/juego (which must stay offline:
// tests/juego.test.ts "privacy"). They send only what the voter typed: the free question, or the
// content of a "Reportar error" / "Falta un partido" notice. Never a choice, bet, ranking or province.
//
// The session id is random, lives in sessionStorage (gone when the tab closes) and is only used by
// the function for the per-session limits; it is not linked to anything else.
import type { RespuestaPreguntaLibre } from '../pregunta/libre';
import type { PeticionAviso, ResultadoAviso } from '../transparencia/avisos';

export type { RespuestaPreguntaLibre, ResultadoAviso };
export type SinRed = { estado: 'red'; mensaje: string };

/** Free question flag, fixed at build time (PUBLIC_PREGUNTA_LIBRE=1); the function has its own. */
export const PREGUNTA_LIBRE_ACTIVA = import.meta.env.PUBLIC_PREGUNTA_LIBRE === '1';

let enMemoria: string | null = null;
function sesion(): string {
  const nueva = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^\w-]/g, '');
  try {
    let id = sessionStorage.getItem('29n:sesion');
    if (!id) sessionStorage.setItem('29n:sesion', (id = nueva()));
    return id;
  } catch {
    return (enMemoria ??= nueva());
  }
}

async function enviar<T>(ruta: string, cuerpo: Record<string, unknown>): Promise<T | SinRed> {
  try {
    const r = await fetch(ruta, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...cuerpo, sesion: sesion() }),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    const datos = (await r.json().catch(() => null)) as T | null;
    return datos ?? { estado: 'red', mensaje: 'No hemos podido conectar. Comprueba tu conexión e inténtalo de nuevo.' };
  } catch {
    return { estado: 'red', mensaje: 'No hemos podido conectar. Comprueba tu conexión e inténtalo de nuevo.' };
  }
}

export const preguntarEnDirecto = (pregunta: string) => enviar<RespuestaPreguntaLibre>('/api/preguntar', { pregunta });

export const enviarAviso = (aviso: PeticionAviso) => enviar<ResultadoAviso>('/api/avisar', { aviso });
