// Analytics (#13): funnel + bet hit rate per topic, never the chosen party or the ranking.
import { describe, expect, it } from 'vitest';
import { crearPartida, NINGUNA } from '../src/juego';
import {
  EVENTOS,
  esEventoValido,
  eventoCompartio,
  eventoEmpezo,
  eventoVioResultado,
  eventosAlConfirmar,
  type Evento,
} from '../src/analitica/eventos';
import { crearContadorUmami, crearPuertosGitHub } from '../src/apuestas/adaptadores';
import { comprobarApuestas, UMBRAL_ACIERTO, MINIMO_APUESTAS, type PuertosApuestas } from '../src/apuestas';
import { datasetTemas } from './fixtures/dataset-temas';

type P = ReturnType<typeof crearPartida>;
const nueva = () => crearPartida(datasetTemas, null, 's', undefined, { modo: 'privado' });
const letraDe = (p: P, tema: string, partido: string) =>
  p.elegir(tema, NINGUNA).revelar(tema)!.tarjetas.find((t) => t.partido.id === partido)!.letra;
/** Confirm a party's card, returning the partida before and after (what the app hook sees). */
const confirmar = (antes: P, tema: string, partido: string | null, apuesta?: string) => {
  const letra = partido ? letraDe(antes, tema, partido) : NINGUNA;
  const despues = antes.elegir(tema, letra, apuesta ? { apuesta } : undefined);
  return { despues, eventos: eventosAlConfirmar(antes, despues, tema) };
};

const PARTIDOS = datasetTemas.partidos.flatMap((p) => [p.id, p.nombre, p.siglas]).filter(Boolean) as string[];
/** No event may carry a party (id, name, acronym) or ranking data, anywhere. */
const sinPartidos = (eventos: Evento[]) => {
  for (const e of eventos) {
    expect(esEventoValido(e), JSON.stringify(e)).toBe(true);
    const valores = Object.values(e.datos ?? {}).map(String);
    for (const v of valores) for (const p of PARTIDOS) expect(v.toLowerCase()).not.toBe(p.toLowerCase());
    // field names: only 'tema' / 'variante' (the share variant 'ranking' names the card type, not its content)
    expect(Object.keys(e.datos ?? {}).every((k) => k === 'tema' || k === 'variante')).toBe(true);
    expect(e.nombre).not.toMatch(/ranking|porcentaje|puntos|partido|eleccion|letra|provincia/i);
  }
};

describe('analytics events', () => {
  it('confirming a topic sends "topic completed" with the topic only', () => {
    const { eventos } = confirmar(nueva(), 'vivienda', 'uno');
    expect(eventos).toEqual([{ nombre: 'tema-completado', datos: { tema: 'vivienda' } }]);
    sinPartidos(eventos);
  });

  it('"Ninguna me convence" is indistinguishable from any other choice', () => {
    const { eventos } = confirmar(nueva(), 'vivienda', null);
    expect(eventos).toEqual([{ nombre: 'tema-completado', datos: { tema: 'vivienda' } }]);
  });

  it('a bet sends the topic and hit/miss, never the party chosen or bet on', () => {
    const acierto = confirmar(nueva(), 'vivienda', 'uno', 'uno').eventos;
    expect(acierto).toContainEqual({ nombre: 'apuesta-acierto', datos: { tema: 'vivienda' } });
    const fallo = confirmar(nueva(), 'vivienda', 'uno', 'dos').eventos;
    expect(fallo).toContainEqual({ nombre: 'apuesta-fallo', datos: { tema: 'vivienda' } });
    expect(fallo.some((e) => e.nombre === 'apuesta-acierto')).toBe(false);
    sinPartidos([...acierto, ...fallo]);
  });

  it('the bet event is the same whatever party was chosen (only hit/miss varies)', () => {
    const a = confirmar(nueva(), 'vivienda', 'uno', 'uno').eventos;
    const b = confirmar(nueva(), 'vivienda', 'dos', 'dos').eventos;
    expect(a).toEqual(b);
  });

  it('sends "5 topics completed" exactly when the fifth topic is done', () => {
    let p = nueva();
    const todos: Evento[] = [];
    for (const tema of ['vivienda', 'empleo', 'sanidad', 'pensiones', 'impuestos', 'transporte']) {
      const r = confirmar(p, tema, 'uno', 'dos');
      todos.push(...r.eventos);
      if (tema === 'impuestos') expect(r.eventos).toContainEqual({ nombre: 'cinco-temas' });
      else expect(r.eventos.some((e) => e.nombre === 'cinco-temas')).toBe(false);
      p = r.despues;
    }
    sinPartidos(todos);
    // the ranking is now available but no event carries it
    expect(p.resultado().disponible).toBe(true);
    sinPartidos([eventoVioResultado()]);
  });

  it('start, result viewed and share carry no choice data', () => {
    expect(eventoEmpezo()).toEqual({ nombre: 'empezo' });
    expect(eventoVioResultado()).toEqual({ nombre: 'vio-resultado' });
    expect(eventoCompartio('neutra')).toEqual({ nombre: 'compartio', datos: { variante: 'neutra' } });
    expect(eventoCompartio('ranking')).toEqual({ nombre: 'compartio', datos: { variante: 'ranking' } });
    sinPartidos([eventoEmpezo(), eventoVioResultado(), eventoCompartio('ranking')]);
  });

  it('the shape is fixed: unknown events, extra fields or free values are rejected', () => {
    expect(Object.keys(EVENTOS).sort()).toEqual(
      ['apuesta-acierto', 'apuesta-fallo', 'cinco-temas', 'compartio', 'empezo', 'tema-completado', 'vio-resultado'].sort(),
    );
    expect(esEventoValido({ nombre: 'eleccion', datos: { tema: 'vivienda' } })).toBe(false);
    expect(esEventoValido({ nombre: 'tema-completado', datos: { tema: 'vivienda', partido: 'uno' } })).toBe(false);
    expect(esEventoValido({ nombre: 'tema-completado' })).toBe(false);
    expect(esEventoValido({ nombre: 'empezo', datos: { tema: 'vivienda' } })).toBe(false);
    expect(esEventoValido({ nombre: 'compartio', datos: { variante: 'Partido uno' } })).toBe(false);
    expect(esEventoValido({ nombre: 'tema-completado', datos: { tema: 'Mi voto: Partido uno' } })).toBe(false);
  });

  it('a topic id that is also a party id cannot be sent as a topic', () => {
    expect(esEventoValido({ nombre: 'tema-completado', datos: { tema: 'vivienda' } }, { partidos: ['uno'] })).toBe(true);
    expect(esEventoValido({ nombre: 'tema-completado', datos: { tema: 'uno' } }, { partidos: ['uno'] })).toBe(false);
  });
});

describe('client privacy', () => {
  it('the engine and the client app make no network calls; only src/web/analitica.ts talks to Umami', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    for (const d of ['src/juego', 'src/web', 'src/analitica'])
      for (const f of readdirSync(d)) {
        const codigo = readFileSync(`${d}/${f}`, 'utf8');
        expect(codigo, `${d}/${f}`).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
        if (`${d}/${f}` !== 'src/web/analitica.ts' && d !== 'src/analitica') expect(codigo, `${d}/${f}`).not.toMatch(/umami/i);
      }
    const adaptador = readFileSync('src/web/analitica.ts', 'utf8');
    // The only exception: it calls umami.track and nothing else, always with a validated event.
    expect(adaptador.match(/umami\??\.\w+/g)).toEqual(['umami?.track']);
    expect(adaptador).toMatch(/esEventoValido\(/);
  });
});

describe('bet hit rate check', () => {
  const puertos = (conteos: Record<string, { aciertos: number; fallos: number }>, abiertos: string[] = []) => {
    const abiertas: { titulo: string; cuerpo: string; etiquetas: string[] }[] = [];
    const p: PuertosApuestas = {
      contarApuestas: async () => conteos,
      issuesAbiertos: async () => abiertos,
      abrirIssue: async (i) => {
        abiertas.push(i);
      },
    };
    return { p, abiertas };
  };

  it('opens one issue per topic whose hit rate is above 60 % with enough bets', async () => {
    const { p, abiertas } = puertos({
      vivienda: { aciertos: 70, fallos: 30 }, // 70 % → issue
      empleo: { aciertos: 60, fallos: 40 }, // exactly 60 % → not above
      sanidad: { aciertos: 9, fallos: 1 }, // 90 % but too few bets
    });
    const r = await comprobarApuestas(p, { temas: datasetTemas.temas });
    expect(UMBRAL_ACIERTO).toBe(0.6);
    expect(MINIMO_APUESTAS).toBeGreaterThan(10);
    expect(abiertas).toHaveLength(1);
    expect(abiertas[0]!.titulo).toContain('Vivienda');
    expect(abiertas[0]!.titulo).toContain('70 %');
    expect(abiertas[0]!.cuerpo).toMatch(/neutraliz/i);
    expect(abiertas[0]!.etiquetas).toContain('reneutralizar');
    expect(r.temas.find((t) => t.tema === 'vivienda')).toMatchObject({ apuestas: 100, tasa: 0.7, accion: 'abierto' });
    expect(r.temas.find((t) => t.tema === 'sanidad')).toMatchObject({ accion: 'pocas_apuestas' });
    expect(r.temas.find((t) => t.tema === 'empleo')).toMatchObject({ accion: 'ok' });
  });

  it('does not open a duplicate while an issue for that topic is still open', async () => {
    const { p, abiertas } = puertos({ vivienda: { aciertos: 80, fallos: 20 } }, ['Reneutralizar «Vivienda y alquiler»: 75 % de acierto']);
    const r = await comprobarApuestas(p, { temas: datasetTemas.temas });
    expect(abiertas).toHaveLength(0);
    expect(r.temas[0]).toMatchObject({ tema: 'vivienda', accion: 'ya_abierto' });
  });

  it('ignores topics unknown to the dataset', async () => {
    const { p, abiertas } = puertos({ 'uno': { aciertos: 100, fallos: 0 } });
    await comprobarApuestas(p, { temas: datasetTemas.temas });
    expect(abiertas).toHaveLength(0);
  });
});

describe('bet check adapters', () => {
  it('reads per-topic hit and miss counts from the Umami API', async () => {
    const urls: string[] = [];
    const contar = crearContadorUmami({
      base: 'https://api.umami.is/v1/',
      apiKey: 'clave',
      websiteId: 'web-1',
      dias: 30,
      ahora: () => 30 * 86_400_000,
      pedir: async (url, init) => {
        urls.push(url);
        expect(init.headers['x-umami-api-key']).toBe('clave');
        const acierto = url.includes('event=apuesta-acierto');
        return { ok: true, status: 200, json: async () => (acierto ? [{ value: 'vivienda', total: 7 }] : [{ value: 'vivienda', total: 3 }, { value: 'empleo', total: 5 }]) };
      },
    });
    expect(await contar()).toEqual({ vivienda: { aciertos: 7, fallos: 3 }, empleo: { aciertos: 0, fallos: 5 } });
    expect(urls[0]).toMatch(/^https:\/\/api\.umami\.is\/v1\/websites\/web-1\/event-data\/values\?startAt=0&endAt=2592000000&/);
    expect(urls[0]).toContain('propertyName=tema');
  });

  it('fails loudly on an API error instead of reporting zero bets', async () => {
    const contar = crearContadorUmami({ base: 'https://x', apiKey: 'k', websiteId: 'w', dias: 1, ahora: () => 0,
      pedir: async () => ({ ok: false, status: 401, json: async () => ({}) }) });
    await expect(contar()).rejects.toThrow(/401/);
  });

  it('lists open issues and opens new ones with gh, creating the label first', async () => {
    const llamadas: string[][] = [];
    const gh = crearPuertosGitHub((args) => {
      llamadas.push(args);
      return args[1] === 'list' ? JSON.stringify([{ title: 'Reneutralizar «Sanidad»: 70 % de acierto' }]) : '';
    });
    expect(await gh.issuesAbiertos()).toEqual(['Reneutralizar «Sanidad»: 70 % de acierto']);
    expect(llamadas[0]).toEqual(expect.arrayContaining(['issue', 'list', '--label', 'reneutralizar', '--state', 'open']));
    await gh.abrirIssue({ titulo: 'T', cuerpo: 'C', etiquetas: ['reneutralizar'] });
    await gh.abrirIssue({ titulo: 'T2', cuerpo: 'C2', etiquetas: ['reneutralizar'] });
    expect(llamadas.filter((a) => a[0] === 'label')).toHaveLength(1);
    expect(llamadas.at(-1)).toEqual(['issue', 'create', '--title', 'T2', '--body', 'C2', '--label', 'reneutralizar']);
  });
});
