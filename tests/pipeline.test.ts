// Test point A: the data pipeline, exercised only through procesarPrograma.
import { describe, expect, it } from 'vitest';
import { procesarPrograma, type OpcionesProceso } from '../src/pipeline';
import { fusionarPrograma } from '../src/pipeline/publicar';
import { crearIAFalsa, type RespuestasFalsas } from '../src/ia/falsa';
import { crearCacheEnMemoria } from '../src/ia/cache';
import { construirDataset, validarDataset } from '../src/dataset';
import { crearPdfDePrueba } from './fixtures/pdf';
import {
  dominiosDePrueba,
  partidoEjemplo,
  partidoOtro,
  posturaOtro,
  posturaTercero,
  temaVivienda,
  terceroPartido,
  terminosDePrueba,
} from './fixtures/registro';
import { VERSION_RUBRICA } from '../src/registro/rubrica';
import type { Informe, Postura, Tema } from '../src/dataset/esquema';

/** Rewrites recorded in the verification report for a topic (default: the only one). */
const reescrituras = (informe: { posturas: { tema: string; reescrituras: number }[] }, tema = 'vivienda') =>
  informe.posturas.find((p) => p.tema === tema)?.reescrituras;
/** Fake AI behaviour: answers `bien` only once the request mentions `pista` (the feedback reached it), else `mal`. */
const corrigeCon =
  <T,>(pista: string | RegExp, mal: T, bien: T) =>
  (entrada: unknown) => {
    const recibido = JSON.stringify(entrada);
    return (typeof pista === 'string' ? recibido.includes(pista) : pista.test(recibido)) ? bien : mal;
  };

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

// 15 + 14 = 29 words: inside V5's 25–70 range.
const neutroBueno = {
  que: 'Limitar por ley el precio del alquiler de vivienda en las zonas tensionadas del país.',
  como: 'Declarando esas zonas y ampliando además el parque público de vivienda disponible para alquilar.',
  cifra: null,
};

const FUENTE_INE = { titulo: 'INE: Índice de precios de vivienda en alquiler', url: 'https://www.ine.es/alquiler' };
const FUENTE_BOE = { titulo: 'BOE: Ley 12/2023 por el derecho a la vivienda', url: 'https://www.boe.es/eli/es/l/2023/05/24/12' };

const razones = {
  competencia: 'La vivienda es competencia autonómica; el Estado fija bases.',
  coste: 'Coste bajo para el Estado; el parque público requiere inversión.',
  legal: 'La ley estatal de vivienda ya prevé zonas tensionadas.',
  precedentes: 'Hay precedentes en Cataluña y en otros países europeos.',
  mayoria: 'Basta una ley ordinaria.',
};

function evaluacion(nivel: string, extra: Record<string, unknown> = {}) {
  return { nivel, razones, porque: `Evaluada como ${nivel}. Depende de las comunidades.`, fuentes: [FUENTE_INE], ...extra };
}
const fiel = { anade: false, omite: false, cambiaSentido: false, explicacion: 'Fiel a la cita.' };

/** V12 does not confirm the absence: the second pass finds a proposal. */
const segundaPasadaEncuentra = { 'confirmar-ausencia': () => ({ propone: true, citas: [{ texto: CITA, pagina: 2 }] }) };
/** A neutral text of exactly `n` words (V5). */
const textoDe = (n: number) => ({ que: palabras(n - 1), como: 'fin.', cifra: null });
/** A published postura of another party on the topic, `n` words long. */
const publicadaDe = (partido: string, n: number): Postura => ({ ...(posturaOtro as Extract<Postura, { estado: 'propone' }>), partido, texto: textoDe(n) });
/** Minimal report of a party already in the published dataset. */
const informeDe = (partido: string): Informe => ({
  partido,
  hashPdf: 'a'.repeat(64),
  versionPrompt: 'v1',
  extraidas: 1,
  descartadas: 0,
  publicable: true,
  posturas: [{ tema: 'vivienda', estado: 'propone', reescrituras: 0 }],
  entradas: [],
});
const palabras = (n: number) => Array.from({ length: n }, (_, i) => `palabra${String.fromCharCode(97 + (i % 26))}`).join(' ');

function respuestas(extra: Partial<RespuestasFalsas> = {}): RespuestasFalsas {
  return {
    'extraer-postura': () => ({ propone: true, citas: [{ texto: CITA, pagina: 2 }] }),
    neutralizar: () => neutroBueno,
    'evaluar-viabilidad': () => evaluacion('viable_con_matices'),
    'verificar-fidelidad': () => fiel,
    'adivinar-partido': () => ({ asignaciones: [] }),
    'confirmar-ausencia': () => ({ propone: false, citas: [] }),
    'responder-pregunta': () => ({ menciona: false, que: '', como: '', cifra: null, citas: [] }),
    ...extra,
  };
}

const opciones = (o: Partial<OpcionesProceso> = {}): OpcionesProceso => ({
  temas: [temaVivienda],
  terminos: terminosDePrueba,
  // V8 checks HTTP 200; tests never hit the network.
  comprobarUrl: async () => true,
  dominios: dominiosDePrueba,
  // Suggested questions are tested on their own (see "suggested questions").
  preguntas: [],
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

  it('publishes the page text of the programme, for the live free question (#15)', async () => {
    const { texto, informe } = await procesar(respuestas());
    expect(texto).toEqual({ partido: 'pej', hashPdf: informe.hashPdf, paginas: expect.any(Array) });
    expect(texto!.paginas).toHaveLength(paginas.length);
    expect(texto!.paginas[1]).toContain('Limitaremos el precio');
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
      // The fake AI only drops the leader's name once it is told to avoid it.
      const { posturas, informe } = await procesar(
        respuestas({
          neutralizar: corrigeCon('Bruno Jefe', { ...neutroBueno, como: 'Como propone Bruno Jefe, ampliando el parque público.' }, neutroBueno),
        }),
      );
      expect(posturas[0]).toEqual(expect.objectContaining({ estado: 'propone', texto: neutroBueno }));
      expect(reescrituras(informe)).toBe(1);
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
      const { informe } = await procesar(
        respuestas({ neutralizar: () => ({ ...neutroBueno, como: 'Con un plan espejo del modelo vienés y sin topes.' }) }),
      );
      expect(reescrituras(informe)).toBe(0);
    });

    it('discards the postura after 2 failed rewrites', async () => {
      const { posturas, informe } = await procesar(
        respuestas({ neutralizar: () => ({ ...neutroBueno, que: 'La propuesta de OTP sobre el alquiler.' }) }),
      );
      expect(reescrituras(informe)).toBe(2);
      expect(posturas[0]?.estado).toBe('sin_verificar');
      expect(informe.entradas).toContainEqual(
        expect.objectContaining({ tema: 'vivienda', barrera: 'V3', resultado: 'descartar' }),
      );
    });
  });

  describe('V13: double-blind feasibility', () => {
    const viabilidad = async (r: RespuestasFalsas, o: Partial<OpcionesProceso> = {}) => {
      const res = await procesar(r, o);
      const p = res.posturas[0];
      if (p?.estado !== 'propone' || !p.viabilidad) throw new Error('sin nota de viabilidad');
      return { ...res, nota: p.viabilidad };
    };

    it('publishes the level when both evaluations agree, with reasons per criterion and versions', async () => {
      const { nota } = await viabilidad(respuestas());
      expect(nota.resultado).toBe('viable_con_matices');
      expect(nota.porque).toBe('Evaluada como viable_con_matices. Depende de las comunidades.');
      expect(nota.fuentes).toEqual([FUENTE_INE]);
      expect(nota.evaluaciones).toHaveLength(2);
      for (const e of nota.evaluaciones) expect(Object.keys(e.razones).sort()).toEqual(['competencia', 'coste', 'legal', 'mayoria', 'precedentes']);
      expect(nota.versiones).toEqual({ prompt: expect.any(String), rubrica: VERSION_RUBRICA });
    });

    it('never tells the evaluators which party the proposal is from', async () => {
      const citaConMarca =
        'Partido Ejemplo limitará el precio del alquiler en las zonas tensionadas, como ha dicho Ana Líder.';
      const pdf = await crearPdfDePrueba([['Vivienda', citaConMarca]]);
      const ia = crearIAFalsa(
        respuestas({ 'extraer-postura': () => ({ propone: true, citas: [{ texto: citaConMarca, pagina: 1 }] }) }),
      );
      await procesarPrograma(pdf, partidoEjemplo, ia, opciones());
      const llamadas = ia.llamadas.filter((l) => l.tarea === 'evaluar-viabilidad');
      expect(llamadas).toHaveLength(2);
      for (const l of llamadas) {
        const recibido = JSON.stringify(l.entrada) + l.instrucciones;
        expect(recibido).not.toMatch(/partido ejemplo|ana l[ií]der|\bpej\b/i);
        // It does get the neutral text and the (masked) quote.
        expect(recibido).toContain(neutroBueno.que);
        expect(recibido).toContain('limitará el precio del alquiler en las zonas tensionadas');
      }
    });

    it('publishes "sin concreción" when both evaluations say so', async () => {
      const { nota } = await viabilidad(
        respuestas({ 'evaluar-viabilidad': () => evaluacion('sin_concrecion', { fuentes: [] }) }),
      );
      expect(nota.resultado).toBe('sin_concrecion');
    });

    it('publishes "sin consenso" with both arguments when the evaluations disagree', async () => {
      const { nota, informe } = await viabilidad(
        respuestas({ 'evaluar-viabilidad': (e) => evaluacion(e.evaluacion === 1 ? 'viable' : 'dificil') }),
      );
      expect(nota.resultado).toBe('sin_consenso');
      expect(nota.porque).toBeNull();
      expect(nota.evaluaciones.map((e) => [e.nivel, e.porque])).toEqual([
        ['viable', 'Evaluada como viable. Depende de las comunidades.'],
        ['dificil', 'Evaluada como dificil. Depende de las comunidades.'],
      ]);
      expect(informe.entradas).toContainEqual(expect.objectContaining({ barrera: 'V13', detalle: expect.stringContaining('sin consenso') }));
    });

    it('keeps the two evaluations independent when answers come from the cache', async () => {
      const cache = crearCacheEnMemoria();
      const r = respuestas({ 'evaluar-viabilidad': (e) => evaluacion(e.evaluacion === 1 ? 'viable' : 'dificil') });
      const primera = await viabilidad(r, { cache });
      const segunda = await viabilidad(r, { cache });
      expect(segunda.ia.llamadas).toHaveLength(0);
      expect(segunda.nota).toEqual(primera.nota);
      expect(segunda.nota.resultado).toBe('sin_consenso');
    });
  });

  describe('V8: feasibility sources', () => {
    const viabilidad = async (r: RespuestasFalsas, o: Partial<OpcionesProceso> = {}) => {
      const res = await procesar(r, o);
      const p = res.posturas[0];
      if (p?.estado !== 'propone' || !p.viabilidad) throw new Error('sin nota de viabilidad');
      return { ...res, nota: p.viabilidad };
    };

    it('caches the HTTP check with the AI answers: re-running the same PDF offline keeps the sources', async () => {
      const cache = crearCacheEnMemoria();
      const r = respuestas({ 'evaluar-viabilidad': () => evaluacion('viable', { fuentes: [FUENTE_INE, FUENTE_BOE] }) });
      const enLinea = await viabilidad(r, { cache, comprobarUrl: async () => true });
      const comprobadas: string[] = [];
      const sinRed = await viabilidad(r, {
        cache,
        comprobarUrl: async (url) => {
          comprobadas.push(url);
          return false;
        },
      });
      expect(comprobadas).toEqual([]);
      expect(sinRed.nota).toEqual(enLinea.nota);
      expect(sinRed.nota.fuentes).toEqual([FUENTE_INE, FUENTE_BOE]);
    });

    it('removes a source outside the institutional domain list', async () => {
      const { nota, informe } = await viabilidad(
        respuestas({
          'evaluar-viabilidad': () =>
            evaluacion('viable', { fuentes: [FUENTE_INE, { titulo: 'Un blog', url: 'https://blog.ejemplo.com/alquiler' }] }),
        }),
      );
      expect(nota.fuentes).toEqual([FUENTE_INE]);
      for (const e of nota.evaluaciones) expect(e.fuentes).toEqual([FUENTE_INE]);
      expect(informe.entradas).toContainEqual(
        expect.objectContaining({ barrera: 'V8', detalle: expect.stringContaining('blog.ejemplo.com') }),
      );
    });

    it('removes a source that does not answer HTTP 200 (checked through the injected function)', async () => {
      const comprobadas: string[] = [];
      const { nota } = await viabilidad(
        respuestas({ 'evaluar-viabilidad': () => evaluacion('viable', { fuentes: [FUENTE_INE, FUENTE_BOE] }) }),
        {
          comprobarUrl: async (url) => {
            comprobadas.push(url);
            return url !== FUENTE_BOE.url;
          },
        },
      );
      expect(comprobadas).toContain(FUENTE_BOE.url);
      expect(nota.fuentes).toEqual([FUENTE_INE]);
    });

    it('repeats an evaluation whose "por qué" is left without sources', async () => {
      const { nota, informe } = await viabilidad(
        respuestas({
          'evaluar-viabilidad': (e) =>
            e.evaluacion === 2 && !e.repeticion
              ? evaluacion('viable', { fuentes: [{ titulo: 'Wiki', url: 'https://es.wikipedia.org/wiki/Alquiler' }] })
              : evaluacion('viable', { fuentes: [FUENTE_BOE] }),
        }),
      );
      expect(informe.entradas.filter((e) => e.barrera === 'V8' && e.resultado === 'reescribir')).toHaveLength(1);
      expect(nota.evaluaciones[1].fuentes).toEqual([FUENTE_BOE]);
      expect(nota.resultado).toBe('viable');
      expect(informe.entradas).toContainEqual(expect.objectContaining({ barrera: 'V8', resultado: 'reescribir' }));
    });

    it('gives up repeating after 2 attempts and publishes the note without sources', async () => {
      const { nota, informe } = await viabilidad(
        respuestas({ 'evaluar-viabilidad': () => evaluacion('dificil', { fuentes: [{ titulo: 'X', url: 'http://www.ine.es/x' }] }) }),
      );
      // 2 repetitions per evaluation, then published without sources (and the report says so).
      expect(informe.entradas.filter((e) => e.barrera === 'V8' && e.resultado === 'reescribir')).toHaveLength(4);
      expect(informe.entradas).toContainEqual(expect.objectContaining({ barrera: 'V8', detalle: expect.stringContaining('se publica sin fuentes') }));
      expect(nota.resultado).toBe('dificil');
      expect(nota.fuentes).toEqual([]);
    });

    it('does not repeat a "sin concreción" evaluation that has no sources', async () => {
      const { informe } = await viabilidad(respuestas({ 'evaluar-viabilidad': () => evaluacion('sin_concrecion', { fuentes: [] }) }));
      expect(informe.entradas.filter((e) => e.barrera === 'V8' && e.resultado !== 'pasa')).toEqual([]);
    });
  });

  describe('V10: fidelity to the quote', () => {
    it('an independent verifier gets the quotes and the neutral text, and an addition forces a rewrite', async () => {
      const anadido = { ...neutroBueno, como: `${neutroBueno.como.slice(0, -1)} y con ayudas.` };
      // The verifier compares the text with the quotes; the writer fixes the text once told why.
      const { posturas, informe } = await procesar(
        respuestas({
          neutralizar: corrigeCon('Las ayudas no están en la cita.', anadido, neutroBueno),
          'verificar-fidelidad': (entrada) =>
            entrada.texto.como.includes('ayudas') && entrada.citas.every((c: { texto: string }) => !c.texto.includes('ayudas'))
              ? { anade: true, omite: false, cambiaSentido: false, explicacion: 'Las ayudas no están en la cita.' }
              : fiel,
        }),
      );
      expect(reescrituras(informe)).toBe(1);
      expect(posturas[0]).toEqual(expect.objectContaining({ estado: 'propone', texto: neutroBueno }));
      expect(informe.entradas).toContainEqual(expect.objectContaining({ tema: 'vivienda', barrera: 'V10', resultado: 'reescribir' }));
      expect(informe.entradas).toContainEqual(expect.objectContaining({ tema: 'vivienda', barrera: 'V10', resultado: 'pasa' }));
    });

    it.each([
      ['omits an essential condition', { omite: true }],
      ['changes the meaning', { cambiaSentido: true }],
    ])('discards the postura when the text still %s after 2 rewrites', async (_caso, fallo) => {
      const { posturas, informe } = await procesar(
        respuestas({ 'verificar-fidelidad': () => ({ ...fiel, ...fallo, explicacion: 'No es fiel.' }) }),
      );
      expect(reescrituras(informe)).toBe(2);
      expect(posturas[0]?.estado).toBe('sin_verificar');
      expect(informe.entradas).toContainEqual(expect.objectContaining({ tema: 'vivienda', barrera: 'V10', resultado: 'descartar' }));
    });

    it('never verifies a text that still has identifying marks (V3 first)', async () => {
      // This verifier would reject any text with a party acronym: it must never see one.
      const { posturas, informe } = await procesar(
        respuestas({
          neutralizar: (_e, intento) => (intento === 0 ? { ...neutroBueno, que: 'La propuesta de OTP sobre el alquiler.' } : neutroBueno),
          'verificar-fidelidad': (e) => (JSON.stringify(e.texto).includes('OTP') ? { ...fiel, anade: true, explicacion: 'OTP' } : fiel),
        }),
      );
      expect(posturas[0]).toEqual(expect.objectContaining({ estado: 'propone', texto: neutroBueno }));
      expect(informe.entradas.filter((e) => e.barrera === 'V10' && e.resultado !== 'pasa')).toEqual([]);
      expect(informe.entradas).toContainEqual(expect.objectContaining({ barrera: 'V3', resultado: 'reescribir' }));
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

    it('the guesser gets every neutral postura of the topic and the party list', async () => {
      // This guesser can only spot our postura by comparing it with the other two.
      const comparando = (entrada: any) => ({
        asignaciones: entrada.posturas.map((p: { letra: string; texto: string }) => ({
          letra: p.letra,
          partido:
            entrada.posturas.length === 3 &&
            ['otp', 'pej', 'ter'].every((id) => entrada.partidos.some((x: { id: string }) => x.id === id)) &&
            p.texto.includes('zonas tensionadas')
              ? 'pej'
              : 'otp',
          confianza: 0.9,
          pista: 'Es la única que habla de zonas tensionadas.',
        })),
      });
      const { informe } = await procesar(respuestas({ 'adivinar-partido': comparando }), { publicado });
      expect(informe.entradas).toContainEqual(expect.objectContaining({ barrera: 'V11', resultado: 'aviso' }));
    });

    it('the posturas are anonymous: a guesser looking for party names finds none', async () => {
      const tramposo = (entrada: any) => ({
        asignaciones: entrada.posturas.map((p: any) => ({
          letra: p.letra,
          partido: /pej|Partido Ejemplo/i.test(JSON.stringify(p)) ? 'pej' : 'otp',
          confianza: 1,
          pista: 'El nombre.',
        })),
      });
      const { informe } = await procesar(respuestas({ 'adivinar-partido': tramposo }), { publicado });
      expect(informe.entradas).toContainEqual(expect.objectContaining({ barrera: 'V11', resultado: 'pasa' }));
      expect(reescrituras(informe)).toBe(0);
    });

    it('the 3 rounds use different orders: a guesser that only goes by position never flags a postura', async () => {
      const porPosicion = (entrada: any) => ({
        asignaciones: entrada.posturas.map((p: { letra: string }) => ({
          letra: p.letra,
          partido: p.letra === 'A' ? 'pej' : 'otp',
          confianza: 1,
          pista: 'Va primera.',
        })),
      });
      const { informe } = await procesar(respuestas({ 'adivinar-partido': porPosicion }), { publicado });
      expect(informe.entradas).toContainEqual(expect.objectContaining({ barrera: 'V11', resultado: 'pasa' }));
    });

    it('rewrites a postura guessed 3 of 3 times with mean confidence ≥ 0.7, passing the clue', async () => {
      const otraVersion = { ...neutroBueno, que: 'Poner por ley un tope al precio del alquiler de vivienda en las zonas con precios más altos.' };
      const { posturas, informe } = await procesar(
        respuestas({
          neutralizar: corrigeCon('Menciona las zonas tensionadas.', neutroBueno, otraVersion),
          'adivinar-partido': adivina('zonas tensionadas', 0.8),
        }),
        { publicado },
      );
      expect(reescrituras(informe)).toBe(1);
      expect(posturas[0]).toEqual(expect.objectContaining({ estado: 'propone', texto: otraVersion }));
      expect(informe.entradas).toContainEqual(expect.objectContaining({ barrera: 'V11', resultado: 'reescribir' }));
      expect(informe.entradas).toContainEqual(expect.objectContaining({ barrera: 'V11', resultado: 'pasa' }));
    });

    it('publishes with an internal warning when the postura is still recognisable after the rewrites', async () => {
      const { posturas, informe, publicable } = await procesar(
        respuestas({ 'adivinar-partido': adivina('alquiler', 0.9) }),
        { publicado },
      );
      expect(reescrituras(informe)).toBe(2);
      expect(posturas[0]?.estado).toBe('propone');
      expect(informe.entradas).toContainEqual(expect.objectContaining({ barrera: 'V11', resultado: 'aviso' }));
      expect(informe.descartadas).toBe(0);
      expect(publicable).toBe(true);
    });

    it.each([
      ['mean confidence is below 0.7', adivina('alquiler', 0.6)],
      ['it is guessed only 2 of 3 times', adivina('alquiler', 0.9, 2)],
    ])('does not flag the postura when %s', async (_caso, adivinador) => {
      const { informe } = await procesar(respuestas({ 'adivinar-partido': adivinador }), { publicado });
      expect(reescrituras(informe)).toBe(0);
      expect(informe.entradas).toContainEqual(expect.objectContaining({ barrera: 'V11', resultado: 'pasa' }));
    });

    it('checks the first party to publish too, against the list of registered parties', async () => {
      const { informe } = await procesar(respuestas({ 'adivinar-partido': adivina('alquiler', 0.9) }), {
        partidos: [partidoOtro, terceroPartido],
      });
      expect(informe.entradas).toContainEqual(expect.objectContaining({ barrera: 'V11', resultado: 'aviso' }));
    });

    it('skips the guesser when there is no other party to choose from', async () => {
      const { ia, informe } = await procesar(respuestas(), { partidos: [] });
      expect(ia.llamadas.filter((l) => l.tarea === 'adivinar-partido')).toHaveLength(0);
      expect(informe.entradas).toContainEqual(expect.objectContaining({ barrera: 'V11', resultado: 'pasa' }));
    });

    it('re-checks the parties already published: a recognisable one gets a warning in its own report, its text untouched', async () => {
      const delataIVA = (entrada: any) => ({
        asignaciones: entrada.posturas.map((p: { letra: string; texto: string }) => ({
          letra: p.letra,
          partido: p.texto.includes('IVA') ? 'otp' : 'nadie',
          confianza: 0.9,
          pista: 'Habla del IVA.',
        })),
      });
      const anterior = construirDataset({
        partidos: [partidoOtro, terceroPartido],
        temas: [temaVivienda],
        resultados: [
          { informe: informeDe('otp'), posturas: [posturaOtro] },
          { informe: informeDe('ter'), posturas: [posturaTercero] },
        ],
        generado: '2026-11-08T00:00:00.000Z',
        origen: 'real',
      });
      const resultado = await procesar(respuestas({ 'adivinar-partido': delataIVA }), { publicado: anterior });
      // Our own postura is not recognised.
      expect(resultado.informe.entradas).toContainEqual(expect.objectContaining({ barrera: 'V11', resultado: 'pasa' }));
      const publicar = (ds: typeof anterior) =>
        fusionarPrograma(ds, partidoEjemplo, resultado, { temas: [temaVivienda], preguntas: [], generado: '2026-11-08T00:00:00.000Z' });
      const fusion = publicar(anterior);
      if (!fusion.ok) throw new Error(fusion.motivo);
      const avisosOtp = fusion.dataset.informes.find((i) => i.partido === 'otp')!.entradas;
      expect(avisosOtp).toEqual([
        expect.objectContaining({ tema: 'vivienda', barrera: 'V11', resultado: 'aviso', detalle: expect.stringContaining('Partido Ejemplo') }),
      ]);
      expect(fusion.dataset.informes.find((i) => i.partido === 'ter')!.entradas).toEqual([]);
      // Never silently rewritten: the published text and note stay as they were.
      expect(fusion.dataset.posturas.find((p) => p.partido === 'otp')).toEqual(posturaOtro);
      // Publishing the same programme again replaces the warning instead of piling it up.
      const otraVez = publicar(fusion.dataset);
      if (!otraVez.ok) throw new Error(otraVez.motivo);
      expect(otraVez.dataset.informes.find((i) => i.partido === 'otp')!.entradas).toHaveLength(1);
    });
  });

  describe('V12: confirmed absence', () => {
    const noPropone = { 'extraer-postura': () => ({ propone: false, citas: [] }) };

    it('extracts the postura when the second pass finds a proposal the first one missed', async () => {
      const { posturas, informe } = await procesar(respuestas({ ...noPropone, ...segundaPasadaEncuentra }));
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
      // The default fake V12 would confirm an absence: it is not asked.
      const { posturas } = await procesar(
        respuestas({ neutralizar: () => ({ ...neutroBueno, que: 'La propuesta de OTP sobre el alquiler.' }) }),
      );
      expect(posturas[0]?.estado).toBe('sin_verificar');
    });
  });

  describe('V2: correct page', () => {
    it('fixes the declared page automatically and records the correction', async () => {
      const { posturas, informe } = await procesar(
        respuestas({ 'extraer-postura': () => ({ propone: true, citas: [{ texto: CITA, pagina: 1 }] }) }),
      );
      expect(posturas[0]).toEqual(expect.objectContaining({ estado: 'propone', citas: [{ texto: CITA, pagina: 2 }] }));
      expect(informe.entradas).toContainEqual(
        expect.objectContaining({ tema: 'vivienda', barrera: 'V2', resultado: 'corregir', detalle: expect.stringContaining('1 → 2') }),
      );
    });

    it('records a pass when the declared page is right', async () => {
      const { informe } = await procesar(respuestas());
      expect(informe.entradas).toContainEqual(expect.objectContaining({ tema: 'vivienda', barrera: 'V2', resultado: 'pasa' }));
    });

    it('discards the postura when the quote is on no page at all', async () => {
      const { posturas } = await procesar(
        respuestas({
          'extraer-postura': () => ({
            propone: true,
            citas: [{ texto: 'Limitaremos el precio del alquiler en todas las ciudades del país sin excepción alguna.', pagina: 7 }],
          }),
          ...segundaPasadaEncuentra,
        }),
      );
      expect(posturas[0]?.estado).toBe('sin_verificar');
    });
  });

  describe('V4: traceable figures', () => {
    const CITA_CIFRAS =
      'Construiremos 50.000 viviendas públicas al año y limitaremos el alquiler al 30 % de los ingresos del hogar.';
    const paginasCifras = [['Vivienda', CITA_CIFRAS]];
    const extraerCifras = () => ({ propone: true, citas: [{ texto: CITA_CIFRAS, pagina: 1 }] });
    const conCifras = {
      que: 'Construir vivienda pública cada año y limitar por ley lo que pagan los hogares de alquiler.',
      como: 'El alquiler de esas viviendas no podría superar el 30% de los ingresos de cada hogar inquilino.',
      cifra: '50000 viviendas al año',
    };

    async function procesarCifras(r: RespuestasFalsas, o: Partial<OpcionesProceso> = {}) {
      const pdf = await crearPdfDePrueba(paginasCifras);
      const ia = crearIAFalsa(r);
      return { ...(await procesarPrograma(pdf, partidoEjemplo, ia, opciones(o))), ia };
    }

    it('accepts figures that appear in a quote, whatever their format ("50000" vs "50.000", "30%" vs "30 %")', async () => {
      const { posturas, informe } = await procesarCifras(respuestas({ 'extraer-postura': extraerCifras, neutralizar: () => conCifras }));
      expect(posturas[0]).toEqual(expect.objectContaining({ estado: 'propone', texto: conCifras }));
      expect(reescrituras(informe)).toBe(0);
      expect(informe.entradas).toContainEqual(expect.objectContaining({ barrera: 'V4', resultado: 'pasa' }));
    });

    it('rewrites a text with a figure that is in none of its quotes, telling the AI which one', async () => {
      const { posturas, informe } = await procesarCifras(
        respuestas({
          'extraer-postura': extraerCifras,
          neutralizar: corrigeCon(/no aparecen en las citas[^"]*40/, { ...conCifras, como: conCifras.como.replace('30%', '40 %') }, conCifras),
        }),
      );
      expect(posturas[0]).toEqual(expect.objectContaining({ estado: 'propone', texto: conCifras }));
      expect(reescrituras(informe)).toBe(1);
      expect(informe.entradas).toContainEqual(
        expect.objectContaining({ tema: 'vivienda', barrera: 'V4', resultado: 'reescribir', detalle: expect.stringContaining('40') }),
      );
    });

    it('checks the figure field too, and discards after 2 failed rewrites', async () => {
      const { posturas, informe } = await procesarCifras(
        respuestas({ 'extraer-postura': extraerCifras, neutralizar: () => ({ ...conCifras, cifra: '2030' }) }),
      );
      expect(reescrituras(informe)).toBe(2);
      expect(posturas[0]?.estado).toBe('sin_verificar');
      expect(informe.entradas).toContainEqual(expect.objectContaining({ barrera: 'V4', resultado: 'descartar' }));
    });
  });

  describe('V5: equal length', () => {
    it('rewrites a text shorter than 25 words', async () => {
      const corto = { que: 'Limitar el alquiler.', como: 'Con más vivienda pública.', cifra: null };
      const { posturas, informe } = await procesar(
        respuestas({ neutralizar: (_e, intento) => (intento === 0 ? corto : neutroBueno) }),
      );
      expect(posturas[0]).toEqual(expect.objectContaining({ estado: 'propone', texto: neutroBueno }));
      expect(reescrituras(informe)).toBe(1);
      expect(informe.entradas).toContainEqual(
        expect.objectContaining({ barrera: 'V5', resultado: 'reescribir', detalle: expect.stringContaining('7 palabras') }),
      );
    });

    it('rewrites a text longer than 70 words', async () => {
      const largo = { ...neutroBueno, como: `${neutroBueno.como} ${palabras(60)}` };
      const { informe } = await procesar(respuestas({ neutralizar: (_e, intento) => (intento === 0 ? largo : neutroBueno) }));
      expect(reescrituras(informe)).toBe(1);
      expect(informe.entradas).toContainEqual(expect.objectContaining({ barrera: 'V5', resultado: 'reescribir' }));
    });

    it('rewrites a text outside ±25 % of the topic median, giving the AI the target range', async () => {
      // Topic: 38, 40 and 42 words published + this 29-word text → median 39: out. Target: 30–50 (±25 % of 40).
      const largo = { ...neutroBueno, como: `${neutroBueno.como} ${palabras(15)}` }; // 44 words
      const publicado = { partidos: [], posturas: [publicadaDe('otp', 40), publicadaDe('ter', 38), publicadaDe('cua', 42)] };
      const { posturas, informe } = await procesar(
        respuestas({ neutralizar: corrigeCon(/entre 30 y 50 palabras/, neutroBueno, largo) }),
        { publicado },
      );
      expect(posturas[0]).toEqual(expect.objectContaining({ estado: 'propone', texto: largo }));
      expect(reescrituras(informe)).toBe(1);
      expect(informe.entradas).toContainEqual(
        expect.objectContaining({ barrera: 'V5', resultado: 'reescribir', detalle: expect.stringContaining('mediana') }),
      );
    });

    it('the first party on a topic is only held to the 25–70 range (the median is its own length)', async () => {
      const largo = textoDe(65);
      const { posturas } = await procesar(respuestas({ neutralizar: () => largo, 'extraer-postura': () => ({ propone: true, citas: [{ texto: CITA, pagina: 2 }] }) }));
      expect(posturas[0]).toEqual(expect.objectContaining({ estado: 'propone', texto: largo }));
    });

    it('the median counts the new text: published parties now outside ±25 % get a warning in their report', async () => {
      // 29 (this one), 30 and 60 words → median 30: this text passes, the 60-word one is flagged.
      const publicado = { partidos: [partidoOtro, terceroPartido], posturas: [publicadaDe('otp', 30), publicadaDe('ter', 60)] };
      const resultado = await procesar(respuestas(), { publicado });
      expect(resultado.posturas[0]).toEqual(expect.objectContaining({ estado: 'propone', texto: neutroBueno }));
      expect(reescrituras(resultado.informe)).toBe(0);
      const anterior = construirDataset({
        partidos: [partidoOtro, terceroPartido],
        temas: [temaVivienda],
        resultados: publicado.posturas.map((p) => ({ informe: informeDe(p.partido), posturas: [p] })),
        generado: '2026-11-08T00:00:00.000Z',
        origen: 'real',
      });
      const fusion = fusionarPrograma(anterior, partidoEjemplo, resultado, { temas: [temaVivienda], preguntas: [], generado: '2026-11-08T00:00:00.000Z' });
      if (!fusion.ok) throw new Error(fusion.motivo);
      expect(fusion.dataset.informes.find((i) => i.partido === 'ter')!.entradas).toEqual([
        expect.objectContaining({ tema: 'vivienda', barrera: 'V5', resultado: 'aviso', detalle: expect.stringContaining('60 palabras') }),
      ]);
      expect(fusion.dataset.informes.find((i) => i.partido === 'otp')!.entradas).toEqual([]);
    });

    it('discards after 2 failed rewrites', async () => {
      const corto = { que: 'Limitar el alquiler.', como: 'Con más vivienda pública.', cifra: null };
      const { posturas, informe } = await procesar(respuestas({ neutralizar: () => corto }));
      expect(reescrituras(informe)).toBe(2);
      expect(posturas[0]?.estado).toBe('sin_verificar');
    });
  });

  describe('V6: template', () => {
    it('rewrites a text whose "what" field is missing', async () => {
      const { posturas, informe } = await procesar(
        respuestas({ neutralizar: (_e, intento) => (intento === 0 ? { ...neutroBueno, que: '  ' } : neutroBueno) }),
      );
      expect(posturas[0]).toEqual(expect.objectContaining({ estado: 'propone', texto: neutroBueno }));
      expect(reescrituras(informe)).toBe(1);
      expect(informe.entradas).toContainEqual(
        expect.objectContaining({ barrera: 'V6', resultado: 'reescribir', detalle: expect.stringContaining('qué') }),
      );
    });

    it('rewrites a text whose "how" field is missing, and discards it if it never arrives', async () => {
      const { posturas, informe } = await procesar(respuestas({ neutralizar: () => ({ ...neutroBueno, como: '' }) }));
      expect(reescrituras(informe)).toBe(2);
      expect(posturas[0]?.estado).toBe('sin_verificar');
      expect(informe.entradas).toContainEqual(expect.objectContaining({ barrera: 'V6', resultado: 'descartar', detalle: expect.stringContaining('cómo') }));
    });

    it('treats the figure as optional (an empty figure becomes null)', async () => {
      const { posturas, informe } = await procesar(respuestas({ neutralizar: () => ({ ...neutroBueno, cifra: '' }) }));
      expect(reescrituras(informe)).toBe(0);
      expect(posturas[0]).toEqual(expect.objectContaining({ estado: 'propone', texto: { ...neutroBueno, cifra: null } }));
    });
  });

  describe('V7: official source', () => {
    it('records the source URL, PDF hash and date of an allowed domain (subdomains included)', async () => {
      const partido = { ...partidoEjemplo, programa: { ...partidoEjemplo.programa, url: 'https://www.ejemplo.org/docs/p.pdf' } };
      const pdf = await crearPdfDePrueba(paginas);
      const { informe, publicable } = await procesarPrograma(pdf, partido, crearIAFalsa(respuestas()), opciones({ fecha: '2026-11-08' }));
      expect(publicable).toBe(true);
      expect(informe).toEqual(
        expect.objectContaining({ url: 'https://www.ejemplo.org/docs/p.pdf', hashPdf: expect.stringMatching(/^[0-9a-f]{64}$/), fecha: '2026-11-08' }),
      );
      expect(informe.entradas).toContainEqual(expect.objectContaining({ barrera: 'V7', resultado: 'pasa' }));
    });

    it('blocks a programme whose PDF comes from a domain not allowed for that party', async () => {
      for (const url of ['https://otro-partido.es/programa.pdf', 'https://ejemplo.org.malo.com/p.pdf', 'https://falsoejemplo.org/p.pdf']) {
        const partido = { ...partidoEjemplo, programa: { ...partidoEjemplo.programa, url } };
        const pdf = await crearPdfDePrueba(paginas);
        const ia = crearIAFalsa(respuestas());
        const { informe, publicable, posturas } = await procesarPrograma(pdf, partido, ia, opciones({ fecha: '2026-11-08' }));
        expect(publicable).toBe(false);
        expect(informe.motivo).toContain('V7');
        expect(informe).toEqual(expect.objectContaining({ url, hashPdf: expect.stringMatching(/^[0-9a-f]{64}$/), fecha: '2026-11-08' }));
        expect(informe.entradas).toContainEqual(expect.objectContaining({ barrera: 'V7', resultado: 'bloquear' }));
        expect(posturas).toEqual([]);
        expect(ia.llamadas).toHaveLength(0);
        expect((await procesarPrograma(pdf, partido, ia, opciones())).texto).toBeNull();
      }
    });

    it('blocks a party with no allowed domains', async () => {
      const { publicable } = await procesar(respuestas(), { dominios: {} });
      expect(publicable).toBe(false);
    });
  });

  describe('publication rule', () => {
    const temas: Tema[] = ['vivienda', 'empleo', 'sanidad', 'energia'].map((id, i) => ({ ...temaVivienda, id, orden: i + 1 }));
    const inventada = { texto: 'Regalaremos una vivienda a cada joven que cumpla dieciocho años en todo el país.', pagina: 2 };
    const extraer = (malos: string[]) => (entrada: any) => ({
      propone: true,
      citas: [malos.includes(entrada.tema.id) ? inventada : { texto: CITA, pagina: 2 }],
    });

    it('publishes a programme with ≤ 30 % of its extracted posturas discarded', async () => {
      const { publicable, informe } = await procesar(respuestas({ 'extraer-postura': extraer(['empleo']) }), { temas });
      expect(informe).toEqual(expect.objectContaining({ extraidas: 4, descartadas: 1 }));
      expect(publicable).toBe(true);
    });

    it('blocks the whole programme when more than 30 % is discarded', async () => {
      const { publicable, informe } = await procesar(respuestas({ 'extraer-postura': extraer(['empleo']) }), { temas: temas.slice(0, 3) });
      expect(informe).toEqual(expect.objectContaining({ extraidas: 3, descartadas: 1, publicable: false }));
      expect(publicable).toBe(false);
      expect(informe.motivo).toContain('33 %');
    });
  });

  describe('verification report', () => {
    it('summarises every postura: its final state, rewrites and why it was discarded', async () => {
      const temas: Tema[] = ['vivienda', 'empleo', 'sanidad', 'energia'].map((id, i) => ({ ...temaVivienda, id, orden: i + 1 }));
      const { informe } = await procesar(
        respuestas({
          'extraer-postura': (e) =>
            e.tema.id === 'energia'
              ? { propone: false, citas: [] }
              : { propone: true, citas: [{ texto: CITA, pagina: 2 }] },
          neutralizar: (e, intento) =>
            e.tema.id === 'empleo'
              ? { ...neutroBueno, que: '' }
              : e.tema.id === 'sanidad' && intento === 0
                ? { ...neutroBueno, cifra: '99 %' }
                : neutroBueno,
        }),
        { temas },
      );
      expect(informe.posturas).toEqual([
        { tema: 'vivienda', estado: 'propone', reescrituras: 0 },
        { tema: 'empleo', estado: 'sin_verificar', reescrituras: 2, motivo: expect.stringMatching(/V6.*qué/) },
        { tema: 'sanidad', estado: 'propone', reescrituras: 1 },
        { tema: 'energia', estado: 'no_propone', reescrituras: 0 },
      ]);
      // Every barrier leaves a trace for a postura that passed them all.
      const barreras = informe.entradas.filter((e) => e.tema === 'vivienda').map((e) => e.barrera);
      expect(new Set(barreras)).toEqual(new Set(['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V8', 'V10', 'V11', 'V13']));
      expect(informe.entradas.filter((e) => e.barrera === 'V7')).toHaveLength(1);
    });
  });

  describe('determinism', () => {
    it('two runs over the same PDF with the cache give an identical result, rewrites included', async () => {
      const cache = crearCacheEnMemoria();
      const r = respuestas({ neutralizar: (_e, intento) => (intento === 0 ? { ...neutroBueno, cifra: '12 %' } : neutroBueno) });
      const publicado = { partidos: [partidoOtro, terceroPartido], posturas: [posturaOtro, posturaTercero] };
      const { ia: _ia1, ...primera } = await procesar(r, { cache, fecha: '2026-11-08', publicado });
      const { ia: ia2, ...segunda } = await procesar(r, { cache, fecha: '2026-11-08', publicado });
      expect(reescrituras(primera.informe)).toBe(1);
      expect(ia2.llamadas.map((l) => l.tarea)).toEqual([]);
      expect(segunda).toEqual(primera);
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

    it('keeps the feasibility note of an unchanged neutral text when the PDF changes (V13 is keyed by text and quotes)', async () => {
      const cache = crearCacheEnMemoria();
      const primera = await procesar(respuestas(), { cache });
      const pdf = await crearPdfDePrueba([...paginas, ['Una página más']]);
      const ia = crearIAFalsa(respuestas({ 'evaluar-viabilidad': () => evaluacion('muy_dificil') }));
      const segunda = await procesarPrograma(pdf, partidoEjemplo, ia, opciones({ cache }));
      expect(segunda.posturas[0]).toEqual(primera.posturas[0]);
      expect(ia.llamadas.filter((l) => l.tarea === 'evaluar-viabilidad')).toHaveLength(0);
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
  describe('suggested questions (Preguntar): precomputed answers', () => {
    const CITA_PENSIONES = 'Revalorizaremos las pensiones con el IPC cada año.';
    const jubilacion = { id: 'jubilacion', texto: '¿Qué pasa con la edad de jubilación?', palabrasClave: ['jubilación', 'pensiones'], orden: 1 };
    const mili = { id: 'mili', texto: '¿Qué dicen sobre el servicio militar?', palabrasClave: ['servicio militar', 'mili'], orden: 2 };
    // 13 + 21 = 34 words, no figures, no marks.
    const respuestaBuena = {
      menciona: true,
      que: 'Subir todas las pensiones cada año al mismo ritmo que suben los precios de consumo.',
      como: 'La subida sería automática y anual, ligada a los precios, para que las personas jubiladas no pierdan poder de compra con el tiempo.',
      cifra: null,
      citas: [{ texto: CITA_PENSIONES, pagina: 3 }],
    };
    const llamadasPregunta = (ia: { llamadas: { tarea: string; entrada: any }[] }, id: string) =>
      ia.llamadas.filter((l) => l.tarea === 'responder-pregunta' && l.entrada.pregunta.id === id);

    it('answers each suggested question with a neutral text and a verified literal quote', async () => {
      const { respuestas: rs, informe } = await procesar(respuestas({ 'responder-pregunta': () => respuestaBuena }), { preguntas: [jubilacion] });
      expect(rs).toEqual([
        expect.objectContaining({
          partido: 'pej',
          pregunta: 'jubilacion',
          estado: 'responde',
          texto: { que: respuestaBuena.que, como: respuestaBuena.como, cifra: null },
          citas: [{ texto: CITA_PENSIONES, pagina: 3 }],
        }),
      ]);
      for (const b of ['V1', 'V3', 'V10'])
        expect(informe.entradas).toContainEqual(expect.objectContaining({ pregunta: 'jubilacion', barrera: b, resultado: 'pasa' }));
    });

    it('answers with the suggested questions of the registry by default', async () => {
      const { respuestas: rs } = await procesar(respuestas(), { preguntas: undefined });
      expect(rs.length).toBe(7);
    });

    it('a programme with no page about the question "does not mention it", without asking the AI', async () => {
      const { respuestas: rs, ia } = await procesar(respuestas({ 'responder-pregunta': () => respuestaBuena }), { preguntas: [mili] });
      expect(rs).toEqual([expect.objectContaining({ pregunta: 'mili', estado: 'no_menciona' })]);
      expect(llamadasPregunta(ia, 'mili')).toHaveLength(0);
    });

    it('"does not mention it" when the AI finds nothing in the candidate pages', async () => {
      const { respuestas: rs } = await procesar(respuestas(), { preguntas: [jubilacion] });
      expect(rs).toEqual([expect.objectContaining({ pregunta: 'jubilacion', estado: 'no_menciona' })]);
    });

    it('removes an invented quote and keeps the verified one (V1)', async () => {
      const inventada = { texto: 'Bajaremos la edad de jubilación a los sesenta años para todo el mundo.', pagina: 3 };
      const { respuestas: rs, informe } = await procesar(
        respuestas({ 'responder-pregunta': () => ({ ...respuestaBuena, citas: [inventada, ...respuestaBuena.citas] }) }),
        { preguntas: [jubilacion] },
      );
      expect(rs).toEqual([expect.objectContaining({ estado: 'responde', citas: [{ texto: CITA_PENSIONES, pagina: 3 }] })]);
      expect(informe.entradas).toContainEqual(expect.objectContaining({ pregunta: 'jubilacion', barrera: 'V1', resultado: 'descartar' }));
    });

    it('an answer whose quotes are all invented is asked again, then not published (V1)', async () => {
      const inventada = { texto: 'Bajaremos la edad de jubilación a los sesenta años para todo el mundo.', pagina: 3 };
      const { respuestas: rs, informe, publicable } = await procesar(
        respuestas({ 'responder-pregunta': () => ({ ...respuestaBuena, citas: [inventada] }) }),
        { preguntas: [jubilacion] },
      );
      expect(rs).toEqual([expect.objectContaining({ pregunta: 'jubilacion', estado: 'sin_verificar' })]);
      expect(rs[0]).not.toHaveProperty('citas');
      // Asked 3 times: the invented quote is removed each time.
      expect(informe.entradas.filter((e) => e.pregunta === 'jubilacion' && e.detalle.startsWith('cita eliminada'))).toHaveLength(3);
      // Answers never block the programme.
      expect(publicable).toBe(true);
    });

    it('rewrites an answer with identifying marks and, if they persist after 2 retries, does not publish it (V3)', async () => {
      const { respuestas: rs, informe } = await procesar(
        respuestas({ 'responder-pregunta': () => ({ ...respuestaBuena, que: `Como propone OTP, ${respuestaBuena.que}` }) }),
        { preguntas: [jubilacion] },
      );
      expect(informe.entradas.filter((e) => e.pregunta === 'jubilacion' && e.barrera === 'V3' && e.resultado === 'reescribir')).toHaveLength(2);
      expect(informe.entradas).toContainEqual(expect.objectContaining({ pregunta: 'jubilacion', barrera: 'V3', resultado: 'descartar' }));
      expect(rs).toEqual([expect.objectContaining({ estado: 'sin_verificar' })]);
    });

    it('a rewrite that removes the marks is published (V3)', async () => {
      // The fake AI drops the name only once it is told to avoid it.
      const { respuestas: rs } = await procesar(
        respuestas({
          'responder-pregunta': corrigeCon(/"evitar":\[[^\]]*Bruno Jefe/, { ...respuestaBuena, que: `Bruno Jefe quiere ${respuestaBuena.que}` }, respuestaBuena),
        }),
        { preguntas: [jubilacion] },
      );
      expect(rs).toEqual([expect.objectContaining({ estado: 'responde', texto: expect.objectContaining({ que: respuestaBuena.que }) })]);
      expect(JSON.stringify(rs)).not.toMatch(/Bruno Jefe/);
    });

    it('rewrites an answer the independent verifier finds unfaithful to the quote (V10)', async () => {
      const sinPoderDeCompra = { ...respuestaBuena, como: 'La subida sería automática y anual, ligada a los precios, para que las personas jubiladas mantengan su pensión al día con el tiempo.' };
      const { respuestas: rs, informe } = await procesar(
        respuestas({
          'responder-pregunta': corrigeCon('Habla de poder de compra.', respuestaBuena, sinPoderDeCompra),
          'verificar-fidelidad': (e) =>
            e.texto.como.includes('poder de compra') ? { ...fiel, anade: true, explicacion: 'Habla de poder de compra.' } : fiel,
        }),
        { preguntas: [jubilacion] },
      );
      expect(rs[0]).toEqual(expect.objectContaining({ estado: 'responde', texto: expect.objectContaining({ como: sinPoderDeCompra.como }) }));
      expect(informe.entradas).toContainEqual(expect.objectContaining({ pregunta: 'jubilacion', barrera: 'V10', resultado: 'reescribir' }));
      expect(rs[0]!.estado).toBe('responde');
    });

    it('answers go into a dataset that validates (V9)', async () => {
      const { posturas, informe, respuestas: rs } = await procesar(
        respuestas({ 'responder-pregunta': () => respuestaBuena }),
        { preguntas: [jubilacion, mili] },
      );
      const dataset = construirDataset({
        partidos: [partidoEjemplo],
        temas: [temaVivienda],
        preguntas: [jubilacion, mili],
        resultados: [{ posturas, informe, respuestas: rs }],
        generado: '2026-11-08T00:00:00.000Z',
        origen: 'prueba',
      });
      expect(validarDataset(dataset)).toEqual({ valido: true, errores: [] });
      expect(validarDataset({ ...dataset, respuestas: [...rs, ...rs] }).valido).toBe(false);
      expect(validarDataset({ ...dataset, respuestas: rs.map((r) => ({ ...r, pregunta: 'otra' })) }).valido).toBe(false);
    });

    it('two runs with the cache give identical answers', async () => {
      const cache = crearCacheEnMemoria();
      const r = respuestas({ 'responder-pregunta': () => respuestaBuena });
      const primera = await procesar(r, { cache, preguntas: [jubilacion, mili] });
      const segunda = await procesar(r, { cache, preguntas: [jubilacion, mili] });
      expect(segunda.ia.llamadas).toHaveLength(0);
      expect(segunda.respuestas).toEqual(primera.respuestas);
    });
  });
});
