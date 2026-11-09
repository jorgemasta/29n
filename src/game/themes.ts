// v2 game (#18): themes → questions → 3 approaches, chosen blind and revealed per theme.
// Pure functions over the dataset; createGame (./index.ts) wires them into the Game object.
import type { Approach, Dataset, Party, Question, Theme } from '../dataset/schema';
import { provinceByCode } from '../registry/territory';
import { byName, linkQuote, revealParty, type LinkedQuote, type RevealedParty } from './party';
import { positionsOf, proposalOf, type PartyProposal } from './proposal';
import { shuffle } from './random';

const NONE = 'none' as const;
type None = typeof NONE;
const LETTERS = 'ABC';

/** The v2 part of the serializable game state (never leaves the browser). */
export interface ThemeState {
  /** Chosen approach id (or "none") per question id. Insertion order = order answered. */
  questionChoices?: Record<string, string | None>;
  /** Themes the voter revealed ("Destapar"): their choices are final. */
  revealedThemes?: string[];
}

/** What the voter sees before the reveal: no id, no party, no stance. */
export interface BlindApproach {
  letter: string;
  what: string;
  how: string;
  figure: string | null;
}

export type QuestionSummary = Pick<Question, 'id' | 'theme' | 'text' | 'followUp'>;

export interface QuestionView {
  question: QuestionSummary;
  /** Exactly 3, shuffled stably per seed and question. */
  approaches: BlindApproach[];
}

/** A question of a theme and what the voter chose (letter, "none", or null if not answered). */
export interface QuestionItem {
  question: QuestionSummary;
  choice: string | None | null;
}

export interface ThemeView {
  theme: Theme;
  /** Base questions, in their order. */
  questions: QuestionItem[];
  /** Follow-up questions ("para afinar"), offered after the base ones; never required. */
  followUps: QuestionItem[];
  /** Every base question answered: the theme can be revealed. */
  done: boolean;
  revealed: boolean;
}

/** A party in play that defends an approach, fully (1) or in part (0.5), with its quote. */
export interface RevealedStance {
  party: RevealedParty;
  stance: 'full' | 'partial';
  quote: LinkedQuote;
  /** Its own concrete proposal on the question (exact figures, feasibility); null if none was read. */
  proposal: PartyProposal | null;
}

/** A party in play that fits no approach ("propone otra cosa"): its quote and its proposal. */
export interface OtherProposalReveal {
  party: RevealedParty;
  quote: LinkedQuote;
  proposal: PartyProposal | null;
}

export interface RevealedApproach extends BlindApproach {
  /** Defended by no party: added to reach 3 (adds to nobody). */
  filler: boolean;
  /** Not a filler, but every party defending it runs elsewhere: nobody in play here defends it. */
  onlyElsewhere: boolean;
  chosen: boolean;
  /** Parties in play here, full ones first, then by name. */
  parties: RevealedStance[];
}

export interface QuestionReveal {
  question: QuestionSummary;
  choice: string | None;
  /** Same order and letters as the voter saw them. */
  approaches: RevealedApproach[];
  /** Parties in play that fit no approach ("propone otra cosa"). */
  otherProposals: OtherProposalReveal[];
  /** Parties in play with a published manifesto that propose nothing on the question, by name. */
  noProposal: RevealedParty[];
  /** Parties in play whose proposal on the question did not pass the checks, by name. */
  unverified: RevealedParty[];
}

export interface ThemeReveal {
  theme: Theme;
  /** Answered questions: base ones, then the follow-up ones the voter answered. */
  questions: QuestionReveal[];
}

/** The v2 methods of a Game. `G` is the Game type (actions return a new one). */
export interface ThemeGame<G> {
  /** Themes playable in this province, in their order: national ones plus its regionalTheme. */
  themes(): Theme[];
  theme(themeId: string): ThemeView;
  /** Blind view of a question: its 3 approaches, shuffled. */
  question(questionId: string): QuestionView;
  /** Choose an approach by letter, or "none" ("Ninguna me convence"). Changeable until the reveal. */
  chooseApproach(questionId: string, letter: string | None): G;
  /** "Destapar": once every base question is answered. Choices become final. */
  revealTheme(themeId: string): G;
  /** Null until the theme is revealed. */
  themeReveal(themeId: string): ThemeReveal | null;
}

/** What the v2 engine needs from createGame. */
export interface ThemeContext<G> {
  /** Dataset with the mode already applied. */
  dataset: Dataset;
  province: string | null;
  seed: string;
  state: ThemeState;
  /** Parties in play here with a published manifesto. */
  published: Map<string, Party>;
  withChanges(changes: ThemeState): G;
}

export function themeGame<G>(ctx: ThemeContext<G>): ThemeGame<G> {
  const { dataset, seed, state } = ctx;
  const region = ctx.province === null ? null : (provinceByCode(ctx.province)?.regionCode ?? null);
  const themes = (dataset.themes ?? [])
    .filter((t) => t.region === undefined || t.region === region)
    .sort((a, b) => a.order - b.order);
  const questions = (dataset.questions ?? [])
    .filter((q) => themes.some((t) => t.id === q.theme))
    .sort((a, b) => a.order - b.order);
  const choices = state.questionChoices ?? {};
  const revealed = new Set(state.revealedThemes ?? []);

  const findTheme = (themeId: string): Theme => {
    const t = themes.find((x) => x.id === themeId);
    if (!t) throw new Error(`Temática no disponible: ${themeId}`);
    return t;
  };
  const findQuestion = (questionId: string): Question => {
    const q = questions.find((x) => x.id === questionId);
    if (!q) throw new Error(`Pregunta no disponible: ${questionId}`);
    return q;
  };
  const questionsOf = (themeId: string) => questions.filter((q) => q.theme === themeId);
  /** Approaches in their shuffled order, stable for (seed, question), with their letters. */
  const shuffled = (q: Question): { approach: Approach; letter: string }[] =>
    shuffle([...q.approaches].sort((a, b) => a.id.localeCompare(b.id)), `${seed}:${q.id}`).map((approach, i) => ({
      approach,
      letter: LETTERS[i]!,
    }));

  /** The voter's choice as shown now: letter in the current shuffle, "none", or null. */
  const choiceOf = (q: Question): string | None | null => {
    const id = choices[q.id];
    if (id === undefined) return null;
    if (id === NONE) return NONE;
    return shuffled(q).find((x) => x.approach.id === id)?.letter ?? null;
  };
  const item = (q: Question): QuestionItem => ({ question: summary(q), choice: choiceOf(q) });
  const isDone = (themeId: string) => questionsOf(themeId).every((q) => q.followUp || choices[q.id] !== undefined);

  /** Runs in the voter's province (national, or regional here). */
  const runsHere = (p: Party) => p.scope.type === 'national' || (ctx.province !== null && p.scope.provinces.includes(ctx.province));

  const revealQuestion = (q: Question): QuestionReveal => {
    const inPlay = <T extends { party: string }>(list: T[]) => list.filter((x) => ctx.published.has(x.party));
    const party = (id: string) => ctx.published.get(id)!;
    const positions = positionsOf(dataset, q.id);
    const detail = (id: string) => ({ party: revealParty(party(id)), proposal: proposalOf(positions.get(id)) });
    const defenders = new Set(q.approaches.flatMap((a) => a.stances.filter((s) => s.stance !== 'none').map((s) => s.party)));
    const proposingOther = new Set(q.otherProposals.map((o) => o.party));
    const silent = [...ctx.published.values()]
      .filter((p) => !defenders.has(p.id) && !proposingOther.has(p.id))
      .map((p) => ({ party: revealParty(p), unverified: positions.get(p.id)?.state === 'unverified' }));
    const elsewhere = (id: string) => {
      const p = dataset.parties.find((x) => x.id === id);
      return p !== undefined && !runsHere(p);
    };
    return {
      question: summary(q),
      choice: choiceOf(q)!,
      approaches: shuffled(q).map(({ approach: a, letter }) => {
        const parties = inPlay(a.stances)
          .flatMap((s) => (s.stance === 'none' ? [] : [{ ...detail(s.party), stance: s.stance, quote: linkQuote(party(s.party), s.quote) }]))
          .sort((x, y) => (x.stance === y.stance ? byName(x.party, y.party) : x.stance === 'full' ? -1 : 1));
        const defending = a.stances.filter((s) => s.stance !== 'none');
        return {
          letter,
          what: a.what,
          how: a.how,
          figure: a.figure,
          filler: a.filler,
          onlyElsewhere: !a.filler && parties.length === 0 && defending.length > 0 && defending.every((s) => elsewhere(s.party)),
          chosen: choices[q.id] === a.id,
          parties,
        };
      }),
      otherProposals: inPlay(q.otherProposals)
        .map((o) => ({ ...detail(o.party), quote: linkQuote(party(o.party), o.quote) }))
        .sort((x, y) => byName(x.party, y.party)),
      noProposal: silent.filter((x) => !x.unverified).map((x) => x.party).sort(byName),
      unverified: silent.filter((x) => x.unverified).map((x) => x.party).sort(byName),
    };
  };

  return {
    themes: () => themes,
    theme(themeId) {
      const theme = findTheme(themeId);
      const all = questionsOf(themeId);
      const base = all.filter((q) => !q.followUp);
      return {
        theme,
        questions: base.map(item),
        followUps: all.filter((q) => q.followUp).map(item),
        done: isDone(themeId),
        revealed: revealed.has(themeId),
      };
    },
    chooseApproach(questionId, letter) {
      const q = findQuestion(questionId);
      if (revealed.has(q.theme) && !q.followUp) throw new Error(`La temática ${q.theme} ya está destapada`);
      let choice: string;
      if (letter === NONE) choice = NONE;
      else {
        const x = shuffled(q).find((y) => y.letter === letter);
        if (!x) throw new Error(`No hay enfoque ${letter} en ${questionId}`);
        choice = x.approach.id;
      }
      const { [questionId]: _, ...others } = choices;
      return ctx.withChanges({ questionChoices: { ...others, [questionId]: choice } });
    },
    revealTheme(themeId) {
      findTheme(themeId);
      if (!isDone(themeId)) throw new Error(`Faltan preguntas por contestar en ${themeId}`);
      return ctx.withChanges({ revealedThemes: [...revealed, themeId].filter((t, i, all) => all.indexOf(t) === i) });
    },
    themeReveal(themeId) {
      const theme = findTheme(themeId);
      if (!revealed.has(themeId)) return null;
      const answered = questionsOf(themeId).filter((q) => choices[q.id] !== undefined);
      return { theme, questions: [...answered.filter((q) => !q.followUp), ...answered.filter((q) => q.followUp)].map(revealQuestion) };
    },
    question(questionId) {
      const q = findQuestion(questionId);
      return {
        question: summary(q),
        approaches: shuffled(q).map(({ approach: a, letter }) => ({ letter, what: a.what, how: a.how, figure: a.figure })),
      };
    },
  };
}

const summary = (q: Question): QuestionSummary => ({ id: q.id, theme: q.theme, text: q.text, followUp: q.followUp });

export type { Theme };
