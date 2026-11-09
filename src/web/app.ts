// Client app: first-visit home → province → topic (blind choice → confirm/bet → reveal) → result. All
// logic lives in the game engine; this file only renders and routes (#portada, #provincia, #inicio,
// #temas, #tema/<id>, #resultado, #compartir, #preguntar[/<id>], #datos) and drives the bottom tab bar
// (static in index.astro). Choices, bets and the result never leave the browser.
import type { Dataset, Mode } from '../dataset/schema';
import { challengeHomeText } from '../share';
import {
  createGame,
  GOAL_TOPICS,
  MAX_PRIORITIES,
  NONE,
  type GameState,
  type TopicItem,
  type Game,
  type Journey,
  type Reveal,
  type RevealedCard,
} from '../game';
import { newSeed } from '../game/random';
import { storageAvailable, remove, save, read } from './storage';
import { questionsView, answerView } from './ask';
import { zoneNotice, partiesBlock, provinceChip, provinceView } from './province';
import { startOver, ballot, joinList, dataView, resultView, returnView } from './result';
import { feasibilityChip, feasibilityNote } from './feasibility';
import { aiLabel } from './ai';
import { feedbackButton } from './feedback';
import { homeView } from './home';
import { createReader } from './listen';
import { TEXT_SIZE_KEY, largeText } from './text-size';
import { trackConfirm, trackResult, trackViewTopic, setupAnalytics } from './analytics';
import { challengeNotice, shareView } from './share';
import { button, h, type Child } from './dom';
import { SOURCE_LABEL } from './labels';
import { greyCard, revealedCard } from './card';

const SEED_KEY = '29n:seed';
const STATE_KEY = '29n:state';
/** { codigo: "35" } or { codigo: null } ("Prefiero no decirlo"); absent = not asked yet. */
const PROVINCE_KEY = '29n:province';
/** { noGuess: true } after "No preguntarme más" (reactivated in Tus datos); { helpSeen: true } after
 * the first-time help layer of topic 1. */
const PREFERENCES_KEY = '29n:preferences';
const KEYS = [SEED_KEY, STATE_KEY, PROVINCE_KEY, PREFERENCES_KEY, TEXT_SIZE_KEY];
/** The province summary shows ~2 s on the screen after choosing (ux-spec screen 3). */
const ZONE_NOTICE_DURATION = 2000;
/** Routes without the bottom tab bar (onboarding). */
const NO_TABS = new Set(['portada', 'provincia']);
type Preferences = { noGuess?: boolean; helpSeen?: boolean };


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
  /** Saved on every confirmed action; an unconfirmed round is never saved. */
  const update = (p: Game) => {
    game = p;
    save(STATE_KEY, game.state);
  };
  // Returning visit: parties published since the last one are announced once, then marked as known.
  const newParties = game.state.known ? game.news().parties : [];
  update(game.markKnown());
  let homeShown = false;
  let selection: string | null = null;
  let priorityNotice: string | null = null;
  /** Only right after confirming: the reveal flips (or fades, with reduced motion) once. */
  let animateReveal = false;
  let reading = false;
  const reader = createReader((id) => {
    reading = id !== null;
    markReading();
  });
  /** Highlights the card being read and keeps the button label in sync (survives re-renders). */
  const markReading = () => {
    for (const t of root.querySelectorAll<HTMLElement>('.card[data-value]')) t.classList.toggle('playing', t.dataset.value === reader.current);
    const b = root.querySelector<HTMLElement>('.listen');
    if (b) b.replaceChildren(...listenLabel(reading));
  };

  /** The next pending topic, or the list when every topic is done. */
  const goToNext = () => {
    const s = game.next();
    goTo(s ? `tema/${s.id}` : 'temas');
  };

  const render = (focus: string | null = 'h1') => {
    const path = location.hash.slice(1);
    const topicId = path.startsWith('tema/') ? decodeURIComponent(path.slice(5)) : null;
    const exists = topicId !== null && game.topics().some((t) => t.id === topicId);
    if (path === 'provincia') root.replaceChildren(provinceView(province, chooseProvince));
    else if (path === 'datos') root.replaceChildren(dataViewApp());
    else if (path === 'portada') root.replaceChildren(homeView(() => (province === undefined ? goTo('provincia') : goToNext())));
    else if (province === undefined) return goTo('portada'); // first visit: the home page, then the province
    else if (path === 'inicio') root.replaceChildren(returnViewApp());
    else if (path === 'temas') root.replaceChildren(listView());
    else if (path === 'preguntar') root.replaceChildren(questionsView(game));
    else if (path.startsWith('preguntar/') && game.suggestedQuestions().some((p) => p.id === decodeURIComponent(path.slice(10))))
      root.replaceChildren(answerView(game, decodeURIComponent(path.slice(10))));
    else if (path === 'resultado') root.replaceChildren(resultViewApp()), trackResult(game);
    else if (path === 'compartir') root.replaceChildren(shareViewApp());
    else if (exists) root.replaceChildren(topicView(topicId!)), trackViewTopic(game);
    else if (!homeShown && game.done().length > 0) {
      homeShown = true;
      return goTo('inicio');
    } else return goToNext(); // start: the next pending topic (vivienda first), or the list if all are done
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
    renderTabs(path);
    if (storageNotice) {
      root.prepend(h('p', { class: 'zone-notice', role: 'status' }, 'En este modo no podemos recordar tu progreso si cierras.'));
      storageNotice = false;
    }
    if (focus) root.querySelector<HTMLElement>(focus)?.focus();
  };

  const chooseProvince = (code: string | null) => {
    province = code;
    save(PROVINCE_KEY, { code });
    // Choices are kept; topics not available in the new province simply stop counting.
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

  const returnViewApp = () =>
    returnView(game, newParties, {
      proceed: goToNext,
      seeNews: () => {
        const t = game.news().topics[0];
        goTo(t ? `tema/${t.topic.id}` : 'temas');
      },
      keepChoices: () => {
        update(game.keepChoices());
        render();
      },
      clearAll,
    });

  const resultViewApp = () =>
    h('div', {},
      h('header', { class: 'header' }, h('a', { href: '#temas', class: 'back-link' }, '← Temas'), provinceChip(game.province)),
      resultView(game, {
        markPriority: (id, marked) => {
          if (marked && game.priorities().length >= MAX_PRIORITIES) priorityNotice = `Ya tienes ${MAX_PRIORITIES}. Quita uno.`;
          else {
            priorityNotice = null;
            update(game.markPriority(id, marked));
          }
          render(`[aria-pressed][data-topic="${id}"]`);
          priorityNotice = null;
        },
        nextTopic: goToNext,
      }, priorityNotice),
    );

  const shareViewApp = () =>
    h('div', {},
      h('header', { class: 'header' }, h('a', { href: '#resultado', class: 'back-link' }, '← Mi resultado')),
      shareView(game),
    );

  const dataViewApp = () =>
    h('div', {},
      h('header', { class: 'header' }, h('a', { href: '#temas', class: 'back-link' }, '← Temas')),
      dataView(game, { chosenProvince: province !== undefined, guessEnabled: !preferences.noGuess, storage: hasStorage, largeText: largeText() }, {
        changeGuess: (enabled) => changePreferences({ noGuess: !enabled }),
        clearAll,
      }),
    );

  window.addEventListener('hashchange', () => {
    selection = null;
    reader.stop();
    render();
    window.scrollTo(0, 0);
  });

  const listView = (): HTMLElement => {
    const list = game.list();
    const done = game.done().length;
    const row = (i: TopicItem) => {
      const state = i.newOnes
        ? `Nuevo: ${i.newOnes} ${i.newOnes === 1 ? 'propuesta' : 'propuestas'}`
        : i.state === 'done' ? '✓ Hecho' : i.state === 'none' ? '— Ninguna me convenció' : 'Sin empezar';
      const a = h('a', { href: `#tema/${i.topic.id}`, class: `topic-row ${i.state}` },
        h('span', { class: 'name' }, i.topic.title, i.topic.scope === 'canarias' ? h('span', { class: 'canary-label' }, 'Solo Canarias') : null),
        h('span', { class: 'state' }, state),
      );
      return h('li', {}, a);
    };
    return h('section', { class: 'list' },
      h('header', { class: 'header' }, h('span', {}), provinceChip(game.province)),
      h('h1', { tabindex: '-1' }, 'Temas'),
      ballot(game),
      h('p', { class: 'grey' }, done < GOAL_TOPICS
        ? `Tu papeleta · ${done} de ${GOAL_TOPICS}. Te ${GOAL_TOPICS - done === 1 ? 'falta 1 tema' : `faltan ${GOAL_TOPICS - done} temas`} para ver tu resultado.`
        : `${done} hechos · Haz más para afinar tu resultado.`),
      done >= GOAL_TOPICS ? h('a', { href: '#resultado', class: 'secondary link-button' }, 'Ver mi resultado') : null,
      h('ol', { class: 'rows', role: 'list' }, ...list.suggested.map(row)),
      list.extra.length ? h('h2', {}, 'Temas extra') : null,
      list.extra.length ? h('ul', { class: 'rows', role: 'list' }, ...list.extra.map(row)) : null,
      list.hidden.length
        ? h('div', { class: 'hidden-topics' },
            h('h2', {}, 'Pocos partidos hablan de esto'),
            h('p', { class: 'grey' }, 'Menos de dos partidos de tu zona hacen una propuesta sobre estos temas, así que no hay nada que elegir a ciegas.'),
            h('ul', { class: 'rows', role: 'list' },
              ...list.hidden.map((t) => h('li', { class: 'topic-row hidden-item' }, h('span', { class: 'name' }, t.title)))))
        : null,
      partiesBlock(game),
      game.suggestedQuestions().length
        ? h('p', {}, h('a', { href: '#preguntar', class: 'topic-row' }, h('span', { class: 'name' }, 'Pregunta a los programas'), h('span', { class: 'state' }, '→')))
        : null,
      h('p', {}, h('a', { href: '#datos' }, 'Tus datos')),
      done ? startOver(clearAll) : null,
    );
  };

  const topicView = (topicId: string): HTMLElement => {
    const reveal = game.reveal(topicId);
    return reveal ? revealView(reveal) : chooseView(topicId);
  };

  const chooseView = (topicId: string): HTMLElement => {
    const view = game.topic(topicId);
    const list = h('ol', { class: 'cards', role: 'list' });
    const options = [...view.cards.map((t) => t.letter), NONE];
    const card = (value: string, ...content: Child[]) => {
      const b = h('button', {
        type: 'button',
        class: value === NONE ? 'card none' : 'card',
        'aria-pressed': String(selection === value),
        'aria-label': value === NONE ? 'Ninguna me convence' : `Propuesta ${value}`,
        'data-value': value,
      }, ...content);
      b.addEventListener('click', () => {
        selection = value;
        navigator.vibrate?.(10); // short haptic tap where supported
        render(`[data-value="${value}"]`);
        markReading();
      });
      return b;
    };
    for (const t of view.cards) {
      list.append(h('li', {}, card(t.letter, h('span', { class: 'letter', 'aria-hidden': 'true' }, t.letter),
        h('span', { class: 'text' }, h('strong', { class: 'headline' }, t.headline), h('span', { class: 'detail' }, t.detail)))));
    }
    list.append(h('li', {}, card(NONE, h('span', { class: 'text' }, h('strong', { class: 'headline' }, 'Ninguna me convence')))));

    const noProposal = view.noProposal
      ? ` ${view.noProposal} ${view.noProposal === 1 ? 'partido no propone' : 'partidos no proponen'} nada sobre esto (los verás al final).`
      : '';
    const confirm = selection && options.includes(selection) ? confirmSheet(topicId, selection) : null;

    return h('section', { class: 'choose' },
      header(game, topicId),
      h('h1', { tabindex: '-1' }, view.topic.question),
      view.topic.explanation ? h('p', { class: 'explanation' }, view.topic.explanation) : null,
      utilities(view.cards),
      list,
      h('p', { class: 'grey' }, `Hay ${view.cards.length} propuestas.${noProposal}`),
      h('p', { class: 'grey ai-note' }, aiLabel(), ' Reescritas con IA en el mismo estilo y largo parecido. El texto original lo verás después de elegir.'),
      firstTimeHelp(topicId),
      h('p', { class: 'grey' }, `El orden y las letras se barajan para ti en cada tema. Tu barajado: #${view.shuffleId} `,
        button('Barajar otra vez', 'text-link', () => {
          update(game.reshuffle(topicId));
          selection = null;
          render();
        })),
      confirm,
    );
  };

  /** Confirm + optional bet in one tap: a chip reveals with that bet, the big button without. */
  const confirmSheet = (topicId: string, value: string): HTMLElement => {
    const confirm = (guess?: string) => {
      const before = game;
      update(game.choose(topicId, value, guess ? { guess } : undefined));
      trackConfirm(before, game, topicId);
      selection = null;
      reader.stop();
      animateReveal = true;
      render();
    };
    if (value === NONE)
      return h('div', { class: 'sticky-bar', role: 'region', 'aria-label': 'Confirmar elección' },
        h('p', {}, 'No te convence ninguna.'),
        button('Ver de quién era cada una', 'primary', () => confirm()),
      );
    const guessParty = !preferences.noGuess;
    return h('div', { class: 'sticky-bar sheet', role: 'region', 'aria-label': 'Confirmar elección' },
      h('p', {}, `Has elegido la ${value}.`),
      guessParty ? h('p', { class: 'guess-question', id: 'guess-question' }, '¿De quién crees que es? ', h('span', { class: 'grey' }, '(opcional, solo lo ves tú)')) : null,
      guessParty
        ? h('div', { class: 'chips', role: 'group', 'aria-labelledby': 'guess-question' },
            ...game.guessOptions(topicId).map((p) => button(p.name, 'chip', () => confirm(p.id))))
        : null,
      button(guessParty ? 'Descubrir sin apostar' : 'Descubrir de quién es', 'primary', () => confirm()),
      h('div', { class: 'button-row' },
        button('Cambiar', 'text-link', () => {
          selection = null;
          render(`[data-value="${value}"]`);
        }),
        guessParty
          ? button('No preguntarme más', 'text-link', () => {
              changePreferences({ noGuess: true });
              render('.sticky-bar .primary');
            })
          : null,
      ),
    );
  };

  const revealView = (r: Reveal): HTMLElement => {
    const mine = r.cards.find((t) => t.chosen);
    const banner = !mine
      ? 'No te convenció ninguna. Esto proponía cada uno:'
      : r.guess?.correct
        ? `Era de ${mine.party.name}. Lo pensabas.`
        : r.guess
          ? `Era de ${mine.party.name}. Tu apuesta: ${r.guess.party.name}.`
          : `La ${mine.letter} era de ${mine.party.name}.`;
    const others = r.cards.filter((t) => !t.chosen);
    const next = game.next(r.topic.id);
    const slot = game.slot(r.topic.id);
    const onResult = slot.type === 'goal' && slot.number === GOAL_TOPICS;
    const newOnes = game.list().suggested.concat(game.list().extra).find((i) => i.topic.id === r.topic.id)?.newOnes ?? 0;
    const chooseAgain = () => {
      update(game.chooseAgain(r.topic.id));
      render();
    };
    const animate = animateReveal;
    animateReveal = false;
    let order = 0;
    const cascade = (el: HTMLElement) => {
      el.style.setProperty('--i', String(order++));
      return el;
    };
    const section = h('section', { class: animate ? 'reveal animate' : 'reveal' },
      header(game, r.topic.id),
      h('p', { class: 'kicker' }, '¿De quién era?'),
      h('h1', { tabindex: '-1' }, banner),
      r.journey ? h('p', { class: 'journey' }, journeyText(r.journey)) : null,
      newOnes
        ? h('div', { class: 'zone-notice', role: 'status' },
            h('p', {}, newOnes === 1 ? 'Hay una propuesta nueva. ¿Sigues prefiriendo la misma?' : `Hay ${newOnes} propuestas nuevas. ¿Sigues prefiriendo la misma?`),
            button('Volver a elegir', 'secondary', chooseAgain))
        : null,
      mine ? h('div', { class: 'mine' }, h('h2', {}, 'Tu elección'), cascade(topicCard(mine, true, r.topic))) : null,
      others.length ? h('h2', {}, mine ? 'Las demás' : 'Todas las propuestas') : null,
      ...others.map((t) => cascade(topicCard(t, false, r.topic))),
      ...r.noProposal.map((p) => cascade(greyCard(p, 'Este partido no propone nada sobre esto'))),
      ...r.unverified.map((p) => cascade(greyCard(p, 'No pudimos verificar su propuesta'))),
      r.pending.length
        ? h('p', { class: 'grey-row' }, `⏳ Sin programa todavía: ${joinList(r.pending.map((p) => p.name))}. `,
            'Mientras falte, no aparece en los temas ni en tu resultado. ', h('a', { href: '/partidos/' }, 'Partidos y programas'))
        : null,
      h('p', { class: 'note' }, aiLabel(), ' Las propuestas están reescritas con IA en un estilo común. La cita es el texto literal del documento.'),
      r.cards.some((t) => t.feasibility)
        ? h('p', { class: 'note' }, 'La viabilidad dice qué haría falta para aplicarla, no si es buena idea.')
        : null,
      newOnes ? null : button('Volver a elegir', 'text-link', chooseAgain),
      h('div', { class: 'sticky-bar' },
        onResult
          ? button('Ver mi resultado', 'primary', () => goTo('resultado'))
          : next
            ? button(`Siguiente: ${next.title}`, 'primary', () => goTo(`tema/${next.id}`))
            : h('p', {}, 'Has hecho todos los temas.'),
        button('Elegir otro tema', 'secondary', () => goTo('temas')),
      ),
    );
    // One tap skips the flip.
    if (animate) section.addEventListener('pointerdown', () => section.classList.remove('animate'), { once: true });
    return section;
  };

  /** "🔊 Escuchar todas" (only if the browser has a voice). Reads the cards in their order. */
  const utilities = (cards: { letter: string; headline: string; detail: string }[]): HTMLElement | null => {
    if (!reader.available || !cards.length) return null;
    const sentence = (t: string) => `${t.trim().replace(/[.\s]+$/, '')}.`;
    const b = button('', 'secondary listen', () => {
      if (reading) return reader.stop();
      reading = true;
      markReading();
      reader.read(cards.map((t) => ({ id: t.letter, text: `Propuesta ${t.letter}. ${sentence(t.headline)} ${sentence(t.detail)}` })));
    });
    b.replaceChildren(...listenLabel(reading));
    return h('div', { class: 'utilities' }, b);
  };

  /** First time only, on topic 1: a layer closed with one tap (anywhere) or Escape. */
  const firstTimeHelp = (topicId: string): HTMLElement | null => {
    const slot = game.slot(topicId);
    if (preferences.helpSeen || slot.type !== 'goal' || slot.number !== 1) return null;
    const layer = h('dialog', { class: 'help', 'aria-labelledby': 'help-text' },
      h('p', { id: 'help-text' }, 'Lee y toca la que más te convenza. No pone de quién es: lo verás después.'),
      h('button', { type: 'button', class: 'primary', autofocus: '' }, 'Entendido'),
    ) as HTMLDialogElement;
    layer.addEventListener('click', () => layer.close());
    layer.addEventListener('close', () => {
      changePreferences({ helpSeen: true });
      layer.remove();
    });
    // Opened once it is in the document (pintar has already focused the heading, which gets the
    // focus back when the layer closes).
    queueMicrotask(() => {
      if (layer.isConnected && !layer.open) layer.showModal();
    });
    return layer;
  };

  render();
}

const listenLabel = (reading: boolean): (Node | string)[] => [
  h('span', { 'aria-hidden': 'true' }, reading ? '⏹ ' : '🔊 '),
  reading ? 'Parar' : 'Escuchar todas',
];

let observed = false;
/** Bottom tab bar (Temas · Preguntar · Mi resultado): hidden during onboarding, current tab marked. */
function renderTabs(path: string): void {
  const nav = document.querySelector<HTMLElement>('.tabs');
  if (!nav) return;
  const visible = !NO_TABS.has(path);
  nav.hidden = !visible;
  document.body.dataset.tabs = visible ? 'yes' : 'no';
  // Fixed bars stack above the tabs, whatever their height (large text, 200 % zoom…).
  if (!observed) {
    observed = true;
    new ResizeObserver(() => document.documentElement.style.setProperty('--tabs-height', `${nav.offsetHeight}px`)).observe(nav);
  }
  const current = path.startsWith('tema/') ? null : path.split('/')[0];
  for (const a of nav.querySelectorAll('a')) {
    if (a.getAttribute('href') === `#${current}`) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

/** Removes a transient notice after `ms`, but not while it is focused or covered by a layer. */
function removeAfter(el: HTMLElement, ms: number): void {
  setTimeout(() => {
    if (!el.isConnected) return;
    // Behind the help layer nobody has seen it yet: start again once the layer is closed.
    if (document.querySelector('dialog[open]')) return removeAfter(el, ms);
    // Not while a keyboard/screen-reader user is on its "Cambiar" link. (No :hover check: on phones
    // hover sticks after a tap and the notice would never go.)
    if (el.matches(':focus-within')) return removeAfter(el, 1000);
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

/** Factual, never a judgement: "Tu primera elección." / "Primera vez que eliges a X." / "3 temas, 2 partidos distintos." */
function journeyText(r: Journey): string {
  if (r.type === 'first') return 'Tu primera elección.';
  if (r.type === 'newParty') return `Primera vez que eliges a ${r.party.name}.`;
  return `${r.topics} temas, ${r.parties} ${r.parties === 1 ? 'partido' : 'partidos distintos'}.`;
}

function header(game: Game, topicId: string): HTMLElement {
  const topic = game.topics().find((t) => t.id === topicId)!;
  const slot = game.slot(topicId);
  const done = game.done().length;
  return h('header', { class: 'header' },
    h('div', { class: 'header-row' }, h('a', { href: '#temas', class: 'back-link' }, '← Temas'), provinceChip(game.province)),
    h('p', {}, slot.type === 'goal' ? `Tema ${slot.number} de ${slot.goal} · ${topic.title}` : `Tema extra · ${topic.title}`),
    slot.type === 'goal'
      ? h('ol', { class: 'progress', 'aria-hidden': 'true' },
          ...Array.from({ length: slot.goal }, (_, i) => h('li', { class: i + 1 === slot.number ? 'current' : i < done ? 'done' : '' })))
      : null,
  );
}

/** A topic's revealed card: source line, feasibility note and "¿Algo no cuadra?" under the quotes. */
function topicCard(t: RevealedCard, open: boolean, topic: { id: string; title: string }): HTMLElement {
  const source = `${SOURCE_LABEL[t.source.type]}${t.source.privateOnly ? ' · solo privado' : ''}`;
  return revealedCard(t, {
    open,
    chips: [feasibilityChip(t.feasibility)],
    extra: [
      h('p', { class: `source${t.source.privateOnly ? ' provisional' : ''}` }, `Fuente: ${source}`),
      feasibilityNote(t.feasibility, t.noSources),
      feedbackButton({ topic, party: t.party, letter: t.letter, pages: t.quotes.map((c) => c.page) }),
    ],
  });
}
