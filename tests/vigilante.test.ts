// The programme watcher, exercised only through `vigilar` with fakes for fetching, the AI,
// git/deploy (`guardar`) and the phone notification (`avisar`). No network.
import { describe, expect, it } from 'vitest';
import { construirDataset, Dataset } from '../src/dataset';
import { crearIAFalsa, type RespuestasFalsas } from '../src/ia/falsa';
import { crearCacheEnMemoria } from '../src/ia/cache';
import { vigilar, type Aviso, type Cambio, type Descarga, type EstadoVigilante, type FuenteVigilada } from '../src/vigilante';
import { crearAvisoNtfy } from '../src/vigilante/ntfy';
import { crearPdfDePrueba } from './fixtures/pdf';
import { dominiosDePrueba, partidoEjemplo, temaVivienda, terminosDePrueba } from './fixtures/registro';

const CITA =
  'Limitaremos el precio del alquiler en las zonas tensionadas y ampliaremos el parque público de vivienda.';
const paginas = [['Programa electoral 2026'], ['Vivienda', CITA]];
const neutro = {
  que: 'Limitar por ley el precio del alquiler de vivienda en las zonas tensionadas del país.',
  como: 'Declarando esas zonas y ampliando además el parque público de vivienda disponible para alquilar.',
  cifra: null,
};
const razones = { competencia: 'a', coste: 'b', legal: 'c', precedentes: 'd', mayoria: 'e' };
const FUENTE_INE = { titulo: 'INE', url: 'https://www.ine.es/alquiler' };

function respuestas(extra: Partial<RespuestasFalsas> = {}): RespuestasFalsas {
  return {
    'extraer-postura': () => ({ propone: true, citas: [{ texto: CITA, pagina: 2 }] }),
    neutralizar: () => neutro,
    'evaluar-viabilidad': () => ({ nivel: 'viable', razones, porque: 'Es viable con una ley ordinaria.', fuentes: [FUENTE_INE] }),
    'verificar-fidelidad': () => ({ anade: false, omite: false, cambiaSentido: false, explicacion: '' }),
    'adivinar-partido': () => ({ asignaciones: [] }),
    'confirmar-ausencia': () => ({ propone: false, citas: [] }),
    'responder-pregunta': () => ({ menciona: false, que: '', como: '', cifra: null, citas: [] }),
    ...extra,
  };
}
/** An AI that invents the quote: V1 discards the only postura ⇒ the programme is blocked. */
const respuestasInventadas = () =>
  respuestas({
    'extraer-postura': () => ({
      propone: true,
      citas: [{ texto: 'Regalaremos una vivienda a cada joven que cumpla dieciocho años en todo el país.', pagina: 2 }],
    }),
  });

const { programa: _, ...registroPej } = partidoEjemplo;
const PAGINA_PEJ = 'https://ejemplo.org/elecciones';
const PDF_PEJ = 'https://ejemplo.org/docs/programa-29n.pdf';
const AGREGADOR = 'https://agregador.example/programas-29n';

const datasetInicial = (): Dataset =>
  construirDataset({ partidos: [], temas: [temaVivienda], resultados: [], generado: '2026-11-01T00:00:00.000Z', origen: 'simulado' });

function html(...enlaces: string[]) {
  return `<html><body>${enlaces.map((e) => `<a href="${e}">enlace</a>`).join('\n')}</body></html>`;
}

/** Fake web: url → page or PDF; anything else fails like a network error. */
function crearWeb(paginasWeb: Record<string, string | Uint8Array>) {
  const pedidas: string[] = [];
  const descargar = async (url: string): Promise<Descarga> => {
    pedidas.push(url);
    const r = paginasWeb[url];
    if (r === undefined) throw new Error(`HTTP 404 ${url}`);
    return typeof r === 'string' ? { tipo: 'html', texto: r } : { tipo: 'pdf', bytes: r };
  };
  return { descargar, pedidas, paginas: paginasWeb };
}

async function montar(o: {
  web: Record<string, string | Uint8Array>;
  respuestas?: RespuestasFalsas;
  fuentes?: FuenteVigilada[];
  falloGuardar?: boolean;
  falloAviso?: boolean;
}) {
  const web = crearWeb(o.web);
  const guardados: Cambio[] = [];
  const avisos: Aviso[] = [];
  const ia = crearIAFalsa(o.respuestas ?? respuestas());
  const cache = crearCacheEnMemoria();
  let dataset = datasetInicial();
  let estado: EstadoVigilante = {};
  const ejecutar = async (opc: { partido?: string; forzar?: boolean } = {}) => {
    const r = await vigilar(
      { dataset, estado, fuentes: o.fuentes ?? [{ partido: 'pej', url: PAGINA_PEJ }], partidos: { pej: registroPej } },
      {
        descargar: web.descargar,
        ia,
        cache,
        guardar: async (c) => {
          if (o.falloGuardar && c.desplegar) throw new Error('wrangler deploy: 500');
          guardados.push(c);
        },
        avisar: async (a) => {
          if (o.falloAviso) throw new Error('ntfy caído');
          avisos.push(a);
        },
        ahora: () => new Date('2026-11-08T10:00:00Z'),
      },
      {
        ...opc,
        proceso: { temas: [temaVivienda], terminos: terminosDePrueba, dominios: dominiosDePrueba, comprobarUrl: async () => true },
      },
    );
    dataset = r.dataset;
    estado = r.estado;
    return r;
  };
  return { ejecutar, web, guardados, avisos, ia, get dataset() { return dataset; }, get estado() { return estado; } };
}

const pdf = () => crearPdfDePrueba(paginas);
const json = (c: Cambio | undefined, ruta: string) => JSON.parse(c?.archivos[ruta] ?? 'null');

describe('vigilar', () => {
  it('detects a new programme linked from the official page, publishes it and notifies', async () => {
    const m = await montar({ web: { [PAGINA_PEJ]: html('/docs/programa-29n.pdf', '/estatutos.html'), [PDF_PEJ]: await pdf() } });
    const r = await m.ejecutar();

    expect(r.resultados).toEqual([expect.objectContaining({ partido: 'pej', resultado: 'publicado', url: PDF_PEJ })]);
    expect(m.guardados).toHaveLength(1);
    const cambio = m.guardados[0]!;
    expect(cambio.desplegar).toBe(true);
    const ds = Dataset.parse(json(cambio, 'data/dataset.json'));
    expect(ds.origen).toBe('real');
    expect(ds.partidos).toEqual([
      expect.objectContaining({ id: 'pej', programa: expect.objectContaining({ url: PDF_PEJ, hashPdf: expect.stringMatching(/^[0-9a-f]{64}$/) }) }),
    ]);
    expect(ds.posturas).toEqual([expect.objectContaining({ partido: 'pej', tema: 'vivienda', estado: 'propone' })]);
    expect(json(cambio, 'data/informes/pej.json')).toEqual(expect.objectContaining({ partido: 'pej', publicable: true }));
    // Page text for the live free question, from the same PDF.
    expect(json(cambio, 'public/textos/pej.json')).toEqual({ partido: 'pej', hashPdf: ds.partidos[0]!.programa.estado === 'publicado' ? ds.partidos[0]!.programa.hashPdf : '', paginas: expect.any(Array) });
    expect(m.dataset).toEqual(ds);
    expect(m.avisos).toEqual([expect.objectContaining({ tipo: 'publicado', titulo: expect.stringContaining('PEJ') })]);
  });

  it('does nothing when the PDF has not changed (same hash)', async () => {
    const m = await montar({ web: { [PAGINA_PEJ]: html(PDF_PEJ), [PDF_PEJ]: await pdf() } });
    await m.ejecutar();
    const llamadas = m.ia.llamadas.length;
    const r = await m.ejecutar();

    expect(r.resultados).toEqual([expect.objectContaining({ partido: 'pej', resultado: 'sin_cambios' })]);
    expect(m.ia.llamadas).toHaveLength(llamadas);
    expect(m.guardados).toHaveLength(1);
    expect(m.avisos).toHaveLength(1);
  });

  it('reprocesses a programme whose PDF changed', async () => {
    const m = await montar({ web: { [PAGINA_PEJ]: html(PDF_PEJ), [PDF_PEJ]: await pdf() } });
    await m.ejecutar();
    const hashAntes = m.estado.pej?.hash;
    m.web.paginas[PDF_PEJ] = await crearPdfDePrueba([...paginas, ['Anexo: fe de erratas']]);
    const r = await m.ejecutar();

    expect(r.resultados[0]?.resultado).toBe('publicado');
    expect(m.estado.pej?.hash).not.toBe(hashAntes);
    expect(m.guardados).toHaveLength(2);
  });

  it('accepts a source that is the PDF itself', async () => {
    const m = await montar({ web: { [PDF_PEJ]: await pdf() }, fuentes: [{ partido: 'pej', url: PDF_PEJ }] });
    const r = await m.ejecutar();
    expect(r.resultados[0]?.resultado).toBe('publicado');
  });

  it('finds the programme on an aggregator, ignoring links outside the party’s official domains', async () => {
    const m = await montar({
      web: {
        [AGREGADOR]: html('https://agregador.example/copias/pej.pdf', 'https://otro-partido.es/programa.pdf', PDF_PEJ),
        [PDF_PEJ]: await pdf(),
      },
      fuentes: [{ partido: 'pej', url: AGREGADOR }],
    });
    const r = await m.ejecutar();
    expect(r.resultados[0]).toEqual(expect.objectContaining({ resultado: 'publicado', url: PDF_PEJ }));
    expect(m.web.pedidas).not.toContain('https://agregador.example/copias/pej.pdf');
    expect(m.web.pedidas).not.toContain('https://otro-partido.es/programa.pdf');
  });

  it('uses the source’s pattern to pick the programme among several PDFs', async () => {
    const m = await montar({
      web: { [PAGINA_PEJ]: html('https://ejemplo.org/docs/estatutos.pdf', PDF_PEJ), [PDF_PEJ]: await pdf() },
      fuentes: [{ partido: 'pej', url: PAGINA_PEJ, patron: 'programa' }],
    });
    const r = await m.ejecutar();
    expect(r.resultados[0]?.url).toBe(PDF_PEJ);
    expect(m.web.pedidas).not.toContain('https://ejemplo.org/docs/estatutos.pdf');
  });

  it('reports a party with no programme found yet without notifying', async () => {
    const m = await montar({ web: { [PAGINA_PEJ]: html('/noticias.html') } });
    const r = await m.ejecutar();
    expect(r.resultados).toEqual([expect.objectContaining({ partido: 'pej', resultado: 'sin_programa' })]);
    expect(m.avisos).toEqual([]);
    expect(m.guardados).toEqual([]);
  });

  describe('a blocked programme', () => {
    it('publishes nothing of that party, keeps the previous state and notifies the reason', async () => {
      const m = await montar({ web: { [PAGINA_PEJ]: html(PDF_PEJ), [PDF_PEJ]: await pdf() }, respuestas: respuestasInventadas() });
      const antes = m.dataset;
      const r = await m.ejecutar();

      expect(r.resultados[0]?.resultado).toBe('bloqueado');
      expect(m.dataset).toEqual(antes);
      expect(m.guardados).toHaveLength(1);
      expect(m.guardados[0]?.desplegar).toBe(false);
      expect(Object.keys(m.guardados[0]!.archivos)).not.toContain('data/dataset.json');
      expect(Object.keys(m.guardados[0]!.archivos)).not.toContain('data/informes/pej.json');
      expect(Object.keys(m.guardados[0]!.archivos)).not.toContain('public/textos/pej.json');
      expect(json(m.guardados[0], 'data/informes/bloqueados/pej.json')).toEqual(expect.objectContaining({ publicable: false }));
      expect(m.avisos).toEqual([expect.objectContaining({ tipo: 'fallo', mensaje: expect.stringContaining('descart') })]);
    });

    it('keeps an already published version of the party intact', async () => {
      let inventa = false;
      const buenas = respuestas();
      const malas = respuestasInventadas();
      const m = await montar({
        web: { [PAGINA_PEJ]: html(PDF_PEJ), [PDF_PEJ]: await pdf() },
        respuestas: { ...buenas, 'extraer-postura': (e, i) => (inventa ? malas : buenas)['extraer-postura'](e, i) },
      });
      await m.ejecutar();
      const publicado = m.dataset;
      // A new PDF whose extraction now fails verification.
      m.web.paginas[PDF_PEJ] = await crearPdfDePrueba([...paginas, ['Versión 2']]);
      inventa = true;
      const r = await m.ejecutar();

      expect(r.resultados[0]?.resultado).toBe('bloqueado');
      expect(m.dataset).toEqual(publicado);
    });

    it('is not reprocessed (nor notified again) until its PDF changes', async () => {
      const m = await montar({ web: { [PAGINA_PEJ]: html(PDF_PEJ), [PDF_PEJ]: await pdf() }, respuestas: respuestasInventadas() });
      await m.ejecutar();
      const r = await m.ejecutar();
      expect(r.resultados[0]?.resultado).toBe('sin_cambios');
      expect(m.avisos).toHaveLength(1);
    });
  });

  it('notifies a failure with its reason and retries on the next run when the pipeline crashes', async () => {
    let caida = true;
    const base = respuestas();
    const m = await montar({
      web: { [PAGINA_PEJ]: html(PDF_PEJ), [PDF_PEJ]: await pdf() },
      respuestas: {
        ...base,
        'extraer-postura': (e, i) => {
          if (caida) throw new Error('API de Anthropic: 529 overloaded');
          return base['extraer-postura'](e, i);
        },
      },
    });
    const r = await m.ejecutar();
    expect(r.resultados[0]?.resultado).toBe('error');
    expect(m.avisos).toEqual([expect.objectContaining({ tipo: 'fallo', mensaje: expect.stringContaining('529 overloaded') })]);
    expect(m.guardados).toEqual([]);
    expect(m.estado).toEqual({});

    caida = false;
    expect((await m.ejecutar()).resultados[0]?.resultado).toBe('publicado');
  });

  it('notifies a failed deploy and leaves the previous dataset', async () => {
    const m = await montar({ web: { [PAGINA_PEJ]: html(PDF_PEJ), [PDF_PEJ]: await pdf() }, falloGuardar: true });
    const antes = m.dataset;
    const r = await m.ejecutar();
    expect(r.resultados[0]?.resultado).toBe('error');
    expect(m.dataset).toEqual(antes);
    expect(m.estado).toEqual({});
    expect(m.avisos).toEqual([expect.objectContaining({ tipo: 'fallo', mensaje: expect.stringContaining('wrangler deploy: 500') })]);
  });

  it('still publishes when the phone notification cannot be delivered', async () => {
    const m = await montar({ web: { [PAGINA_PEJ]: html(PDF_PEJ), [PDF_PEJ]: await pdf() }, falloAviso: true });
    const r = await m.ejecutar();
    expect(r.resultados[0]?.resultado).toBe('publicado');
    expect(r.erroresAviso).toEqual([expect.stringContaining('ntfy caído')]);
  });

  it('keeps watching the other parties when one source is unreachable', async () => {
    const m = await montar({
      web: { [PDF_PEJ]: await pdf() },
      fuentes: [
        { partido: 'pej', url: 'https://ejemplo.org/caida' },
        { partido: 'pej', url: PDF_PEJ },
      ],
    });
    const r = await m.ejecutar();
    expect(r.resultados).toEqual([expect.objectContaining({ partido: 'pej', resultado: 'publicado' })]);
    expect(r.erroresFuente).toEqual([expect.objectContaining({ url: 'https://ejemplo.org/caida', error: expect.stringContaining('404') })]);
  });

  describe('manual relaunch', () => {
    it('reprocesses one party on demand even if its PDF has not changed, with the same result', async () => {
      const m = await montar({ web: { [PAGINA_PEJ]: html(PDF_PEJ), [PDF_PEJ]: await pdf() } });
      await m.ejecutar();
      const primero = m.dataset;
      const r = await m.ejecutar({ partido: 'pej', forzar: true });

      expect(r.resultados[0]?.resultado).toBe('publicado');
      expect(m.guardados).toHaveLength(2);
      // Cached AI answers ⇒ same posturas and notes.
      expect(m.dataset.posturas).toEqual(primero.posturas);
    });

    it('only looks at that party’s sources', async () => {
      const m = await montar({
        web: { [PAGINA_PEJ]: html(PDF_PEJ), [PDF_PEJ]: await pdf() },
        fuentes: [
          { partido: 'pej', url: PAGINA_PEJ },
          { partido: 'otro', url: 'https://otro-partido.es/programa' },
        ],
      });
      await m.ejecutar({ partido: 'pej' });
      expect(m.web.pedidas).not.toContain('https://otro-partido.es/programa');
    });

    it('rejects an unknown party', async () => {
      const m = await montar({ web: {} });
      await expect(m.ejecutar({ partido: 'nadie' })).rejects.toThrow(/nadie/);
    });
  });
});

describe('crearAvisoNtfy', () => {
  it('publishes the notice to the secret topic, high priority for failures', async () => {
    const pedidas: { url: string; init: RequestInit }[] = [];
    const avisar = crearAvisoNtfy({
      topic: 'tema-secreto',
      token: 'tk',
      fetch: (async (url: string, init: RequestInit) => {
        pedidas.push({ url, init });
        return new Response('{}', { status: 200 });
      }) as typeof fetch,
    });
    await avisar({ tipo: 'fallo', titulo: '29N: programa de PEJ bloqueado', mensaje: 'V1: cita inventada' });

    expect(pedidas[0]?.url).toBe('https://ntfy.sh');
    expect((pedidas[0]?.init.headers as Record<string, string>).authorization).toBe('Bearer tk');
    expect(JSON.parse(String(pedidas[0]?.init.body))).toEqual(
      expect.objectContaining({ topic: 'tema-secreto', title: '29N: programa de PEJ bloqueado', message: 'V1: cita inventada', priority: 4 }),
    );
  });

  it('fails loudly when ntfy rejects the notice', async () => {
    const avisar = crearAvisoNtfy({ topic: 't', fetch: (async () => new Response('', { status: 429 })) as unknown as typeof fetch });
    await expect(avisar({ tipo: 'publicado', titulo: 't', mensaje: 'm' })).rejects.toThrow(/429/);
  });
});
