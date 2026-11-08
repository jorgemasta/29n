// Analytics events (#13), built as pure data. The only things that may leave the browser:
// funnel steps and, per topic, whether a bet was right. Never the chosen card or party, the party bet
// on, the province or the ranking. Every event is checked against this fixed shape before sending
// (src/web/analitica.ts is the only module that talks to Umami).
import { META_TEMAS, type Partida } from '../juego';

/** Event name → the only data fields it may carry. */
export const EVENTOS = {
  empezo: [],
  'tema-completado': ['tema'],
  'cinco-temas': [],
  'vio-resultado': [],
  compartio: ['variante'],
  'apuesta-acierto': ['tema'],
  'apuesta-fallo': ['tema'],
} as const satisfies Record<string, readonly string[]>;

export type NombreEvento = keyof typeof EVENTOS;
export type VarianteCompartir = 'neutra' | 'ranking';
export interface Evento {
  nombre: string;
  datos?: Record<string, string>;
}

const VARIANTES: readonly string[] = ['neutra', 'ranking'] satisfies VarianteCompartir[];
/** Topic ids are slugs ("vivienda", "ref-canarias"); anything else (free text, names) is refused. */
const ID_TEMA = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** True only for a known event with exactly its allowed fields and allowed values. `partidos`: ids never allowed as a value. */
export function esEventoValido(e: Evento, { partidos = [] as readonly string[] } = {}): boolean {
  if (!Object.hasOwn(EVENTOS, e.nombre)) return false;
  const permitidos: readonly string[] = EVENTOS[e.nombre as NombreEvento];
  const datos = e.datos ?? {};
  const claves = Object.keys(datos);
  if (claves.length !== permitidos.length || !permitidos.every((k) => claves.includes(k))) return false;
  if (permitidos.length === 0 && e.datos !== undefined) return false;
  for (const [k, v] of Object.entries(datos)) {
    if (typeof v !== 'string' || v.length > 40) return false;
    if (k === 'tema' && (!ID_TEMA.test(v) || partidos.includes(v))) return false;
    if (k === 'variante' && !VARIANTES.includes(v)) return false;
  }
  return true;
}

export const eventoEmpezo = (): Evento => ({ nombre: 'empezo' });
export const eventoVioResultado = (): Evento => ({ nombre: 'vio-resultado' });
export const eventoCompartio = (variante: VarianteCompartir): Evento => ({ nombre: 'compartio', datos: { variante } });

/**
 * Events for a confirmed choice, from the partida before and after `elegir`: topic completed, the
 * 5th topic, and the bet's hit/miss (read from the engine's reveal; the party itself is dropped here).
 */
export function eventosAlConfirmar(antes: Partida, despues: Partida, tema: string): Evento[] {
  if (!despues.hechos().includes(tema)) return [];
  const eventos: Evento[] = [{ nombre: 'tema-completado', datos: { tema } }];
  if (antes.hechos().length < META_TEMAS && despues.hechos().length >= META_TEMAS) eventos.push({ nombre: 'cinco-temas' });
  const apuesta = despues.revelar(tema)?.apuesta;
  if (apuesta) eventos.push({ nombre: apuesta.acertada ? 'apuesta-acierto' : 'apuesta-fallo', datos: { tema } });
  return eventos;
}
