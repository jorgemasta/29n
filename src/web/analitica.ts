// The ONLY client module that sends anything: it hands validated events (src/analitica/eventos.ts)
// to the Umami script, which does the network. Without the script (UMAMI_WEBSITE_ID unset at build
// time, blocker, offline) every call is a no-op. tests/analitica.test.ts enforces both.
import type { Partida } from '../juego';
import {
  esEventoValido,
  eventoCompartio,
  eventoEmpezo,
  eventosAlConfirmar,
  eventoVioResultado,
  type Evento,
  type VarianteCompartir,
} from '../analitica/eventos';

declare global {
  interface Window {
    umami?: { track(nombre: string, datos?: Record<string, string>): unknown };
  }
}

let partidos: readonly string[] = [];
const enviados = new Set<string>();

function enviar(e: Evento): void {
  if (!esEventoValido(e, { partidos })) return;
  try {
    window.umami?.track(e.nombre, e.datos);
  } catch {
    // analytics must never break the game
  }
}
/** Funnel steps are counted once per page load. */
const unaVez = (e: Evento) => {
  if (enviados.has(e.nombre)) return;
  enviados.add(e.nombre);
  enviar(e);
};

/** Party ids that must never appear as a value (defence in depth). */
export const configurarAnalitica = (ids: readonly string[]) => {
  partidos = ids;
};
/** A topic is on screen: a player with nothing done yet has started. */
export const analiticaVerTema = (partida: Partida) => {
  if (partida.hechos().length === 0) unaVez(eventoEmpezo());
};
export const analiticaConfirmar = (antes: Partida, despues: Partida, tema: string) =>
  eventosAlConfirmar(antes, despues, tema).forEach(enviar);
export const analiticaResultado = (partida: Partida) => {
  if (partida.resultado().disponible) unaVez(eventoVioResultado());
};
/** For the share button (#9). */
export const analiticaCompartir = (variante: VarianteCompartir) => enviar(eventoCompartio(variante));
