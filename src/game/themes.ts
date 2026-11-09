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
const ALL = 'all' as const;

/** The overall ranking appears from this many revealed themes (one theme is too thin a base). */
export const MIN_THEMES_FOR_RANKING = 2;

/** Rough reading-and-choosing time of one question, for "3 preguntas · unos 3 min". */
export const MINUTES_PER_QUESTION = 1;

/** The v2 part of the serializable game state (never leaves the browser). */
export interface ThemeState {
  /** Chosen approach id (or "none") per question id. Insertion order = order answered. */
  questionChoices?: Record<string, string | None>;
  /** Themes the voter revealed ("Destapar"): their choices are final. */
  revealedThemes?: string[];
  /** Themes the voter picked to play ("all" = "Todas", also those of another province later). */
  selectedThemes?: string[] | typeof ALL;
  /** Optional guess per question id: the party the voter thinks defends the chosen approach. */
  questionGuesses?: Record<string, string>;
  /**
   * Themes the voter repeated ("Repetir") after seeing their reveal: no guess is offered or accepted
   * there any more (it would not measure anonymity, and would skew the guess analytics).
   */
  repeatedThemes?: string[];
}

/** The voter's guess on a question, judged once its theme is revealed. */
export interface GuessReveal {
  party: RevealedParty;
  /** The party is `full` or `partial` in the chosen approach (several parties can be right). */
  correct: boolean;
}

export interface ApproachChoiceOptions {
  /** Party id the voter guesses defends the chosen approach. Not allowed with "none". */
  guess?: string;
}

/** What the voter sees before the reveal: no id, no party, no stance. */
export interface BlindApproach {
  letter: string;
  what: string;
  how: string;
  figure: string | null;
}

export type QuestionSummary = Pick<Question, 'id' | 'theme' | 'text' | 'followUp'>;

/** Place of a question in its theme: "Pregunta 2 de 3", or among the follow-up ones. */
export interface QuestionProgress {
  number: number;
  total: number;
  followUp: boolean;
}

export interface QuestionView {
  question: QuestionSummary;
  progress: QuestionProgress;
  /** Exactly 3, shuffled stably per seed and question. */
  approaches: BlindApproach[];
}

/** A question of a theme and what the voter chose (letter, "none", or null if not answered). */
export interface QuestionItem {
  question: QuestionSummary;
  choice: string | None | null;
  /** Its choice is final: the theme is revealed and it is a base question or an answered follow-up one. */
  locked: boolean;
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
  /** Rough minutes to play the base questions. */
  minutes: number;
  /** First base question not answered yet; null once all are (or the theme is revealed). */
  next: string | null;
  /** After the reveal, the first follow-up question not answered yet; null before the reveal or when none is left. */
  nextFollowUp: string | null;
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
  /** "Tú pensabas: X"; null without a guess. */
  guess: GuessReveal | null;
}

export interface ThemeReveal {
  theme: Theme;
  /** Answered questions: base ones, then the follow-up ones the voter answered. */
  questions: QuestionReveal[];
}

/** How much one party in play coincided with the voter's choices. */
export interface AffinityRow {
  party: RevealedParty;
  /** Sum of its stances on the approaches chosen: 1 full, 0.5 partial. */
  points: number;
  /** Rounded share of the questions counted ("Ninguna" included): 100 = behind every choice. */
  percent: number;
  /** Same place for ties (1, 2, 2, 4). */
  rank: number;
  tie: boolean;
}

/** "Con quién coincidiste" in one revealed theme. */
export interface ThemeAffinity {
  theme: Theme;
  /** Answered questions counted (base and follow-up). */
  questions: number;
  /** Of those, answered "Ninguna me convence". */
  none: number;
  /** Every party in play with a published manifesto, also at 0 %; most points first, then by name. */
  rows: AffinityRow[];
}

/** The result. Only revealed themes count: an unrevealed choice can still change and must stay blind. */
export interface Affinity {
  /** Revealed themes, in their order. */
  themes: ThemeAffinity[];
  /** Every counted question of every revealed theme; null with fewer than MIN_THEMES_FOR_RANKING themes. */
  ranking: AffinityRow[] | null;
  /** Parties in play whose manifesto is not published yet: the result is partial without them. */
  missingManifestos: RevealedParty[];
  /** No province given: only national parties are in play. */
  noProvince: boolean;
}

/** The v2 methods of a Game. `G` is the Game type (actions return a new one). */
export interface ThemeGame<G> {
  /** Themes playable in this province, in their order: national ones plus its regionalTheme; only those with a published base question. */
  themes(): Theme[];
  /** Pick the themes to play, or "all" ("Todas"). Replaces the previous pick. */
  selectThemes(themeIds: string[] | typeof ALL): G;
  /** Picked themes available here, in their order; empty until the voter picks. */
  selectedThemes(): Theme[];
  /** Next picked theme not revealed yet, after `themeId` (wrapping); null when none is left. */
  nextTheme(themeId?: string): Theme | null;
  /** Picked themes revealed out of the picked ones ("Temáticas · 1/3"). */
  themesProgress(): { revealed: number; total: number };
  /** "Repetir": forget every choice of the theme (follow-up ones too) and make it blind again; no guess is offered there any more. */
  repeatTheme(themeId: string): G;
  theme(themeId: string): ThemeView;
  /** Blind view of a question: its 3 approaches, shuffled. */
  question(questionId: string): QuestionView;
  /**
   * Choose an approach by letter, or "none" ("Ninguna me convence"). Changeable until the reveal;
   * after it, only a follow-up question not answered yet can be answered (once: it is revealed at
   * once). Playing a theme that was not picked adds it to the pick.
   */
  chooseApproach(questionId: string, letter: string | None, options?: ApproachChoiceOptions): G;
  /** Guess chips in the sheet: every party in play here with a published manifesto, by name. Empty with the guess off or in a repeated theme. */
  questionGuessOptions(questionId: string): RevealedParty[];
  /** Hit (true) or miss per revealed question with a guess. Never the party: this is what analytics may send. */
  guessOutcomes(): Record<string, boolean>;
  /** "Acertaste X de Y": over revealed questions with a guess. */
  guessScore(): { hits: number; total: number };
  /**
   * Chance of a blind guess being right on this question, here: for each approach, its defenders in
   * play over the parties offered; the most generous approach (the periodic check compares with it).
   */
  guessChance(questionId: string): number;
  /** "Destapar": once every base question is answered. Choices become final. */
  revealTheme(themeId: string): G;
  /** Null until the theme is revealed. */
  themeReveal(themeId: string): ThemeReveal | null;
  /** The result, per revealed theme and overall. Computed only here, on the voter's device. */
  affinity(): Affinity;
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
  /** False after "No volver a preguntarme": no guess is offered or accepted (past ones still count). */
  guess: boolean;
  withChanges(changes: ThemeState): G;
}

export function themeGame<G>(ctx: ThemeContext<G>): ThemeGame<G> {
  const { dataset, seed, state } = ctx;
  const region = ctx.province === null ? null : (provinceByCode(ctx.province)?.regionCode ?? null);
  // A theme plays only with at least one published base question (settleApproaches may have
  // published none of its questions): otherwise it would be revealed empty and count as played.
  const themes = (dataset.themes ?? [])
    .filter((t) => t.region === undefined || t.region === region)
    .filter((t) => (dataset.questions ?? []).some((q) => q.theme === t.id && !q.followUp))
    .sort((a, b) => a.order - b.order);
  const questions = (dataset.questions ?? [])
    .filter((q) => themes.some((t) => t.id === q.theme))
    .sort((a, b) => a.order - b.order);
  const choices = state.questionChoices ?? {};
  const revealed = new Set(state.revealedThemes ?? []);
  const guesses = state.questionGuesses ?? {};
  const repeated = new Set(state.repeatedThemes ?? []);

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
  /** Final choice: in a revealed theme, every base question and every answered follow-up one. */
  const isLocked = (q: Question) => revealed.has(q.theme) && (!q.followUp || choices[q.id] !== undefined);
  /** A guess can be offered here: the guess is on and the voter has not seen this theme's reveal before. */
  const canGuess = (q: Question) => ctx.guess && !repeated.has(q.theme);
  const item = (q: Question): QuestionItem => ({ question: summary(q), choice: choiceOf(q), locked: isLocked(q) });
  const isDone = (themeId: string) => questionsOf(themeId).every((q) => q.followUp || choices[q.id] !== undefined);
  const selection = state.selectedThemes ?? [];
  const selected = selection === ALL ? themes : themes.filter((t) => selection.includes(t.id));
  /** The pick with this theme added (unchanged with "all" or if already there). */
  const selecting = (themeId: string): ThemeState =>
    selection === ALL || selection.includes(themeId) ? {} : { selectedThemes: [...selection, themeId] };

  /** Runs in the voter's province (national, or regional here). */
  const runsHere = (p: Party) => p.scope.type === 'national' || (ctx.province !== null && p.scope.provinces.includes(ctx.province));

  /** Parties defending (full or partial) an approach. */
  const defendersOf = (a: Approach) => a.stances.filter((s) => s.stance !== 'none').map((s) => s.party);
  const guessOf = (q: Question): GuessReveal | null => {
    const guessed = guesses[q.id];
    const party = guessed === undefined ? undefined : ctx.published.get(guessed);
    if (!party) return null;
    const chosen = q.approaches.find((a) => a.id === choices[q.id]);
    return { party: revealParty(party), correct: chosen !== undefined && defendersOf(chosen).includes(guessed!) };
  };
  const revealedQuestions = () => questions.filter((q) => revealed.has(q.theme) && choices[q.id] !== undefined);
  const outcomes = () =>
    Object.fromEntries(revealedQuestions().flatMap((q) => {
      const g = guessOf(q);
      return g ? [[q.id, g.correct] as const] : [];
    }));
  const offered = () => [...ctx.published.values()].map(revealParty).sort(byName);
  /** Rows for these answered questions: the stances of the parties in play on each chosen approach. */
  const affinityRows = (list: Question[]): AffinityRow[] => {
    const points = new Map([...ctx.published.keys()].map((id) => [id, 0]));
    for (const q of list) {
      const chosen = q.approaches.find((a) => a.id === choices[q.id]);
      // "Ninguna" and fillers add nothing; parties running elsewhere are not in `points`.
      if (!chosen || chosen.filler) continue;
      for (const s of chosen.stances)
        if (points.has(s.party) && s.stance !== 'none') points.set(s.party, points.get(s.party)! + STANCE_POINTS[s.stance]);
    }
    const sorted = [...ctx.published.values()]
      .map((p) => ({ party: revealParty(p), points: points.get(p.id)! }))
      .sort((a, b) => b.points - a.points || byName(a.party, b.party));
    return sorted.map((r) => ({
      ...r,
      percent: list.length ? Math.round((100 * r.points) / list.length) : 0,
      rank: 1 + sorted.filter((x) => x.points > r.points).length,
      tie: sorted.filter((x) => x.points === r.points).length > 1,
    }));
  };
  /** Questions of a revealed theme that count: every answered one, base and follow-up. */
  const counted = (themeId: string) => questionsOf(themeId).filter((q) => choices[q.id] !== undefined);

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
      guess: guessOf(q),
    };
  };

  return {
    themes: () => themes,
    selectThemes(themeIds) {
      if (themeIds !== ALL) {
        if (!themeIds.length) throw new Error('Elige al menos una temática');
        themeIds.forEach(findTheme);
      }
      return ctx.withChanges({ selectedThemes: themeIds === ALL ? ALL : [...new Set(themeIds)] });
    },
    selectedThemes: () => selected,
    nextTheme(themeId) {
      const start = themeId === undefined ? 0 : selected.findIndex((t) => t.id === themeId) + 1;
      const pending = (t: Theme) => !revealed.has(t.id);
      return selected.slice(start).find(pending) ?? selected.slice(0, start).find(pending) ?? null;
    },
    themesProgress: () => ({ revealed: selected.filter((t) => revealed.has(t.id)).length, total: selected.length }),
    repeatTheme(themeId) {
      findTheme(themeId);
      const ofTheme = new Set(questionsOf(themeId).map((q) => q.id));
      const others = <T>(r: Record<string, T>) => Object.fromEntries(Object.entries(r).filter(([q]) => !ofTheme.has(q)));
      return ctx.withChanges({
        questionChoices: others(choices),
        questionGuesses: others(guesses),
        revealedThemes: [...revealed].filter((t) => t !== themeId),
        // Repeating a theme never revealed has seen nothing: the guess stays.
        ...(revealed.has(themeId) && !repeated.has(themeId) ? { repeatedThemes: [...repeated, themeId] } : {}),
      });
    },
    theme(themeId) {
      const theme = findTheme(themeId);
      const all = questionsOf(themeId);
      const base = all.filter((q) => !q.followUp);
      const isRevealed = revealed.has(themeId);
      const unanswered = (list: Question[]) => list.find((q) => choices[q.id] === undefined)?.id ?? null;
      return {
        theme,
        questions: base.map(item),
        followUps: all.filter((q) => q.followUp).map(item),
        done: isDone(themeId),
        revealed: isRevealed,
        minutes: base.length * MINUTES_PER_QUESTION,
        next: isRevealed ? null : unanswered(base),
        nextFollowUp: isRevealed ? unanswered(all.filter((q) => q.followUp)) : null,
      };
    },
    chooseApproach(questionId, letter, { guess } = {}) {
      const q = findQuestion(questionId);
      if (isLocked(q)) throw new Error(`La temática ${q.theme} ya está destapada: ${questionId} no se puede cambiar`);
      if (guess !== undefined) {
        if (letter === NONE) throw new Error('No se puede apostar con «Ninguna me convence»');
        if (!ctx.guess) throw new Error('La apuesta está desactivada');
        if (repeated.has(q.theme)) throw new Error(`No se puede apostar en ${q.theme}: ya viste su revelación`);
        if (!ctx.published.has(guess)) throw new Error(`No se puede apostar por ${guess}: no está en juego aquí`);
      }
      let choice: string;
      if (letter === NONE) choice = NONE;
      else {
        const x = shuffled(q).find((y) => y.letter === letter);
        if (!x) throw new Error(`No hay enfoque ${letter} en ${questionId}`);
        choice = x.approach.id;
      }
      const { [questionId]: _, ...others } = choices;
      const { [questionId]: __, ...otherGuesses } = guesses;
      return ctx.withChanges({
        questionChoices: { ...others, [questionId]: choice },
        questionGuesses: guess === undefined ? otherGuesses : { ...otherGuesses, [questionId]: guess },
        ...selecting(q.theme),
      });
    },
    questionGuessOptions(questionId) {
      return canGuess(findQuestion(questionId)) ? offered() : [];
    },
    guessOutcomes: outcomes,
    guessScore() {
      const all = Object.values(outcomes());
      return { hits: all.filter(Boolean).length, total: all.length };
    },
    guessChance(questionId) {
      const q = findQuestion(questionId);
      const n = ctx.published.size;
      if (!n) return 0;
      return Math.max(...q.approaches.map((a) => defendersOf(a).filter((p) => ctx.published.has(p)).length / n));
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
    affinity() {
      const done = themes.filter((t) => revealed.has(t.id));
      return {
        themes: done.map((theme) => {
          const list = counted(theme.id);
          return { theme, questions: list.length, none: list.filter((q) => choices[q.id] === NONE).length, rows: affinityRows(list) };
        }),
        ranking: done.length >= MIN_THEMES_FOR_RANKING ? affinityRows(done.flatMap((t) => counted(t.id))) : null,
        missingManifestos: dataset.parties
          .filter((p) => runsHere(p) && p.manifesto.state === 'pending')
          .map(revealParty)
          .sort(byName),
        noProvince: ctx.province === null,
      };
    },
    question(questionId) {
      const q = findQuestion(questionId);
      const siblings = questionsOf(q.theme).filter((x) => x.followUp === q.followUp);
      return {
        question: summary(q),
        progress: { number: siblings.indexOf(q) + 1, total: siblings.length, followUp: q.followUp },
        approaches: shuffled(q).map(({ approach: a, letter }) => ({ letter, what: a.what, how: a.how, figure: a.figure })),
      };
    },
  };
}

const STANCE_POINTS = { full: 1, partial: 0.5 } as const;

const summary = (q: Question): QuestionSummary => ({ id: q.id, theme: q.theme, text: q.text, followUp: q.followUp });

export type { Theme };
