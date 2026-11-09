// Build-time dataset for every static page, through the launch rules (src/launch): the public build
// never ships provisional sources, and the production build (PRODUCTION=1) fails unless the data is real.
import data from '../../data/dataset.json';
import type { Dataset, Mode } from '../dataset';
import { setupPublication } from '../launch';

const publication = setupPublication(data as Dataset, process.env);
if (publication.errors.length) {
  throw new Error(`Build de producción bloqueado (docs/deploy.md, «Lanzamiento»):\n- ${publication.errors.join('\n- ')}`);
}

export const mode: Mode = publication.mode;
export const dataset: Dataset = publication.dataset;
/** Only the checked production build lets search engines in (meta robots, robots.txt). */
export const indexable = publication.indexable;

/** "14 nov, 09:30" (Europe/Madrid). */
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
/** "5 nov 2026" for a date or a timestamp. */
export const dayDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', year: 'numeric' });
