// Build-time dataset for the static transparency pages, filtered by MODO exactly like the game page
// (src/pages/index.astro): the public build never ships provisional sources.
import datos from '../../data/dataset.json';
import { aplicarModo, type Dataset, type Modo } from '../dataset';

export const modo: Modo = process.env.MODO === 'privado' ? 'privado' : 'publico';
export const dataset: Dataset = aplicarModo(datos as Dataset, modo);

/** "14 nov, 09:30" (Europe/Madrid). */
export const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
/** "5 nov 2026" for a date or a timestamp. */
export const fechaDia = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', year: 'numeric' });
