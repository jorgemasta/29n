// Test point A: the data pipeline, exercised only through procesarPrograma.
import { describe, expect, it } from 'vitest';
import { procesarPrograma, type OpcionesProceso } from '../src/pipeline';
import { crearIAFalsa, type RespuestasFalsas } from '../src/ia/falsa';
import { crearCacheEnMemoria } from '../src/ia/cache';
import { construirDataset, validarDataset } from '../src/dataset';
import { crearPdfDePrueba } from './fixtures/pdf';
import {
  partidoEjemplo,
  partidoOtro,
  posturaOtro,
  posturaTercero,
  temaVivienda,
  terceroPartido,
  terminosDePrueba,
} from './fixtures/registro';

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

const fiel = { anade: false, omite: false, cambiaSentido: false, explicacion: 'Fiel a la cita.' };

/** V12 does not confirm the absence: the second pass finds a proposal. */
const segundaPasadaEncuentra = { 'confirmar-ausencia': () => ({ propone: true, citas: [{ texto: CITA, pagina: 2 }] }) };

function respuestas(extra: Partial<RespuestasFalsas> = {}): RespuestasFalsas {
  return {
    'extraer-postura': () => ({ propone: true, citas: [{ texto: CITA, pagina: 2 }] }),
    neutralizar: () => neutroBueno,
    'verificar-fidelidad': () => fiel,
    'adivinar-partido': () => ({ asignaciones: [] }),
    'confirmar-ausencia': () => ({ propone: false, citas: [] }),
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
          ...segundaPasadaEncuentra,
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
          ...segundaPasadaEncuentra,
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

  describe('V10: fidelity to the quote', () => {
    it('an independent verifier gets the quotes and the neutral text, and an addition forces a rewrite', async () => {
      const anadido = { ...neutroBueno, cifra: '50.000 viviendas' };
      const { posturas, ia, informe } = await procesar(
        respuestas({
          neutralizar: (_e, intento) => (intento === 0 ? anadido : neutroBueno),
          'verificar-fidelidad': (entrada) =>
            entrada.texto.cifra
              ? { anade: true, omite: false, cambiaSentido: false, explicacion: 'La cifra de 50.000 viviendas no está en la cita.' }
              : fiel,
        }),
      );
      const verificaciones = ia.llamadas.filter((l) => l.tarea === 'verificar-fidelidad');
      expect(verificaciones[0]?.entrada).toEqual(expect.objectContaining({ citas: [{ texto: CITA, pagina: 2 }], texto: anadido }));
      const neutralizaciones = ia.llamadas.filter((l) => l.tarea === 'neutralizar');
      expect(neutralizaciones).toHaveLength(2);
      expect(JSON.stringify(neutralizaciones[1]?.entrada)).toContain('50.000 viviendas no está en la cita');
      expect(posturas[0]).toEqual(expect.objectContaining({ estado: 'propone', texto: neutroBueno }));
      expect(informe.entradas).toContainEqual(expect.objectContaining({ tema: 'vivienda', barrera: 'V10', resultado: 'reescribir' }));
      expect(informe.entradas).toContainEqual(expect.objectContaining({ tema: 'vivienda', barrera: 'V10', resultado: 'pasa' }));
    });

    it.each([
      ['omits an essential condition', { omite: true }],
      ['changes the meaning', { cambiaSentido: true }],
    ])('discards the postura when the text still %s after 2 rewrites', async (_caso, fallo) => {
      const { posturas, ia, informe } = await procesar(
        respuestas({ 'verificar-fidelidad': () => ({ ...fiel, ...fallo, explicacion: 'No es fiel.' }) }),
      );
      expect(ia.llamadas.filter((l) => l.tarea === 'neutralizar')).toHaveLength(3);
      expect(posturas[0]?.estado).toBe('sin_verificar');
      expect(informe.entradas).toContainEqual(expect.objectContaining({ tema: 'vivienda', barrera: 'V10', resultado: 'descartar' }));
    });

    it('never verifies a text that still has identifying marks (V3 first)', async () => {
      const { ia } = await procesar(
        respuestas({
          neutralizar: (_e, intento) => (intento === 0 ? { ...neutroBueno, que: 'La propuesta de OTP sobre el alquiler.' } : neutroBueno),
        }),
      );
      const verificados = ia.llamadas.filter((l) => l.tarea === 'verificar-fidelidad').map((l) => JSON.stringify(l.entrada));
      expect(verificados).toHaveLength(1);
      expect(verificados[0]).not.toContain('OTP');
    });
  });

  describe('V11: recognisability', () => {
    const publicado = { partidos: [partidoOtro, terceroPartido], posturas: [posturaOtro, posturaTercero] };
    /** Guesser that spots our postura (the one whose text is `delator`) with confidence `confianza`. */
    const adivina =
      (delator: string, confianza: number, rondas = Infinity) =>
      (entrada: any, intento: number) => ({
        asignaciones: entrada.posturas.map((p: { letra: string; texto: string }) => ({
          letra: p.letra,
          partido: p.texto.includes(delator) && intento < rondas ? 'pej' : 'otp',
          confianza,
          pista: 'Menciona las zonas tensionadas.',
        })),
      });

    it('the guesser sees every neutral postura of the topic, anonymous and in 3 different orders', async () => {
      const { ia } = await procesar(respuestas(), { publicado });
      const rondas = ia.llamadas.filter((l) => l.tarea === 'adivinar-partido');
      expect(rondas).toHaveLength(3);
      const entrada = rondas[0]!.entrada as any;
      expect(entrada.partidos.map((p: { id: string }) => p.id).sort()).toEqual(['otp', 'pej', 'ter']);
      expect(entrada.posturas).toHaveLength(3);
      for (const p of entrada.posturas) expect(Object.keys(p).sort()).toEqual(['letra', 'texto']);
      expect(JSON.stringify(entrada.posturas)).not.toMatch(/pej|otp|ter|Partido/);
      const ordenes = rondas.map((r) => (r.entrada as any).posturas.map((p: { texto: string }) => p.texto).join('|'));
      expect(new Set(ordenes).size).toBe(3);
    });

    it('rewrites a postura guessed 3 of 3 times with mean confidence ≥ 0.7, passing the clue', async () => {
      const otraVersion = { ...neutroBueno, que: 'Poner topes al alquiler en zonas con precios altos.' };
      const { posturas, ia, informe } = await procesar(
        respuestas({
          neutralizar: (_e, intento) => (intento === 0 ? neutroBueno : otraVersion),
          'adivinar-partido': adivina('zonas tensionadas', 0.8),
        }),
        { publicado },
      );
      const neutralizaciones = ia.llamadas.filter((l) => l.tarea === 'neutralizar');
      expect(neutralizaciones).toHaveLength(2);
      expect(JSON.stringify(neutralizaciones[1]?.entrada)).toContain('Menciona las zonas tensionadas.');
      expect(posturas[0]).toEqual(expect.objectContaining({ estado: 'propone', texto: otraVersion }));
      expect(informe.entradas).toContainEqual(expect.objectContaining({ barrera: 'V11', resultado: 'reescribir' }));
      expect(informe.entradas).toContainEqual(expect.objectContaining({ barrera: 'V11', resultado: 'pasa' }));
    });

    it('publishes with an internal warning when the postura is still recognisable after the rewrites', async () => {
      const { posturas, informe, publicable, ia } = await procesar(
        respuestas({ 'adivinar-partido': adivina('alquiler', 0.9) }),
        { publicado },
      );
      expect(ia.llamadas.filter((l) => l.tarea === 'neutralizar')).toHaveLength(3);
      expect(posturas[0]?.estado).toBe('propone');
      expect(informe.entradas).toContainEqual(expect.objectContaining({ barrera: 'V11', resultado: 'aviso' }));
      expect(informe.descartadas).toBe(0);
      expect(publicable).toBe(true);
    });

    it.each([
      ['mean confidence is below 0.7', adivina('alquiler', 0.6)],
      ['it is guessed only 2 of 3 times', adivina('alquiler', 0.9, 2)],
    ])('does not flag the postura when %s', async (_caso, adivinador) => {
      const { ia, informe } = await procesar(respuestas({ 'adivinar-partido': adivinador }), { publicado });
      expect(ia.llamadas.filter((l) => l.tarea === 'neutralizar')).toHaveLength(1);
      expect(informe.entradas).toContainEqual(expect.objectContaining({ barrera: 'V11', resultado: 'pasa' }));
    });

    it('skips the guesser when the party is the only one with a proposal on the topic', async () => {
      const { ia } = await procesar(respuestas());
      expect(ia.llamadas.filter((l) => l.tarea === 'adivinar-partido')).toHaveLength(0);
    });
  });

  describe('V12: confirmed absence', () => {
    const noPropone = { 'extraer-postura': () => ({ propone: false, citas: [] }) };

    it('extracts the postura when the second pass finds a proposal the first one missed', async () => {
      const { posturas, ia, informe } = await procesar(respuestas({ ...noPropone, ...segundaPasadaEncuentra }));
      const segunda = ia.llamadas.find((l) => l.tarea === 'confirmar-ausencia')!;
      // Only the keyword-matching fragments (page 2 talks about vivienda/alquiler) go to the AI.
      expect((segunda.entrada as any).paginas.map((p: { pagina: number }) => p.pagina)).toEqual([2]);
      expect(posturas[0]).toEqual(expect.objectContaining({ estado: 'propone', citas: [{ texto: CITA, pagina: 2 }] }));
      expect(informe.entradas).toContainEqual(expect.objectContaining({ barrera: 'V12', resultado: 'extraer' }));
    });

    it('marks "proposes nothing" when the targeted question confirms it, recording the terms searched', async () => {
      const { posturas, informe } = await procesar(respuestas(noPropone));
      expect(posturas[0]?.estado).toBe('no_propone');
      const entrada = informe.entradas.find((e) => e.barrera === 'V12')!;
      expect(entrada.resultado).toBe('pasa');
      expect(entrada.detalle).toContain('alquiler');
    });

    it('confirms the absence without asking the AI when no keyword appears in the programme', async () => {
      const pdf = await crearPdfDePrueba([['Pensiones', 'Revalorizaremos las pensiones con el IPC cada año.']]);
      const ia = crearIAFalsa(respuestas({ ...noPropone, ...segundaPasadaEncuentra }));
      const { posturas } = await procesarPrograma(pdf, partidoEjemplo, ia, opciones());
      expect(ia.llamadas.filter((l) => l.tarea === 'confirmar-ausencia')).toHaveLength(0);
      expect(posturas[0]?.estado).toBe('no_propone');
    });

    it('shows a discarded postura as "proposes nothing" only when V12 confirms it', async () => {
      const inventada = {
        'extraer-postura': () => ({
          propone: true,
          citas: [{ texto: 'Regalaremos una vivienda a cada joven que cumpla dieciocho años en todo el país.', pagina: 2 }],
        }),
      };
      const confirmada = await procesar(respuestas(inventada));
      expect(confirmada.posturas[0]?.estado).toBe('no_propone');
      expect(confirmada.informe.descartadas).toBe(1);

      const sinConfirmar = await procesar(respuestas({ ...inventada, ...segundaPasadaEncuentra }));
      expect(sinConfirmar.posturas[0]?.estado).toBe('sin_verificar');
    });

    it('a postura discarded after its quotes were verified stays "could not verify" (it does exist)', async () => {
      const { posturas, ia } = await procesar(
        respuestas({ neutralizar: () => ({ ...neutroBueno, que: 'La propuesta de OTP sobre el alquiler.' }) }),
      );
      expect(posturas[0]?.estado).toBe('sin_verificar');
      expect(ia.llamadas.filter((l) => l.tarea === 'confirmar-ausencia')).toHaveLength(0);
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
