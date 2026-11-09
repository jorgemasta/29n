// Test point B: the game engine, exercised only through createGame.
import { describe, expect, it } from 'vitest';
import { createGame, NONE } from '../src/game';
import { validateDataset } from '../src/dataset';
import { sampleDataset, sampleNote } from './fixtures/sample-dataset';
import { topicsDataset } from './fixtures/topics-dataset';
import { questionsDataset } from './fixtures/questions-dataset';
import { themesDataset } from './fixtures/themes-dataset';
import type { Dataset } from '../src/dataset/schema';
import publishedDataset from '../data/dataset.json';

const partiesOf = (p: ReturnType<typeof createGame>, topic = 'vivienda') =>
  p.reveal(topic)!.cards.map((t) => t.party.id).sort();

describe('createGame', () => {
  it('uses a valid example dataset', () => {
    expect(validateDataset(sampleDataset)).toEqual({ valid: true, errors: [] });
  });

  it('starts with vivienda and shows anonymous cards with letters A, B, C…', () => {
    const game = createGame(sampleDataset, null, 'semilla');
    const topic = game.topic('vivienda');
    expect(topic.topic.title).toBe('Vivienda y alquiler');
    expect(topic.cards.map((t) => t.letter)).toEqual(['A', 'B', 'C']);
    for (const t of topic.cards) {
      expect(Object.keys(t).sort()).toEqual(['detail', 'headline', 'letter']);
      expect(JSON.stringify(t)).not.toMatch(/aaa|bbb|ccc|AAA|BBB|CCC|Cita literal/);
    }
    expect(game.topics().map((t) => t.id)).toEqual(['vivienda']);
  });

  it('shuffles cards stably per seed and topic', () => {
    const order = (seed: string) => createGame(sampleDataset, null, seed).topic('vivienda').cards.map((t) => t.headline).join('|');
    expect(order('s1')).toBe(order('s1'));
    const different = new Set(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].map(order));
    expect(different.size).toBeGreaterThan(1);
  });

  it('does not offer "proposes nothing" as a card, but counts and reveals it', () => {
    const game = createGame(sampleDataset, null, 's');
    expect(game.topic('vivienda').noProposal).toBe(1);
    const r = game.choose('vivienda', NONE).reveal('vivienda')!;
    expect(r.noProposal.map((p) => p.id)).toEqual(['nada']);
  });

  it('a party that proposes nothing cannot be chosen: it has no letter', () => {
    const game = createGame(sampleDataset, null, 's');
    const letters = game.topic('vivienda').cards.map((t) => t.letter);
    expect(letters).toEqual(['A', 'B', 'C']);
    expect(() => game.choose('vivienda', 'D')).toThrow();
    for (const letter of letters) {
      const r = game.choose('vivienda', letter).reveal('vivienda')!;
      expect(r.cards.find((t) => t.chosen)?.party.id).not.toBe('nada');
    }
  });

  it('excludes pending parties and reports them as missing', () => {
    const game = createGame(sampleDataset, null, 's');
    const r = game.choose('vivienda', 'A').reveal('vivienda')!;
    expect(partiesOf(game.choose('vivienda', 'A'))).not.toContain('pend');
    expect(r.pending.map((p) => p.id)).toEqual(['pend']);
  });

  it('adds regional parties and Canary topics only in their provinces', () => {
    const noProvince = createGame(sampleDataset, null, 's').choose('vivienda', 'A');
    expect(partiesOf(noProvince)).toEqual(['aaa', 'bbb', 'ccc']);
    const lasPalmas = createGame(sampleDataset, '35', 's');
    expect(lasPalmas.topic('vivienda').cards).toHaveLength(4);
    expect(lasPalmas.topics().map((t) => t.id)).toEqual(['vivienda', 'ref']);
    expect(createGame(sampleDataset, '28', 's').topics().map((t) => t.id)).toEqual(['vivienda']);
  });

  it('a topic with an unverified position shows it neither as a card nor as "proposes nothing"', () => {
    const p = createGame(sampleDataset, '35', 's');
    expect(p.topic('ref').cards).toHaveLength(3);
    const r = p.choose('ref', 'A').reveal('ref')!;
    expect(r.unverified.map((x) => x.id)).toEqual(['bbb']);
  });

  it('reveals nothing before choosing', () => {
    expect(createGame(sampleDataset, null, 's').reveal('vivienda')).toBeNull();
  });

  it('reveals who wrote each card, with the literal quote and a link to the PDF page', () => {
    const game = createGame(sampleDataset, null, 's');
    const chosen = game.topic('vivienda').cards[1]!;
    const r = game.choose('vivienda', 'B').reveal('vivienda')!;
    expect(r.choice).toBe('B');
    const mine = r.cards.find((t) => t.chosen)!;
    expect(mine.letter).toBe('B');
    expect(mine.headline).toBe(chosen.headline);
    expect(r.cards.filter((t) => t.chosen)).toHaveLength(1);
    expect(mine.quotes[0]).toEqual({
      text: expect.stringContaining(`programa de ${mine.party.id}`),
      page: 7,
      link: `https://ejemplo.org/${mine.party.id}.pdf#page=7`,
    });
    expect(r.cards.map((t) => t.letter)).toEqual(['A', 'B', 'C']);
  });

  it('shows the feasibility note on every revealed card, never before choosing', () => {
    const game = createGame(sampleDataset, null, 's');
    for (const t of game.topic('vivienda').cards) expect(t).not.toHaveProperty('feasibility');
    const r = game.choose('vivienda', NONE).reveal('vivienda')!;
    const byParty = Object.fromEntries(r.cards.map((t) => [t.party.id, t.feasibility]));
    expect(byParty.aaa).toEqual(sampleNote);
    expect(byParty.bbb).toBeNull();
  });

  it('"Ninguna me convence" marks no card as chosen', () => {
    const r = createGame(sampleDataset, null, 's').choose('vivienda', NONE).reveal('vivienda')!;
    expect(r.choice).toBe(NONE);
    expect(r.cards.some((t) => t.chosen)).toBe(false);
  });

  it('rejects choosing a letter that is not a card', () => {
    expect(() => createGame(sampleDataset, null, 's').choose('vivienda', 'Z')).toThrow();
  });

  it('is immutable and its state round-trips through JSON', () => {
    const initial = createGame(sampleDataset, null, 's');
    const after = initial.choose('vivienda', 'C');
    expect(initial.reveal('vivienda')).toBeNull();
    const restored = createGame(sampleDataset, null, 's', JSON.parse(JSON.stringify(after.state)));
    expect(restored.reveal('vivienda')).toEqual(after.reveal('vivienda'));
  });
});

describe('source types and the public/private mode switch', () => {
  const ids = (p: ReturnType<typeof createGame>) => partiesOf(p.choose('vivienda', 'A'));

  it('the dataset with provisional sources is valid', () => {
    expect(validateDataset(topicsDataset)).toEqual({ valid: true, errors: [] });
  });

  it('public mode (the default) excludes provisional sources and lists those parties as pending', () => {
    const game = createGame(topicsDataset, null, 's');
    expect(game.topic('vivienda').cards).toHaveLength(2);
    expect(ids(game)).toEqual(['dos', 'uno']);
    expect(game.choose('vivienda', 'A').reveal('vivienda')!.pending.map((p) => p.id).sort()).toEqual(['dichos', 'viejo']);
    expect(ids(createGame(topicsDataset, null, 's', undefined, { mode: 'public' }))).toEqual(['dos', 'uno']);
  });

  it('private mode includes provisional sources', () => {
    const game = createGame(topicsDataset, null, 's', undefined, { mode: 'private' });
    expect(game.topic('vivienda').cards).toHaveLength(4);
    expect(ids(game)).toEqual(['dichos', 'dos', 'uno', 'viejo']);
  });

  it('every revealed position states its source type and whether it is private-only', () => {
    const r = createGame(topicsDataset, null, 's', undefined, { mode: 'private' }).choose('vivienda', NONE).reveal('vivienda')!;
    const sources = Object.fromEntries(r.cards.map((t) => [t.party.id, t.source]));
    expect(sources).toEqual({
      uno: { type: 'manifesto-29n', privateOnly: false },
      dos: { type: 'manifesto-29n', privateOnly: false },
      viejo: { type: 'manifesto-2023', privateOnly: true },
      dichos: { type: 'statements', privateOnly: true },
    });
  });

  it('blind cards never reveal the source type', () => {
    const t = createGame(topicsDataset, null, 's', undefined, { mode: 'private' }).topic('vivienda');
    for (const c of t.cards) expect(Object.keys(c).sort()).toEqual(['detail', 'headline', 'letter']);
  });

  it('the mode survives actions and state round-trips', () => {
    const p = createGame(topicsDataset, null, 's', undefined, { mode: 'private' }).choose('vivienda', 'A');
    expect(p.topic('empleo').cards).toHaveLength(4);
  });
});

describe('navigating several topics', () => {
  const newGame = () => createGame(topicsDataset, null, 's');
  const play = (p: ReturnType<typeof createGame>, ...topics: string[]) => topics.reduce((acc, t) => acc.choose(t, 'A'), p);

  it('topics come in their fixed order, vivienda first', () => {
    expect(newGame().topics().map((t) => t.id)).toEqual(['vivienda', 'empleo', 'sanidad', 'pensiones', 'impuestos', 'transporte', 'defensa']);
  });

  it('shows a visible goal of 5 topics, then extra topics', () => {
    let p = newGame();
    expect(p.slot('vivienda')).toEqual({ type: 'goal', number: 1, goal: 5 });
    expect(p.slot('defensa')).toEqual({ type: 'goal', number: 1, goal: 5 });
    p = play(p, 'vivienda');
    expect(p.slot('vivienda')).toEqual({ type: 'goal', number: 1, goal: 5 });
    expect(p.slot('sanidad')).toEqual({ type: 'goal', number: 2, goal: 5 });
    p = play(p, 'defensa', 'empleo', 'sanidad', 'pensiones');
    expect(p.slot('pensiones')).toEqual({ type: 'goal', number: 5, goal: 5 });
    expect(p.slot('defensa')).toEqual({ type: 'goal', number: 2, goal: 5 });
    expect(p.slot('impuestos')).toEqual({ type: 'extra' });
    expect(p.done()).toEqual(['vivienda', 'defensa', 'empleo', 'sanidad', 'pensiones']);
  });

  it('"Ninguna me convence" counts as a done topic', () => {
    const p = newGame().choose('vivienda', NONE);
    expect(p.done()).toEqual(['vivienda']);
    expect(p.slot('empleo')).toEqual({ type: 'goal', number: 2, goal: 5 });
  });

  it('next topic follows the fixed order, skips done topics and wraps around', () => {
    let p = newGame();
    expect(p.next('vivienda')?.id).toBe('empleo');
    p = play(p, 'vivienda', 'empleo', 'sanidad');
    expect(p.next('vivienda')?.id).toBe('pensiones');
    expect(p.next('defensa')?.id).toBe('pensiones');
    expect(p.next()?.id).toBe('pensiones');
    p = play(p, 'pensiones', 'impuestos', 'transporte');
    expect(p.next('transporte')?.id).toBe('defensa');
    expect(play(p, 'defensa').next('defensa')).toBeNull();
  });

  it('the topic list shows the 5 suggested topics first, then the extra ones alphabetically, with their state', () => {
    const p = newGame().choose('vivienda', 'B').choose('defensa', NONE);
    const l = p.list();
    expect(l.suggested.map((i) => i.topic.id)).toEqual(['vivienda', 'empleo', 'sanidad', 'pensiones', 'impuestos']);
    expect(l.extra.map((i) => i.topic.id)).toEqual(['defensa', 'transporte']);
    expect(l.suggested[0]!.state).toBe('done');
    expect(l.suggested[1]!.state).toBe('notStarted');
    expect(l.extra[0]!.state).toBe('none');
  });
});

describe('the published topic registry', () => {
  const game = createGame(publishedDataset as Dataset, null, 's', undefined, { mode: 'private' });

  it('the committed dataset is valid', () => {
    expect(validateDataset(publishedDataset)).toEqual({ valid: true, errors: [] });
  });

  it('has ~18 national topics, vivienda first, each with a neutral question', () => {
    const topics = game.topics();
    expect(topics.length).toBeGreaterThanOrEqual(17);
    expect(topics[0]!.id).toBe('vivienda');
    expect(new Set(topics.map((t) => t.id)).size).toBe(topics.length);
    for (const t of topics) {
      expect(t.scope).toBe('national');
      expect(t.question).toMatch(/^¿.+\?$/);
    }
  });

  it('explains jargon in plain words', () => {
    const withJargon = game.topics().filter((t) => /\b(IRPF|OTAN|FP)\b/.test(t.title + t.question));
    expect(withJargon.length).toBeGreaterThan(0);
    for (const t of withJargon) expect(t.explanation).toBeTruthy();
  });

  it('every topic is playable with at least two cards in the private prototype', () => {
    for (const t of game.topics()) expect(game.topic(t.id).cards.length).toBeGreaterThanOrEqual(2);
  });
});

describe('where the voter votes', () => {
  const ids = (l: { id: string }[]) => l.map((p) => p.id).sort();

  it('remembers its province', () => {
    expect(createGame(sampleDataset, '35', 's').province).toBe('35');
    expect(createGame(sampleDataset, null, 's').province).toBeNull();
    expect(createGame(sampleDataset, '35', 's').choose('vivienda', 'A').province).toBe('35');
  });

  it('lists the national parties plus the ones running in the province, with the pending ones apart', () => {
    const lasPalmas = createGame(sampleDataset, '35', 's').parties();
    expect(ids(lasPalmas.withManifesto)).toEqual(['aaa', 'bbb', 'ccc', 'isla', 'nada']);
    expect(ids(lasPalmas.pending)).toEqual(['pend', 'penreg']);
    expect(lasPalmas.withManifesto.filter((p) => p.regional).map((p) => p.id)).toEqual(['isla']);
    expect(lasPalmas.pending.find((p) => p.id === 'penreg')?.regional).toBe(true);

    const barcelona = createGame(sampleDataset, '08', 's').parties();
    expect(ids(barcelona.withManifesto)).toEqual(['aaa', 'bbb', 'bcn', 'ccc', 'nada']);
    expect(ids(barcelona.pending)).toEqual(['pend']);
  });

  it('"Prefiero no decirlo" (no province) keeps only the national parties', () => {
    const p = createGame(sampleDataset, null, 's');
    expect(ids(p.parties().withManifesto)).toEqual(['aaa', 'bbb', 'ccc', 'nada']);
    expect(p.parties().withManifesto.some((x) => x.regional)).toBe(false);
    expect(partiesOf(p.choose('vivienda', 'A'))).toEqual(['aaa', 'bbb', 'ccc']);
  });

  it('regional parties only get cards in their provinces', () => {
    expect(partiesOf(createGame(sampleDataset, '08', 's').choose('vivienda', 'A'))).toEqual(['aaa', 'bbb', 'bcn', 'ccc']);
    expect(partiesOf(createGame(sampleDataset, '38', 's').choose('vivienda', 'A'))).toEqual(['aaa', 'bbb', 'ccc', 'isla']);
  });

  it('pending parties never get a card, in any topic, and are reported as pending in the reveal', () => {
    const p = createGame(sampleDataset, '35', 's');
    for (const t of p.topics()) {
      const r = p.choose(t.id, NONE).reveal(t.id)!;
      expect(r.cards.map((x) => x.party.id)).not.toContain('penreg');
      expect(r.cards.map((x) => x.party.id)).not.toContain('pend');
      expect(ids(r.pending)).toEqual(['pend', 'penreg']);
    }
  });

  it('Canary topics only exist in the two Canary provinces', () => {
    expect(createGame(sampleDataset, '38', 's').topics().map((t) => t.id)).toEqual(['vivienda', 'ref']);
    expect(createGame(sampleDataset, null, 's').topics().map((t) => t.id)).toEqual(['vivienda']);
    expect(() => createGame(sampleDataset, '08', 's').topic('ref')).toThrow();
    expect(() => createGame(sampleDataset, null, 's').choose('ref', 'A')).toThrow();
  });

  it('after a province change, choices stay saved but only topics available there count', () => {
    const inCanaryIslands = createGame(sampleDataset, '35', 's').choose('vivienda', 'A').choose('ref', 'A');
    expect(inCanaryIslands.done()).toEqual(['vivienda', 'ref']);
    const inMadrid = createGame(sampleDataset, '28', 's', inCanaryIslands.state);
    expect(inMadrid.done()).toEqual(['vivienda']);
    expect(createGame(sampleDataset, '38', 's', inMadrid.state).done()).toEqual(['vivienda', 'ref']);
  });

  it('the published registry: both Canary topics appear only in Canary provinces, after the national ones', () => {
    const ds = publishedDataset as Dataset;
    const canaryParties = ['ref-canarias', 'migracion-atlantica'];
    for (const prov of ['35', '38']) {
      const p = createGame(ds, prov, 's', undefined, { mode: 'private' });
      expect(p.topics().slice(-2).map((t) => t.id)).toEqual(canaryParties);
      for (const id of canaryParties) expect(p.topic(id).cards.length, `${prov}/${id}`).toBeGreaterThanOrEqual(2);
      expect(p.list().extra.map((i) => i.topic.id)).toEqual(expect.arrayContaining(canaryParties));
    }
    for (const prov of [null, '28', '08']) {
      const ids = createGame(ds, prov, 's', undefined, { mode: 'private' }).topics().map((t) => t.id);
      for (const id of canaryParties) expect(ids).not.toContain(id);
    }
  });
});

describe('Preguntar: suggested questions with precomputed answers', () => {
  const ids = (l: { id: string }[]) => l.map((p) => p.id).sort();
  const revealed = (p: ReturnType<typeof createGame>, id = 'luz') => p.revealSuggestedQuestion(id).cards.map((t) => t.party.id).sort();

  it('uses a valid example dataset', () => {
    expect(validateDataset(questionsDataset)).toEqual({ valid: true, errors: [] });
  });

  it('lists the suggested questions in their fixed order', () => {
    expect(createGame(questionsDataset, null, 's').suggestedQuestions().map((p) => p.id)).toEqual(['luz', 'mili']);
    expect(createGame(sampleDataset, null, 's').suggestedQuestions()).toEqual([]);
  });

  it('shows each party\'s answer as an anonymous card A, B, C…', () => {
    const view = createGame(questionsDataset, null, 's').suggestedQuestion('luz');
    expect(view.question.text).toBe('¿Quién propone bajar el IVA de la luz?');
    expect(view.cards.map((t) => t.letter)).toEqual(['A', 'B']);
    for (const t of view.cards) {
      expect(Object.keys(t).sort()).toEqual(['detail', 'headline', 'letter']);
      expect(JSON.stringify(t)).not.toMatch(/aaa|ccc|AAA|CCC|Cita literal/);
    }
    expect(view.notMentioned).toBe(1);
    expect(view.noneAtAll).toBe(false);
  });

  it('shuffles the answers stably per seed and question', () => {
    const order = (seed: string) => createGame(questionsDataset, '35', seed).suggestedQuestion('luz').cards.map((t) => t.headline).join('|');
    expect(order('s1')).toBe(order('s1'));
    expect(new Set(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].map(order)).size).toBeGreaterThan(1);
  });

  it('reveals whose answer each one was, with its quote and PDF page, and who does not mention it', () => {
    const p = createGame(questionsDataset, null, 's');
    const anonymous = p.suggestedQuestion('luz').cards;
    const r = p.revealSuggestedQuestion('luz');
    expect(r.cards.map(({ letter, headline, detail }) => ({ letter, headline, detail }))).toEqual(anonymous);
    const aaa = r.cards.find((t) => t.party.id === 'aaa')!;
    expect(aaa.party.name).toBe('Partido AAA');
    expect(aaa.quotes).toEqual([{ text: expect.stringContaining('Cita literal'), page: 3, link: 'https://ejemplo.org/aaa.pdf#page=3' }]);
    expect(aaa.manifestoTitle).toBe('Programa 2026');
    expect(aaa).not.toHaveProperty('feasibility');
    expect(ids(r.notMentioned)).toEqual(['bbb']);
    expect(ids(r.unverified)).toEqual(['nada']);
    expect(r.noneAtAll).toBe(false);
  });

  it('says when no programme talks about it', () => {
    const p = createGame(questionsDataset, null, 's');
    expect(p.suggestedQuestion('mili')).toMatchObject({ cards: [], noneAtAll: true });
    expect(p.revealSuggestedQuestion('mili')).toMatchObject({ cards: [], noneAtAll: true });
    expect(ids(p.revealSuggestedQuestion('mili').notMentioned)).toEqual(['aaa', 'bbb', 'ccc', 'nada']);
  });

  it('a party in play with no answer at all is shown as "no lo menciona", not hidden', () => {
    const withoutAaa: Dataset = { ...questionsDataset, answers: questionsDataset.answers!.filter((r) => r.party !== 'aaa') };
    const p = createGame(withoutAaa, null, 's');
    expect(ids(p.revealSuggestedQuestion('luz').notMentioned)).toEqual(['aaa', 'bbb']);
    expect(p.suggestedQuestion('luz').notMentioned).toBe(2);
    // Same for live answers: a party left out of the answers did not mention it.
    const free = { id: 'libre', text: '¿Bicis?' };
    const onlyCcc = questionsDataset.answers!.filter((r) => r.question === 'luz' && r.party === 'ccc').map((r) => ({ ...r, question: 'libre' }));
    expect(ids(p.revealSuggestedQuestion(free, onlyCcc).notMentioned)).toEqual(['aaa', 'bbb', 'nada']);
  });

  it('respects the province: regional parties only answer where they run', () => {
    expect(revealed(createGame(questionsDataset, null, 's'))).toEqual(['aaa', 'ccc']);
    expect(revealed(createGame(questionsDataset, '35', 's'))).toEqual(['aaa', 'ccc', 'isla']);
    expect(revealed(createGame(questionsDataset, '08', 's'))).toEqual(['aaa', 'bcn', 'ccc']);
  });

  it('pending parties never answer and are reported as pending', () => {
    const r = createGame(questionsDataset, '35', 's').revealSuggestedQuestion('luz');
    expect(ids(r.pending)).toEqual(['pend', 'penreg']);
  });

  it('answers of a party that only has a provisional source are hidden in public', () => {
    const withProvisional: Dataset = {
      ...questionsDataset,
      parties: questionsDataset.parties.map((p) =>
        p.id === 'aaa' && p.manifesto.state === 'published' ? { ...p, manifesto: { ...p.manifesto, source: 'manifesto-2023' } } : p,
      ),
    };
    expect(revealed(createGame(withProvisional, null, 's'))).toEqual(['ccc']);
    expect(revealed(createGame(withProvisional, null, 's', undefined, { mode: 'private' }))).toEqual(['aaa', 'ccc']);
  });

  it('answering does not count as a topic done', () => {
    const p = createGame(questionsDataset, null, 's');
    p.revealSuggestedQuestion('luz');
    expect(p.done()).toEqual([]);
  });

  it('anonymises answers that do not come from the dataset (live free question, #15) the same way', () => {
    const p = createGame(questionsDataset, '08', 's');
    const free = { id: 'libre', text: '¿Qué proponen sobre bicicletas?' };
    const fromDataset = questionsDataset.answers!.filter((r) => r.question === 'luz').map((r) => ({ ...r, question: 'libre' }));
    const view = p.suggestedQuestion(free, fromDataset);
    expect(view.question.text).toBe('¿Qué proponen sobre bicicletas?');
    expect(view.cards).toHaveLength(3);
    expect(revealedFree()).toEqual(['aaa', 'bcn', 'ccc']);
    function revealedFree() {
      return p.revealSuggestedQuestion(free, fromDataset).cards.map((t) => t.party.id).sort();
    }
  });

  it('the published dataset answers the 7 suggested questions', () => {
    const p = createGame(publishedDataset as Dataset, null, 's', undefined, { mode: 'private' });
    expect(p.suggestedQuestions()).toHaveLength(7);
    for (const q of p.suggestedQuestions()) {
      const r = p.revealSuggestedQuestion(q.id);
      expect(r.cards.length + r.notMentioned.length + r.unverified.length, q.id).toBe(p.parties().withManifesto.length);
    }
    expect(p.suggestedQuestions().some((q) => p.suggestedQuestion(q.id).noneAtAll)).toBe(true);
    expect(p.suggestedQuestions().filter((q) => p.suggestedQuestion(q.id).cards.length >= 2).length).toBeGreaterThanOrEqual(4);
  });
});

// ---- #8: the full game (bet, affinity, priorities, re-shuffle, news) ----

type P = ReturnType<typeof createGame>;
/** The letter a party's card has in this topic for this game (read through a throwaway reveal). */
const letterOf = (p: P, topic: string, party: string) =>
  p.choose(topic, NONE).reveal(topic)!.cards.find((t) => t.party.id === party)!.letter;
/** Choose a party's card (and optionally bet on a party). */
const chooseParty = (p: P, topic: string, party: string, guess?: string) =>
  p.choose(topic, letterOf(p, topic, party), guess ? { guess } : undefined);
const privateOnly = (state?: Parameters<typeof createGame>[3]) =>
  createGame(topicsDataset, null, 's', state, { mode: 'private' });

describe('confirming with an optional bet', () => {
  it('offers as bet chips the parties with a card in the topic, by name', () => {
    expect(privateOnly().guessOptions('vivienda').map((p) => p.id)).toEqual(['dichos', 'dos', 'uno', 'viejo']);
    const example = createGame(sampleDataset, null, 's').guessOptions('vivienda').map((p) => p.id);
    expect(example).toEqual(['aaa', 'bbb', 'ccc']); // never the party that proposes nothing, nor a pending one
  });

  it('the reveal says whether the bet was right', () => {
    const hit = chooseParty(privateOnly(), 'vivienda', 'uno', 'uno').reveal('vivienda')!;
    expect(hit.guess).toEqual({ party: expect.objectContaining({ id: 'uno' }), correct: true });
    const failure = chooseParty(privateOnly(), 'vivienda', 'uno', 'dos').reveal('vivienda')!;
    expect(failure.guess).toEqual({ party: expect.objectContaining({ id: 'dos', name: 'Partido dos' }), correct: false });
  });

  it('betting is optional', () => {
    expect(chooseParty(privateOnly(), 'vivienda', 'uno').reveal('vivienda')!.guess).toBeNull();
  });

  it('rejects a bet on a party without a card, and a bet with "Ninguna me convence"', () => {
    const p = createGame(sampleDataset, null, 's');
    expect(() => chooseParty(p, 'vivienda', 'aaa', 'nada')).toThrow();
    expect(() => chooseParty(p, 'vivienda', 'aaa', 'pend')).toThrow();
    expect(() => p.choose('vivienda', NONE, { guess: 'aaa' })).toThrow();
  });

  it('the bet is saved in the state and survives a JSON round-trip', () => {
    const p = chooseParty(privateOnly(), 'vivienda', 'uno', 'dos');
    expect(privateOnly(JSON.parse(JSON.stringify(p.state))).reveal('vivienda')!.guess?.correct).toBe(false);
  });
});

describe('the factual journey label in the reveal', () => {
  it('first choice, first time a party is chosen, then "N temas, K partidos distintos"', () => {
    let p = chooseParty(privateOnly(), 'vivienda', 'uno');
    expect(p.reveal('vivienda')!.journey).toEqual({ type: 'first' });
    p = chooseParty(p, 'empleo', 'dos');
    expect(p.reveal('empleo')!.journey).toEqual({ type: 'newParty', party: expect.objectContaining({ id: 'dos' }) });
    p = chooseParty(p, 'sanidad', 'uno');
    expect(p.reveal('sanidad')!.journey).toEqual({ type: 'different', topics: 3, parties: 2 });
  });

  it('no label for a repeated party before topic 3, nor for "Ninguna" after the first', () => {
    let p = chooseParty(privateOnly(), 'vivienda', 'uno');
    p = chooseParty(p, 'empleo', 'uno');
    expect(p.reveal('empleo')!.journey).toBeNull();
    p = p.choose('sanidad', NONE);
    expect(p.reveal('sanidad')!.journey).toBeNull();
  });
});

describe('affinity result', () => {
  const five = (): P => {
    let p = privateOnly();
    p = chooseParty(p, 'vivienda', 'uno');
    p = chooseParty(p, 'empleo', 'uno');
    p = chooseParty(p, 'sanidad', 'dos');
    p = chooseParty(p, 'pensiones', 'viejo');
    return p.choose('impuestos', NONE);
  };

  it('is not offered before 5 topics', () => {
    let p = privateOnly();
    for (const t of ['vivienda', 'empleo', 'sanidad', 'pensiones']) {
      p = chooseParty(p, t, 'uno');
      expect(p.result().available).toBe(false);
    }
    expect(p.result().topics).toBe(4);
    expect(p.choose('impuestos', NONE).result().available).toBe(true);
  });

  it('ranks every party in play with a percentage, including 0 %, ties alphabetically with the same place', () => {
    const r = five().result();
    expect(r.ranking.map((f) => [f.party.id, f.rank, f.percent, f.topics, f.tie])).toEqual([
      ['uno', 1, 40, 2, false],
      ['dos', 2, 20, 1, true],
      ['viejo', 2, 20, 1, true],
      ['dichos', 4, 0, 0, false],
    ]);
  });

  it('"Ninguna me convence" adds to no party and is counted apart', () => {
    const r = five().result();
    expect(r.topics).toBe(5);
    expect(r.none).toBe(1);
    expect(r.ranking.reduce((s, f) => s + f.points, 0)).toBe(4);
    expect(r.distinctParties).toBe(3);
  });

  it('when every choice is "Ninguna" there is no ranking', () => {
    const p = ['vivienda', 'empleo', 'sanidad', 'pensiones', 'impuestos'].reduce((acc, t) => acc.choose(t, NONE), privateOnly());
    const r = p.result();
    expect(r.available).toBe(true);
    expect(r.allNone).toBe(true);
    expect(r.ranking).toEqual([]);
  });

  it('up to 3 priority topics count double', () => {
    const p = five().markPriority('sanidad', true).markPriority('pensiones', true);
    expect(p.priorities()).toEqual(['sanidad', 'pensiones']);
    const r = p.result();
    // weights: vivienda 1, empleo 1, sanidad 2, pensiones 2, impuestos 1 → 7 points possible
    expect(r.ranking.map((f) => [f.party.id, f.points, f.percent])).toEqual([
      ['dos', 2, 29],
      ['uno', 2, 29],
      ['viejo', 2, 29],
      ['dichos', 0, 0],
    ]);
    expect(p.markPriority('sanidad', false).priorities()).toEqual(['pensiones']);
  });

  it('refuses a 4th priority topic and topics not done yet', () => {
    const p = five().markPriority('vivienda', true).markPriority('empleo', true).markPriority('sanidad', true);
    expect(() => p.markPriority('pensiones', true)).toThrow(/3/);
    expect(() => five().markPriority('defensa', true)).toThrow();
    expect(p.markPriority('vivienda', true).priorities()).toHaveLength(3);
  });

  it('warns about parties with a pending programme and about the missing province', () => {
    const publicGame = ['vivienda', 'empleo', 'sanidad', 'pensiones', 'impuestos'].reduce(
      (acc, t) => chooseParty(acc, t, 'uno'),
      createGame(topicsDataset, null, 's'),
    );
    const r = publicGame.result();
    expect(r.pending.map((p) => p.id)).toEqual(['dichos', 'viejo']);
    expect(r.noProvince).toBe(true);
    expect(r.ranking.map((f) => f.party.id)).toEqual(['uno', 'dos']);
    expect(createGame(sampleDataset, '28', 's').result().noProvince).toBe(false);
  });

  it('summarises the bets: how many times the chosen card was not from the party guessed', () => {
    let p = privateOnly();
    p = chooseParty(p, 'vivienda', 'uno', 'dos');
    p = chooseParty(p, 'empleo', 'uno', 'uno');
    p = chooseParty(p, 'sanidad', 'dos', 'viejo');
    p = chooseParty(p, 'pensiones', 'dos');
    const a = p.result().guesses;
    expect(a.total).toBe(3);
    expect(a.wrong).toBe(2);
    expect(a.surprises.map((s) => [s.party.id, s.topics.map((t) => t.id)])).toEqual([
      ['dos', ['sanidad']],
      ['uno', ['vivienda']],
    ]);
  });
});

describe('choosing again', () => {
  it('"Volver a elegir" forgets the choice and re-shuffles the cards', () => {
    const p = chooseParty(privateOnly(), 'vivienda', 'uno', 'dos');
    const before = p.topic('vivienda');
    const other = p.chooseAgain('vivienda');
    expect(other.reveal('vivienda')).toBeNull();
    expect(other.done()).toEqual([]);
    const after = other.topic('vivienda');
    expect(after.shuffleId).not.toBe(before.shuffleId);
    // with 4 cards some re-shuffle within a few tries changes the order
    let q = other;
    const orders = new Set([before.cards.map((t) => t.headline).join('|')]);
    for (let i = 0; i < 6; i++) {
      orders.add(q.topic('vivienda').cards.map((t) => t.headline).join('|'));
      q = q.reshuffle('vivienda');
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it('the re-shuffled order is stable after a JSON round-trip', () => {
    const p = chooseParty(privateOnly(), 'vivienda', 'uno').chooseAgain('vivienda');
    expect(privateOnly(JSON.parse(JSON.stringify(p.state))).topic('vivienda')).toEqual(p.topic('vivienda'));
  });

  it('"Barajar otra vez" only before choosing', () => {
    expect(() => chooseParty(privateOnly(), 'vivienda', 'uno').reshuffle('vivienda')).toThrow();
  });
});

describe('returning visit: news', () => {
  const withTwo = (state: 'published' | 'pending'): Dataset => ({
    ...topicsDataset,
    parties: topicsDataset.parties.map((p) =>
      p.id === 'dos' && state === 'pending' ? { ...p, manifesto: { state: 'pending' } } : p,
    ),
    topicPositions: state === 'pending' ? topicsDataset.topicPositions.filter((p) => p.party !== 'dos') : topicsDataset.topicPositions,
  });

  // Private mode: with 'dos' pending, the public sources alone would leave every topic too thin to play.
  const privateMode = { mode: 'private' as const };

  it('announces parties that published their programme since last visit and the done topics with a new proposal', () => {
    let p = createGame(withTwo('pending'), null, 's', undefined, privateMode).markKnown();
    p = p.choose('vivienda', 'A').choose('empleo', NONE);
    expect(p.news()).toEqual({ parties: [], topics: [] });

    const returnVisit = createGame(withTwo('published'), null, 's', JSON.parse(JSON.stringify(p.state)), privateMode);
    const n = returnVisit.news();
    expect(n.parties.map((x) => x.id)).toEqual(['dos']);
    expect(n.topics.map((t) => [t.topic.id, t.newOnes])).toEqual([['vivienda', 1], ['empleo', 1]]);
    expect(returnVisit.list().suggested[0]!.newOnes).toBe(1);
    expect(returnVisit.list().suggested[2]!.newOnes).toBe(0);
    expect(returnVisit.result().topicsWithNews).toBe(2);
  });

  it('news are announced once; topic news last until reviewed or kept', () => {
    let p = createGame(withTwo('pending'), null, 's', undefined, privateMode).markKnown().choose('vivienda', 'A').choose('empleo', 'A');
    p = createGame(withTwo('published'), null, 's', p.state, privateMode);
    const view = p.markKnown();
    expect(view.news().parties).toEqual([]);
    expect(view.news().topics).toHaveLength(2);
    // reviewing one topic (choose again) clears its news, keeping the old choice until then
    expect(view.reveal('vivienda')).not.toBeNull();
    const redone = chooseParty(view.chooseAgain('vivienda'), 'vivienda', 'dos');
    expect(redone.news().topics.map((t) => t.topic.id)).toEqual(['empleo']);
    expect(view.keepChoices().news().topics).toEqual([]);
    expect(view.keepChoices().reveal('empleo')!.choice).not.toBe(NONE);
  });

  it('a state without known parties (first visit) has no news', () => {
    expect(createGame(topicsDataset, null, 's').news()).toEqual({ parties: [], topics: [] });
  });
});

describe('pending parties in the reveal', () => {
  it('lists the pending parties of the zone, by name', () => {
    const r = createGame(sampleDataset, '35', 's').choose('vivienda', NONE).reveal('vivienda')!;
    expect(r.pending.map((p) => [p.id, p.regional])).toEqual([['pend', false], ['penreg', true]]);
  });
});

// The client network/privacy check (engine + web make no calls; only src/web/analytics.ts hands
// validated events to Umami) lives in tests/analytics.test.ts.

describe('topics with too few proposals', () => {
  // vivienda: only aaa proposes in play (bbb/ccc unverified or proposing nothing).
  const sparse: Dataset = {
    ...sampleDataset,
    topicPositions: sampleDataset.topicPositions.map((p) =>
      p.topic === 'vivienda' && p.party !== 'aaa' && p.state === 'proposes'
        ? { party: p.party, topic: p.topic, state: 'noProposal', versions: p.versions }
        : p,
    ),
  };

  it('hides a topic with fewer than 2 real proposals, listing it apart ("Pocos partidos hablan de esto")', () => {
    const p = createGame(sparse, '35', 's');
    expect(p.topics().map((t) => t.id)).toEqual(['ref']);
    const list = p.list();
    expect([...list.suggested, ...list.extra].map((i) => i.topic.id)).toEqual(['ref']);
    expect(list.hidden.map((t) => t.id)).toEqual(['vivienda']);
    expect(p.next()?.id).toBe('ref');
    expect(() => p.topic('vivienda')).toThrow();
  });

  it('counts only the parties in play: a topic can be thin in one province and not in another', () => {
    const onlyIsland: Dataset = {
      ...sparse,
      topicPositions: sparse.topicPositions.map((p) =>
        p.topic === 'vivienda' && p.party === 'aaa' ? { party: 'aaa', topic: 'vivienda', state: 'unverified', versions: p.versions } : p,
      ),
    };
    // Only isla (35/38) and bcn (08) propose: 1 proposal in each province.
    expect(createGame(onlyIsland, '35', 's').list().hidden.map((t) => t.id)).toEqual(['vivienda']);
    expect(createGame(sampleDataset, '35', 's').list().hidden).toEqual([]);
  });
});

describe('revealed feasibility without verifiable sources', () => {
  it('marks a note whose evaluation was published without sources (V8 gave up)', () => {
    const withNote = (note: typeof sampleNote): Dataset => ({
      ...sampleDataset,
      topicPositions: sampleDataset.topicPositions.map((p) => (p.party === 'aaa' && p.topic === 'vivienda' ? { ...p, feasibility: note } : p)),
    });
    const revealed = (ds: Dataset) =>
      createGame(ds, null, 's').choose('vivienda', NONE).reveal('vivienda')!.cards.find((t) => t.party.id === 'aaa')!;
    const ev = sampleNote.assessments[0];
    const source = ev.sources[0]!;
    const consensus = (sources: (typeof source)[]): typeof sampleNote => ({
      ...sampleNote,
      result: 'viable',
      why: 'Una.',
      sources,
      assessments: [{ ...ev, sources }, { ...ev, sources }],
    });
    expect(revealed(withNote(consensus([source]))).noSources).toBe(false);
    expect(revealed(withNote(consensus([]))).noSources).toBe(true);
    // Sin consenso: one of the two evaluations has no sources.
    expect(revealed(withNote(sampleNote)).noSources).toBe(true);
    // "Sin concreción" never needs sources.
    expect(revealed(withNote({ ...consensus([]), result: 'notConcrete', assessments: [{ ...ev, level: 'notConcrete', sources: [] }, { ...ev, level: 'notConcrete', sources: [] }] })).noSources).toBe(false);
  });
});

describe('Preguntar: honest states', () => {
  it('when every party in play failed verification, it does not say that no programme talks about it', () => {
    const p = createGame(questionsDataset, null, 's');
    const answers = ['aaa', 'bbb', 'ccc', 'nada'].map((party) => ({
      party,
      question: 'luz',
      state: 'unverified' as const,
      versions: { prompt: 'v1' },
    }));
    expect(p.suggestedQuestion('luz', answers)).toMatchObject({ cards: [], noneAtAll: false, unverified: 4 });
    expect(p.revealSuggestedQuestion('luz', answers)).toMatchObject({ cards: [], noneAtAll: false });
  });

  it('lists the pending parties of the zone by name, like the topics', () => {
    const r = createGame(sampleDataset, '35', 's').revealSuggestedQuestion({ id: 'libre', text: '¿Algo?' }, []);
    expect(r.pending.map((p) => [p.id, p.regional])).toEqual([['pend', false], ['penreg', true]]);
  });
});

describe('createGame: themes, questions and approaches (v2)', () => {
  const PARTY_INFO = /aaa|bbb|ccc|isla|bcn|AAA|BBB|CCC|Cita literal|stance|filler/;

  it('shows a question as exactly 3 anonymous approaches with letters A, B, C', () => {
    const view = createGame(themesDataset, null, 'semilla').question('alquiler');
    expect(view.question).toEqual({ id: 'alquiler', theme: 'vivienda', text: '¿Qué harían para que el alquiler sea asequible?', followUp: false });
    expect(view.approaches.map((a) => a.letter)).toEqual(['A', 'B', 'C']);
    for (const a of view.approaches) {
      expect(Object.keys(a).sort()).toEqual(['figure', 'how', 'letter', 'what']);
    }
    expect(JSON.stringify(view)).not.toMatch(PARTY_INFO);
  });

  it('shuffles approaches stably per seed and question', () => {
    const order = (seed: string, q = 'alquiler') =>
      createGame(themesDataset, null, seed).question(q).approaches.map((a) => a.what).join('|');
    expect(order('s1')).toBe(order('s1'));
    const different = new Set(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].map((s) => order(s)));
    expect(different.size).toBeGreaterThan(1);
  });

  it('records the chosen approach or "none" and survives a JSON round trip', () => {
    const game = createGame(themesDataset, null, 's');
    const letter = game.question('alquiler').approaches[1]!.letter;
    const after = game.chooseApproach('alquiler', letter).chooseApproach('compra', NONE);
    const restored = createGame(themesDataset, null, 's', JSON.parse(JSON.stringify(after.state)));
    expect(restored.theme('vivienda').questions.map((q) => [q.question.id, q.choice])).toEqual([
      ['alquiler', letter],
      ['compra', NONE],
    ]);
  });

  it('rejects an unknown letter or question', () => {
    const game = createGame(themesDataset, null, 's');
    expect(() => game.chooseApproach('alquiler', 'D')).toThrow();
    expect(() => game.chooseApproach('nope', 'A')).toThrow();
  });

  it('a choice can be changed before the reveal', () => {
    const game = createGame(themesDataset, null, 's').chooseApproach('alquiler', 'A').chooseApproach('alquiler', 'C');
    expect(game.theme('vivienda').questions[0]!.choice).toBe('C');
  });

  it('lists the themes in their order with their base questions, follow-up questions apart', () => {
    const game = createGame(themesDataset, null, 's');
    expect(game.themes().map((t) => t.id)).toEqual(['vivienda', 'sanidad']);
    const t = game.theme('vivienda');
    expect(t.theme.title).toBe('Vivienda');
    expect(t.questions.map((q) => [q.question.id, q.choice])).toEqual([
      ['alquiler', null],
      ['compra', null],
    ]);
    expect(t.followUps.map((q) => q.question.id)).toEqual(['okupacion']);
    expect(t.done).toBe(false);
    expect(t.revealed).toBe(false);
  });

  it('shows a regional theme only in its autonomous community', () => {
    expect(createGame(themesDataset, '35', 's').themes().map((t) => t.id)).toEqual(['vivienda', 'sanidad', 'canarias']);
    expect(createGame(themesDataset, '38', 's').themes().map((t) => t.id)).toContain('canarias');
    expect(createGame(themesDataset, '08', 's').themes().map((t) => t.id)).not.toContain('canarias');
    expect(() => createGame(themesDataset, '08', 's').theme('canarias')).toThrow();
    expect(() => createGame(themesDataset, '08', 's').question('ref')).toThrow();
  });

  /** Plays every base question of vivienda: A in alquiler, "none" in compra. */
  const playVivienda = (province: string | null = null) =>
    createGame(themesDataset, province, 's').chooseApproach('alquiler', 'A').chooseApproach('compra', NONE);

  it('reveals nothing until every base question of the theme is answered', () => {
    const game = createGame(themesDataset, null, 's').chooseApproach('alquiler', 'A');
    expect(game.theme('vivienda').done).toBe(false);
    expect(game.themeReveal('vivienda')).toBeNull();
    expect(() => game.revealTheme('vivienda')).toThrow();
    const done = game.chooseApproach('compra', NONE);
    expect(done.theme('vivienda').done).toBe(true);
    expect(done.themeReveal('vivienda')).toBeNull();
  });

  it('the reveal shows which parties defend each approach, fully or in part, with their quote', () => {
    const game = playVivienda().revealTheme('vivienda');
    expect(game.theme('vivienda').revealed).toBe(true);
    const r = game.themeReveal('vivienda')!;
    expect(r.theme.id).toBe('vivienda');
    expect(r.questions.map((q) => [q.question.id, q.choice])).toEqual([
      ['alquiler', 'A'],
      ['compra', NONE],
    ]);
    const alquiler = r.questions[0]!;
    expect(alquiler.approaches.map((a) => a.letter)).toEqual(['A', 'B', 'C']);
    expect(alquiler.approaches.map((a) => a.what)).toEqual(game.question('alquiler').approaches.map((a) => a.what));
    expect(alquiler.approaches.filter((a) => a.chosen)).toEqual([alquiler.approaches[0]]);
    const byWhat = (w: string) => alquiler.approaches.find((a) => a.what === `Enfoque ${w}`)!;
    expect(byWhat('uno').parties.map((p) => [p.party.id, p.stance])).toEqual([
      ['aaa', 'full'],
      ['bbb', 'partial'],
    ]);
    expect(byWhat('uno').parties[0]!.quote).toEqual({
      text: 'Cita literal número 3 del programa de aaa, con más de cuarenta caracteres.',
      page: 3,
      link: 'https://ejemplo.org/aaa.pdf#page=3',
    });
    expect(byWhat('tres')).toMatchObject({ filler: true, parties: [] });
    expect(alquiler.otherProposals).toEqual([]);
    expect(r.questions[1]!.approaches.every((a) => !a.chosen)).toBe(true);
  });

  it('the reveal only names parties in play in the province', () => {
    const national = playVivienda().revealTheme('vivienda').themeReveal('vivienda')!.questions[0]!;
    const oferta = (q: typeof national) => q.approaches.find((a) => a.what === 'Enfoque dos')!.parties.map((p) => p.party.id);
    expect(oferta(national)).toEqual(['ccc']);
    const canary = playVivienda('35').revealTheme('vivienda').themeReveal('vivienda')!.questions[0]!;
    expect(oferta(canary)).toEqual(['ccc', 'isla']);
    const barcelona = playVivienda('08').revealTheme('vivienda').themeReveal('vivienda')!.questions[0]!;
    expect(barcelona.otherProposals.map((p) => p.party.id)).toEqual(['bcn']);
    expect(national.otherProposals).toEqual([]);
  });

  it('includes the follow-up questions answered, and only those', () => {
    const r = playVivienda().chooseApproach('okupacion', 'B').revealTheme('vivienda').themeReveal('vivienda')!;
    expect(r.questions.map((q) => q.question.id)).toEqual(['alquiler', 'compra', 'okupacion']);
  });

  it('a follow-up question can still be answered after the reveal, and is revealed with the theme', () => {
    const game = playVivienda().revealTheme('vivienda').chooseApproach('okupacion', 'C');
    expect(game.themeReveal('vivienda')!.questions.map((q) => [q.question.id, q.choice])).toEqual([
      ['alquiler', 'A'],
      ['compra', NONE],
      ['okupacion', 'C'],
    ]);
  });

  it('no base choice can change once the theme is revealed; other themes stay blind', () => {
    const game = playVivienda().revealTheme('vivienda');
    expect(() => game.chooseApproach('alquiler', 'B')).toThrow();
    expect(game.theme('sanidad').revealed).toBe(false);
    expect(game.themeReveal('sanidad')).toBeNull();
    const restored = createGame(themesDataset, null, 's', JSON.parse(JSON.stringify(game.state)));
    expect(restored.themeReveal('vivienda')).toEqual(game.themeReveal('vivienda'));
  });

  it('nothing about parties is exposed before the reveal', () => {
    const game = playVivienda('35').chooseApproach('okupacion', 'A');
    const blind = [
      game.themes(),
      game.theme('vivienda'),
      ...['alquiler', 'compra', 'okupacion', 'listas', 'ref'].map((q) => game.question(q)),
      game.state,
    ];
    expect(JSON.stringify(blind)).not.toMatch(PARTY_INFO);
  });

  it('a party with only a provisional source is named at the reveal only in private mode', () => {
    const d = publishedDataset as Dataset;
    const q = d.questions![0]!;
    const named = (mode: 'public' | 'private') => {
      const game = createGame(d, null, 's', undefined, { mode });
      const played = game.theme(q.theme).questions.reduce((g, x) => g.chooseApproach(x.question.id, NONE), game).revealTheme(q.theme);
      return played.themeReveal(q.theme)!.questions.flatMap((x) => x.approaches.flatMap((a) => a.parties.map((p) => p.party.id)));
    };
    expect(named('public')).not.toContain('prueba-d');
    expect(named('private')).toContain('prueba-d');
  });
});
