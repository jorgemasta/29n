// Public launch (#16): the production build only ships official 29N programmes of registered
// parties, never simulated data or provisional sources, and no aggregated affinity statistics.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Dataset } from '../src/dataset/schema';
import { setupPublication, nonPublishableFiles, robotsText } from '../src/launch';
import { EVENTS } from '../src/analytics/events';
import { topicsDataset } from './fixtures/topics-dataset';

const real: Dataset = { ...topicsDataset, origin: 'real' };
const simulated: Dataset = { ...topicsDataset, origin: 'simulated' };
const options = {
  registry: ['uno', 'dos', 'viejo', 'dichos'],
  domains: { uno: ['ejemplo.org'], dos: ['ejemplo.org'], viejo: ['ejemplo.org'], dichos: ['ejemplo.org'] },
};
const prod = (dataset: Dataset, env: Record<string, string | undefined> = {}) =>
  setupPublication(dataset, { PRODUCTION: '1', ...env }, options);

describe('production build', () => {
  it('fails on simulated data (the committed dataset today; `npm run e2e` builds it with PRODUCCION=1)', () => {
    const c = prod(simulated);
    expect(c.errors.join('\n')).toMatch(/simulated/);
    expect(c.indexable).toBe(false);
  });

  it('a real dataset of registered parties with official sources is publishable and indexable', () => {
    const c = prod(real);
    expect(c.errors).toEqual([]);
    expect(c.production).toBe(true);
    expect(c.indexable).toBe(true);
    expect(c.mode).toBe('public');
  });

  it('provisional sources are excluded loudly: the party ships as pending, with a warning', () => {
    const c = prod(real);
    expect(c.warnings.join('\n')).toMatch(/viejo/);
    expect(c.warnings.join('\n')).toMatch(/dichos/);
    const pending = c.dataset.parties.filter((p) => p.manifesto.state === 'pending').map((p) => p.id);
    expect(pending.sort()).toEqual(['dichos', 'viejo']);
    expect(c.dataset.positions.some((p) => p.party === 'viejo' || p.party === 'dichos')).toBe(false);
  });

  it('a fictional test party fails the build', () => {
    const c = prod({ ...real, parties: real.parties.map((p) => (p.id === 'uno' ? { ...p, test: true } : p)) });
    expect(c.errors.join('\n')).toMatch(/uno/);
  });

  it('a programme that is not on an official domain of its party fails the build', () => {
    const c = setupPublication(real, { PRODUCTION: '1' }, { ...options, domains: { ...options.domains, uno: ['otro.org'] } });
    expect(c.errors.join('\n')).toMatch(/uno/);
  });

  it('a party outside the inclusion registry fails the build', () => {
    const c = setupPublication(real, { PRODUCTION: '1' }, { ...options, registry: ['dos', 'viejo', 'dichos'] });
    expect(c.errors.join('\n')).toMatch(/uno/);
  });

  it('an invalid dataset fails the build', () => {
    const c = prod({ ...real, topicPositions: [...real.topicPositions, real.topicPositions[0]!] });
    expect(c.errors.length).toBeGreaterThan(0);
  });

  it('the private prototype can never be the production build', () => {
    const c = prod(real, { SITE_MODE: 'private' });
    expect(c.errors.join('\n')).toMatch(/privado/);
    expect(c.indexable).toBe(false);
  });

  it('a preview build (no PRODUCCION) never fails, is never indexable and warns about test data', () => {
    const c = setupPublication(simulated, {}, options);
    expect(c.errors).toEqual([]);
    expect(c.production).toBe(false);
    expect(c.indexable).toBe(false);
    expect(c.warnings.join('\n')).toMatch(/simulated/);
    expect(prod(real, { PRODUCTION: undefined }).indexable).toBe(false);
  });

  it('robots.txt blocks everything unless the build is indexable', () => {
    expect(robotsText(false)).toMatch(/Disallow: \//);
    expect(robotsText(true)).not.toMatch(/Disallow: \//);
  });

  it('static files of parties without a public official programme are removed from the build', () => {
    const c = prod(real);
    const files = ['og.png', 'programas/prueba-a.pdf', 'texts/uno.json', 'texts/viejo.json', 'texts/prueba-a.json', 'texts/dos.json'];
    expect(nonPublishableFiles(c.dataset, files).sort()).toEqual(['programas/prueba-a.pdf', 'texts/prueba-a.json', 'texts/viejo.json']);
  });
});

/** Every file under a directory (relative paths). */
function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const path = join(dir, f);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

describe('no aggregated affinity statistics are published (art. 69 LOREG)', () => {
  it('analytics events can only carry a topic or the share-card type', () => {
    for (const fields of Object.values(EVENTS)) for (const c of fields) expect(['topic', 'variant']).toContain(c);
    for (const name of Object.keys(EVENTS)) expect(name).not.toMatch(/afinidad|ranking|partido|resultado-|porcentaje/);
  });

  it('the affinity result is only computed on the device: nothing server-side, build-time or scheduled touches it', () => {
    // The ranking lives in the engine (src/game) and is shown/shared only by client modules.
    const client = ['src/game/', 'src/web/', 'src/share/'];
    const rest = [...listFiles('src'), ...listFiles('scripts')]
      .filter((f) => /\.(ts|astro|mjs)$/.test(f))
      .filter((f) => !client.some((d) => f.startsWith(d)));
    const offenders = rest.filter((f) => /\.resultado\(\)|\.ranking\b|afinidad\(/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('no page or workflow publishes affinity counts', () => {
    const pages = listFiles('src/pages').concat(listFiles('src/components'), listFiles('.github/workflows'));
    for (const f of pages) expect(readFileSync(f, 'utf8'), f).not.toMatch(/afinidad agregada|ranking global|eligieron [0-9]|% de (la gente|los usuarios)/i);
  });
});

describe('licences', () => {
  it('code is MIT (Jorge Masta) and data CC BY 4.0, in the repo and in the footer of every page', () => {
    const licence = readFileSync('LICENSE', 'utf8');
    expect(licence).toMatch(/^MIT License/);
    expect(licence).toMatch(/Copyright \(c\) 2026 Jorge Masta/);
    expect(JSON.parse(readFileSync('package.json', 'utf8')).license).toBe('MIT');
    expect(readFileSync('data/LICENSE.md', 'utf8')).toMatch(/CC BY 4\.0/);
    const footer = readFileSync('src/components/Footer.astro', 'utf8');
    expect(footer).toMatch(/licencia MIT/);
    expect(footer).toMatch(/CC BY 4\.0/);
    expect(footer).toMatch(/\/privacidad\//);
    // every page renders the shared footer (directly or through InfoPage)
    for (const f of listFiles('src/pages').filter((x) => x.endsWith('.astro'))) {
      expect(readFileSync(f, 'utf8'), f).toMatch(/<Footer\b|<InfoPage\b/);
    }
  });
});
