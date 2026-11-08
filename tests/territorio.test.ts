// Party registry and territory: where the voter votes, and which parties count there.
import { describe, expect, it } from 'vitest';
import municipiosIne from '../data/municipios.json';
import { crearBuscador, PROVINCIAS, provinciaPorCodigo, type Municipios } from '../src/registro/territorio';
import { ambitoSegunCriterio, cumpleCriterio, type DatosInclusion } from '../src/registro/inclusion';
import { PARTIDOS, REGISTRO } from '../src/registro/partidos';
import { TEMAS } from '../src/registro/temas';
import { PALABRAS_CLAVE } from '../src/registro/palabras-clave';
import { DOMINIOS_OFICIALES } from '../src/registro/dominios';
import { TERMINOS } from '../src/registro/terminos';
import { FUENTES_PROGRAMAS } from '../src/vigilante/fuentes';

const buscador = crearBuscador(municipiosIne as Municipios);
const primero = (q: string) => buscador.buscar(q)[0];

describe('place search', () => {
  it('has the 52 provinces, Ceuta and Melilla included', () => {
    expect(PROVINCIAS).toHaveLength(52);
    expect(new Set(PROVINCIAS.map((p) => p.codigo)).size).toBe(52);
    expect(provinciaPorCodigo('51')?.nombre).toBe('Ceuta');
  });

  it('uses the official INE list of ~8,100 municipalities', () => {
    expect(municipiosIne.total).toBeGreaterThan(8000);
    expect(municipiosIne.url).toMatch(/^https:\/\/www\.ine\.es\//);
    expect(Object.keys(municipiosIne.municipios)).toHaveLength(52);
  });

  it('finds a municipality and shows what it resolves to', () => {
    expect(primero('Telde')).toMatchObject({ tipo: 'municipio', nombre: 'Telde', provincia: '35', resolucion: 'Telde → Las Palmas' });
  });

  it('ignores accents and case', () => {
    expect(primero('MALAGA')).toMatchObject({ tipo: 'provincia', provincia: '29' });
    expect(primero('caceres')).toMatchObject({ provincia: '10' });
    expect(primero('santa cruz de tenerife')).toMatchObject({ tipo: 'provincia', provincia: '38' });
  });

  it('accepts province name variants', () => {
    for (const q of ['A Coruña', 'La Coruña', 'Coruña', 'coruna']) expect(primero(q), q).toMatchObject({ tipo: 'provincia', provincia: '15' });
    for (const q of ['Girona', 'Gerona']) expect(primero(q), q).toMatchObject({ tipo: 'provincia', provincia: '17' });
    for (const q of ['Vizcaya', 'Bizkaia']) expect(primero(q), q).toMatchObject({ provincia: '48' });
    for (const q of ['Lérida', 'Orense', 'Guipúzcoa', 'Baleares', 'Alacant']) expect(primero(q), q).toMatchObject({ tipo: 'provincia' });
  });

  it('reads INE names with the article at the end and bilingual names', () => {
    expect(primero('Las Palmas de Gran Canaria')).toMatchObject({ tipo: 'municipio', provincia: '35' });
    expect(primero('Las Rozas')).toMatchObject({ tipo: 'municipio', provincia: '28' });
    expect(primero("L'Hospitalet")).toMatchObject({ tipo: 'municipio', provincia: '08' });
    expect(primero('Donostia')).toMatchObject({ tipo: 'municipio', provincia: '20' });
    expect(primero('San Sebastián')).toMatchObject({ tipo: 'municipio', provincia: '20' });
  });

  it('finds islands', () => {
    expect(primero('Lanzarote')).toMatchObject({ tipo: 'isla', provincia: '35', resolucion: 'Lanzarote → Las Palmas' });
    expect(primero('la gomera')).toMatchObject({ tipo: 'isla', provincia: '38' });
    expect(primero('Ibiza')).toMatchObject({ tipo: 'isla', provincia: '07' });
  });

  it('lists every province a repeated municipality name belongs to', () => {
    const r = buscador.buscar('Villanueva de la Fuente');
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r.every((x) => x.nombre.startsWith('Villanueva de la Fuente'))).toBe(true);
  });

  it('returns nothing for an unknown place', () => {
    expect(buscador.buscar('Narnia')).toEqual([]);
    expect(buscador.buscar('  ')).toEqual([]);
  });
});

describe('inclusion criterion', () => {
  const base: DatosInclusion = {
    representacion: { congreso: false, parlamentos: [] },
    candidaturas: { provincias: 'todas', estado: 'provisional', fuente: 'prueba' },
  };

  it('needs a candidature in the province AND current seats in Congress or that region’s parliament', () => {
    const enCongreso = { ...base, representacion: { congreso: true, parlamentos: [] } };
    expect(cumpleCriterio(enCongreso, '28')).toBe(true);
    expect(cumpleCriterio({ ...enCongreso, candidaturas: { ...base.candidaturas, provincias: ['08'] } }, '28')).toBe(false);
    // Seats only in the Canary parliament (CCAA 05): counts in Canary provinces only.
    const canario = { ...base, representacion: { congreso: false, parlamentos: ['05'] } };
    expect(cumpleCriterio(canario, '35')).toBe(true);
    expect(cumpleCriterio(canario, '38')).toBe(true);
    expect(cumpleCriterio(canario, '28')).toBe(false);
    expect(cumpleCriterio(base, '28')).toBe(false);
  });

  it('a party included in all 52 provinces is national; otherwise it is listed by province, or left out', () => {
    expect(ambitoSegunCriterio({ ...base, representacion: { congreso: true, parlamentos: [] } })).toEqual({ tipo: 'estatal' });
    expect(ambitoSegunCriterio({ ...base, representacion: { congreso: false, parlamentos: ['05'] } })).toEqual({ tipo: 'provincias', provincias: ['35', '38'] });
    expect(ambitoSegunCriterio(base)).toBeNull();
  });
});

describe('the real registry', () => {
  it('every party has inclusion data marked with its status (provisional until candidatures are proclaimed)', () => {
    for (const r of REGISTRO) {
      expect(['provisional', 'proclamada']).toContain(r.inclusion.candidaturas.estado);
      expect(r.inclusion.candidaturas.fuente).toBeTruthy();
    }
  });

  it('only the parties that meet the criterion somewhere are in PARTIDOS, with the derived scope', () => {
    for (const r of REGISTRO) {
      const ambito = ambitoSegunCriterio(r.inclusion);
      if (ambito) expect(PARTIDOS[r.id]?.ambito).toEqual(ambito);
      else expect(PARTIDOS[r.id]).toBeUndefined();
    }
  });

  it('every registered party has identifying terms and official domains', () => {
    for (const id of Object.keys(PARTIDOS)) {
      expect(TERMINOS[id]?.length, id).toBeGreaterThan(0);
      expect(DOMINIOS_OFICIALES[id]?.length, id).toBeGreaterThan(0);
    }
  });

  it('the watcher watches every registered party, only on its official domains', () => {
    for (const id of Object.keys(PARTIDOS)) expect(FUENTES_PROGRAMAS.some((f) => f.partido === id), id).toBe(true);
    for (const f of FUENTES_PROGRAMAS) {
      expect(PARTIDOS[f.partido], f.partido).toBeDefined();
      const host = new URL(f.url).hostname;
      expect(DOMINIOS_OFICIALES[f.partido]!.some((d) => host === d || host.endsWith(`.${d}`)), f.url).toBe(true);
    }
  });

  it('has the 18 national topics and the 2 Canary topics', () => {
    expect(TEMAS.filter((t) => t.ambito === 'nacional')).toHaveLength(18);
    const canarias = TEMAS.filter((t) => t.ambito === 'canarias').map((t) => t.id);
    expect(canarias).toEqual(['ref-canarias', 'migracion-atlantica']);
    expect(new Set(TEMAS.map((t) => t.orden)).size).toBe(TEMAS.length);
  });

  it('every topic has its own V12 keywords', () => {
    for (const t of TEMAS) expect(PALABRAS_CLAVE[t.id]?.length, t.id).toBeGreaterThanOrEqual(5);
  });
});
