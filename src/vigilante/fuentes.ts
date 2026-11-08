// Where the watcher looks for each party's programme, in priority order: official pages first,
// then aggregators. A source can be a page (its links to PDFs on the party's official domains,
// V7's registro/dominios.ts, are candidates) or the PDF URL itself. `patron` tells the programme
// apart from other PDFs on the page. Links from aggregators are only followed when they point
// to an official domain, so an aggregator can never be the origin of a published programme.
// TODO(maintainer / #7): refine the URLs when each party publishes its programme page.
import type { FuenteVigilada } from './index';

export const FUENTES_PROGRAMAS: FuenteVigilada[] = [
  // ERC: esquerra.cat answers 403 to non-browser clients (Cloudflare bot block) — if it keeps
  // failing, add the direct PDF URL here or process it by hand (`npm run procesar`).
  { partido: 'erc', url: 'https://www.esquerra.cat/', patron: 'programa' },
  { partido: 'pp', url: 'https://www.pp.es/', patron: 'programa|contrato' },
];
