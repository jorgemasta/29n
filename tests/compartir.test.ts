// Share card, link preview and ?r=reto: pure content derived from the game result (canvas drawing stays thin).
import { describe, expect, it } from 'vitest';
import {
  FORMATOS,
  OG,
  TEXTO_COMPARTIR,
  URL_RETO,
  aplicarReto,
  contenidoTarjeta,
  esReto,
  textoAlternativo,
  textoPortadaReto,
  varianteDisponible,
} from '../src/compartir';
import { crearPartida, type FilaRanking, type Resultado } from '../src/juego';
import { datasetTemas } from './fixtures/dataset-temas';

const partido = (id: string, nombre = `Partido ${id.toUpperCase()}`) => ({ id, nombre, siglas: id.toUpperCase(), prueba: true });
const fila = (id: string, porcentaje: number, puesto: number, empate = false): FilaRanking =>
  ({ partido: partido(id), puntos: porcentaje / 10, porcentaje, temas: 1, puesto, empate }) as FilaRanking;

function resultado(r: Partial<Resultado> = {}): Resultado {
  return {
    disponible: true,
    temas: 8,
    ninguna: 0,
    todoNinguna: false,
    partidosDistintos: 4,
    ranking: [fila('a', 38, 1), fila('b', 25, 2), fila('c', 13, 3), fila('d', 13, 3, true), fila('e', 0, 5)],
    pendientes: [],
    sinProvincia: false,
    temasConNovedades: 0,
    apuestas: { total: 0, falladas: 0, sorpresas: [] },
    ...r,
  } as Resultado;
}

const textos = (c: ReturnType<typeof contenidoTarjeta>) => c.lineas.map((l) => l.texto);
const nombres = ['Partido A', 'Partido B', 'Partido C', 'Partido D', 'Partido E'];

describe('default card ("Sin partidos")', () => {
  it('says how many different parties in how many topics, and never names a party', () => {
    const c = contenidoTarjeta(resultado(), 'sin-partidos');
    expect(textos(c)).toEqual([
      '29N · Elegido a ciegas',
      '4 partidos',
      'distintos en 8 temas, sin saber de quién era cada propuesta.',
      'Vas por libre.',
      '¿Y tú? Lee las propuestas sin saber de quién son.',
      '29n.jorgemasta.com',
      'Sin registro · Sin datos personales · Con citas de los programas',
    ]);
    const todo = JSON.stringify(c);
    for (const n of nombres) expect(todo).not.toContain(n);
    expect(c.barras).toEqual([]);
  });

  it('labels 1 party as "Lo tengo claro." and 2–3 as "Con matices."', () => {
    expect(textos(contenidoTarjeta(resultado({ partidosDistintos: 1 }), 'sin-partidos')).slice(1, 4)).toEqual([
      '1 partido',
      'en 8 temas, sin saber de quién era cada propuesta.',
      'Lo tengo claro.',
    ]);
    expect(textos(contenidoTarjeta(resultado({ partidosDistintos: 3 }), 'sin-partidos'))).toContain('Con matices.');
  });

  it('adds the bets line only with 3 bets or more', () => {
    const con = (total: number, falladas: number) =>
      textos(contenidoTarjeta(resultado({ apuestas: { total, falladas, sorpresas: [] } }), 'sin-partidos'));
    expect(con(2, 2).join('\n')).not.toMatch(/pensaba/);
    expect(con(5, 3)).toContain('3 de 5 veces no era de quien yo pensaba.');
    expect(con(3, 1)).toContain('1 de 3 veces no era de quien yo pensaba.');
  });

  it('when nothing convinced the voter, says so without a party count', () => {
    const c = contenidoTarjeta(resultado({ todoNinguna: true, partidosDistintos: 0, ninguna: 6, temas: 6, ranking: [] }), 'sin-partidos');
    expect(textos(c).slice(1, 3)).toEqual(['Ninguna', 'me convenció en 6 temas, sin saber de quién era cada propuesta.']);
  });
});

describe('ranking card ("Con mi ranking")', () => {
  it('shows the top 3, how many more, topics, "Ninguna", pending programmes and the disclaimer', () => {
    const c = contenidoTarjeta(resultado({ ninguna: 1, pendientes: [partido('f') as never] }), 'ranking');
    expect(c.barras).toEqual([
      { texto: 'Partido A 38 %', porcentaje: 38 },
      { texto: 'Partido B 25 %', porcentaje: 25 },
      { texto: 'Partido C 13 %', porcentaje: 13 },
    ]);
    expect(textos(c)).toEqual([
      '29N · Con quién coincido a ciegas',
      '+2 partidos más',
      'En 8 temas · 1 vez ninguna me convenció',
      '⏳ Falta 1 programa.',
      'No es una recomendación de voto.',
      '29n.jorgemasta.com',
    ]);
  });

  it('pluralises and leaves out what does not apply', () => {
    const c = contenidoTarjeta(
      resultado({ ninguna: 2, ranking: [fila('a', 50, 1), fila('b', 25, 2)], pendientes: [partido('f'), partido('g')] as never }),
      'ranking',
    );
    expect(textos(c)).toEqual([
      '29N · Con quién coincido a ciegas',
      'En 8 temas · 2 veces ninguna me convenció',
      '⏳ Faltan 2 programas.',
      'No es una recomendación de voto.',
      '29n.jorgemasta.com',
    ]);
    expect(textos(contenidoTarjeta(resultado(), 'ranking'))).toContain('En 8 temas');
  });

  it('marks ties', () => {
    const c = contenidoTarjeta(resultado({ ranking: [fila('a', 40, 1, true), fila('b', 40, 1, true), fila('c', 20, 3)] }), 'ranking');
    expect(c.barras.map((b) => b.texto)).toEqual(['Partido A 40 % (empate)', 'Partido B 40 % (empate)', 'Partido C 20 %']);
  });

  it('is not offered when every choice was "Ninguna"', () => {
    expect(varianteDisponible(resultado(), 'ranking')).toBe(true);
    expect(varianteDisponible(resultado({ todoNinguna: true, ranking: [] }), 'ranking')).toBe(false);
    expect(varianteDisponible(resultado({ todoNinguna: true, ranking: [] }), 'sin-partidos')).toBe(true);
    expect(varianteDisponible(resultado({ disponible: false }), 'sin-partidos')).toBe(false);
  });
});

describe('alt text', () => {
  it('is built from the same content as the image', () => {
    const c = contenidoTarjeta(resultado({ apuestas: { total: 5, falladas: 3, sorpresas: [] } }), 'sin-partidos');
    expect(textoAlternativo(c)).toBe(
      'Tarjeta de 29N. 29N · Elegido a ciegas. 4 partidos distintos en 8 temas, sin saber de quién era cada propuesta. ' +
        'Vas por libre. 3 de 5 veces no era de quien yo pensaba. ¿Y tú? Lee las propuestas sin saber de quién son. ' +
        '29n.jorgemasta.com. Sin registro · Sin datos personales · Con citas de los programas.',
    );
  });

  it('includes the ranking bars in the ranking variant', () => {
    const alt = textoAlternativo(contenidoTarjeta(resultado(), 'ranking'));
    expect(alt).toContain('Partido A 38 %. Partido B 25 %. Partido C 13 %. +2 partidos más.');
    expect(alt).toContain('No es una recomendación de voto.');
  });
});

describe('formats and accompanying text', () => {
  it('has a story and a square size', () => {
    expect(FORMATOS.historia).toEqual({ ancho: 1080, alto: 1920, nombre: 'Historia (vertical)' });
    expect(FORMATOS.cuadrada).toEqual({ ancho: 1080, alto: 1080, nombre: 'Cuadrada (mensajes)' });
  });

  it('shares the same text and a clean challenge link, with no user data', () => {
    expect(URL_RETO).toBe('https://29n.jorgemasta.com/?r=reto');
    expect(TEXTO_COMPARTIR).toBe(
      'He leído propuestas de los partidos para el 29N sin saber de quién eran. Me he llevado alguna sorpresa. ¿Y tú? 29n.jorgemasta.com/?r=reto',
    );
  });

  it('works on a real result from the engine', () => {
    let p = crearPartida(datasetTemas, null, 's');
    for (const t of p.temas().slice(0, 5)) p = p.elegir(t.id, 'A');
    const r = p.resultado();
    const c = contenidoTarjeta(r, 'sin-partidos');
    expect(c.lineas[1]!.texto).toBe(`${r.partidosDistintos} ${r.partidosDistintos === 1 ? 'partido' : 'partidos'}`);
    expect(contenidoTarjeta(r, 'ranking').barras.length).toBe(Math.min(3, r.ranking.length));
  });
});

describe('link preview and ?r=reto', () => {
  it('has the og texts and a 1200×630 image', () => {
    expect(OG.titulo).toBe('29N: lee lo que proponen los partidos sin saber de quién es');
    expect(OG.tituloReto).toBe('Te han retado: ¿con quién coincides sin saberlo?');
    expect(OG.descripcion).toBe('Elige la propuesta que más te convence y descubre de qué partido era. Gratis, sin registrarte, sin datos personales.');
    expect(OG.imagen).toEqual({ ruta: '/og.png', ancho: 1200, alto: 630 });
  });

  it('detects the challenge only from r=reto', () => {
    expect(esReto('?r=reto')).toBe(true);
    expect(esReto('?provincia=35&r=reto')).toBe(true);
    expect(esReto('')).toBe(false);
    expect(esReto('?r=otra')).toBe(false);
    expect(textoPortadaReto('?r=reto')).toBe('Alguien te reta: ¿con quién coincides sin saberlo?');
    expect(textoPortadaReto('')).toBeNull();
  });

  it('rewrites only the og/twitter title of the page for a challenge link', () => {
    const html = `<title>29N</title><meta property="og:title" content="${OG.titulo}" /><meta name="twitter:title" content="${OG.titulo}" /><p>${OG.titulo}</p>`;
    const reto = aplicarReto(html);
    expect(reto).toBe(
      `<title>29N</title><meta property="og:title" content="${OG.tituloReto}" /><meta name="twitter:title" content="${OG.tituloReto}" /><p>${OG.titulo}</p>`,
    );
  });
});
