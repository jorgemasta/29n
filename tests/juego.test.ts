// Test point B: the game engine, exercised only through crearPartida.
import { describe, expect, it } from 'vitest';
import { crearPartida, NINGUNA } from '../src/juego';
import { validarDataset } from '../src/dataset';
import { datasetEjemplo, notaEjemplo } from './fixtures/dataset-ejemplo';
import { datasetTemas } from './fixtures/dataset-temas';
import { datasetPreguntas } from './fixtures/dataset-preguntas';
import type { Dataset } from '../src/dataset/esquema';
import datasetPublicado from '../data/dataset.json';

const partidosDe = (p: ReturnType<typeof crearPartida>, tema = 'vivienda') =>
  p.revelar(tema)!.tarjetas.map((t) => t.partido.id).sort();

describe('crearPartida', () => {
  it('uses a valid example dataset', () => {
    expect(validarDataset(datasetEjemplo)).toEqual({ valido: true, errores: [] });
  });

  it('starts with vivienda and shows anonymous cards with letters A, B, C…', () => {
    const partida = crearPartida(datasetEjemplo, null, 'semilla');
    const tema = partida.tema('vivienda');
    expect(tema.tema.titulo).toBe('Vivienda y alquiler');
    expect(tema.tarjetas.map((t) => t.letra)).toEqual(['A', 'B', 'C']);
    for (const t of tema.tarjetas) {
      expect(Object.keys(t).sort()).toEqual(['detalle', 'letra', 'titular']);
      expect(JSON.stringify(t)).not.toMatch(/aaa|bbb|ccc|AAA|BBB|CCC|Cita literal/);
    }
    expect(partida.temas().map((t) => t.id)).toEqual(['vivienda']);
  });

  it('shuffles cards stably per seed and topic', () => {
    const orden = (semilla: string) => crearPartida(datasetEjemplo, null, semilla).tema('vivienda').tarjetas.map((t) => t.titular).join('|');
    expect(orden('s1')).toBe(orden('s1'));
    const distintos = new Set(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].map(orden));
    expect(distintos.size).toBeGreaterThan(1);
  });

  it('does not offer "proposes nothing" as a card, but counts and reveals it', () => {
    const partida = crearPartida(datasetEjemplo, null, 's');
    expect(partida.tema('vivienda').sinPropuesta).toBe(1);
    const r = partida.elegir('vivienda', NINGUNA).revelar('vivienda')!;
    expect(r.sinPropuesta.map((p) => p.id)).toEqual(['nada']);
  });

  it('a party that proposes nothing cannot be chosen: it has no letter', () => {
    const partida = crearPartida(datasetEjemplo, null, 's');
    const letras = partida.tema('vivienda').tarjetas.map((t) => t.letra);
    expect(letras).toEqual(['A', 'B', 'C']);
    expect(() => partida.elegir('vivienda', 'D')).toThrow();
    for (const letra of letras) {
      const r = partida.elegir('vivienda', letra).revelar('vivienda')!;
      expect(r.tarjetas.find((t) => t.elegida)?.partido.id).not.toBe('nada');
    }
  });

  it('excludes pending parties and reports them as missing', () => {
    const partida = crearPartida(datasetEjemplo, null, 's');
    const r = partida.elegir('vivienda', 'A').revelar('vivienda')!;
    expect(partidosDe(partida.elegir('vivienda', 'A'))).not.toContain('pend');
    expect(r.pendientes.map((p) => p.id)).toEqual(['pend']);
  });

  it('adds regional parties and Canary topics only in their provinces', () => {
    const sinProvincia = crearPartida(datasetEjemplo, null, 's').elegir('vivienda', 'A');
    expect(partidosDe(sinProvincia)).toEqual(['aaa', 'bbb', 'ccc']);
    const lasPalmas = crearPartida(datasetEjemplo, '35', 's');
    expect(lasPalmas.tema('vivienda').tarjetas).toHaveLength(4);
    expect(lasPalmas.temas().map((t) => t.id)).toEqual(['vivienda', 'ref']);
    expect(crearPartida(datasetEjemplo, '28', 's').temas().map((t) => t.id)).toEqual(['vivienda']);
  });

  it('a topic with an unverified postura shows it neither as a card nor as "proposes nothing"', () => {
    const p = crearPartida(datasetEjemplo, '35', 's');
    expect(p.tema('ref').tarjetas).toHaveLength(3);
    const r = p.elegir('ref', 'A').revelar('ref')!;
    expect(r.sinVerificar.map((x) => x.id)).toEqual(['bbb']);
  });

  it('reveals nothing before choosing', () => {
    expect(crearPartida(datasetEjemplo, null, 's').revelar('vivienda')).toBeNull();
  });

  it('reveals who wrote each card, with the literal quote and a link to the PDF page', () => {
    const partida = crearPartida(datasetEjemplo, null, 's');
    const elegida = partida.tema('vivienda').tarjetas[1]!;
    const r = partida.elegir('vivienda', 'B').revelar('vivienda')!;
    expect(r.eleccion).toBe('B');
    const mia = r.tarjetas.find((t) => t.elegida)!;
    expect(mia.letra).toBe('B');
    expect(mia.titular).toBe(elegida.titular);
    expect(r.tarjetas.filter((t) => t.elegida)).toHaveLength(1);
    expect(mia.citas[0]).toEqual({
      texto: expect.stringContaining(`programa de ${mia.partido.id}`),
      pagina: 7,
      enlace: `https://ejemplo.org/${mia.partido.id}.pdf#page=7`,
    });
    expect(r.tarjetas.map((t) => t.letra)).toEqual(['A', 'B', 'C']);
  });

  it('shows the feasibility note on every revealed card, never before choosing', () => {
    const partida = crearPartida(datasetEjemplo, null, 's');
    for (const t of partida.tema('vivienda').tarjetas) expect(t).not.toHaveProperty('viabilidad');
    const r = partida.elegir('vivienda', NINGUNA).revelar('vivienda')!;
    const porPartido = Object.fromEntries(r.tarjetas.map((t) => [t.partido.id, t.viabilidad]));
    expect(porPartido.aaa).toEqual(notaEjemplo);
    expect(porPartido.bbb).toBeNull();
  });

  it('"Ninguna me convence" marks no card as chosen', () => {
    const r = crearPartida(datasetEjemplo, null, 's').elegir('vivienda', NINGUNA).revelar('vivienda')!;
    expect(r.eleccion).toBe(NINGUNA);
    expect(r.tarjetas.some((t) => t.elegida)).toBe(false);
  });

  it('rejects choosing a letter that is not a card', () => {
    expect(() => crearPartida(datasetEjemplo, null, 's').elegir('vivienda', 'Z')).toThrow();
  });

  it('is immutable and its state round-trips through JSON', () => {
    const inicial = crearPartida(datasetEjemplo, null, 's');
    const tras = inicial.elegir('vivienda', 'C');
    expect(inicial.revelar('vivienda')).toBeNull();
    const restaurada = crearPartida(datasetEjemplo, null, 's', JSON.parse(JSON.stringify(tras.estado)));
    expect(restaurada.revelar('vivienda')).toEqual(tras.revelar('vivienda'));
  });
});

describe('source types and the public/private mode switch', () => {
  const ids = (p: ReturnType<typeof crearPartida>) => partidosDe(p.elegir('vivienda', 'A'));

  it('the dataset with provisional sources is valid', () => {
    expect(validarDataset(datasetTemas)).toEqual({ valido: true, errores: [] });
  });

  it('public mode (the default) excludes provisional sources and lists those parties as pending', () => {
    const partida = crearPartida(datasetTemas, null, 's');
    expect(partida.tema('vivienda').tarjetas).toHaveLength(2);
    expect(ids(partida)).toEqual(['dos', 'uno']);
    expect(partida.elegir('vivienda', 'A').revelar('vivienda')!.pendientes.map((p) => p.id).sort()).toEqual(['dichos', 'viejo']);
    expect(ids(crearPartida(datasetTemas, null, 's', undefined, { modo: 'publico' }))).toEqual(['dos', 'uno']);
  });

  it('private mode includes provisional sources', () => {
    const partida = crearPartida(datasetTemas, null, 's', undefined, { modo: 'privado' });
    expect(partida.tema('vivienda').tarjetas).toHaveLength(4);
    expect(ids(partida)).toEqual(['dichos', 'dos', 'uno', 'viejo']);
  });

  it('every revealed postura states its source type and whether it is private-only', () => {
    const r = crearPartida(datasetTemas, null, 's', undefined, { modo: 'privado' }).elegir('vivienda', NINGUNA).revelar('vivienda')!;
    const fuentes = Object.fromEntries(r.tarjetas.map((t) => [t.partido.id, t.fuente]));
    expect(fuentes).toEqual({
      uno: { tipo: 'programa-29n', soloPrivado: false },
      dos: { tipo: 'programa-29n', soloPrivado: false },
      viejo: { tipo: 'programa-2023', soloPrivado: true },
      dichos: { tipo: 'declaraciones', soloPrivado: true },
    });
  });

  it('blind cards never reveal the source type', () => {
    const t = crearPartida(datasetTemas, null, 's', undefined, { modo: 'privado' }).tema('vivienda');
    for (const c of t.tarjetas) expect(Object.keys(c).sort()).toEqual(['detalle', 'letra', 'titular']);
  });

  it('the mode survives actions and state round-trips', () => {
    const p = crearPartida(datasetTemas, null, 's', undefined, { modo: 'privado' }).elegir('vivienda', 'A');
    expect(p.tema('empleo').tarjetas).toHaveLength(4);
  });
});

describe('navigating several topics', () => {
  const nueva = () => crearPartida(datasetTemas, null, 's');
  const hacer = (p: ReturnType<typeof crearPartida>, ...temas: string[]) => temas.reduce((acc, t) => acc.elegir(t, 'A'), p);

  it('topics come in their fixed order, vivienda first', () => {
    expect(nueva().temas().map((t) => t.id)).toEqual(['vivienda', 'empleo', 'sanidad', 'pensiones', 'impuestos', 'transporte', 'defensa']);
  });

  it('shows a visible goal of 5 topics, then extra topics', () => {
    let p = nueva();
    expect(p.posicion('vivienda')).toEqual({ tipo: 'meta', numero: 1, meta: 5 });
    expect(p.posicion('defensa')).toEqual({ tipo: 'meta', numero: 1, meta: 5 });
    p = hacer(p, 'vivienda');
    expect(p.posicion('vivienda')).toEqual({ tipo: 'meta', numero: 1, meta: 5 });
    expect(p.posicion('sanidad')).toEqual({ tipo: 'meta', numero: 2, meta: 5 });
    p = hacer(p, 'defensa', 'empleo', 'sanidad', 'pensiones');
    expect(p.posicion('pensiones')).toEqual({ tipo: 'meta', numero: 5, meta: 5 });
    expect(p.posicion('defensa')).toEqual({ tipo: 'meta', numero: 2, meta: 5 });
    expect(p.posicion('impuestos')).toEqual({ tipo: 'extra' });
    expect(p.hechos()).toEqual(['vivienda', 'defensa', 'empleo', 'sanidad', 'pensiones']);
  });

  it('"Ninguna me convence" counts as a done topic', () => {
    const p = nueva().elegir('vivienda', NINGUNA);
    expect(p.hechos()).toEqual(['vivienda']);
    expect(p.posicion('empleo')).toEqual({ tipo: 'meta', numero: 2, meta: 5 });
  });

  it('next topic follows the fixed order, skips done topics and wraps around', () => {
    let p = nueva();
    expect(p.siguiente('vivienda')?.id).toBe('empleo');
    p = hacer(p, 'vivienda', 'empleo', 'sanidad');
    expect(p.siguiente('vivienda')?.id).toBe('pensiones');
    expect(p.siguiente('defensa')?.id).toBe('pensiones');
    expect(p.siguiente()?.id).toBe('pensiones');
    p = hacer(p, 'pensiones', 'impuestos', 'transporte');
    expect(p.siguiente('transporte')?.id).toBe('defensa');
    expect(hacer(p, 'defensa').siguiente('defensa')).toBeNull();
  });

  it('the topic list shows the 5 suggested topics first, then the extra ones alphabetically, with their state', () => {
    const p = nueva().elegir('vivienda', 'B').elegir('defensa', NINGUNA);
    const l = p.lista();
    expect(l.sugeridos.map((i) => i.tema.id)).toEqual(['vivienda', 'empleo', 'sanidad', 'pensiones', 'impuestos']);
    expect(l.extra.map((i) => i.tema.id)).toEqual(['defensa', 'transporte']);
    expect(l.sugeridos[0]!.estado).toBe('hecho');
    expect(l.sugeridos[1]!.estado).toBe('sin_empezar');
    expect(l.extra[0]!.estado).toBe('ninguna');
  });
});

describe('the published topic registry', () => {
  const partida = crearPartida(datasetPublicado as Dataset, null, 's', undefined, { modo: 'privado' });

  it('the committed dataset is valid', () => {
    expect(validarDataset(datasetPublicado)).toEqual({ valido: true, errores: [] });
  });

  it('has ~18 national topics, vivienda first, each with a neutral question', () => {
    const temas = partida.temas();
    expect(temas.length).toBeGreaterThanOrEqual(17);
    expect(temas[0]!.id).toBe('vivienda');
    expect(new Set(temas.map((t) => t.id)).size).toBe(temas.length);
    for (const t of temas) {
      expect(t.ambito).toBe('nacional');
      expect(t.pregunta).toMatch(/^¿.+\?$/);
    }
  });

  it('explains jargon in plain words', () => {
    const conJerga = partida.temas().filter((t) => /\b(IRPF|OTAN|FP)\b/.test(t.titulo + t.pregunta));
    expect(conJerga.length).toBeGreaterThan(0);
    for (const t of conJerga) expect(t.explicacion).toBeTruthy();
  });

  it('every topic is playable with at least two cards in the private prototype', () => {
    for (const t of partida.temas()) expect(partida.tema(t.id).tarjetas.length).toBeGreaterThanOrEqual(2);
  });
});

describe('where the voter votes', () => {
  const ids = (l: { id: string }[]) => l.map((p) => p.id).sort();

  it('remembers its province', () => {
    expect(crearPartida(datasetEjemplo, '35', 's').provincia).toBe('35');
    expect(crearPartida(datasetEjemplo, null, 's').provincia).toBeNull();
    expect(crearPartida(datasetEjemplo, '35', 's').elegir('vivienda', 'A').provincia).toBe('35');
  });

  it('lists the national parties plus the ones running in the province, with the pending ones apart', () => {
    const lasPalmas = crearPartida(datasetEjemplo, '35', 's').partidos();
    expect(ids(lasPalmas.conPrograma)).toEqual(['aaa', 'bbb', 'ccc', 'isla', 'nada']);
    expect(ids(lasPalmas.pendientes)).toEqual(['pend', 'penreg']);
    expect(lasPalmas.conPrograma.filter((p) => p.regional).map((p) => p.id)).toEqual(['isla']);
    expect(lasPalmas.pendientes.find((p) => p.id === 'penreg')?.regional).toBe(true);

    const barcelona = crearPartida(datasetEjemplo, '08', 's').partidos();
    expect(ids(barcelona.conPrograma)).toEqual(['aaa', 'bbb', 'bcn', 'ccc', 'nada']);
    expect(ids(barcelona.pendientes)).toEqual(['pend']);
  });

  it('"Prefiero no decirlo" (no province) keeps only the national parties', () => {
    const p = crearPartida(datasetEjemplo, null, 's');
    expect(ids(p.partidos().conPrograma)).toEqual(['aaa', 'bbb', 'ccc', 'nada']);
    expect(p.partidos().conPrograma.some((x) => x.regional)).toBe(false);
    expect(partidosDe(p.elegir('vivienda', 'A'))).toEqual(['aaa', 'bbb', 'ccc']);
  });

  it('regional parties only get cards in their provinces', () => {
    expect(partidosDe(crearPartida(datasetEjemplo, '08', 's').elegir('vivienda', 'A'))).toEqual(['aaa', 'bbb', 'bcn', 'ccc']);
    expect(partidosDe(crearPartida(datasetEjemplo, '38', 's').elegir('vivienda', 'A'))).toEqual(['aaa', 'bbb', 'ccc', 'isla']);
  });

  it('pending parties never get a card, in any topic, and are reported as pending in the reveal', () => {
    const p = crearPartida(datasetEjemplo, '35', 's');
    for (const t of p.temas()) {
      const r = p.elegir(t.id, NINGUNA).revelar(t.id)!;
      expect(r.tarjetas.map((x) => x.partido.id)).not.toContain('penreg');
      expect(r.tarjetas.map((x) => x.partido.id)).not.toContain('pend');
      expect(ids(r.pendientes)).toEqual(['pend', 'penreg']);
    }
  });

  it('Canary topics only exist in the two Canary provinces', () => {
    expect(crearPartida(datasetEjemplo, '38', 's').temas().map((t) => t.id)).toEqual(['vivienda', 'ref']);
    expect(crearPartida(datasetEjemplo, null, 's').temas().map((t) => t.id)).toEqual(['vivienda']);
    expect(() => crearPartida(datasetEjemplo, '08', 's').tema('ref')).toThrow();
    expect(() => crearPartida(datasetEjemplo, null, 's').elegir('ref', 'A')).toThrow();
  });

  it('after a province change, choices stay saved but only topics available there count', () => {
    const enCanarias = crearPartida(datasetEjemplo, '35', 's').elegir('vivienda', 'A').elegir('ref', 'A');
    expect(enCanarias.hechos()).toEqual(['vivienda', 'ref']);
    const enMadrid = crearPartida(datasetEjemplo, '28', 's', enCanarias.estado);
    expect(enMadrid.hechos()).toEqual(['vivienda']);
    expect(crearPartida(datasetEjemplo, '38', 's', enMadrid.estado).hechos()).toEqual(['vivienda', 'ref']);
  });

  it('the published registry: both Canary topics appear only in Canary provinces, after the national ones', () => {
    const ds = datasetPublicado as Dataset;
    const canarios = ['ref-canarias', 'migracion-atlantica'];
    for (const prov of ['35', '38']) {
      const p = crearPartida(ds, prov, 's', undefined, { modo: 'privado' });
      expect(p.temas().slice(-2).map((t) => t.id)).toEqual(canarios);
      for (const id of canarios) expect(p.tema(id).tarjetas.length, `${prov}/${id}`).toBeGreaterThanOrEqual(2);
      expect(p.lista().extra.map((i) => i.tema.id)).toEqual(expect.arrayContaining(canarios));
    }
    for (const prov of [null, '28', '08']) {
      const ids = crearPartida(ds, prov, 's', undefined, { modo: 'privado' }).temas().map((t) => t.id);
      for (const id of canarios) expect(ids).not.toContain(id);
    }
  });
});

describe('Preguntar: suggested questions with precomputed answers', () => {
  const ids = (l: { id: string }[]) => l.map((p) => p.id).sort();
  const reveladas = (p: ReturnType<typeof crearPartida>, id = 'luz') => p.revelarPregunta(id).tarjetas.map((t) => t.partido.id).sort();

  it('uses a valid example dataset', () => {
    expect(validarDataset(datasetPreguntas)).toEqual({ valido: true, errores: [] });
  });

  it('lists the suggested questions in their fixed order', () => {
    expect(crearPartida(datasetPreguntas, null, 's').preguntas().map((p) => p.id)).toEqual(['luz', 'mili']);
    expect(crearPartida(datasetEjemplo, null, 's').preguntas()).toEqual([]);
  });

  it('shows each party\'s answer as an anonymous card A, B, C…', () => {
    const vista = crearPartida(datasetPreguntas, null, 's').pregunta('luz');
    expect(vista.pregunta.texto).toBe('¿Quién propone bajar el IVA de la luz?');
    expect(vista.tarjetas.map((t) => t.letra)).toEqual(['A', 'B']);
    for (const t of vista.tarjetas) {
      expect(Object.keys(t).sort()).toEqual(['detalle', 'letra', 'titular']);
      expect(JSON.stringify(t)).not.toMatch(/aaa|ccc|AAA|CCC|Cita literal/);
    }
    expect(vista.noMencionan).toBe(1);
    expect(vista.ninguno).toBe(false);
  });

  it('shuffles the answers stably per seed and question', () => {
    const orden = (semilla: string) => crearPartida(datasetPreguntas, '35', semilla).pregunta('luz').tarjetas.map((t) => t.titular).join('|');
    expect(orden('s1')).toBe(orden('s1'));
    expect(new Set(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].map(orden)).size).toBeGreaterThan(1);
  });

  it('reveals whose answer each one was, with its quote and PDF page, and who does not mention it', () => {
    const p = crearPartida(datasetPreguntas, null, 's');
    const anonimas = p.pregunta('luz').tarjetas;
    const r = p.revelarPregunta('luz');
    expect(r.tarjetas.map(({ letra, titular, detalle }) => ({ letra, titular, detalle }))).toEqual(anonimas);
    const aaa = r.tarjetas.find((t) => t.partido.id === 'aaa')!;
    expect(aaa.partido.nombre).toBe('Partido AAA');
    expect(aaa.citas).toEqual([{ texto: expect.stringContaining('Cita literal'), pagina: 3, enlace: 'https://ejemplo.org/aaa.pdf#page=3' }]);
    expect(aaa.tituloPrograma).toBe('Programa 2026');
    expect(aaa).not.toHaveProperty('viabilidad');
    expect(ids(r.noMencionan)).toEqual(['bbb']);
    expect(ids(r.sinVerificar)).toEqual(['nada']);
    expect(r.ninguno).toBe(false);
  });

  it('says when no programme talks about it', () => {
    const p = crearPartida(datasetPreguntas, null, 's');
    expect(p.pregunta('mili')).toMatchObject({ tarjetas: [], ninguno: true });
    expect(p.revelarPregunta('mili')).toMatchObject({ tarjetas: [], ninguno: true });
    expect(ids(p.revelarPregunta('mili').noMencionan)).toEqual(['aaa', 'bbb', 'ccc', 'nada']);
  });

  it('a party in play with no answer at all is shown as "no lo menciona", not hidden', () => {
    const sinAaa: Dataset = { ...datasetPreguntas, respuestas: datasetPreguntas.respuestas!.filter((r) => r.partido !== 'aaa') };
    const p = crearPartida(sinAaa, null, 's');
    expect(ids(p.revelarPregunta('luz').noMencionan)).toEqual(['aaa', 'bbb']);
    expect(p.pregunta('luz').noMencionan).toBe(2);
    // Same for live answers: a party left out of the answers did not mention it.
    const libre = { id: 'libre', texto: '¿Bicis?' };
    const soloCcc = datasetPreguntas.respuestas!.filter((r) => r.pregunta === 'luz' && r.partido === 'ccc').map((r) => ({ ...r, pregunta: 'libre' }));
    expect(ids(p.revelarPregunta(libre, soloCcc).noMencionan)).toEqual(['aaa', 'bbb', 'nada']);
  });

  it('respects the province: regional parties only answer where they run', () => {
    expect(reveladas(crearPartida(datasetPreguntas, null, 's'))).toEqual(['aaa', 'ccc']);
    expect(reveladas(crearPartida(datasetPreguntas, '35', 's'))).toEqual(['aaa', 'ccc', 'isla']);
    expect(reveladas(crearPartida(datasetPreguntas, '08', 's'))).toEqual(['aaa', 'bcn', 'ccc']);
  });

  it('pending parties never answer and are reported as pending', () => {
    const r = crearPartida(datasetPreguntas, '35', 's').revelarPregunta('luz');
    expect(ids(r.pendientes)).toEqual(['pend', 'penreg']);
  });

  it('answers of a party that only has a provisional source are hidden in public', () => {
    const conProvisional: Dataset = {
      ...datasetPreguntas,
      partidos: datasetPreguntas.partidos.map((p) =>
        p.id === 'aaa' && p.programa.estado === 'publicado' ? { ...p, programa: { ...p.programa, fuente: 'programa-2023' } } : p,
      ),
    };
    expect(reveladas(crearPartida(conProvisional, null, 's'))).toEqual(['ccc']);
    expect(reveladas(crearPartida(conProvisional, null, 's', undefined, { modo: 'privado' }))).toEqual(['aaa', 'ccc']);
  });

  it('answering does not count as a topic done', () => {
    const p = crearPartida(datasetPreguntas, null, 's');
    p.revelarPregunta('luz');
    expect(p.hechos()).toEqual([]);
  });

  it('anonymises answers that do not come from the dataset (live free question, #15) the same way', () => {
    const p = crearPartida(datasetPreguntas, '08', 's');
    const libre = { id: 'libre', texto: '¿Qué proponen sobre bicicletas?' };
    const deDataset = datasetPreguntas.respuestas!.filter((r) => r.pregunta === 'luz').map((r) => ({ ...r, pregunta: 'libre' }));
    const vista = p.pregunta(libre, deDataset);
    expect(vista.pregunta.texto).toBe('¿Qué proponen sobre bicicletas?');
    expect(vista.tarjetas).toHaveLength(3);
    expect(reveladasLibre()).toEqual(['aaa', 'bcn', 'ccc']);
    function reveladasLibre() {
      return p.revelarPregunta(libre, deDataset).tarjetas.map((t) => t.partido.id).sort();
    }
  });

  it('the published dataset answers the 7 suggested questions', () => {
    const p = crearPartida(datasetPublicado as Dataset, null, 's', undefined, { modo: 'privado' });
    expect(p.preguntas()).toHaveLength(7);
    for (const q of p.preguntas()) {
      const r = p.revelarPregunta(q.id);
      expect(r.tarjetas.length + r.noMencionan.length + r.sinVerificar.length, q.id).toBe(p.partidos().conPrograma.length);
    }
    expect(p.preguntas().some((q) => p.pregunta(q.id).ninguno)).toBe(true);
    expect(p.preguntas().filter((q) => p.pregunta(q.id).tarjetas.length >= 2).length).toBeGreaterThanOrEqual(4);
  });
});

// ---- #8: the full game (bet, affinity, priorities, re-shuffle, news) ----

type P = ReturnType<typeof crearPartida>;
/** The letter a party's card has in this topic for this partida (read through a throwaway reveal). */
const letraDe = (p: P, tema: string, partido: string) =>
  p.elegir(tema, NINGUNA).revelar(tema)!.tarjetas.find((t) => t.partido.id === partido)!.letra;
/** Choose a party's card (and optionally bet on a party). */
const elegirPartido = (p: P, tema: string, partido: string, apuesta?: string) =>
  p.elegir(tema, letraDe(p, tema, partido), apuesta ? { apuesta } : undefined);
const privada = (estado?: Parameters<typeof crearPartida>[3]) =>
  crearPartida(datasetTemas, null, 's', estado, { modo: 'privado' });

describe('confirming with an optional bet', () => {
  it('offers as bet chips the parties with a card in the topic, by name', () => {
    expect(privada().opcionesApuesta('vivienda').map((p) => p.id)).toEqual(['dichos', 'dos', 'uno', 'viejo']);
    const ejemplo = crearPartida(datasetEjemplo, null, 's').opcionesApuesta('vivienda').map((p) => p.id);
    expect(ejemplo).toEqual(['aaa', 'bbb', 'ccc']); // never the party that proposes nothing, nor a pending one
  });

  it('the reveal says whether the bet was right', () => {
    const acierto = elegirPartido(privada(), 'vivienda', 'uno', 'uno').revelar('vivienda')!;
    expect(acierto.apuesta).toEqual({ partido: expect.objectContaining({ id: 'uno' }), acertada: true });
    const fallo = elegirPartido(privada(), 'vivienda', 'uno', 'dos').revelar('vivienda')!;
    expect(fallo.apuesta).toEqual({ partido: expect.objectContaining({ id: 'dos', nombre: 'Partido dos' }), acertada: false });
  });

  it('betting is optional', () => {
    expect(elegirPartido(privada(), 'vivienda', 'uno').revelar('vivienda')!.apuesta).toBeNull();
  });

  it('rejects a bet on a party without a card, and a bet with "Ninguna me convence"', () => {
    const p = crearPartida(datasetEjemplo, null, 's');
    expect(() => elegirPartido(p, 'vivienda', 'aaa', 'nada')).toThrow();
    expect(() => elegirPartido(p, 'vivienda', 'aaa', 'pend')).toThrow();
    expect(() => p.elegir('vivienda', NINGUNA, { apuesta: 'aaa' })).toThrow();
  });

  it('the bet is saved in the state and survives a JSON round-trip', () => {
    const p = elegirPartido(privada(), 'vivienda', 'uno', 'dos');
    expect(privada(JSON.parse(JSON.stringify(p.estado))).revelar('vivienda')!.apuesta?.acertada).toBe(false);
  });
});

describe('the factual journey label in the reveal', () => {
  it('first choice, first time a party is chosen, then "N temas, K partidos distintos"', () => {
    let p = elegirPartido(privada(), 'vivienda', 'uno');
    expect(p.revelar('vivienda')!.recorrido).toEqual({ tipo: 'primera' });
    p = elegirPartido(p, 'empleo', 'dos');
    expect(p.revelar('empleo')!.recorrido).toEqual({ tipo: 'partido_nuevo', partido: expect.objectContaining({ id: 'dos' }) });
    p = elegirPartido(p, 'sanidad', 'uno');
    expect(p.revelar('sanidad')!.recorrido).toEqual({ tipo: 'distintos', temas: 3, partidos: 2 });
  });

  it('no label for a repeated party before topic 3, nor for "Ninguna" after the first', () => {
    let p = elegirPartido(privada(), 'vivienda', 'uno');
    p = elegirPartido(p, 'empleo', 'uno');
    expect(p.revelar('empleo')!.recorrido).toBeNull();
    p = p.elegir('sanidad', NINGUNA);
    expect(p.revelar('sanidad')!.recorrido).toBeNull();
  });
});

describe('affinity result', () => {
  const cinco = (): P => {
    let p = privada();
    p = elegirPartido(p, 'vivienda', 'uno');
    p = elegirPartido(p, 'empleo', 'uno');
    p = elegirPartido(p, 'sanidad', 'dos');
    p = elegirPartido(p, 'pensiones', 'viejo');
    return p.elegir('impuestos', NINGUNA);
  };

  it('is not offered before 5 topics', () => {
    let p = privada();
    for (const t of ['vivienda', 'empleo', 'sanidad', 'pensiones']) {
      p = elegirPartido(p, t, 'uno');
      expect(p.resultado().disponible).toBe(false);
    }
    expect(p.resultado().temas).toBe(4);
    expect(p.elegir('impuestos', NINGUNA).resultado().disponible).toBe(true);
  });

  it('ranks every party in play with a percentage, including 0 %, ties alphabetically with the same place', () => {
    const r = cinco().resultado();
    expect(r.ranking.map((f) => [f.partido.id, f.puesto, f.porcentaje, f.temas, f.empate])).toEqual([
      ['uno', 1, 40, 2, false],
      ['dos', 2, 20, 1, true],
      ['viejo', 2, 20, 1, true],
      ['dichos', 4, 0, 0, false],
    ]);
  });

  it('"Ninguna me convence" adds to no party and is counted apart', () => {
    const r = cinco().resultado();
    expect(r.temas).toBe(5);
    expect(r.ninguna).toBe(1);
    expect(r.ranking.reduce((s, f) => s + f.puntos, 0)).toBe(4);
    expect(r.partidosDistintos).toBe(3);
  });

  it('when every choice is "Ninguna" there is no ranking', () => {
    const p = ['vivienda', 'empleo', 'sanidad', 'pensiones', 'impuestos'].reduce((acc, t) => acc.elegir(t, NINGUNA), privada());
    const r = p.resultado();
    expect(r.disponible).toBe(true);
    expect(r.todoNinguna).toBe(true);
    expect(r.ranking).toEqual([]);
  });

  it('up to 3 priority topics count double', () => {
    const p = cinco().marcarPrioritario('sanidad', true).marcarPrioritario('pensiones', true);
    expect(p.prioritarios()).toEqual(['sanidad', 'pensiones']);
    const r = p.resultado();
    // weights: vivienda 1, empleo 1, sanidad 2, pensiones 2, impuestos 1 → 7 points possible
    expect(r.ranking.map((f) => [f.partido.id, f.puntos, f.porcentaje])).toEqual([
      ['dos', 2, 29],
      ['uno', 2, 29],
      ['viejo', 2, 29],
      ['dichos', 0, 0],
    ]);
    expect(p.marcarPrioritario('sanidad', false).prioritarios()).toEqual(['pensiones']);
  });

  it('refuses a 4th priority topic and topics not done yet', () => {
    const p = cinco().marcarPrioritario('vivienda', true).marcarPrioritario('empleo', true).marcarPrioritario('sanidad', true);
    expect(() => p.marcarPrioritario('pensiones', true)).toThrow(/3/);
    expect(() => cinco().marcarPrioritario('defensa', true)).toThrow();
    expect(p.marcarPrioritario('vivienda', true).prioritarios()).toHaveLength(3);
  });

  it('warns about parties with a pending programme and about the missing province', () => {
    const publica = ['vivienda', 'empleo', 'sanidad', 'pensiones', 'impuestos'].reduce(
      (acc, t) => elegirPartido(acc, t, 'uno'),
      crearPartida(datasetTemas, null, 's'),
    );
    const r = publica.resultado();
    expect(r.pendientes.map((p) => p.id)).toEqual(['dichos', 'viejo']);
    expect(r.sinProvincia).toBe(true);
    expect(r.ranking.map((f) => f.partido.id)).toEqual(['uno', 'dos']);
    expect(crearPartida(datasetEjemplo, '28', 's').resultado().sinProvincia).toBe(false);
  });

  it('summarises the bets: how many times the chosen card was not from the party guessed', () => {
    let p = privada();
    p = elegirPartido(p, 'vivienda', 'uno', 'dos');
    p = elegirPartido(p, 'empleo', 'uno', 'uno');
    p = elegirPartido(p, 'sanidad', 'dos', 'viejo');
    p = elegirPartido(p, 'pensiones', 'dos');
    const a = p.resultado().apuestas;
    expect(a.total).toBe(3);
    expect(a.falladas).toBe(2);
    expect(a.sorpresas.map((s) => [s.partido.id, s.temas.map((t) => t.id)])).toEqual([
      ['dos', ['sanidad']],
      ['uno', ['vivienda']],
    ]);
  });
});

describe('choosing again', () => {
  it('"Volver a elegir" forgets the choice and re-shuffles the cards', () => {
    const p = elegirPartido(privada(), 'vivienda', 'uno', 'dos');
    const antes = p.tema('vivienda');
    const otra = p.volverAElegir('vivienda');
    expect(otra.revelar('vivienda')).toBeNull();
    expect(otra.hechos()).toEqual([]);
    const despues = otra.tema('vivienda');
    expect(despues.barajado).not.toBe(antes.barajado);
    // with 4 cards some re-shuffle within a few tries changes the order
    let q = otra;
    const ordenes = new Set([antes.tarjetas.map((t) => t.titular).join('|')]);
    for (let i = 0; i < 6; i++) {
      ordenes.add(q.tema('vivienda').tarjetas.map((t) => t.titular).join('|'));
      q = q.barajarOtraVez('vivienda');
    }
    expect(ordenes.size).toBeGreaterThan(1);
  });

  it('the re-shuffled order is stable after a JSON round-trip', () => {
    const p = elegirPartido(privada(), 'vivienda', 'uno').volverAElegir('vivienda');
    expect(privada(JSON.parse(JSON.stringify(p.estado))).tema('vivienda')).toEqual(p.tema('vivienda'));
  });

  it('"Barajar otra vez" only before choosing', () => {
    expect(() => elegirPartido(privada(), 'vivienda', 'uno').barajarOtraVez('vivienda')).toThrow();
  });
});

describe('returning visit: news', () => {
  const conDos = (estado: 'publicado' | 'pendiente'): Dataset => ({
    ...datasetTemas,
    partidos: datasetTemas.partidos.map((p) =>
      p.id === 'dos' && estado === 'pendiente' ? { ...p, programa: { estado: 'pendiente' } } : p,
    ),
    posturas: estado === 'pendiente' ? datasetTemas.posturas.filter((p) => p.partido !== 'dos') : datasetTemas.posturas,
  });

  it('announces parties that published their programme since last visit and the done topics with a new proposal', () => {
    let p = crearPartida(conDos('pendiente'), null, 's').marcarConocidos();
    p = p.elegir('vivienda', 'A').elegir('empleo', NINGUNA);
    expect(p.novedades()).toEqual({ partidos: [], temas: [] });

    const vuelta = crearPartida(conDos('publicado'), null, 's', JSON.parse(JSON.stringify(p.estado)));
    const n = vuelta.novedades();
    expect(n.partidos.map((x) => x.id)).toEqual(['dos']);
    expect(n.temas.map((t) => [t.tema.id, t.nuevas])).toEqual([['vivienda', 1], ['empleo', 1]]);
    expect(vuelta.lista().sugeridos[0]!.nuevas).toBe(1);
    expect(vuelta.lista().sugeridos[2]!.nuevas).toBe(0);
    expect(vuelta.resultado().temasConNovedades).toBe(2);
  });

  it('news are announced once; topic news last until reviewed or kept', () => {
    let p = crearPartida(conDos('pendiente'), null, 's').marcarConocidos().elegir('vivienda', 'A').elegir('empleo', 'A');
    p = crearPartida(conDos('publicado'), null, 's', p.estado);
    const vista = p.marcarConocidos();
    expect(vista.novedades().partidos).toEqual([]);
    expect(vista.novedades().temas).toHaveLength(2);
    // reviewing one topic (choose again) clears its news, keeping the old choice until then
    expect(vista.revelar('vivienda')).not.toBeNull();
    const repasada = elegirPartido(vista.volverAElegir('vivienda'), 'vivienda', 'dos');
    expect(repasada.novedades().temas.map((t) => t.tema.id)).toEqual(['empleo']);
    expect(vista.mantenerElecciones().novedades().temas).toEqual([]);
    expect(vista.mantenerElecciones().revelar('empleo')!.eleccion).not.toBe(NINGUNA);
  });

  it('a state without known parties (first visit) has no news', () => {
    expect(crearPartida(datasetTemas, null, 's').novedades()).toEqual({ partidos: [], temas: [] });
  });
});

describe('pending parties in the reveal', () => {
  it('lists the pending parties of the zone, by name', () => {
    const r = crearPartida(datasetEjemplo, '35', 's').elegir('vivienda', NINGUNA).revelar('vivienda')!;
    expect(r.pendientes.map((p) => [p.id, p.regional])).toEqual([['pend', false], ['penreg', true]]);
  });
});

// The client network/privacy check (engine + web make no calls; only src/web/analitica.ts hands
// validated events to Umami) lives in tests/analitica.test.ts.
