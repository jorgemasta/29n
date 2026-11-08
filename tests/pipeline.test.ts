// Test point A: the data pipeline, exercised only through procesarPrograma.
import { describe, expect, it } from 'vitest';
import { procesarPrograma, type OpcionesProceso } from '../src/pipeline';
import { crearIAFalsa, type RespuestasFalsas } from '../src/ia/falsa';
import { crearCacheEnMemoria } from '../src/ia/cache';
import { construirDataset, validarDataset } from '../src/dataset';
import { crearPdfDePrueba } from './fixtures/pdf';
import { partidoEjemplo, temaVivienda, terminosDePrueba } from './fixtures/registro';

const CITA =
  'Limitaremos el precio del alquiler en las zonas tensionadas y ampliaremos el parque público de vivienda.';

const paginas = [
  ['Programa electoral 2026', 'Índice'],
  [
    'Vivienda',
    'Limitaremos el precio del alqui-',
    'ler en las zonas tensionadas y ampliaremos el parque público de vivienda.',
  ],
  ['Pensiones', 'Revalorizaremos las pensiones con el IPC cada año.'],
];

const neutroBueno = {
  que: 'Limitar el precio del alquiler en zonas tensionadas.',
  como: 'Ampliando además el parque público de vivienda.',
  cifra: null,
};

function respuestas(extra: Partial<RespuestasFalsas> = {}): RespuestasFalsas {
  return {
    'extraer-postura': () => ({ propone: true, citas: [{ texto: CITA, pagina: 2 }] }),
    neutralizar: () => neutroBueno,
    ...extra,
  };
}

const opciones = (o: Partial<OpcionesProceso> = {}): OpcionesProceso => ({
  temas: [temaVivienda],
  terminos: terminosDePrueba,
  ...o,
});

async function procesar(r: RespuestasFalsas, o: Partial<OpcionesProceso> = {}) {
  const pdf = await crearPdfDePrueba(paginas);
  const ia = crearIAFalsa(r);
  const resultado = await procesarPrograma(pdf, partidoEjemplo, ia, opciones(o));
  return { ...resultado, ia };
}

describe('procesarPrograma', () => {
  it('turns a programme into a verified, neutral postura with its literal quote', async () => {
    const { posturas, informe, publicable } = await procesar(respuestas());

    expect(publicable).toBe(true);
    expect(posturas).toEqual([
      expect.objectContaining({
        partido: 'pej',
        tema: 'vivienda',
        estado: 'propone',
        texto: neutroBueno,
        citas: [{ texto: CITA, pagina: 2 }],
      }),
    ]);
    expect(informe.partido).toBe('pej');
    expect(informe.hashPdf).toMatch(/^[0-9a-f]{64}$/);
    expect(informe.descartadas).toBe(0);
  });

  it('records when a party proposes nothing on a topic', async () => {
    const { posturas, publicable } = await procesar(
      respuestas({ 'extraer-postura': () => ({ propone: false, citas: [] }) }),
    );
    expect(posturas).toEqual([expect.objectContaining({ tema: 'vivienda', estado: 'no_propone' })]);
    expect(publicable).toBe(true);
  });

  describe('V1: the quote exists in the PDF', () => {
    it('discards a postura whose quote was invented by the AI', async () => {
      const { posturas, informe, publicable } = await procesar(
        respuestas({
          'extraer-postura': () => ({
            propone: true,
            citas: [{ texto: 'Regalaremos una vivienda a cada joven que cumpla dieciocho años en todo el país.', pagina: 2 }],
          }),
        }),
      );
      expect(posturas).toEqual([expect.objectContaining({ tema: 'vivienda', estado: 'sin_verificar' })]);
      expect(informe.descartadas).toBe(1);
      expect(informe.entradas).toContainEqual(
        expect.objectContaining({ tema: 'vivienda', barrera: 'V1', resultado: 'descartar' }),
      );
      expect(publicable).toBe(false);
    });

    it('accepts a quote split by an end-of-line hyphen (the PDF reads "alqui-" / "ler")', async () => {
      const { posturas } = await procesar(respuestas());
      expect(posturas[0]?.estado).toBe('propone');
    });

    it('accepts a quote whose typographic quotes and spacing differ from the PDF', async () => {
      const pdf = await crearPdfDePrueba([
        ['Defenderemos el «derecho a la vivienda» como un', 'derecho   fundamental exigible ante los tribunales.'],
      ]);
      const ia = crearIAFalsa(
        respuestas({
          'extraer-postura': () => ({
            propone: true,
            citas: [
              {
                texto: 'Defenderemos el "derecho a la vivienda" como un derecho fundamental exigible ante los tribunales.',
                pagina: 1,
              },
            ],
          }),
        }),
      );
      const { posturas } = await procesarPrograma(pdf, partidoEjemplo, ia, opciones());
      expect(posturas[0]?.estado).toBe('propone');
    });

    it('rejects quotes shorter than 40 characters', async () => {
      const { posturas } = await procesar(
        respuestas({
          'extraer-postura': () => ({ propone: true, citas: [{ texto: 'parque público de vivienda', pagina: 2 }] }),
        }),
      );
      expect(posturas[0]?.estado).toBe('sin_verificar');
    });

    it('fixes the page number when the quote is on another page', async () => {
      const { posturas } = await procesar(
        respuestas({ 'extraer-postura': () => ({ propone: true, citas: [{ texto: CITA, pagina: 3 }] }) }),
      );
      expect(posturas[0]).toEqual(expect.objectContaining({ citas: [{ texto: CITA, pagina: 2 }] }));
    });
  });

  describe('V3: no identifying marks', () => {
    it('rewrites a neutral text that names any party leader, telling the AI what to avoid', async () => {
      const { posturas, ia, informe } = await procesar(
        respuestas({
          neutralizar: (_entrada, intento) =>
            intento === 0 ? { ...neutroBueno, como: 'Como propone Bruno Jefe, ampliando el parque público.' } : neutroBueno,
        }),
      );
      expect(posturas[0]).toEqual(expect.objectContaining({ estado: 'propone', texto: neutroBueno }));
      const llamadas = ia.llamadas.filter((l) => l.tarea === 'neutralizar');
      expect(llamadas).toHaveLength(2);
      expect(JSON.stringify(llamadas[1]?.entrada)).toContain('Bruno Jefe');
      expect(informe.entradas).toContainEqual(
        expect.objectContaining({ tema: 'vivienda', barrera: 'V3', resultado: 'reescribir' }),
      );
    });

    it('matches acronyms ignoring case and accents ("Ana Lider", "pej")', async () => {
      const { posturas } = await procesar(
        respuestas({
          neutralizar: (_e, intento) =>
            intento === 0
              ? { ...neutroBueno, que: 'Lo que pej y ana lider proponen para el alquiler.' }
              : neutroBueno,
        }),
      );
      expect(posturas[0]?.estado).toBe('propone');
    });

    it('does not flag words that merely contain an acronym', async () => {
      const { ia } = await procesar(
        respuestas({ neutralizar: () => ({ ...neutroBueno, como: 'Con un plan espejo del modelo vienés y sin topes.' }) }),
      );
      expect(ia.llamadas.filter((l) => l.tarea === 'neutralizar')).toHaveLength(1);
    });

    it('discards the postura after 2 failed rewrites', async () => {
      const { posturas, ia, informe } = await procesar(
        respuestas({ neutralizar: () => ({ ...neutroBueno, que: 'La propuesta de OTP sobre el alquiler.' }) }),
      );
      expect(ia.llamadas.filter((l) => l.tarea === 'neutralizar')).toHaveLength(3);
      expect(posturas[0]?.estado).toBe('sin_verificar');
      expect(informe.entradas).toContainEqual(
        expect.objectContaining({ tema: 'vivienda', barrera: 'V3', resultado: 'descartar' }),
      );
    });
  });

  describe('V9: schema', () => {
    it('produces a dataset that validates against the schema', async () => {
      const { posturas, informe } = await procesar(respuestas());
      const dataset = construirDataset({
        partidos: [partidoEjemplo],
        temas: [temaVivienda],
        resultados: [{ posturas, informe }],
        generado: '2026-11-08T00:00:00.000Z',
        origen: 'prueba',
      });
      expect(validarDataset(dataset)).toEqual({ valido: true, errores: [] });
    });

    it('rejects a dataset with two states for the same party and topic', async () => {
      const { posturas, informe } = await procesar(respuestas());
      const dataset = construirDataset({
        partidos: [partidoEjemplo],
        temas: [temaVivienda],
        resultados: [{ posturas: [...posturas, ...posturas], informe }],
        generado: '2026-11-08T00:00:00.000Z',
        origen: 'prueba',
      });
      expect(validarDataset(dataset).valido).toBe(false);
    });

    it('rejects malformed data', () => {
      expect(validarDataset({ partidos: 'nope' }).valido).toBe(false);
    });
  });

  describe('AI cache', () => {
    it('reuses cached AI answers keyed by PDF hash, prompt version and input', async () => {
      const cache = crearCacheEnMemoria();
      const primera = await procesar(respuestas(), { cache });
      expect(primera.ia.llamadas.length).toBeGreaterThan(0);

      const segunda = await procesar(respuestas(), { cache });
      expect(segunda.ia.llamadas).toHaveLength(0);
      expect(segunda.posturas).toEqual(primera.posturas);
      expect(segunda.informe).toEqual(primera.informe);
    });

    it('misses the cache when the prompt version changes', async () => {
      const cache = crearCacheEnMemoria();
      await procesar(respuestas(), { cache });
      const otra = await procesar(respuestas(), { cache, versionPrompt: 'otra' });
      expect(otra.ia.llamadas.length).toBeGreaterThan(0);
    });

    it('misses the cache when the PDF changes', async () => {
      const cache = crearCacheEnMemoria();
      await procesar(respuestas(), { cache });
      const pdf = await crearPdfDePrueba([...paginas, ['Una página más']]);
      const ia = crearIAFalsa(respuestas());
      await procesarPrograma(pdf, partidoEjemplo, ia, opciones({ cache }));
      expect(ia.llamadas.length).toBeGreaterThan(0);
    });
  });
});
