// Where the watcher looks for each party's programme, in priority order: official pages first,
// then aggregators. A source can be a page (its links to PDFs on the party's official domains,
// V7's registry/domains.ts, are candidates) or the PDF URL itself. `pattern` tells the programme
// apart from other PDFs on the page. Links from aggregators are only followed when they point
// to an official domain, so an aggregator can never be the origin of a published programme.
// One entry (at least) per registered party (src/registry/parties.ts), on its V7 official domain.
// TODO(maintainer): refine the URLs when each party publishes its programme page.
import type { WatchedSource } from './index';

export const MANIFESTO_SOURCES: WatchedSource[] = [
  // ERC: esquerra.cat answers 403 to non-browser clients (Cloudflare bot block) — if it keeps
  // failing, add the direct PDF URL here or process it by hand (`npm run process`).
  { party: 'erc', url: 'https://www.esquerra.cat/', pattern: 'programa' },
  { party: 'pp', url: 'https://www.pp.es/', pattern: 'programa|contrato' },
  { party: 'psoe', url: 'https://www.psoe.es/', pattern: 'programa' },
  { party: 'vox', url: 'https://www.voxespana.es/', pattern: 'programa' },
  { party: 'sumar', url: 'https://movimientosumar.es/', pattern: 'programa' },
  { party: 'podemos', url: 'https://podemos.info/', pattern: 'programa' },
  { party: 'junts', url: 'https://junts.cat/', pattern: 'programa' },
  { party: 'bildu', url: 'https://ehbildu.eus/', pattern: 'programa|egitaraua' },
  { party: 'pnv', url: 'https://www.eaj-pnv.eus/', pattern: 'programa|egitaraua' },
  { party: 'bng', url: 'https://www.bng.gal/', pattern: 'programa' },
  { party: 'cc', url: 'https://coalicioncanaria.org/', pattern: 'programa' },
  { party: 'upn', url: 'https://www.upn.org/', pattern: 'programa' },
];
