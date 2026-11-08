// Test point B: the game engine, exercised only through crearPartida.
import { describe, expect, it } from 'vitest';
import { crearPartida, NINGUNA } from '../src/juego';
import { validarDataset } from '../src/dataset';
import { datasetEjemplo, notaEjemplo } from './fixtures/dataset-ejemplo';

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
