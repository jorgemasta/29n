// Public launch (#16): what a build may publish. Pure: the Astro pages (src/transparency/data.ts),
// robots.txt and the build integration (astro.config.mjs) all go through `setupPublication`.
//
// - Preview build (`npm run build`, no PRODUCTION): never fails, never indexable; warns about test data.
// - Production build (`PRODUCTION=1`, used by `npm run deploy` and the watcher): FAILS unless the dataset
//   is real, valid, only has registered parties and every published programme comes from an official
//   domain. Provisional sources (2023 programme, party document, statements) are excluded loudly: those
//   parties ship as "programme pending".
import { applyMode, sourceOf, isPrivateOnly, validateDataset, type Dataset, type Mode } from '../dataset';
import { verifySource } from '../pipeline/source';
import { OFFICIAL_DOMAINS, type OfficialDomains } from '../registry/domains';
import { PARTIES } from '../registry/parties';
import { textPath } from '../questions/texts';

export type Env = Record<string, string | undefined>;

export interface Publication {
  mode: Mode;
  /** `PRODUCTION=1`: the build that goes to the public domain. */
  production: boolean;
  /** Only a production build that passed every check can be indexed by search engines. */
  indexable: boolean;
  /** Dataset after the mode filter: what the pages ship. */
  dataset: Dataset;
  /** Non-empty ⇒ the production build must fail. */
  errors: string[];
  /** Printed loudly by the build. */
  warnings: string[];
}

export interface PublicationOptions {
  /** Party ids that meet the inclusion criterion (default: src/registry/parties.ts). */
  registry?: string[];
  /** Official domains per party (default: src/registry/domains.ts, V7). */
  domains?: OfficialDomains;
}

export function setupPublication(raw: Dataset, env: Env, options: PublicationOptions = {}): Publication {
  const mode: Mode = env.SITE_MODE === 'private' ? 'private' : 'public';
  const production = env.PRODUCTION === '1';
  const registry = new Set(options.registry ?? Object.keys(PARTIES));
  const domains = options.domains ?? OFFICIAL_DOMAINS;
  const dataset = applyMode(raw, mode);
  const problems: string[] = [];
  const warnings: string[] = [];

  if (raw.origin !== 'real') problems.push(`el dataset es «${raw.origin}» (datos de prueba), no real`);
  if (mode === 'private') problems.push('el prototipo privado (MODO=privado) no puede ser el build de producción');
  const v = validateDataset(raw);
  if (!v.valid) problems.push(...v.errors.map((e) => `dataset no válido (V9): ${e}`));
  for (const p of raw.parties) {
    if (p.test) problems.push(`${p.id}: partido ficticio de prueba`);
    if (!registry.has(p.id)) problems.push(`${p.id}: no está en el registro de partidos (criterio de inclusión)`);
  }
  for (const p of dataset.parties) {
    if (p.manifesto.state !== 'published') continue;
    const f = verifySource(p, domains);
    if (!f.ok) problems.push(`${p.id}: fuente no oficial (V7): ${f.detail}`);
  }
  if (mode === 'public') {
    for (const p of raw.parties) {
      const f = sourceOf(p);
      if (f && isPrivateOnly(f)) warnings.push(`${p.id}: fuente provisional (${f}) excluida; sale como «programa pendiente»`);
    }
  }

  if (!production && problems.length) {
    warnings.unshift('build de vista previa (sin PRODUCCION=1): con estos datos el build de producción fallaría', ...problems.map((x) => `  · ${x}`));
  }
  const errors = production ? problems : [];
  return { mode, production, indexable: production && errors.length === 0, dataset, errors, warnings };
}

/**
 * Static files (paths relative to dist/) that belong to a party without a public official programme
 * in `dataset`: simulated PDFs (programas/<id>.pdf) and page texts (texts/<id>.json).
 */
export function nonPublishableFiles(dataset: Dataset, files: string[]): string[] {
  const published = new Set(dataset.parties.filter((p) => p.manifesto.state === 'published').map((p) => p.id));
  const allowed = new Set([...published].map((id) => textPath(id)));
  return files.filter((a) => {
    if (a.startsWith('programas/')) return true; // real programmes are linked on the party's site, never copied
    if (a.startsWith('texts/')) return !allowed.has(a);
    return false;
  });
}

export function robotsText(indexable: boolean): string {
  return indexable
    ? 'User-agent: *\nAllow: /\n'
    : '# Not the production build: not indexed.\nUser-agent: *\nDisallow: /\n';
}
