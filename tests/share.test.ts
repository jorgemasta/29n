// Share card, link preview and ?r=reto: pure content derived from Game.affinity() (canvas drawing stays thin).
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
import { createGame, type Affinity, type AffinityRow, type ThemeAffinity } from '../src/game';
import { themesDataset } from './fixtures/themes-dataset';

const party = (id: string, name = `Partido ${id.toUpperCase()}`) => ({ id, name, acronym: id.toUpperCase(), test: true });
const row = (id: string, percent: number, rank: number, tie = false): AffinityRow =>
  ({ party: party(id), points: percent / 25, percent, rank, tie }) as AffinityRow;
const theme = (title: string, rows: AffinityRow[], questions = 3, none = 0): ThemeAffinity =>
  ({ theme: { id: title.toLowerCase(), title, order: 1 }, questions, none, rows }) as ThemeAffinity;

const vivienda = theme('Vivienda', [row('a', 67, 1), row('b', 33, 2), row('c', 0, 3), row('d', 0, 3, true)]);
const sanidad = theme('Sanidad', [row('c', 50, 1), row('d', 17, 2), row('a', 0, 3), row('b', 0, 3, true)], 3, 1);

function affinity(a: Partial<Affinity> = {}): Affinity {
  return {
    themes: [vivienda, sanidad],
    ranking: [row('a', 38, 1), row('c', 25, 2), row('b', 13, 3), row('d', 13, 3, true), row('e', 0, 5)],
    missingManifestos: [],
    noProvince: false,
    ...a,
  } as Affinity;
}

const texts = (c: ReturnType<typeof cardContent>) => c.lines.map((l) => l.text);
const names = ['Partido A', 'Partido B', 'Partido C', 'Partido D', 'Partido E'];

describe('default card ("Sin partidos")', () => {
  it('names the themes played and how many different parties coincided, never which ones', () => {
    const c = cardContent(affinity(), 'no-parties');
    expect(texts(c)).toEqual([
      '29N · Elegido a ciegas',
      'He hecho Vivienda y Sanidad a ciegas: coincidí con 4 partidos distintos.',
      '6 preguntas, sin saber qué partidos había detrás de cada propuesta.',
      '¿Y tú? Lee las propuestas sin saber de quién son.',
      '29n.jorgemasta.com',
      'Sin registro · Sin datos personales · Con citas de los programas',
    ]);
    const everything = JSON.stringify(c);
    for (const n of names) expect(everything).not.toContain(n);
    expect(c.bars).toEqual([]);
  });

  it('is the default even when a ranking exists', () => {
    expect(cardContent(affinity(), 'no-parties').variant).toBe('no-parties');
    expect(SHARE_TEXT).not.toMatch(/Partido/);
  });

  it('works from one theme, with one party or none', () => {
    const one = theme('Vivienda', [row('a', 100, 1), row('b', 0, 2)], 1);
    expect(texts(cardContent(affinity({ themes: [one], ranking: null }), 'no-parties')).slice(1, 3)).toEqual([
      'He hecho Vivienda a ciegas: coincidí con 1 partido.',
      '1 pregunta, sin saber qué partidos había detrás de cada propuesta.',
    ]);
    const nobody = theme('Sanidad', [row('a', 0, 1), row('b', 0, 1, true)], 3, 3);
    expect(texts(cardContent(affinity({ themes: [nobody], ranking: null }), 'no-parties'))[1]).toBe(
      'He hecho Sanidad a ciegas: no coincidí con ningún partido.',
    );
  });

  it('lists up to 3 themes by name and counts them beyond that', () => {
    const t = (title: string) => theme(title, [row('a', 100, 1)], 1);
    expect(texts(cardContent(affinity({ themes: [t('Vivienda'), t('Sanidad'), t('Empleo')] }), 'no-parties'))[1]).toBe(
      'He hecho Vivienda, Sanidad y Empleo a ciegas: coincidí con 1 partido.',
    );
    expect(texts(cardContent(affinity({ themes: ['A', 'B', 'C', 'D'].map(t) }), 'no-parties'))[1]).toBe(
      'He hecho 4 temáticas a ciegas: coincidí con 1 partido.',
    );
  });
});

describe('ranking card ("Con mi ranking"), only if the voter picks it', () => {
  it('shows the top 3, how many more, themes and questions, "Ninguna", missing manifestos and the disclaimer', () => {
    const c = cardContent(affinity({ missingManifestos: [party('f')] as never }), 'ranking');
    expect(c.variant).toBe('ranking');
    expect(c.bars).toEqual([
      { text: 'Partido A 38 %', percent: 38 },
      { text: 'Partido C 25 %', percent: 25 },
      { text: 'Partido B 13 %', percent: 13 },
    ]);
    expect(texts(c)).toEqual([
      '29N · Con quién coincido a ciegas',
      '+2 partidos más',
      'En 2 temáticas, 6 preguntas · 1 vez ninguna me convenció',
      'Falta 1 programa.',
      'No es una recomendación de voto.',
      '29n.jorgemasta.com',
    ]);
  });

  it('pluralises and leaves out what does not apply', () => {
    const c = cardContent(
      affinity({
        themes: [vivienda, theme('Sanidad', sanidad.rows, 3, 2)],
        ranking: [row('a', 50, 1), row('b', 25, 2)],
        missingManifestos: [party('f'), party('g')] as never,
      }),
      'ranking',
    );
    expect(texts(c)).toEqual([
      '29N · Con quién coincido a ciegas',
      'En 2 temáticas, 6 preguntas · 2 veces ninguna me convenció',
      'Faltan 2 programas.',
      'No es una recomendación de voto.',
      '29n.jorgemasta.com',
    ]);
    expect(texts(cardContent(affinity({ themes: [vivienda, vivienda] }), 'ranking'))).toContain('En 2 temáticas, 6 preguntas');
  });

  it('marks ties', () => {
    const c = cardContent(affinity({ ranking: [row('a', 40, 1, true), row('b', 40, 1, true), row('c', 20, 3)] }), 'ranking');
    expect(c.bars.map((b) => b.text)).toEqual(['Partido A 40 % (empate)', 'Partido B 40 % (empate)', 'Partido C 20 %']);
  });

  it('is offered only with an overall ranking (2 themes) where some party coincided', () => {
    expect(variantAvailable(affinity(), 'ranking')).toBe(true);
    expect(variantAvailable(affinity({ themes: [vivienda], ranking: null }), 'ranking')).toBe(false);
    expect(variantAvailable(affinity({ ranking: [row('a', 0, 1, true), row('b', 0, 1, true)] }), 'ranking')).toBe(false);
    expect(variantAvailable(affinity({ themes: [vivienda], ranking: null }), 'no-parties')).toBe(true);
    expect(variantAvailable(affinity({ themes: [], ranking: null }), 'no-parties')).toBe(false);
  });

  it('falls back to the default card when the ranking is not available', () => {
    expect(cardContent(affinity({ themes: [vivienda], ranking: null }), 'ranking').variant).toBe('no-parties');
  });
});

describe('alt text', () => {
  it('is built from the same content as the image', () => {
    expect(altText(cardContent(affinity(), 'no-parties'))).toBe(
      'Tarjeta de 29N. 29N · Elegido a ciegas. He hecho Vivienda y Sanidad a ciegas: coincidí con 4 partidos distintos. ' +
        '6 preguntas, sin saber qué partidos había detrás de cada propuesta. ¿Y tú? Lee las propuestas sin saber de quién son. ' +
        '29n.jorgemasta.com. Sin registro · Sin datos personales · Con citas de los programas.',
    );
  });

  it('includes the ranking bars in the ranking variant', () => {
    const alt = altText(cardContent(affinity(), 'ranking'));
    expect(alt).toContain('Partido A 38 %. Partido C 25 %. Partido B 13 %. +2 partidos más.');
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
      'He elegido entre propuestas de los partidos para el 29N sin saber de quién eran. ¿Con cuántos coincides tú? 29n.jorgemasta.com/?r=reto',
    );
  });

  it('works on a real result from the engine', () => {
    const pick = (g: ReturnType<typeof createGame>, q: string) => g.chooseApproach(q, 'A');
    const game = pick(pick(pick(createGame(themesDataset, null, 's'), 'alquiler'), 'compra'), 'listas')
      .revealTheme('vivienda')
      .revealTheme('sanidad');
    const a = game.affinity();
    const distinct = new Set(a.themes.flatMap((t) => t.rows.filter((r) => r.points > 0).map((r) => r.party.id))).size;
    expect(texts(cardContent(a, 'no-parties'))[1]).toMatch(/^He hecho Vivienda y Sanidad a ciegas: /);
    expect(texts(cardContent(a, 'no-parties'))[1]).toContain(distinct === 0 ? 'ningún partido' : `${distinct} partido`);
    expect(texts(cardContent(a, 'no-parties'))[2]).toMatch(/^3 preguntas/);
    if (variantAvailable(a, 'ranking')) expect(cardContent(a, 'ranking').bars.length).toBe(Math.min(3, a.ranking!.length));
  });
});

describe('link preview and ?r=reto', () => {
  it('has the og texts and a 1200×630 image', () => {
    expect(OG.title).toBe('29N: lee lo que proponen los partidos sin saber de quién es');
    expect(OG.challengeTitle).toBe('Te reto: ¿con cuántos partidos coincides a ciegas?');
    expect(OG.description).toBe(
      'Cada pregunta, 3 propuestas sin firma. Elige la que más te convence y descubre qué partidos la defienden. Gratis, sin registrarte, sin datos personales.',
    );
    expect(OG.image).toEqual({
      path: '/og.png',
      width: 1200,
      height: 630,
      alt: 'Tres propuestas sin firma, A, B y C, y una de ellas elegida. Elecciones generales · 29 de noviembre.',
    });
  });

  it('detects the challenge only from r=reto', () => {
    expect(isChallenge('?r=reto')).toBe(true);
    expect(isChallenge('?provincia=35&r=reto')).toBe(true);
    expect(isChallenge('')).toBe(false);
    expect(isChallenge('?r=otra')).toBe(false);
    expect(challengeHomeText('?r=reto')).toBe('Alguien te reta: elige a ciegas y mira con cuántos partidos coincides.');
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
