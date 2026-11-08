// Where the watcher looks for each party's programme, in priority order: official pages first,
// then aggregators. A source can be a page (its links to PDFs on the party's official domains,
// V7's registro/dominios.ts, are candidates) or the PDF URL itself. `patron` tells the programme
// apart from other PDFs on the page. Links from aggregators are only followed when they point
// to an official domain, so an aggregator can never be the origin of a published programme.
// One entry (at least) per registered party (src/registro/partidos.ts), on its V7 official domain.
// TODO(maintainer): refine the URLs when each party publishes its programme page.
import type { FuenteVigilada } from './index';

export const FUENTES_PROGRAMAS: FuenteVigilada[] = [
  // ERC: esquerra.cat answers 403 to non-browser clients (Cloudflare bot block) — if it keeps
  // failing, add the direct PDF URL here or process it by hand (`npm run procesar`).
  { partido: 'erc', url: 'https://www.esquerra.cat/', patron: 'programa' },
  { partido: 'pp', url: 'https://www.pp.es/', patron: 'programa|contrato' },
  { partido: 'psoe', url: 'https://www.psoe.es/', patron: 'programa' },
  { partido: 'vox', url: 'https://www.voxespana.es/', patron: 'programa' },
  { partido: 'sumar', url: 'https://movimientosumar.es/', patron: 'programa' },
  { partido: 'podemos', url: 'https://podemos.info/', patron: 'programa' },
  { partido: 'junts', url: 'https://junts.cat/', patron: 'programa' },
  { partido: 'bildu', url: 'https://ehbildu.eus/', patron: 'programa|egitaraua' },
  { partido: 'pnv', url: 'https://www.eaj-pnv.eus/', patron: 'programa|egitaraua' },
  { partido: 'bng', url: 'https://www.bng.gal/', patron: 'programa' },
  { partido: 'cc', url: 'https://coalicioncanaria.org/', patron: 'programa' },
  { partido: 'upn', url: 'https://www.upn.org/', patron: 'programa' },
];
