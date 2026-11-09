// Client app: first-visit home → province → pick themes → theme (questions with 3 approaches,
// confirmed in a sheet → summary → reveal → optional follow-up questions) → next picked theme. All
// logic lives in the game engine; this file only routes (#portada, #provincia, #elegir, #tematicas,
// #tematica/<theme>[/<question>], #preguntar[/<id>], #datos) and keeps the header chip
// "Temáticas · n/N" up to date. Screens: src/web/themes.ts. Choices never
// leave the browser.
// Not here yet: result (#25), guess in the sheet (#26), detailed reveal (#27), share (#30).
import type { Dataset, Mode } from '../dataset/schema';
import { challengeHomeText } from '../share';
import { createGame, type GameState, type Game } from '../game';
import { newSeed } from '../game/random';
import { storageAvailable, remove, save, read } from './storage';
import { questionsView, answerView } from './ask';
import { zoneNotice, partiesBlock, provinceChip, provinceView } from './province';
import { dataView, startOver } from './result';
import { homeView } from './home';
import { TEXT_SIZE_KEY, largeText } from './text-size';
import { setupAnalytics, trackStarted } from './analytics';
import { challengeNotice } from './share';
import { h } from './dom';
import { pickThemesView, questionView, revealView, summaryView, themeHref, themesListView, themesProgress } from './themes';

const SEED_KEY = '29n:seed';
const STATE_KEY = '29n:state';
/** { code: "35" } or { code: null } ("Prefiero no decirlo"); absent = not asked yet. */
const PROVINCE_KEY = '29n:province';
/** { noGuess: true } after "No preguntarme más" (reactivated in Tus datos). */
const PREFERENCES_KEY = '29n:preferences';
const KEYS = [SEED_KEY, STATE_KEY, PROVINCE_KEY, PREFERENCES_KEY, TEXT_SIZE_KEY];
/** The province summary shows ~2 s on the screen after choosing (ux-spec screen 3). */
const ZONE_NOTICE_DURATION = 2000;
type Preferences = { noGuess?: boolean };

const goTo = (path: string) => {
  location.hash = path;
};

export function mountApp(root: HTMLElement, dataset: Dataset, mode: Mode): void {
  // ?provincia=08 overrides the saved one (handy for testing and shared links).
  const forced = new URLSearchParams(location.search).get('provincia');
  const saved = read<{ code: string | null }>(PROVINCE_KEY);
  let province: string | null | undefined = forced ?? (saved ? saved.code : undefined);
  let showNotice = false;
  // Without storage (private mode…) everything works in memory; we say so once.
  const hasStorage = storageAvailable();
  let storageNotice = !hasStorage;
  let challenge = challengeHomeText(location.search);
  let seed = read<string>(SEED_KEY);
  if (!seed) {
    seed = newSeed();
    save(SEED_KEY, seed);
  }
  let preferences = read<Preferences>(PREFERENCES_KEY) ?? {};
  const changePreferences = (changes: Preferences) => {
    preferences = { ...preferences, ...changes };
    save(PREFERENCES_KEY, preferences);
  };
  const newGame = (state?: GameState) => createGame(dataset, province ?? null, seed!, state, { mode });
  let game: Game = newGame(read<GameState>(STATE_KEY) ?? undefined);
  setupAnalytics(dataset.parties.map((p) => p.id));
  /** Saved on every confirmed action; an unconfirmed choice is never saved. */
  const update = (p: Game) => {
    game = p;
    save(STATE_KEY, game.state);
  };
  update(game.markKnown());

  /** The next picked theme not revealed yet; the picker before picking; the list when all are revealed. */
  const goToNext = (after?: string) => {
    if (!game.selectedThemes().length) return goTo('elegir');
    const t = game.nextTheme(after);
    goTo(t ? themeHref(t.id).slice(1) : 'tematicas');
  };

  /** Goes to `path`; on the same hash (no hashchange) renders it here. */
  const show = (path: string) => {
    if (location.hash.slice(1) === path) render();
    else goTo(path);
    window.scrollTo(0, 0);
  };

  /** #tematica/<theme>[/<question>]: the question asked for, the next unanswered one, the summary or the reveal. */
  const themeScreen = (themeId: string, questionId: string | null): HTMLElement | null => {
    if (!game.themes().some((t) => t.id === themeId)) return null;
    const v = game.theme(themeId);
    const asked = questionId === null ? null : [...v.questions, ...v.followUps].find((q) => q.question.id === questionId);
    // After the reveal only follow-up questions can still be answered.
    const playable = asked && !(v.revealed && !asked.question.followUp) ? asked.question.id : null;
    const id = playable ?? v.next;
    if (id) {
      trackStarted(game);
      return questionView(game, id, {
        choose: (letter) => {
          update(game.chooseApproach(id, letter));
          // After the reveal, follow-up questions go one after another, then back to the reveal.
          const followUp = game.theme(themeId).nextFollowUp;
          show((v.revealed && followUp ? themeHref(themeId, followUp) : themeHref(themeId)).slice(1));
        },
      });
    }
    if (v.revealed)
      return revealView(game, themeId, {
        next: () => goToNext(themeId),
        repeat: () => {
          update(game.repeatTheme(themeId));
          show(themeHref(themeId).slice(1));
        },
      });
    return summaryView(game, themeId, () => {
      update(game.revealTheme(themeId));
      render();
    });
  };

  const render = (focus: string | null = 'h1') => {
    const path = location.hash.slice(1);
    const [route, ...rest] = path.split('/').map(decodeURIComponent);
    let screen: HTMLElement | null = null;
    if (path === 'provincia') screen = provinceView(province, chooseProvince);
    else if (path === 'datos') screen = dataViewApp();
    else if (path === 'portada') screen = homeView(() => (province === undefined ? goTo('provincia') : goToNext()));
    else if (province === undefined) return goTo('portada'); // first visit: the home page, then the province
    else if (path === 'elegir') screen = pickThemesView(game, { pick: (themes) => {
      update(game.selectThemes(themes));
      goToNext();
    } });
    else if (path === 'tematicas') screen = themesListView(game, [partiesBlock(game), listLinks()]);
    else if (route === 'tematica' && rest[0]) screen = themeScreen(rest[0], rest[1] ?? null);
    else if (path === 'preguntar') screen = questionsView(game);
    else if (route === 'preguntar' && game.suggestedQuestions().some((p) => p.id === rest[0])) screen = answerView(game, rest[0]!);
    if (!screen) return goToNext(); // start: the next theme not revealed yet, or the list
    root.replaceChildren(screen);
    if (showNotice && path !== 'provincia') {
      // Once, on the screen after choosing: who is in play here. It goes away after ~2 s.
      const warning = zoneNotice(game);
      root.prepend(warning);
      removeAfter(warning, ZONE_NOTICE_DURATION);
      showNotice = false;
    }
    if (challenge) {
      // ?r=reto: once, on the first screen shown; on the first-visit home, above its headline.
      const line = challengeNotice(challenge);
      const headline = path === 'portada' ? root.querySelector('h1') : null;
      if (headline) headline.before(line);
      else root.prepend(line);
      challenge = null;
    }
    if (storageNotice) {
      root.prepend(h('p', { class: 'zone-notice', role: 'status' }, 'En este modo no podemos recordar tu progreso si cierras.'));
      storageNotice = false;
    }
    renderHeader();
    if (focus) root.querySelector<HTMLElement>(focus)?.focus();
  };

  /** Header chip "Temáticas · n/N", hidden during onboarding. */
  const renderHeader = () => {
    const chip = document.getElementById('themes-chip');
    if (!chip) return;
    const onboarding = ['portada', 'provincia'].includes(location.hash.slice(1)) || province === undefined;
    chip.hidden = onboarding;
    chip.textContent = themesProgress(game);
  };

  const listLinks = () =>
    h('div', { class: 'list-links' },
      provinceChip(game.province),
      game.suggestedQuestions().length ? h('p', {}, h('a', { href: '#preguntar' }, 'Pregunta a los programas')) : null,
      h('p', {}, h('a', { href: '#datos' }, 'Tus datos')),
      Object.keys(game.state.questionChoices ?? {}).length ? startOver(clearAll) : null,
    );

  const chooseProvince = (code: string | null) => {
    province = code;
    save(PROVINCE_KEY, { code });
    // Choices are kept; themes not available in the new province simply stop showing.
    // Parties of the new zone are shown right away (zoneNotice), so they are not "news" later.
    update(newGame(game.state).markKnown());
    showNotice = true;
    goToNext();
  };
  const clearAll = () => {
    for (const c of KEYS) remove(c);
    location.hash = '';
    location.reload();
  };

  const dataViewApp = () =>
    h('div', {},
      h('header', { class: 'header' }, h('a', { href: '#tematicas', class: 'back-link' }, '← Temáticas')),
      dataView(game, { chosenProvince: province !== undefined, guessEnabled: !preferences.noGuess, storage: hasStorage, largeText: largeText() }, {
        changeGuess: (enabled) => changePreferences({ noGuess: !enabled }),
        clearAll,
      }),
    );

  window.addEventListener('hashchange', () => {
    window.speechSynthesis?.cancel();
    document.getElementById('menu')?.hidePopover?.();
    render();
    window.scrollTo(0, 0);
  });

  render();
}

/** Removes a transient notice after `ms`, but not while it is focused or covered by a layer. */
function removeAfter(el: HTMLElement, ms: number): void {
  setTimeout(() => {
    if (!el.isConnected) return;
    // Behind a sheet nobody has seen it yet: start again once it is closed.
    if (document.querySelector('dialog[open]')) return removeAfter(el, ms);
    // Not while a keyboard/screen-reader user is on its "Cambiar" link. (No :hover check: on phones
    // hover sticks after a tap and the notice would never go.)
    if (el.matches(':focus-within')) return removeAfter(el, 1000);
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 300);
  }, ms);
}
