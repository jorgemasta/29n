// Party registry and territory: where the voter votes, and which parties count there.
import { describe, expect, it } from 'vitest';
import ineMunicipalities from '../data/municipalities.json';
import { createFinder, PROVINCES, provinceByCode, type Municipalities } from '../src/registry/territory';
import { scopeByCriterion, meetsCriterion, type InclusionData } from '../src/registry/inclusion';
import { PARTIES, REGISTRY } from '../src/registry/parties';
import { TOPICS } from '../src/registry/topics';
import { OFFICIAL_DOMAINS } from '../src/registry/domains';
import { TERMS } from '../src/registry/terms';
import { MANIFESTO_SOURCES } from '../src/watcher/sources';

const finder = createFinder(ineMunicipalities as Municipalities);
const first = (q: string) => finder.search(q)[0];

describe('place search', () => {
  it('has the 52 provinces, Ceuta and Melilla included', () => {
    expect(PROVINCES).toHaveLength(52);
    expect(new Set(PROVINCES.map((p) => p.code)).size).toBe(52);
    expect(provinceByCode('51')?.name).toBe('Ceuta');
  });

  it('uses the official INE list of ~8,100 municipalities', () => {
    expect(ineMunicipalities.total).toBeGreaterThan(8000);
    expect(ineMunicipalities.url).toMatch(/^https:\/\/www\.ine\.es\//);
    expect(Object.keys(ineMunicipalities.municipalities)).toHaveLength(52);
  });

  it('finds a municipality and shows what it resolves to', () => {
    expect(first('Telde')).toMatchObject({ type: 'municipality', name: 'Telde', province: '35', resolution: 'Telde → Las Palmas' });
  });

  it('ignores accents and case', () => {
    expect(first('MALAGA')).toMatchObject({ type: 'province', province: '29' });
    expect(first('caceres')).toMatchObject({ province: '10' });
    expect(first('santa cruz de tenerife')).toMatchObject({ type: 'province', province: '38' });
  });

  it('accepts province name variants', () => {
    for (const q of ['A Coruña', 'La Coruña', 'Coruña', 'coruna']) expect(first(q), q).toMatchObject({ type: 'province', province: '15' });
    for (const q of ['Girona', 'Gerona']) expect(first(q), q).toMatchObject({ type: 'province', province: '17' });
    for (const q of ['Vizcaya', 'Bizkaia']) expect(first(q), q).toMatchObject({ province: '48' });
    for (const q of ['Lérida', 'Orense', 'Guipúzcoa', 'Baleares', 'Alacant']) expect(first(q), q).toMatchObject({ type: 'province' });
  });

  it('reads INE names with the article at the end and bilingual names', () => {
    expect(first('Las Palmas de Gran Canaria')).toMatchObject({ type: 'municipality', province: '35' });
    expect(first('Las Rozas')).toMatchObject({ type: 'municipality', province: '28' });
    expect(first("L'Hospitalet")).toMatchObject({ type: 'municipality', province: '08' });
    expect(first('Donostia')).toMatchObject({ type: 'municipality', province: '20' });
    expect(first('San Sebastián')).toMatchObject({ type: 'municipality', province: '20' });
  });

  it('finds islands', () => {
    expect(first('Lanzarote')).toMatchObject({ type: 'island', province: '35', resolution: 'Lanzarote → Las Palmas' });
    expect(first('la gomera')).toMatchObject({ type: 'island', province: '38' });
    expect(first('Ibiza')).toMatchObject({ type: 'island', province: '07' });
  });

  it('lists every province a repeated municipality name belongs to', () => {
    const r = finder.search('Villanueva de la Fuente');
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r.every((x) => x.name.startsWith('Villanueva de la Fuente'))).toBe(true);
  });

  it('returns nothing for an unknown place', () => {
    expect(finder.search('Narnia')).toEqual([]);
    expect(finder.search('  ')).toEqual([]);
  });
});

describe('inclusion criterion', () => {
  const base: InclusionData = {
    representation: { congress: false, parliaments: [] },
    candidatures: { provinces: 'all', state: 'provisional', source: 'test' },
  };

  it('needs a candidature in the province AND current seats in Congress or that region’s parliament', () => {
    const inCongress = { ...base, representation: { congress: true, parliaments: [] } };
    expect(meetsCriterion(inCongress, '28')).toBe(true);
    expect(meetsCriterion({ ...inCongress, candidatures: { ...base.candidatures, provinces: ['08'] } }, '28')).toBe(false);
    // Seats only in the Canary parliament (CCAA 05): counts in Canary provinces only.
    const canary = { ...base, representation: { congress: false, parliaments: ['05'] } };
    expect(meetsCriterion(canary, '35')).toBe(true);
    expect(meetsCriterion(canary, '38')).toBe(true);
    expect(meetsCriterion(canary, '28')).toBe(false);
    expect(meetsCriterion(base, '28')).toBe(false);
  });

  it('a party included in all 52 provinces is national; otherwise it is listed by province, or left out', () => {
    expect(scopeByCriterion({ ...base, representation: { congress: true, parliaments: [] } })).toEqual({ type: 'national' });
    expect(scopeByCriterion({ ...base, representation: { congress: false, parliaments: ['05'] } })).toEqual({ type: 'provinces', provinces: ['35', '38'] });
    expect(scopeByCriterion(base)).toBeNull();
  });
});

describe('the real registry', () => {
  it('every party has inclusion data marked with its status (provisional until candidatures are proclaimed)', () => {
    for (const r of REGISTRY) {
      expect(['provisional', 'proclaimed']).toContain(r.inclusion.candidatures.state);
      expect(r.inclusion.candidatures.source).toBeTruthy();
    }
  });

  it('only the parties that meet the criterion somewhere are in PARTIES, with the derived scope', () => {
    for (const r of REGISTRY) {
      const scope = scopeByCriterion(r.inclusion);
      if (scope) expect(PARTIES[r.id]?.scope).toEqual(scope);
      else expect(PARTIES[r.id]).toBeUndefined();
    }
  });

  it('every registered party has identifying terms and official domains', () => {
    for (const id of Object.keys(PARTIES)) {
      expect(TERMS[id]?.length, id).toBeGreaterThan(0);
      expect(OFFICIAL_DOMAINS[id]?.length, id).toBeGreaterThan(0);
    }
  });

  it('the watcher watches every registered party, only on its official domains', () => {
    for (const id of Object.keys(PARTIES)) expect(MANIFESTO_SOURCES.some((f) => f.party === id), id).toBe(true);
    for (const f of MANIFESTO_SOURCES) {
      expect(PARTIES[f.party], f.party).toBeDefined();
      const host = new URL(f.url).hostname;
      expect(OFFICIAL_DOMAINS[f.party]!.some((d) => host === d || host.endsWith(`.${d}`)), f.url).toBe(true);
    }
  });

  it('has the 18 national topics and the 2 Canary topics', () => {
    expect(TOPICS.filter((t) => t.scope === 'national')).toHaveLength(18);
    const canarias = TOPICS.filter((t) => t.scope === 'canarias').map((t) => t.id);
    expect(canarias).toEqual(['ref-canarias', 'migracion-atlantica']);
    expect(new Set(TOPICS.map((t) => t.order)).size).toBe(TOPICS.length);
  });
});
