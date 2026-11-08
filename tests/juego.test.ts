// Test point B: the game engine, exercised only through crearPartida.
import { describe, expect, it } from 'vitest';
import { crearPartida, NINGUNA } from '../src/juego';
import { validarDataset } from '../src/dataset';
import { datasetEjemplo } from './fixtures/dataset-ejemplo';
import { datasetTemas } from './fixtures/dataset-temas';
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
