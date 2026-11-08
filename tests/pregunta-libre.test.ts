// Test point C: the live free question ("Pregunta libre", #15). The endpoint's handler runs with the
// fake AI adapter and in-memory stores (rate limit, spending, FAQ cache): no network, no secrets.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Dataset } from '../src/dataset/esquema';
import { crearIAFalsa, type RespuestasFalsas } from '../src/ia/falsa';
import { crearPartida } from '../src/juego';
import { crearAlmacenEnMemoria, crearPreguntaLibre, palabrasDeLaPregunta, type ConfigPreguntaLibre } from '../src/pregunta/libre';
import type { TextoPrograma } from '../src/pregunta/textos';
import { datasetEjemplo } from './fixtures/dataset-ejemplo';

const CITA = 'Revalorizaremos las pensiones con el IPC cada año para proteger a los jubilados.';
const textos: Record<string, TextoPrograma> = {
  // aaa talks about pensions on page 2; bbb never does; ccc has no published text yet.
  aaa: { partido: 'aaa', hashPdf: 'h-aaa', paginas: ['Portada del programa.', `Pensiones. ${CITA}`, 'Vivienda y alquiler.'] },
  bbb: { partido: 'bbb', hashPdf: 'h-bbb', paginas: ['Portada.', 'Vivienda y alquiler asequible para todos.'] },
  nada: { partido: 'nada', hashPdf: 'h-viejo', paginas: [`Pensiones. ${CITA}`] },
  isla: { partido: 'isla', hashPdf: 'h-isla', paginas: ['Pensiones. Las pensiones canarias subirán con un complemento insular cada año.'] },
};
// The dataset records which PDF each text must come from: a stale text is never used.
const dataset: Dataset = {
  ...datasetEjemplo,
  partidos: datasetEjemplo.partidos.map((p) =>
    p.programa.estado === 'publicado' ? { ...p, programa: { ...p.programa, hashPdf: `h-${p.id}` } } : p,
  ),
};

// 13 + 21 = 34 words, no figures, no marks.
const respuestaBuena = {
  menciona: true,
  que: 'Subir todas las pensiones cada año al mismo ritmo que suben los precios de consumo.',
  como: 'La subida sería automática y anual, ligada a los precios, para que las personas jubiladas no pierdan poder de compra con el tiempo.',
  cifra: null,
  citas: [{ texto: CITA, pagina: 2 }],
};

function iaFalsa(sobre: Partial<RespuestasFalsas> = {}) {
  return crearIAFalsa({
    'extraer-postura': () => ({ propone: false, citas: [] }),
    neutralizar: () => ({ que: '', como: '', cifra: null }),
    'verificar-fidelidad': () => ({ anade: false, omite: false, cambiaSentido: false, explicacion: '' }),
    'adivinar-partido': () => ({ asignaciones: [] }),
    'confirmar-ausencia': () => ({ propone: false, citas: [] }),
    'evaluar-viabilidad': () => {
      throw new Error('no se usa');
    },
    'responder-pregunta': (e) =>
      e.paginas.some((p: { texto: string }) => p.texto.includes(CITA)) ? respuestaBuena : { menciona: false, que: '', como: '', cifra: null, citas: [] },
    ...sobre,
  });
}

function montar(config: Partial<ConfigPreguntaLibre> = {}, ia = iaFalsa()) {
  const almacen = crearAlmacenEnMemoria();
  let ahora = new Date('2026-11-18T10:00:00Z');
  const leidos: string[] = [];
  const servicio = crearPreguntaLibre(
    {
      ia,
      almacen,
      textos: async (id) => {
        leidos.push(id);
        return textos[id] ?? null;
      },
      ahora: () => ahora,
    },
    { activa: true, dataset, terminos: { aaa: ['Partido AAA', 'AAA'], bbb: ['Partido BBB'] }, ...config },
  );
  return { servicio, ia, almacen, leidos, irA: (d: string) => (ahora = new Date(d)) };
}

const llamadasResponder = (ia: ReturnType<typeof iaFalsa>) => ia.llamadas.filter((l) => l.tarea === 'responder-pregunta');
const PREGUNTA = '¿Qué harán con las pensiones?';

afterEach(() => vi.restoreAllMocks());

describe('pregunta libre: answers', () => {
  it('is off unless the flag is on, without touching the AI or the stores', async () => {
    const { servicio, ia, almacen } = montar({ activa: false });
    expect(await servicio.preguntar({ pregunta: PREGUNTA, sesion: 's1' })).toMatchObject({ estado: 'cerrada' });
    expect(ia.llamadas).toHaveLength(0);
    expect(almacen.claves()).toEqual([]);
  });

  it('answers per published party with a verified quote, or says it does not mention it', async () => {
    const { servicio } = montar();
    const r = await servicio.preguntar({ pregunta: PREGUNTA, sesion: 's1' });
    if (r.estado !== 'ok') throw new Error(r.estado);
    expect(r.pregunta.texto).toBe(PREGUNTA);
    const de = (id: string) => r.respuestas.find((x) => x.partido === id);
    expect(de('aaa')).toMatchObject({ estado: 'responde', citas: [{ texto: CITA, pagina: 2 }], texto: { que: respuestaBuena.que } });
    expect(de('bbb')).toMatchObject({ estado: 'no_menciona' });
    // No text published for ccc, and nada's text is from an older PDF: never answered from it.
    expect(de('ccc')).toMatchObject({ estado: 'sin_verificar' });
    expect(de('nada')).toMatchObject({ estado: 'sin_verificar' });
    // Pending parties have no programme to answer from.
    expect(r.respuestas.map((x) => x.partido)).not.toContain('pend');
  });

  it('the answers are anonymised by the game engine like the suggested questions', async () => {
    const { servicio } = montar();
    const r = await servicio.preguntar({ pregunta: PREGUNTA, sesion: 's1' });
    if (r.estado !== 'ok') throw new Error(r.estado);
    const partida = crearPartida(dataset, '35', 'semilla');
    const vista = partida.pregunta(r.pregunta, r.respuestas);
    expect(vista.tarjetas.map((t) => t.titular)).toContain(respuestaBuena.que);
    expect(JSON.stringify(vista)).not.toMatch(/aaa|AAA/);
    const revelada = partida.revelarPregunta(r.pregunta, r.respuestas);
    expect(revelada.tarjetas.map((t) => t.partido.id)).toEqual(['aaa']);
    expect(revelada.noMencionan.map((p) => p.id)).toEqual(['bbb', 'isla']);
  });

  it('says when no programme talks about it', async () => {
    const { servicio, ia } = montar();
    const r = await servicio.preguntar({ pregunta: '¿Qué dicen del servicio militar obligatorio?', sesion: 's1' });
    if (r.estado !== 'ok') throw new Error(r.estado);
    expect(r.respuestas.every((x) => x.estado !== 'responde')).toBe(true);
    expect(crearPartida(dataset, null, 's').pregunta(r.pregunta, r.respuestas).ninguno).toBe(true);
    expect(llamadasResponder(ia)).toHaveLength(0);
  });

  it('an invented quote is removed and the verified one kept (V1)', async () => {
    const inventada = { texto: 'Bajaremos la edad de jubilación a los sesenta años para todo el mundo.', pagina: 2 };
    const ia = iaFalsa({ 'responder-pregunta': () => ({ ...respuestaBuena, citas: [inventada, ...respuestaBuena.citas] }) });
    const { servicio } = montar({}, ia);
    const r = await servicio.preguntar({ pregunta: PREGUNTA, sesion: 's1' });
    if (r.estado !== 'ok') throw new Error(r.estado);
    expect(r.respuestas.find((x) => x.partido === 'aaa')).toMatchObject({ estado: 'responde', citas: [{ texto: CITA, pagina: 2 }] });
  });

  it('an answer with identifying marks is rewritten, then not shown if they persist (V3)', async () => {
    const ia = iaFalsa({ 'responder-pregunta': () => ({ ...respuestaBuena, que: `Partido AAA quiere ${respuestaBuena.que}` }) });
    const { servicio } = montar({}, ia);
    const r = await servicio.preguntar({ pregunta: PREGUNTA, sesion: 's1' });
    if (r.estado !== 'ok') throw new Error(r.estado);
    expect(r.respuestas.find((x) => x.partido === 'aaa')).toMatchObject({ estado: 'sin_verificar' });
    expect(r.respuestas.find((x) => x.partido === 'aaa')).not.toHaveProperty('citas');
    expect(llamadasResponder(ia).filter((l) => (l.entrada as any).evitar?.includes('Partido AAA')).length).toBeGreaterThan(0);
  });

  it('only sends the AI a few pages, the ones that match the most search terms', async () => {
    const muchas = Array.from({ length: 12 }, (_, i) => `Página ${i + 1}: pensiones.`);
    muchas[7] = `Pensiones y jubilados. ${CITA}`;
    textos.bbb = { partido: 'bbb', hashPdf: 'h-bbb', paginas: muchas };
    try {
      const { servicio, ia } = montar({ maxPaginas: 3 });
      await servicio.preguntar({ pregunta: '¿Qué harán con las pensiones de los jubilados?', sesion: 's1' });
      const deBbb = llamadasResponder(ia).find((l) => (l.entrada as any).paginas.some((p: any) => p.texto.startsWith('Página')))!;
      const enviadas = (deBbb.entrada as any).paginas as { pagina: number }[];
      expect(enviadas).toHaveLength(3);
      expect(enviadas[0]!.pagina).toBe(8);
    } finally {
      textos.bbb = { partido: 'bbb', hashPdf: 'h-bbb', paginas: ['Portada.', 'Vivienda y alquiler asequible para todos.'] };
    }
  });
});

describe('pregunta libre: what is accepted', () => {
  it('rejects an empty, too short or too long question without calling the AI', async () => {
    const { servicio, ia } = montar();
    for (const pregunta of ['', '¿y?', 'x'.repeat(301)])
      expect(await servicio.preguntar({ pregunta, sesion: 's1' })).toMatchObject({ estado: 'invalida', mensaje: expect.any(String) });
    expect(await servicio.preguntar({ pregunta: PREGUNTA, sesion: '' })).toMatchObject({ estado: 'invalida' });
    expect(ia.llamadas).toHaveLength(0);
  });

  it('a question with nothing to search for is out of scope, without calling the AI', async () => {
    const { servicio, ia } = montar();
    expect(await servicio.preguntar({ pregunta: '¿Qué es lo que vais a hacer vosotros?', sesion: 's1' })).toMatchObject({
      estado: 'fuera_de_tema',
      mensaje: expect.stringMatching(/programas/),
    });
    expect(ia.llamadas).toHaveLength(0);
  });

  it('search terms come from the content words of the question (no accents, plural-insensitive)', () => {
    expect(palabrasDeLaPregunta('¿Qué proponen los partidos sobre las PENSIONES y la jubilación?')).toEqual(['pension', 'jubilac']);
    expect(palabrasDeLaPregunta('¿Y el alquiler?')).toEqual(['alquile']);
  });
});

describe('pregunta libre: limits, cache and spending cap', () => {
  it('limits questions per session, with a clear message and the frequent questions', async () => {
    const { servicio } = montar({ limiteSesion: 2 });
    expect(await servicio.preguntar({ pregunta: PREGUNTA, sesion: 's1' })).toMatchObject({ estado: 'ok', quedan: 1 });
    expect(await servicio.preguntar({ pregunta: '¿Y con la vivienda?', sesion: 's1' })).toMatchObject({ estado: 'ok', quedan: 0 });
    const r = await servicio.preguntar({ pregunta: '¿Y con el alquiler?', sesion: 's1' });
    expect(r).toMatchObject({ estado: 'limite', mensaje: expect.stringMatching(/límite/i), frecuentes: expect.any(Array) });
    // Another session is not affected.
    expect(await servicio.preguntar({ pregunta: '¿Y con el alquiler?', sesion: 's2' })).toMatchObject({ estado: 'ok' });
  });

  it('caches frequent questions without tying them to any session; a cached answer costs nothing', async () => {
    const { servicio, ia, almacen } = montar({ limiteSesion: 1 });
    await servicio.preguntar({ pregunta: PREGUNTA, sesion: 'sesion-secreta-1' });
    const llamadas = ia.llamadas.length;
    // Same question, different spelling: served from the cache, no AI call, not counted.
    const r = await servicio.preguntar({ pregunta: '  ¿que haran con las PENSIONES ', sesion: 'sesion-secreta-2' });
    expect(r).toMatchObject({ estado: 'ok', deCache: true });
    expect(ia.llamadas.length).toBe(llamadas);
    // Even over the session limit.
    expect(await servicio.preguntar({ pregunta: PREGUNTA, sesion: 'sesion-secreta-1' })).toMatchObject({ estado: 'ok', deCache: true });
    // Nothing stored links a question to a session.
    const todo = JSON.stringify(almacen.volcado());
    expect(todo).not.toContain('sesion-secreta');
    for (const [clave, valor] of Object.entries(almacen.volcado()))
      if (clave.startsWith('sesion:')) expect(valor).toMatch(/^\d+$/);
  });

  it('session counters expire and are keyed by a hash, never by the raw session id', async () => {
    const { servicio, almacen } = montar();
    await servicio.preguntar({ pregunta: PREGUNTA, sesion: 'abc' });
    const sesiones = almacen.claves().filter((c) => c.startsWith('sesion:'));
    expect(sesiones).toHaveLength(1);
    expect(sesiones[0]).not.toContain('abc');
    expect(almacen.ttl(sesiones[0]!)).toBeGreaterThan(0);
  });

  it('lists a question as frequent once it has been asked more than once', async () => {
    const { servicio } = montar({ limiteSesion: 1 });
    await servicio.preguntar({ pregunta: PREGUNTA, sesion: 's1' });
    await servicio.preguntar({ pregunta: PREGUNTA, sesion: 's2' });
    const r = await servicio.preguntar({ pregunta: '¿Y con la vivienda?', sesion: 's1' });
    expect(r).toMatchObject({ estado: 'limite', frecuentes: [PREGUNTA] });
  });

  it('when the monthly spending cap is reached, only frequent (cached) questions are served, with a notice', async () => {
    // Each AI call is charged at its estimated cost; cap 0.02 € and 0.01 € per call.
    const { servicio, ia, irA } = montar({ topeMensual: 0.02, costeLlamada: () => 0.01 });
    await servicio.preguntar({ pregunta: PREGUNTA, sesion: "s1" }); // aaa: answer + V10, isla: answer = 3 calls
    const llamadas = ia.llamadas.length;
    const r = await servicio.preguntar({ pregunta: '¿Y con la vivienda?', sesion: 's1' });
    expect(r).toMatchObject({ estado: 'solo_frecuentes', mensaje: expect.stringMatching(/frecuentes/), frecuentes: expect.any(Array) });
    expect(ia.llamadas.length).toBe(llamadas);
    expect(await servicio.preguntar({ pregunta: PREGUNTA, sesion: 's3' })).toMatchObject({ estado: 'ok', deCache: true });
    // A new month starts from zero.
    irA('2026-12-01T00:00:01Z');
    expect(await servicio.preguntar({ pregunta: '¿Y con la vivienda?', sesion: 's1' })).toMatchObject({ estado: 'ok' });
  });

  it('a question that would go over the cap mid-way is not started', async () => {
    const { servicio, ia } = montar({ topeMensual: 0.015, costeLlamada: () => 0.01 });
    // Needs at least 2 calls (0.02 €) and only 0.015 € are left.
    expect(await servicio.preguntar({ pregunta: PREGUNTA, sesion: 's1' })).toMatchObject({ estado: 'solo_frecuentes' });
    expect(ia.llamadas).toHaveLength(0);
  });

  it('an AI failure is a clear error and is not cached', async () => {
    const ia = iaFalsa({
      'responder-pregunta': () => {
        throw new Error('caído');
      },
    });
    const { servicio, almacen } = montar({}, ia);
    expect(await servicio.preguntar({ pregunta: PREGUNTA, sesion: 's1' })).toMatchObject({ estado: 'error', mensaje: expect.any(String) });
    expect(almacen.claves().filter((c) => c.startsWith('cache:'))).toEqual([]);
  });

  it('never logs the question or the session', async () => {
    const espias = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const { servicio } = montar();
    await servicio.preguntar({ pregunta: PREGUNTA, sesion: 's1' });
    for (const e of espias) expect(e).not.toHaveBeenCalled();
  });
});

describe('Cloudflare function (src/worker)', () => {
  const ORIGEN = 'https://29n.jorgemasta.com';
  const assets = {
    pedidas: [] as string[],
    async fetch(input: Request | string) {
      const ruta = new URL(typeof input === 'string' ? input : input.url).pathname;
      assets.pedidas.push(ruta);
      const { readFile } = await import('node:fs/promises');
      try {
        return new Response(await readFile(`public${ruta}`, 'utf8'), { status: 200 });
      } catch {
        return new Response('404', { status: 404 });
      }
    },
  };
  const post = (ruta: string, cuerpo: unknown, cabeceras: Record<string, string> = {}) =>
    new Request(`${ORIGEN}${ruta}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGEN, ...cabeceras }, body: JSON.stringify(cuerpo) });

  async function manejador(dep: Parameters<typeof import('../src/worker').crearManejador>[0] = {}) {
    const { crearManejador } = await import('../src/worker');
    return crearManejador({ ia: () => iaFalsa(), ...dep });
  }

  it('the free question is closed unless PREGUNTA_LIBRE=1 and the KV store is bound', async () => {
    const f = await manejador();
    const r = await f(post('/api/preguntar', { pregunta: PREGUNTA, sesion: 's1' }), { ASSETS: assets, PREGUNTAS: crearAlmacenEnMemoria() });
    expect(await r.json()).toMatchObject({ estado: 'cerrada' });
    const sinKv = await f(post('/api/preguntar', { pregunta: PREGUNTA, sesion: 's1' }), { ASSETS: assets, PREGUNTA_LIBRE: '1' });
    expect(await sinKv.json()).toMatchObject({ estado: 'cerrada' });
  });

  it('answers from the published page texts when open', async () => {
    const f = await manejador();
    const r = await f(post('/api/preguntar', { pregunta: '¿Qué proponen sobre el alquiler?', sesion: 's1' }), {
      ASSETS: assets,
      PREGUNTAS: crearAlmacenEnMemoria(),
      PREGUNTA_LIBRE: '1',
    });
    const cuerpo = (await r.json()) as any;
    expect(cuerpo.estado).toBe('ok');
    expect(r.headers.get('cache-control')).toBe('no-store');
    // Public mode: the provisional-source party (prueba-d) is not asked.
    expect(cuerpo.respuestas.map((x: any) => x.partido).sort()).toEqual(['prueba-a', 'prueba-b', 'prueba-c', 'prueba-e']);
    expect(assets.pedidas).toContain('/textos/prueba-a.json');
  });

  it('never serves the page texts directly, and passes everything else to the static site', async () => {
    const f = await manejador();
    expect((await f(new Request(`${ORIGEN}/textos/prueba-a.json`), { ASSETS: assets })).status).toBe(404);
    expect((await f(new Request(`${ORIGEN}/robots.txt`), { ASSETS: assets })).status).toBe(200);
  });

  it('keeps the /?r=reto link preview (#9): only the og title of "/" changes', async () => {
    const { OG } = await import('../src/compartir');
    const html = `<meta property="og:title" content="${OG.titulo}">`;
    const env = { ASSETS: { fetch: async () => new Response(html, { headers: { 'content-type': 'text/html' } }) } };
    const f = await manejador();
    expect(await (await f(new Request(`${ORIGEN}/?r=reto`), env)).text()).toContain(OG.tituloReto);
    expect(await (await f(new Request(`${ORIGEN}/`), env)).text()).toBe(html);
  });

  it('rejects requests from another site, non-JSON and oversized bodies', async () => {
    const f = await manejador();
    const env = { ASSETS: assets, PREGUNTAS: crearAlmacenEnMemoria(), PREGUNTA_LIBRE: '1' };
    expect((await f(post('/api/preguntar', { pregunta: PREGUNTA, sesion: 's' }, { origin: 'https://malo.example' }), env)).status).toBe(400);
    expect((await f(post('/api/preguntar', { pregunta: 'x'.repeat(9000), sesion: 's' }), env)).status).toBe(400);
    expect((await f(new Request(`${ORIGEN}/api/preguntar`), env)).status).toBe(400);
  });

  it('"Reportar error" files the issue with the token, or falls back to the GitHub link without it', async () => {
    const llamadas: { url: string; init: RequestInit }[] = [];
    const fetchGitHub = (async (url: string, init: RequestInit) => {
      llamadas.push({ url, init });
      return new Response(JSON.stringify({ html_url: 'https://github.com/jorgemasta/29n/issues/99' }), { status: 201 });
    }) as unknown as typeof fetch;
    const f = await manejador({ fetchGitHub });
    const aviso = { tipo: 'falta-partido', partido: 'Partido Nuevo' };
    const sin = await f(post('/api/avisar', { aviso, sesion: 's1' }), { ASSETS: assets });
    expect(await sin.json()).toMatchObject({ estado: 'no_disponible', alternativa: expect.stringContaining('github.com') });
    expect(llamadas).toHaveLength(0);
    const con = await f(post('/api/avisar', { aviso, sesion: 's1' }, { 'cf-connecting-ip': '203.0.113.9' }), { ASSETS: assets, GITHUB_TOKEN: 't0k3n' });
    expect(await con.json()).toEqual({ estado: 'creado', url: 'https://github.com/jorgemasta/29n/issues/99' });
    expect(llamadas[0]!.url).toBe('https://api.github.com/repos/jorgemasta/29n/issues');
    expect((llamadas[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer t0k3n');
    expect(String(llamadas[0]!.init.body)).not.toContain('203.0.113.9');
  });
});
