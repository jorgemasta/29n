// Public launch (#16): the production build only ships official 29N programmes of registered
// parties, never simulated data or provisional sources, and no aggregated affinity statistics.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Dataset } from '../src/dataset/esquema';
import { configurarPublicacion, archivosNoPublicables, textoRobots } from '../src/lanzamiento';
import { EVENTOS } from '../src/analitica/eventos';
import { datasetTemas } from './fixtures/dataset-temas';

const real: Dataset = { ...datasetTemas, origen: 'real' };
const simulado: Dataset = { ...datasetTemas, origen: 'simulado' };
const opciones = {
  registro: ['uno', 'dos', 'viejo', 'dichos'],
  dominios: { uno: ['ejemplo.org'], dos: ['ejemplo.org'], viejo: ['ejemplo.org'], dichos: ['ejemplo.org'] },
};
const prod = (dataset: Dataset, env: Record<string, string | undefined> = {}) =>
  configurarPublicacion(dataset, { PRODUCCION: '1', ...env }, opciones);

describe('production build', () => {
  it('fails on simulated data (the committed dataset today; `npm run e2e` builds it with PRODUCCION=1)', () => {
    const c = prod(simulado);
    expect(c.errores.join('\n')).toMatch(/simulado/);
    expect(c.indexable).toBe(false);
  });

  it('a real dataset of registered parties with official sources is publishable and indexable', () => {
    const c = prod(real);
    expect(c.errores).toEqual([]);
    expect(c.produccion).toBe(true);
    expect(c.indexable).toBe(true);
    expect(c.modo).toBe('publico');
  });

  it('provisional sources are excluded loudly: the party ships as pending, with a warning', () => {
    const c = prod(real);
    expect(c.avisos.join('\n')).toMatch(/viejo/);
    expect(c.avisos.join('\n')).toMatch(/dichos/);
    const pendientes = c.dataset.partidos.filter((p) => p.programa.estado === 'pendiente').map((p) => p.id);
    expect(pendientes.sort()).toEqual(['dichos', 'viejo']);
    expect(c.dataset.posturas.some((p) => p.partido === 'viejo' || p.partido === 'dichos')).toBe(false);
  });

  it('a fictional test party fails the build', () => {
    const c = prod({ ...real, partidos: real.partidos.map((p) => (p.id === 'uno' ? { ...p, prueba: true } : p)) });
    expect(c.errores.join('\n')).toMatch(/uno/);
  });

  it('a programme that is not on an official domain of its party fails the build', () => {
    const c = configurarPublicacion(real, { PRODUCCION: '1' }, { ...opciones, dominios: { ...opciones.dominios, uno: ['otro.org'] } });
    expect(c.errores.join('\n')).toMatch(/uno/);
  });

  it('a party outside the inclusion registry fails the build', () => {
    const c = configurarPublicacion(real, { PRODUCCION: '1' }, { ...opciones, registro: ['dos', 'viejo', 'dichos'] });
    expect(c.errores.join('\n')).toMatch(/uno/);
  });

  it('an invalid dataset fails the build', () => {
    const c = prod({ ...real, posturas: [...real.posturas, real.posturas[0]!] });
    expect(c.errores.length).toBeGreaterThan(0);
  });

  it('the private prototype can never be the production build', () => {
    const c = prod(real, { MODO: 'privado' });
    expect(c.errores.join('\n')).toMatch(/privado/);
    expect(c.indexable).toBe(false);
  });

  it('a preview build (no PRODUCCION) never fails, is never indexable and warns about test data', () => {
    const c = configurarPublicacion(simulado, {}, opciones);
    expect(c.errores).toEqual([]);
    expect(c.produccion).toBe(false);
    expect(c.indexable).toBe(false);
    expect(c.avisos.join('\n')).toMatch(/simulado/);
    expect(prod(real, { PRODUCCION: undefined }).indexable).toBe(false);
  });

  it('robots.txt blocks everything unless the build is indexable', () => {
    expect(textoRobots(false)).toMatch(/Disallow: \//);
    expect(textoRobots(true)).not.toMatch(/Disallow: \//);
  });

  it('static files of parties without a public official programme are removed from the build', () => {
    const c = prod(real);
    const archivos = ['og.png', 'programas/prueba-a.pdf', 'textos/uno.json', 'textos/viejo.json', 'textos/prueba-a.json', 'textos/dos.json'];
    expect(archivosNoPublicables(c.dataset, archivos).sort()).toEqual(['programas/prueba-a.pdf', 'textos/prueba-a.json', 'textos/viejo.json']);
  });
});

/** Every file under a directory (relative paths). */
function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const ruta = join(dir, f);
    return statSync(ruta).isDirectory() ? ficheros(ruta) : [ruta];
  });
}

describe('no aggregated affinity statistics are published (art. 69 LOREG)', () => {
  it('analytics events can only carry a topic or the share-card type', () => {
    for (const campos of Object.values(EVENTOS)) for (const c of campos) expect(['tema', 'variante']).toContain(c);
    for (const nombre of Object.keys(EVENTOS)) expect(nombre).not.toMatch(/afinidad|ranking|partido|resultado-|porcentaje/);
  });

  it('the affinity result is only computed on the device: nothing server-side, build-time or scheduled touches it', () => {
    // The ranking lives in the engine (src/juego) and is shown/shared only by client modules.
    const cliente = ['src/juego/', 'src/web/', 'src/compartir/'];
    const resto = [...ficheros('src'), ...ficheros('scripts')]
      .filter((f) => /\.(ts|astro|mjs)$/.test(f))
      .filter((f) => !cliente.some((d) => f.startsWith(d)));
    const culpables = resto.filter((f) => /\.resultado\(\)|\.ranking\b|afinidad\(/.test(readFileSync(f, 'utf8')));
    expect(culpables).toEqual([]);
  });

  it('no page or workflow publishes affinity counts', () => {
    const paginas = ficheros('src/pages').concat(ficheros('src/components'), ficheros('.github/workflows'));
    for (const f of paginas) expect(readFileSync(f, 'utf8'), f).not.toMatch(/afinidad agregada|ranking global|eligieron [0-9]|% de (la gente|los usuarios)/i);
  });
});

describe('licences', () => {
  it('code is MIT (Jorge Masta) and data CC BY 4.0, in the repo and in the footer of every page', () => {
    const licencia = readFileSync('LICENSE', 'utf8');
    expect(licencia).toMatch(/^MIT License/);
    expect(licencia).toMatch(/Copyright \(c\) 2026 Jorge Masta/);
    expect(JSON.parse(readFileSync('package.json', 'utf8')).license).toBe('MIT');
    expect(readFileSync('data/LICENSE.md', 'utf8')).toMatch(/CC BY 4\.0/);
    const pie = readFileSync('src/components/Pie.astro', 'utf8');
    expect(pie).toMatch(/licencia MIT/);
    expect(pie).toMatch(/CC BY 4\.0/);
    expect(pie).toMatch(/\/privacidad\//);
    // every page renders the shared footer (directly or through PaginaInfo)
    for (const f of ficheros('src/pages').filter((x) => x.endsWith('.astro'))) {
      expect(readFileSync(f, 'utf8'), f).toMatch(/<Pie\b|<PaginaInfo\b/);
    }
  });
});
