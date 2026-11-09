// Share card, link preview and ?r=reto: pure content derived from the game result (canvas drawing stays thin).
import { describe, expect, it } from 'vitest';
import {
  FORMATS,
  OG,
  SHARE_TEXT,
  CHALLENGE_URL,
  applyChallenge,
  cardContent,
  isChallenge,
  altText,
  challengeHomeText,
  variantAvailable,
} from '../src/share';
import { createGame, type RankingRow, type Result } from '../src/game';
import { topicsDataset } from './fixtures/topics-dataset';

const party = (id: string, name = `Partido ${id.toUpperCase()}`) => ({ id, name, acronym: id.toUpperCase(), test: true });
const row = (id: string, percent: number, rank: number, tie = false): RankingRow =>
  ({ party: party(id), points: percent / 10, percent, topics: 1, rank, tie }) as RankingRow;

function result(r: Partial<Result> = {}): Result {
  return {
    available: true,
    topics: 8,
    none: 0,
    allNone: false,
    distinctParties: 4,
    ranking: [row('a', 38, 1), row('b', 25, 2), row('c', 13, 3), row('d', 13, 3, true), row('e', 0, 5)],
    pending: [],
    noProvince: false,
    topicsWithNews: 0,
    guesses: { total: 0, wrong: 0, surprises: [] },
    ...r,
  } as Result;
}

const texts = (c: ReturnType<typeof cardContent>) => c.lines.map((l) => l.text);
const names = ['Partido A', 'Partido B', 'Partido C', 'Partido D', 'Partido E'];

describe('default card ("Sin partidos")', () => {
  it('says how many different parties in how many topics, and never names a party', () => {
    const c = cardContent(result(), 'no-parties');
    expect(texts(c)).toEqual([
      '29N · Elegido a ciegas',
      '4 partidos',
      'distintos en 8 temas, sin saber de quién era cada propuesta.',
      'Vas por libre.',
      '¿Y tú? Lee las propuestas sin saber de quién son.',
      '29n.jorgemasta.com',
      'Sin registro · Sin datos personales · Con citas de los programas',
    ]);
    const everything = JSON.stringify(c);
    for (const n of names) expect(everything).not.toContain(n);
    expect(c.bars).toEqual([]);
  });

  it('labels 1 party as "Lo tengo claro." and 2–3 as "Con matices."', () => {
    expect(texts(cardContent(result({ distinctParties: 1 }), 'no-parties')).slice(1, 4)).toEqual([
      '1 partido',
      'en 8 temas, sin saber de quién era cada propuesta.',
      'Lo tengo claro.',
    ]);
    expect(texts(cardContent(result({ distinctParties: 3 }), 'no-parties'))).toContain('Con matices.');
  });

  it('adds the bets line only with 3 bets or more', () => {
    const withChanges = (total: number, wrong: number) =>
      texts(cardContent(result({ guesses: { total, wrong, surprises: [] } }), 'no-parties'));
    expect(withChanges(2, 2).join('\n')).not.toMatch(/pensaba/);
    expect(withChanges(5, 3)).toContain('3 de 5 veces no era de quien yo pensaba.');
    expect(withChanges(3, 1)).toContain('1 de 3 veces no era de quien yo pensaba.');
  });

  it('when nothing convinced the voter, says so without a party count', () => {
    const c = cardContent(result({ allNone: true, distinctParties: 0, none: 6, topics: 6, ranking: [] }), 'no-parties');
    expect(texts(c).slice(1, 3)).toEqual(['Ninguna', 'me convenció en 6 temas, sin saber de quién era cada propuesta.']);
  });
});

describe('ranking card ("Con mi ranking")', () => {
  it('shows the top 3, how many more, topics, "Ninguna", pending programmes and the disclaimer', () => {
    const c = cardContent(result({ none: 1, pending: [party('f') as never] }), 'ranking');
    expect(c.bars).toEqual([
      { text: 'Partido A 38 %', percent: 38 },
      { text: 'Partido B 25 %', percent: 25 },
      { text: 'Partido C 13 %', percent: 13 },
    ]);
    expect(texts(c)).toEqual([
      '29N · Con quién coincido a ciegas',
      '+2 partidos más',
      'En 8 temas · 1 vez ninguna me convenció',
      '⏳ Falta 1 programa.',
      'No es una recomendación de voto.',
      '29n.jorgemasta.com',
    ]);
  });

  it('pluralises and leaves out what does not apply', () => {
    const c = cardContent(
      result({ none: 2, ranking: [row('a', 50, 1), row('b', 25, 2)], pending: [party('f'), party('g')] as never }),
      'ranking',
    );
    expect(texts(c)).toEqual([
      '29N · Con quién coincido a ciegas',
      'En 8 temas · 2 veces ninguna me convenció',
      '⏳ Faltan 2 programas.',
      'No es una recomendación de voto.',
      '29n.jorgemasta.com',
    ]);
    expect(texts(cardContent(result(), 'ranking'))).toContain('En 8 temas');
  });

  it('marks ties', () => {
    const c = cardContent(result({ ranking: [row('a', 40, 1, true), row('b', 40, 1, true), row('c', 20, 3)] }), 'ranking');
    expect(c.bars.map((b) => b.text)).toEqual(['Partido A 40 % (empate)', 'Partido B 40 % (empate)', 'Partido C 20 %']);
  });

  it('is not offered when every choice was "Ninguna"', () => {
    expect(variantAvailable(result(), 'ranking')).toBe(true);
    expect(variantAvailable(result({ allNone: true, ranking: [] }), 'ranking')).toBe(false);
    expect(variantAvailable(result({ allNone: true, ranking: [] }), 'no-parties')).toBe(true);
    expect(variantAvailable(result({ available: false }), 'no-parties')).toBe(false);
  });
});

describe('alt text', () => {
  it('is built from the same content as the image', () => {
    const c = cardContent(result({ guesses: { total: 5, wrong: 3, surprises: [] } }), 'no-parties');
    expect(altText(c)).toBe(
      'Tarjeta de 29N. 29N · Elegido a ciegas. 4 partidos distintos en 8 temas, sin saber de quién era cada propuesta. ' +
        'Vas por libre. 3 de 5 veces no era de quien yo pensaba. ¿Y tú? Lee las propuestas sin saber de quién son. ' +
        '29n.jorgemasta.com. Sin registro · Sin datos personales · Con citas de los programas.',
    );
  });

  it('includes the ranking bars in the ranking variant', () => {
    const alt = altText(cardContent(result(), 'ranking'));
    expect(alt).toContain('Partido A 38 %. Partido B 25 %. Partido C 13 %. +2 partidos más.');
    expect(alt).toContain('No es una recomendación de voto.');
  });
});

describe('formats and accompanying text', () => {
  it('has a story and a square size', () => {
    expect(FORMATS.story).toEqual({ width: 1080, height: 1920, name: 'Historia (vertical)' });
    expect(FORMATS.square).toEqual({ width: 1080, height: 1080, name: 'Cuadrada (mensajes)' });
  });

  it('shares the same text and a clean challenge link, with no user data', () => {
    expect(CHALLENGE_URL).toBe('https://29n.jorgemasta.com/?r=reto');
    expect(SHARE_TEXT).toBe(
      'He leído propuestas de los partidos para el 29N sin saber de quién eran. Me he llevado alguna sorpresa. ¿Y tú? 29n.jorgemasta.com/?r=reto',
    );
  });

  it('works on a real result from the engine', () => {
    let p = createGame(topicsDataset, null, 's');
    for (const t of p.topics().slice(0, 5)) p = p.choose(t.id, 'A');
    const r = p.result();
    const c = cardContent(r, 'no-parties');
    expect(c.lines[1]!.text).toBe(`${r.distinctParties} ${r.distinctParties === 1 ? 'partido' : 'partidos'}`);
    expect(cardContent(r, 'ranking').bars.length).toBe(Math.min(3, r.ranking.length));
  });
});

describe('link preview and ?r=reto', () => {
  it('has the og texts and a 1200×630 image', () => {
    expect(OG.title).toBe('29N: lee lo que proponen los partidos sin saber de quién es');
    expect(OG.challengeTitle).toBe('Te han retado: ¿con quién coincides sin saberlo?');
    expect(OG.description).toBe('Elige la propuesta que más te convence y descubre de qué partido era. Gratis, sin registrarte, sin datos personales.');
    expect(OG.image).toEqual({ path: '/og.png', width: 1200, height: 630 });
  });

  it('detects the challenge only from r=reto', () => {
    expect(isChallenge('?r=reto')).toBe(true);
    expect(isChallenge('?provincia=35&r=reto')).toBe(true);
    expect(isChallenge('')).toBe(false);
    expect(isChallenge('?r=otra')).toBe(false);
    expect(challengeHomeText('?r=reto')).toBe('Alguien te reta: ¿con quién coincides sin saberlo?');
    expect(challengeHomeText('')).toBeNull();
  });

  it('rewrites only the og/twitter title of the page for a challenge link', () => {
    const html = `<title>29N</title><meta property="og:title" content="${OG.title}" /><meta name="twitter:title" content="${OG.title}" /><p>${OG.title}</p>`;
    const challenge = applyChallenge(html);
    expect(challenge).toBe(
      `<title>29N</title><meta property="og:title" content="${OG.challengeTitle}" /><meta name="twitter:title" content="${OG.challengeTitle}" /><p>${OG.title}</p>`,
    );
  });
});
