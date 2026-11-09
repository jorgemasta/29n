// Game engine (test point B). Pure functions over the dataset, no I/O: runs in the browser.
//   createGame(dataset, province, seed, state?, options?) → Game (immutable; actions return a new one)
import { applyMode, isPrivateOnly, sourceOf } from '../dataset';
import type { Dataset, Mode, FeasibilityNote, Party, TopicPosition, SuggestedQuestion, SuggestedAnswer, Topic, SourceType } from '../dataset/schema';
import { shuffle } from './random';
import { themeGame, type ThemeGame, type ThemeState } from './themes';
export { MIN_THEMES_FOR_RANKING, MINUTES_PER_QUESTION } from './themes';
import { byName, linkQuote, revealParty, type RevealedParty } from './party';
import { noSources } from './proposal';

export type { PartyProposal } from './proposal';
export type {
  Affinity,
  AffinityRow,
  BlindApproach,
  OtherProposalReveal,
  QuestionItem,
  QuestionProgress,
  QuestionReveal,
  QuestionSummary,
  QuestionView,
  RevealedApproach,
  RevealedStance,
  ThemeAffinity,
  ThemeReveal,
  ThemeView,
} from './themes';

export const NONE = 'none' as const;
export type None = typeof NONE;

/** INE province codes of the Canary Islands (Las Palmas, Santa Cruz de Tenerife). */
export const CANARY_PROVINCES = ['35', '38'];

/** Serializable state: what the voter chose per topic (party id, never leaves the browser). */
export interface GameState extends ThemeState {
  /** Insertion order = order in which topics were done. */
  choices: Record<string, string | None>;
  /** Optional bet per topic: the party the voter thought their card was from. */
  guesses?: Record<string, string>;
  /** Times each topic was re-shuffled ("Volver a elegir", "Barajar otra vez"). */
  reshuffles?: Record<string, number>;
  /** Parties with a card in each done topic when it was chosen (to spot new proposals). */
  seen?: Record<string, string[]>;
  /** Parties with a published programme already announced to the voter; absent = none announced yet. */
  known?: string[];
}

export interface ChoiceOptions {
  /** Party id the voter bets the chosen card is from. Not allowed with NINGUNA. */
  guess?: string;
}

export interface GameOptions {
  /** 'public' (default) only uses official programmes; 'private' adds provisional sources. */
  mode?: Mode;
}

/** Visible goal: the result is offered after this many topics; later ones are "extra". */
export const GOAL_TOPICS = 5;

/** "Tema 2 de 5" or "Tema extra". */
export type TopicSlot = { type: 'goal'; number: number; goal: number } | { type: 'extra' };

export interface TopicItem {
  topic: Topic;
  state: 'notStarted' | 'done' | 'none';
  /** Proposals published since the voter chose ("Nuevo: 1 propuesta"); 0 if none. */
  newOnes: number;
}

export interface TopicList {
  /** The first GOAL_TOPICS topics in the fixed order. */
  suggested: TopicItem[];
  /** The rest, alphabetically. */
  extra: TopicItem[];
  /** Hidden: fewer than MIN_PROPOSALS real proposals here ("Pocos partidos hablan de esto"). */
  hidden: Topic[];
}

/** A topic needs this many proposals among the parties in play to be played (ux-spec §4). */
export const MIN_PROPOSALS = 2;

export interface Card {
  letter: string;
  headline: string;
  detail: string;
}

export interface TopicView {
  topic: Topic;
  cards: Card[];
  /** Public shuffle id shown to the voter ("Tu barajado: #4F2A"). */
  shuffleId: string;
  /** Parties that propose nothing on this topic (cards hidden until the reveal). */
  noProposal: number;
}

export type { RevealedParty, LinkedQuote } from './party';

/** Who wrote a card, with its quotes linked to the PDF page (topics and questions alike). */
export interface PartyCard extends Card {
  party: RevealedParty;
  quotes: { text: string; page: number; link: string }[];
  manifestoTitle: string;
  /** Source type; provisional sources are marked "solo privado". */
  source: { type: SourceType; privateOnly: boolean };
}

export interface RevealedCard extends PartyCard {
  chosen: boolean;
  /** Blind feasibility note (V13); null if the position has none. Only shown after choosing. */
  feasibility: FeasibilityNote | null;
  /** The note's argument was published without verifiable sources (V8 gave up after its repeats). */
  noSources: boolean;
}

export interface Reveal {
  topic: Topic;
  choice: string | None;
  cards: RevealedCard[];
  noProposal: RevealedParty[];
  /** Extracted but failed verification: "No pudimos verificar su propuesta". */
  unverified: RevealedParty[];
  /** Parties in play here whose programme is not published yet, by name. */
  pending: ZoneParty[];
  /** The bet, if any, and whether it was right. */
  guess: { party: RevealedParty; correct: boolean } | null;
  /** Factual journey label ("Tu primera elección"…); never a judgement. */
  journey: Journey | null;
}

export type Journey =
  | { type: 'first' }
  | { type: 'newParty'; party: RevealedParty }
  | { type: 'different'; topics: number; parties: number };

export interface RankingRow {
  party: ZoneParty;
  /** 1 per choice. */
  points: number;
  /** Rounded share of the points possible over every done topic ("Ninguna" included). */
  percent: number;
  /** Topics where this party's card was chosen. */
  topics: number;
  /** Same place for ties (1, 2, 2, 4). */
  rank: number;
  tie: boolean;
}

export interface Result {
  /** True from GOAL_TOPICS done topics. */
  available: boolean;
  topics: number;
  /** Topics where nothing convinced the voter (they add to no party). */
  none: number;
  allNone: boolean;
  distinctParties: number;
  /** Every party in play with a programme, also at 0 %. Empty if every choice was "Ninguna". */
  ranking: RankingRow[];
  /** "⏳ Falta [Partido]": parties in play without a published programme. */
  pending: ZoneParty[];
  /** "Solo partidos nacionales…": the voter did not give a province. */
  noProvince: boolean;
  /** Done topics with proposals the voter has not seen yet. */
  topicsWithNews: number;
  guesses: {
    total: number;
    /** Bets where the chosen card was not from the party guessed. */
    wrong: number;
    /** Failed bets grouped by the party actually chosen, by name. */
    surprises: { party: RevealedParty; topics: Topic[] }[];
  };
}

export interface News {
  /** Parties that published their programme since they were last announced. */
  parties: ZoneParty[];
  /** Done topics with proposals published after the voter chose. */
  topics: { topic: Topic; newOnes: number }[];
}

/** A party in play for this province; `regional` = only runs in some provinces. */
export interface ZoneParty extends RevealedParty {
  regional: boolean;
}

export interface ZoneParties {
  /** National parties plus those running in the province, with a published programme. */
  withManifesto: ZoneParty[];
  /** Same scope, programme not published yet: "⏳ programa pendiente", never a card. */
  pending: ZoneParty[];
}

/** SuggestedQuestion to answer: a suggested one (dataset) or a live free question (#15). */
export type SuggestedQuestionSummary = Pick<SuggestedQuestion, 'id' | 'text'>;

/** Preguntar, blind phase: anonymous answers A, B, C… ("Cita disponible al descubrir"). */
export interface SuggestedQuestionView {
  question: SuggestedQuestionSummary;
  cards: Card[];
  /** Parties in play whose programme does not mention it. */
  notMentioned: number;
  /** Parties whose answer could not be verified ("No pudimos verificar su respuesta"). */
  unverified: number;
  /** No programme in play talks about it: "Ningún programa habla de esto" (none unverified either). */
  noneAtAll: boolean;
}

export type RevealedAnswerCard = PartyCard;

/** Preguntar, after "Ver de quién es cada una". No feasibility note; does not count for the result. */
export interface SuggestedQuestionReveal {
  question: SuggestedQuestionSummary;
  cards: RevealedAnswerCard[];
  /** "El programa de X no lo menciona". */
  notMentioned: RevealedParty[];
  /** "No pudimos verificar su respuesta". */
  unverified: RevealedParty[];
  pending: ZoneParty[];
  noneAtAll: boolean;
}

export interface Game extends ThemeGame<Game> {
  readonly state: GameState;
  /** INE province code, or null for "Prefiero no decirlo" (national parties only). */
  readonly province: string | null;
  /** Parties in play here, alphabetically by name. */
  parties(): ZoneParties;
  /** Playable topics for this province, in their fixed order (thin topics are hidden). */
  topics(): Topic[];
  topic(topicId: string): TopicView;
  /** Choose a card by letter, or NINGUNA ("Ninguna me convence"), with an optional bet. */
  choose(topicId: string, letter: string | None, options?: ChoiceOptions): Game;
  /** Bet chips: parties with a card in this topic, by name. */
  guessOptions(topicId: string): RevealedParty[];
  /** Forget this topic's choice and bet, and re-shuffle its cards. */
  chooseAgain(topicId: string): Game;
  /** Re-shuffle a topic not chosen yet. */
  reshuffle(topicId: string): Game;
  /** v1 affinity result by topic (still read by the share card until #30); v2: `affinity()`. */
  result(): Result;
  /** What changed since the last visit. */
  news(): News;
  /** The voter has seen the published-programme news. */
  markKnown(): Game;
  /** "Mantener mis elecciones": the new proposals are marked as seen in every done topic. */
  keepChoices(): Game;
  /** Null until the voter has chosen on this topic. */
  reveal(topicId: string): Reveal | null;
  /** Done topic ids, in the order they were done ("Ninguna" counts as done). */
  done(): string[];
  /** "Tema N de 5" for the goal topics, "extra" afterwards. */
  slot(topicId: string): TopicSlot;
  /** Next topic not done yet in the fixed order, after `topicId` (wrapping); null if all done. */
  next(topicId?: string): Topic | null;
  /** Topic list: 5 suggested topics first, then the extra ones alphabetically, then the hidden ones. */
  list(): TopicList;
  /** Suggested questions of the Preguntar tab, in their fixed order. */
  suggestedQuestions(): SuggestedQuestion[];
  /**
   * Anonymous answers to a suggested question (by id, answers from the dataset), or to any
   * question with the given answers (live free question, #15). Same province and pending rules
   * as the topics; order shuffled stably per seed and question.
   */
  suggestedQuestion(question: string | SuggestedQuestionSummary, answers?: SuggestedAnswer[]): SuggestedQuestionView;
  /** Who wrote each answer, with quotes. Revealing never changes the game state. */
  revealSuggestedQuestion(question: string | SuggestedQuestionSummary, answers?: SuggestedAnswer[]): SuggestedQuestionReveal;
}

type ProposingPosition = Extract<TopicPosition, { state: 'proposes' }>;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function createGame(
  dataset: Dataset,
  province: string | null,
  seed: string,
  state: GameState = { choices: {} },
  options: GameOptions = {},
): Game {
  dataset = applyMode(dataset, options.mode ?? 'public');
  const inPlay = (p: Party) => p.scope.type === 'national' || (province !== null && p.scope.provinces.includes(province));
  const zoneParties = dataset.parties.filter(inPlay);
  const published = zoneParties.filter((p) => p.manifesto.state === 'published');
  const pending = zoneParties.filter((p) => p.manifesto.state === 'pending');
  const byId = new Map(published.map((p) => [p.id, p]));
  const isCanaryIslands = province !== null && CANARY_PROVINCES.includes(province);
  const proposalsIn = (topicId: string) =>
    dataset.topicPositions.filter((p) => p.topic === topicId && p.state === 'proposes' && byId.has(p.party)).length;
  const inZone = dataset.topics.filter((t) => t.scope === 'national' || isCanaryIslands).sort((a, b) => a.order - b.order);
  const topics = inZone.filter((t) => proposalsIn(t.id) >= MIN_PROPOSALS);
  const hidden = inZone.filter((t) => !topics.includes(t));

  const findTopic = (topicId: string) => {
    const topic = topics.find((t) => t.id === topicId);
    if (!topic) throw new Error(`Tema no disponible: ${topicId}`);
    return topic;
  };
  const positionsOf = (topicId: string) => dataset.topicPositions.filter((p) => p.topic === topicId && byId.has(p.party));

  /** "4F2A", then "4F2A-1", "4F2A-2"… after each re-shuffle of the topic. */
  const shuffleId = (topicId: string) => {
    const n = state.reshuffles?.[topicId] ?? 0;
    return n ? `${seed}-${n}` : seed;
  };
  /** Cards in their shuffled order, stable for (seed, topic, re-shuffles). */
  const shuffledCards = (topicId: string) => {
    const withProposal = positionsOf(topicId)
      .filter((p): p is ProposingPosition => p.state === 'proposes')
      .sort((a, b) => a.party.localeCompare(b.party));
    return shuffle(withProposal, `${shuffleId(topicId)}:${topicId}`).map((position, i) => ({
      position,
      card: toCard(position, LETTERS[i]!),
    }));
  };

  const questions = [...(dataset.suggestedQuestions ?? [])].sort((a, b) => a.order - b.order);
  /** Answers of the parties in play, in their shuffled order (stable per seed and question). */
  const answersOf = (q: string | SuggestedQuestionSummary, given?: SuggestedAnswer[]) => {
    const question = typeof q === 'string' ? questions.find((p) => p.id === q) : q;
    if (!question) throw new Error(`Pregunta no disponible: ${String(q)}`);
    const givenInPlay = (given ?? dataset.answers ?? []).filter((r) => r.question === question.id && byId.has(r.party));
    // A published party in play with no answer at all did not mention it: say so, never hide it.
    const withAny = new Set(givenInPlay.map((r) => r.party));
    const all: SuggestedAnswer[] = [
      ...givenInPlay,
      ...[...byId.keys()]
        .filter((id) => !withAny.has(id))
        .map((party): SuggestedAnswer => ({ party, question: question.id, state: 'notMentioned', versions: { prompt: '' } })),
    ];
    const withAnswer = all
      .filter((r): r is Extract<SuggestedAnswer, { state: 'answers' }> => r.state === 'answers')
      .sort((a, b) => a.party.localeCompare(b.party));
    const shuffledCards = shuffle(withAnswer, `${seed}:pregunta:${question.id}`).map((answer, i) => ({
      answer,
      card: toCard(answer, LETTERS[i]!),
    }));
    const withState = (e: SuggestedAnswer['state']) =>
      all.filter((r) => r.state === e).map((r) => revealParty(byId.get(r.party)!)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return { question: { id: question.id, text: question.text }, shuffledCards, withState };
  };

  const zone = (p: Party): ZoneParty => ({ ...revealParty(p), regional: p.scope.type === 'provinces' });
  /** A card with its author revealed: party, programme title and quotes linked to their PDF page. */
  const withParty = (card: Card, id: string, quotes: { text: string; page: number }[]): PartyCard => {
    const party = byId.get(id)!;
    const manifesto = party.manifesto.state === 'published' ? party.manifesto : null;
    const type = sourceOf(party)!;
    return {
      ...card,
      party: revealParty(party),
      manifestoTitle: manifesto?.title ?? '',
      quotes: quotes.map((c) => linkQuote(party, c)),
      source: { type, privateOnly: isPrivateOnly(type) },
    };
  };
  const zonePending = () => pending.map(zone).sort(byName);
  /** Same dataset, province and options; new state. */
  const withChanges = (changes: Partial<GameState>) => createGame(dataset, province, seed, { ...state, ...changes }, options);
  const without = <T>(r: Record<string, T> | undefined, key: string) => {
    const { [key]: _, ...rest } = r ?? {};
    return rest;
  };
  const partiesWithCard = (topicId: string) => shuffledCards(topicId).map((b) => b.position.party);
  const newIn = (topicId: string) => {
    const seen = state.seen?.[topicId];
    return seen ? partiesWithCard(topicId).filter((id) => !seen.includes(id)).length : 0;
  };

  return {
    ...themeGame<Game>({ dataset, province, seed, state, published: byId, withChanges }),
    state,
    province,
    parties: () => ({ withManifesto: published.map(zone).sort(byName), pending: zonePending() }),
    topics: () => topics,
    topic(topicId) {
      const topic = findTopic(topicId);
      return {
        topic,
        cards: shuffledCards(topicId).map((b) => b.card),
        shuffleId: shuffleId(topicId),
        noProposal: positionsOf(topicId).filter((p) => p.state === 'noProposal').length,
      };
    },
    choose(topicId, letter, { guess } = {}) {
      findTopic(topicId);
      let choice: string;
      if (letter === NONE) {
        if (guess !== undefined) throw new Error('No se puede apostar con «Ninguna me convence»');
        choice = NONE;
      } else {
        const b = shuffledCards(topicId).find((x) => x.card.letter === letter);
        if (!b) throw new Error(`No hay tarjeta ${letter} en ${topicId}`);
        choice = b.position.party;
      }
      if (guess !== undefined && !partiesWithCard(topicId).includes(guess))
        throw new Error(`No se puede apostar por ${guess} en ${topicId}: no tiene tarjeta`);
      const { [topicId]: _, ...others } = state.choices;
      return withChanges({
        // Re-inserted at the end: a topic chosen again counts as the latest one done.
        choices: { ...others, [topicId]: choice },
        guesses: guess === undefined ? without(state.guesses, topicId) : { ...state.guesses, [topicId]: guess },
        seen: { ...state.seen, [topicId]: partiesWithCard(topicId) },
      });
    },
    guessOptions(topicId) {
      findTopic(topicId);
      return partiesWithCard(topicId).map((id) => revealParty(byId.get(id)!)).sort(byName);
    },
    chooseAgain(topicId) {
      findTopic(topicId);
      return withChanges({
        choices: without(state.choices, topicId),
        guesses: without(state.guesses, topicId),
        seen: without(state.seen, topicId),
        reshuffles: { ...state.reshuffles, [topicId]: (state.reshuffles?.[topicId] ?? 0) + 1 },
      });
    },
    reshuffle(topicId) {
      findTopic(topicId);
      if (state.choices[topicId] !== undefined) throw new Error(`Ya has elegido en ${topicId}: usa «Volver a elegir»`);
      return withChanges({ reshuffles: { ...state.reshuffles, [topicId]: (state.reshuffles?.[topicId] ?? 0) + 1 } });
    },
    reveal(topicId) {
      const topic = findTopic(topicId);
      const choice = state.choices[topicId];
      if (choice === undefined) return null;
      const list = shuffledCards(topicId);
      const withState = (e: TopicPosition['state']) =>
        positionsOf(topicId).filter((p) => p.state === e).map((p) => revealParty(byId.get(p.party)!));
      const guessed = state.guesses?.[topicId];
      return {
        topic,
        choice: choice === NONE ? NONE : (list.find((b) => b.position.party === choice)?.card.letter ?? NONE),
        cards: list.map(({ position, card }) => ({
          ...withParty(card, position.party, position.quotes),
          chosen: position.party === choice,
          feasibility: position.feasibility ?? null,
          noSources: position.feasibility ? noSources(position.feasibility) : false,
        })),
        noProposal: withState('noProposal'),
        unverified: withState('unverified'),
        pending: zonePending(),
        guess:
          guessed !== undefined && byId.has(guessed)
            ? { party: revealParty(byId.get(guessed)!), correct: guessed === choice }
            : null,
        journey: journey(topicId),
      };
    },
    done,
    slot(topicId) {
      findTopic(topicId);
      const list = done();
      const i = list.indexOf(topicId);
      const number = (i === -1 ? list.length : i) + 1;
      return number <= GOAL_TOPICS ? { type: 'goal', number, goal: GOAL_TOPICS } : { type: 'extra' };
    },
    next(topicId) {
      const since = topicId === undefined ? -1 : topics.indexOf(findTopic(topicId));
      const doneSet = new Set(done());
      for (let k = 1; k <= topics.length; k++) {
        const t = topics[(since + k) % topics.length]!;
        if (!doneSet.has(t.id)) return t;
      }
      return null;
    },
    list() {
      const item = (topic: Topic): TopicItem => {
        const e = state.choices[topic.id];
        return { topic, state: e === undefined ? 'notStarted' : e === NONE ? 'none' : 'done', newOnes: newIn(topic.id) };
      };
      return {
        suggested: topics.slice(0, GOAL_TOPICS).map(item),
        extra: topics.slice(GOAL_TOPICS).sort((a, b) => a.title.localeCompare(b.title, 'es')).map(item),
        hidden,
      };
    },
    suggestedQuestions: () => questions,
    suggestedQuestion(q, given) {
      const { question, shuffledCards, withState } = answersOf(q, given);
      return {
        question,
        cards: shuffledCards.map((b) => b.card),
        notMentioned: withState('notMentioned').length,
        unverified: withState('unverified').length,
        noneAtAll: shuffledCards.length === 0 && withState('unverified').length === 0,
      };
    },
    revealSuggestedQuestion(q, given) {
      const { question, shuffledCards, withState } = answersOf(q, given);
      return {
        question,
        cards: shuffledCards.map(({ answer, card }) => withParty(card, answer.party, answer.quotes)),
        notMentioned: withState('notMentioned'),
        unverified: withState('unverified'),
        pending: zonePending(),
        noneAtAll: shuffledCards.length === 0 && withState('unverified').length === 0,
      };
    },
    result() {
      const doneIds = done();
      const possible = doneIds.length;
      const points = new Map<string, { points: number; topics: number }>();
      let none = 0;
      for (const t of doneIds) {
        const e = state.choices[t]!;
        if (e === NONE) none++;
        else if (byId.has(e)) {
          const p = points.get(e) ?? { points: 0, topics: 0 };
          points.set(e, { points: p.points + 1, topics: p.topics + 1 });
        }
      }
      const allNone = doneIds.length > 0 && none === doneIds.length;
      const rows = published
        .map(zone)
        .map((party) => {
          const p = points.get(party.id) ?? { points: 0, topics: 0 };
          return { party, ...p, percent: possible ? Math.round((100 * p.points) / possible) : 0 };
        })
        .sort((a, b) => b.points - a.points || byName(a.party, b.party));
      const ranking: RankingRow[] = allNone
        ? []
        : rows.map((f) => {
            const equal = rows.filter((g) => g.points === f.points).length;
            return { ...f, rank: 1 + rows.filter((g) => g.points > f.points).length, tie: equal > 1 };
          });

      const guessedTopics = doneIds.filter((t) => state.guesses?.[t] !== undefined);
      const wrong = guessedTopics.filter((t) => state.guesses![t] !== state.choices[t]);
      const surprises = new Map<string, Topic[]>();
      for (const t of wrong) {
        const e = state.choices[t]!;
        if (byId.has(e)) surprises.set(e, [...(surprises.get(e) ?? []), findTopic(t)]);
      }
      return {
        available: doneIds.length >= GOAL_TOPICS,
        topics: doneIds.length,
        none,
        allNone,
        distinctParties: [...points.keys()].length,
        ranking,
        pending: zonePending(),
        noProvince: province === null,
        topicsWithNews: doneIds.filter((t) => newIn(t) > 0).length,
        guesses: {
          total: guessedTopics.length,
          wrong: wrong.length,
          surprises: [...surprises]
            .map(([id, topics]) => ({ party: revealParty(byId.get(id)!), topics }))
            .sort((a, b) => byName(a.party, b.party)),
        },
      };
    },
    news() {
      const known = state.known;
      return {
        parties: known ? published.filter((p) => !known.includes(p.id)).map(zone).sort(byName) : [],
        topics: done()
          .map((id) => ({ topic: findTopic(id), newOnes: newIn(id) }))
          .filter((t) => t.newOnes > 0),
      };
    },
    markKnown() {
      // Keep parties known from other provinces: changing province must not re-announce them.
      const ids = new Set([...(state.known ?? []), ...published.map((p) => p.id)]);
      return withChanges({ known: [...ids].sort() });
    },
    keepChoices() {
      const seen = { ...state.seen };
      for (const t of done()) seen[t] = partiesWithCard(t);
      return withChanges({ seen });
    },
  };

  function done(): string[] {
    return Object.keys(state.choices).filter((id) => topics.some((t) => t.id === id));
  }

  /** Label for the topic as it was when chosen: only choices made up to it count. */
  function journey(topicId: string): Journey | null {
    const list = done();
    const upTo = list.slice(0, list.indexOf(topicId) + 1);
    if (upTo.length === 1) return { type: 'first' };
    const e = state.choices[topicId]!;
    if (e === NONE || !byId.has(e)) return null;
    const before = upTo.slice(0, -1).map((t) => state.choices[t]);
    if (!before.includes(e)) return { type: 'newParty', party: revealParty(byId.get(e)!) };
    if (upTo.length < 3) return null;
    const different = new Set(upTo.map((t) => state.choices[t]).filter((x): x is string => x !== NONE && x !== undefined && byId.has(x)));
    return { type: 'different', topics: upTo.length, parties: different.size };
  }
}

/** Same card text for a position and for an answer (both use the what / how / figure template). */
function toCard(p: { text: ProposingPosition['text'] }, letter: string): Card {
  return {
    letter,
    headline: p.text.what,
    detail: p.text.figure ? `${p.text.how} Cifra: ${p.text.figure}.` : p.text.how,
  };
}
