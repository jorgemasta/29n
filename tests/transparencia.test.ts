// Transparency data (#11): what the methodology, parties and report pages show, and the report-issue links.
import { describe, expect, it } from 'vitest';
import {
  MOTIVOS_REPORTE,
  programas,
  repartoViabilidad,
  resumenInforme,
  urlFaltaPartido,
  urlReportarError,
} from '../src/transparencia';
import { BARRERAS } from '../src/registro/barreras';
import { crearAvisos, LIMITE_AVISOS, LIMITE_AVISOS_DIA } from '../src/transparencia/avisos';
import { crearAlmacenEnMemoria } from '../src/pregunta/libre';
import { Barrera, type Dataset, type Informe, type NotaViabilidad, type Postura } from '../src/dataset/esquema';
import { datasetEjemplo, notaEjemplo } from './fixtures/dataset-ejemplo';

const nota = (resultado: NotaViabilidad['resultado']): NotaViabilidad => ({ ...notaEjemplo, resultado, porque: resultado === 'sin_consenso' ? null : 'Por esto.' });
const conNota = (ds: Dataset, partido: string, tema: string, resultado: NotaViabilidad['resultado']): Dataset => ({
  ...ds,
  posturas: ds.posturas.map((p) => (p.partido === partido && p.tema === tema && p.estado === 'propone' ? ({ ...p, viabilidad: nota(resultado) } as Postura) : p)),
});

describe('repartoViabilidad', () => {
  const ds = conNota(conNota(datasetEjemplo, 'bbb', 'vivienda', 'viable'), 'ccc', 'vivienda', 'viable');

  it('counts the published feasibility results per party, in the fixed scale order', () => {
    const r = repartoViabilidad(ds);
    expect(r.categorias).toEqual(['viable', 'viable_con_matices', 'dificil', 'muy_dificil', 'sin_concrecion', 'sin_consenso']);
    const aaa = r.porPartido.find((f) => f.partido.id === 'aaa')!;
    expect(aaa.conteos.sin_consenso).toBe(1);
    expect(aaa.conteos.viable).toBe(0);
    // aaa proposes on 'ref' too, without a note.
    expect(aaa.sinNota).toBe(1);
    expect(aaa.total).toBe(2);
    expect(r.porPartido.find((f) => f.partido.id === 'bbb')!.conteos.viable).toBe(1);
  });

  it('only lists parties with a published programme', () => {
    const ids = repartoViabilidad(ds).porPartido.map((f) => f.partido.id);
    expect(ids).not.toContain('pend');
    expect(ids).not.toContain('penreg');
    expect(ids).toContain('nada');
  });

  it('gives one cell per party and topic with the result or the reason there is none', () => {
    const r = repartoViabilidad(ds);
    const vivienda = r.porTema.find((t) => t.tema.id === 'vivienda')!;
    const celda = (p: string) => vivienda.celdas[r.porPartido.findIndex((f) => f.partido.id === p)];
    expect(celda('aaa')).toBe('sin_consenso');
    expect(celda('bbb')).toBe('viable');
    expect(celda('nada')).toBe('no_propone');
    expect(celda('isla')).toBe('sin_nota');
    const ref = r.porTema.find((t) => t.tema.id === 'ref')!;
    expect(ref.celdas[r.porPartido.findIndex((f) => f.partido.id === 'bbb')]).toBe('sin_verificar');
  });

  it('works with the published dataset', async () => {
    const publicado = (await import('../data/dataset.json')).default as Dataset;
    const r = repartoViabilidad(publicado);
    for (const f of r.porPartido) {
      const suma = r.categorias.reduce((s, c) => s + f.conteos[c], 0) + f.sinNota;
      expect(suma).toBe(f.total);
    }
  });
});

describe('programas', () => {
  const ds: Dataset = {
    ...datasetEjemplo,
    partidos: datasetEjemplo.partidos.map((p) => (p.id === 'aaa' && p.programa.estado === 'publicado' ? { ...p, programa: { ...p.programa, fecha: '2026-11-05' } } : p)),
    informes: [{ partido: 'aaa', hashPdf: 'a'.repeat(64), versionPrompt: 'v2', extraidas: 2, descartadas: 0, publicable: true, posturas: [], entradas: [] }],
  };

  it('splits parties into published and pending, sorted by name', () => {
    const r = programas(ds);
    expect(r.conPrograma.map((p) => p.id)).toEqual(['aaa', 'bbb', 'bcn', 'ccc', 'isla', 'nada']);
    expect(r.pendientes.map((p) => p.id)).toEqual(['pend', 'penreg']);
  });

  it('gives date, PDF link, scope and whether there is a verification report', () => {
    const aaa = programas(ds).conPrograma[0];
    expect(aaa).toMatchObject({ fecha: '2026-11-05', url: 'https://ejemplo.org/aaa.pdf', titulo: 'Programa 2026', ambito: 'Toda España', informe: true });
    const isla = programas(ds).conPrograma.find((p) => p.id === 'isla')!;
    expect(isla.ambito).toBe('Las Palmas, Santa Cruz de Tenerife');
    expect(isla.informe).toBe(false);
    expect(isla.fecha).toBeNull();
  });
});

describe('resumenInforme', () => {
  const informe: Informe = {
    partido: 'aaa',
    hashPdf: 'a'.repeat(64),
    versionPrompt: 'v2',
    extraidas: 2,
    descartadas: 1,
    publicable: true,
    posturas: [
      { tema: 'ref', estado: 'sin_verificar', reescrituras: 0, motivo: 'V1: la cita no aparece' },
      { tema: 'vivienda', estado: 'propone', reescrituras: 1 },
    ],
    entradas: [
      { barrera: 'V7', resultado: 'pasa', detalle: 'dominio oficial' },
      { tema: 'vivienda', barrera: 'V1', resultado: 'pasa', detalle: 'ok' },
      { tema: 'vivienda', barrera: 'V3', resultado: 'reescribir', detalle: 'marca' },
      { tema: 'ref', barrera: 'V1', resultado: 'descartar', detalle: 'no aparece' },
    ],
  };

  it('groups the entries by topic in the published topic order, programme-level ones apart', () => {
    const r = resumenInforme(informe, datasetEjemplo.temas);
    expect(r.programa.map((e) => e.barrera)).toEqual(['V7']);
    expect(r.temas.map((t) => t.tema.id)).toEqual(['vivienda', 'ref']);
    expect(r.temas[0]!).toMatchObject({ estado: 'propone', reescrituras: 1 });
    expect(r.temas[0]!.entradas.map((e) => e.barrera)).toEqual(['V1', 'V3']);
    expect(r.temas[1]!).toMatchObject({ estado: 'sin_verificar', motivo: 'V1: la cita no aparece' });
    expect(r.publicadas).toBe(1);
  });

  it('groups the checks of the answers to suggested questions apart, in the questions\' order', () => {
    const conRespuestas: Informe = {
      ...informe,
      entradas: [
        ...informe.entradas,
        { pregunta: 'mili', barrera: 'V12', resultado: 'pasa', detalle: 'no lo menciona' },
        { pregunta: 'luz', barrera: 'V1', resultado: 'pasa', detalle: 'ok' },
      ],
    };
    const preguntas = [
      { id: 'mili', texto: '¿Servicio militar?', palabrasClave: ['mili'], orden: 2 },
      { id: 'luz', texto: '¿IVA de la luz?', palabrasClave: ['luz'], orden: 1 },
    ];
    const r = resumenInforme(conRespuestas, datasetEjemplo.temas, preguntas);
    expect(r.programa.map((e) => e.barrera)).toEqual(['V7']);
    expect(r.preguntas.map((p) => [p.pregunta.texto, p.entradas.map((e) => e.barrera)])).toEqual([
      ['¿IVA de la luz?', ['V1']],
      ['¿Servicio militar?', ['V12']],
    ]);
  });

  it('labels each entry with its barrier name', () => {
    const r = resumenInforme(informe, datasetEjemplo.temas);
    expect(r.programa[0]!.nombre).toBe(BARRERAS.V7.nombre);
  });
});

describe('BARRERAS', () => {
  it('describes every barrier of the schema', () => {
    for (const b of Barrera.options) {
      expect(BARRERAS[b].nombre.length).toBeGreaterThan(3);
      expect(BARRERAS[b].descripcion.length).toBeGreaterThan(20);
    }
    expect(Object.keys(BARRERAS)).toHaveLength(13);
  });
});

describe('urlReportarError', () => {
  const datos = { tema: { id: 'vivienda', titulo: 'Vivienda y alquiler' }, partido: { id: 'aaa', nombre: 'Partido AAA' }, letra: 'B', paginas: [7, 9] };
  const leer = (url: string) => {
    const u = new URL(url);
    return { base: `${u.origin}${u.pathname}`, titulo: u.searchParams.get('title')!, cuerpo: u.searchParams.get('body')!, labels: u.searchParams.get('labels') };
  };

  it('opens a new GitHub issue in the project repository with the card context filled in', () => {
    const r = leer(urlReportarError({ ...datos, motivo: 'cita', comentario: 'La página es la 8.' }));
    expect(r.base).toBe('https://github.com/jorgemasta/29n/issues/new');
    expect(r.titulo).toContain('Vivienda y alquiler');
    expect(r.titulo).toContain('Partido AAA');
    expect(r.cuerpo).toContain(MOTIVOS_REPORTE.find((m) => m.id === 'cita')!.texto);
    expect(r.cuerpo).toContain('vivienda');
    expect(r.cuerpo).toContain('aaa');
    expect(r.cuerpo).toContain('7, 9');
    expect(r.cuerpo).toContain('La página es la 8.');
    expect(r.labels).toBe('reporte');
  });

  it('caps the comment at 300 characters and works without one', () => {
    const largo = 'x'.repeat(400);
    expect(leer(urlReportarError({ ...datos, motivo: 'otra', comentario: largo })).cuerpo).not.toContain('x'.repeat(301));
    expect(leer(urlReportarError({ ...datos, motivo: 'otra' })).cuerpo).not.toContain('undefined');
  });

  it('never sends what the voter chose or their province', () => {
    const r = leer(urlReportarError({ ...datos, motivo: 'sentido' }));
    expect(r.cuerpo).not.toMatch(/elegiste|elección|provincia/i);
  });
});

describe('urlFaltaPartido', () => {
  it('opens a new GitHub issue asking which party is missing', () => {
    const u = new URL(urlFaltaPartido());
    expect(`${u.origin}${u.pathname}`).toBe('https://github.com/jorgemasta/29n/issues/new');
    expect(u.searchParams.get('title')).toMatch(/Falta un partido/);
    expect(u.searchParams.get('body')).toMatch(/criterio/i);
  });
});

describe('avisos sin cuenta de GitHub (Cloudflare function, POST /api/avisar)', () => {
  const reporte = {
    tipo: 'reporte' as const,
    tema: { id: 'vivienda', titulo: 'Vivienda y alquiler' },
    partido: { id: 'aaa', nombre: 'Partido AAA' },
    letra: 'B',
    paginas: [7, 9],
    motivo: 'cita' as const,
    comentario: 'La página es la 8.',
  };
  const falta = { tipo: 'falta-partido' as const, partido: 'Partido Nuevo', provincias: 'Teruel', motivo: 'Candidatura proclamada (BOE).', enlace: 'https://ejemplo.org/programa.pdf' };

  function montar(conToken = true) {
    const creados: { titulo: string; cuerpo: string; etiquetas: string[] }[] = [];
    const almacen = crearAlmacenEnMemoria();
    const avisos = crearAvisos({
      almacen,
      crearIssue: conToken
        ? async (i) => {
            creados.push(i);
            return { url: `https://github.com/jorgemasta/29n/issues/${creados.length}` };
          }
        : undefined,
    });
    return { avisos, creados, almacen };
  }

  it('files the report as a GitHub issue with the same content as the prefilled link', async () => {
    const { avisos, creados } = montar();
    const r = await avisos.enviar(reporte, 's1');
    expect(r).toEqual({ estado: 'creado', url: 'https://github.com/jorgemasta/29n/issues/1' });
    const enlace = new URL(urlReportarError(reporte));
    expect(creados[0]!.titulo).toBe(enlace.searchParams.get('title'));
    expect(creados[0]!.cuerpo).toContain(enlace.searchParams.get('body')!);
    expect(creados[0]!.etiquetas).toEqual(['reporte']);
  });

  it('files "Falta un partido" with what the voter wrote', async () => {
    const { avisos, creados } = montar();
    expect(await avisos.enviar(falta, 's1')).toMatchObject({ estado: 'creado' });
    expect(creados[0]!.titulo).toBe('[Falta un partido] Partido Nuevo');
    expect(creados[0]!.cuerpo).toContain('Teruel');
    expect(creados[0]!.cuerpo).toContain('https://ejemplo.org/programa.pdf');
    expect(creados[0]!.etiquetas).toEqual(['falta-partido']);
  });

  it('without a token, tells the page to fall back to the prefilled GitHub link', async () => {
    const { avisos } = montar(false);
    expect(await avisos.enviar(reporte, 's1')).toEqual({ estado: 'no_disponible', alternativa: urlReportarError(reporte) });
    expect(await avisos.enviar(falta, 's1')).toMatchObject({ estado: 'no_disponible', alternativa: expect.stringContaining('/issues/new') });
  });

  it('rejects malformed requests and never mentions GitHub users', async () => {
    const { avisos, creados } = montar();
    for (const malo of [{}, { ...reporte, motivo: 'nada' }, { ...reporte, comentario: 'x'.repeat(301) }, { ...falta, partido: '' }, { ...falta, enlace: 'javascript:alert(1)' }])
      expect(await avisos.enviar(malo, 's1')).toMatchObject({ estado: 'invalido' });
    expect(creados).toHaveLength(0);
    await avisos.enviar({ ...reporte, comentario: 'Avisad a @alguien' }, 's1');
    expect(creados[0]!.cuerpo).not.toMatch(/@alguien/);
  });

  it('caps notices per day across all sessions, so a fresh session id per request cannot flood the repo', async () => {
    const { avisos, creados } = montar();
    for (let i = 0; i < LIMITE_AVISOS_DIA; i++) expect(await avisos.enviar(reporte, `sesion-${i}`)).toMatchObject({ estado: 'creado' });
    expect(await avisos.enviar(reporte, 'sesion-nueva')).toMatchObject({ estado: 'limite', alternativa: expect.stringContaining('github.com') });
    expect(creados).toHaveLength(LIMITE_AVISOS_DIA);
  });

  it('limits notices per session and falls back to the link when GitHub fails', async () => {
    const { avisos, almacen } = montar();
    for (let i = 0; i < LIMITE_AVISOS; i++) expect(await avisos.enviar(reporte, 's1')).toMatchObject({ estado: 'creado' });
    expect(await avisos.enviar(reporte, 's1')).toMatchObject({ estado: 'limite', alternativa: expect.stringContaining('github.com') });
    expect(JSON.stringify(almacen.volcado())).not.toContain('s1');
    const caido = crearAvisos({ crearIssue: async () => { throw new Error('502'); } });
    expect(await caido.enviar(reporte, 's2')).toMatchObject({ estado: 'error', alternativa: expect.stringContaining('/issues/new') });
  });
});
