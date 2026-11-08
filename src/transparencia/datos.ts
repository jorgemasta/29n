// Build-time dataset for every static page, through the launch rules (src/lanzamiento): the public build
// never ships provisional sources, and the production build (PRODUCCION=1) fails unless the data is real.
import datos from '../../data/dataset.json';
import type { Dataset, Modo } from '../dataset';
import { configurarPublicacion } from '../lanzamiento';

const publicacion = configurarPublicacion(datos as Dataset, process.env);
if (publicacion.errores.length) {
  throw new Error(`Build de producción bloqueado (docs/deploy.md, «Lanzamiento»):\n- ${publicacion.errores.join('\n- ')}`);
}

export const modo: Modo = publicacion.modo;
export const dataset: Dataset = publicacion.dataset;
/** Only the checked production build lets search engines in (meta robots, robots.txt). */
export const indexable = publicacion.indexable;

/** "14 nov, 09:30" (Europe/Madrid). */
export const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
/** "5 nov 2026" for a date or a timestamp. */
export const fechaDia = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', year: 'numeric' });
