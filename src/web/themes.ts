// v2 screens (#19, #24): picking themes, the theme list, a question with its 3 approaches (tap →
// confirmation sheet), the summary before revealing a theme, and the reveal. All the logic lives in
// the engine (src/game/themes.ts); these functions only render and call back. Routes (Spanish: the
// voter sees them): #elegir, #tematicas, #tematica/<theme>, #tematica/<theme>/<question>.
import { NONE, type Game, type QuestionItem, type ThemeReveal, type ThemeView } from '../game';
import type { Theme } from '../dataset/schema';
import { aiLabel } from './ai';
import { button, h, type Child } from './dom';
import { icon } from './icons';
import { createReader } from './listen';
import { questionReveal } from './reveal';
import { openSheet } from './sheet';

export const themeHref = (themeId: string, questionId?: string) =>
  `#tematica/${encodeURIComponent(themeId)}${questionId ? `/${encodeURIComponent(questionId)}` : ''}`;

export interface QuestionActions {
  /** The voter confirmed in the sheet: a letter or "none". */
  choose(letter: string): void;
}

const choiceText = (choice: string | null) =>
  choice === null ? 'Sin contestar' : choice === NONE ? 'Ninguna me convence' : `Elegiste la ${choice}`;

/** "Temáticas · 1/3": picked themes revealed out of the picked ones ("Temáticas" before picking). */
export function themesProgress(game: Game): string {
  const { revealed, total } = game.themesProgress();
  return total ? `Temáticas · ${revealed}/${total}` : 'Temáticas';
}

const questionsAndTime = (v: ThemeView) =>
  `${v.questions.length} ${v.questions.length === 1 ? 'pregunta' : 'preguntas'} · unos ${v.minutes} min`;

export interface PickActions {
  /** Theme ids, or "all" ("Todas"). */
  pick(themes: string[] | 'all'): void;
}

/** #elegir: mark one or several themes, or "Todas". The current pick comes checked. */
export function pickThemesView(game: Game, actions: PickActions): HTMLElement {
  const picked = new Set(game.selectedThemes().map((t) => t.id));
  const boxes: HTMLInputElement[] = [];
  const start = button('Empezar con las marcadas', 'primary', () => {
    const ids = boxes.filter((b) => b.checked).map((b) => b.value);
    if (ids.length) actions.pick(ids);
  });
  const refresh = () => {
    const n = boxes.filter((b) => b.checked).length;
    (start as HTMLButtonElement).disabled = n === 0;
    start.textContent = n ? `Empezar con ${n === 1 ? '1 temática' : `${n} temáticas`}` : 'Marca al menos una';
  };
  const row = (t: Theme) => {
    const v = game.theme(t.id);
    const box = h('input', { type: 'checkbox', name: 'theme', value: t.id }) as HTMLInputElement;
    box.checked = picked.has(t.id);
    box.addEventListener('change', refresh);
    boxes.push(box);
    return h('li', {}, h('label', { class: 'pick-row' },
      box,
      h('span', { class: 'name' }, t.title),
      h('span', { class: 'state' }, v.revealed ? 'Destapada' : questionsAndTime(v))));
  };
  const total = game.themes().reduce((sum, t) => sum + game.theme(t.id).minutes, 0);
  const section = h('section', { class: 'pick-themes' },
    h('h1', { tabindex: '-1' }, '¿Qué temáticas quieres jugar?'),
    h('p', {}, 'Marca las que te importen. Al terminar cada una verás qué partidos defienden cada propuesta.'),
    button(`Todas (unos ${total} min)`, 'secondary', () => actions.pick('all')),
    h('ul', { class: 'rows', role: 'list' }, ...game.themes().map(row)),
    h('div', { class: 'action-bar' }, h('div', {}, start)),
  );
  refresh();
  return section;
}

export function themesListView(game: Game, extra: Child[] = []): HTMLElement {
  const state = (v: ThemeView) => {
    if (v.revealed) return 'Destapada';
    if (v.done) return 'Lista para destapar';
    const answered = v.questions.filter((q) => q.choice !== null).length;
    return answered ? `${answered} de ${v.questions.length}` : questionsAndTime(v);
  };
  return h('section', { class: 'themes' },
    h('h1', { tabindex: '-1' }, 'Temáticas'),
    h('p', { class: 'grey' }, 'Entra en cualquiera. Al terminarla verás qué partidos defienden cada propuesta.'),
    h('p', {}, h('a', { href: '#elegir' }, 'Elegir qué temáticas jugar')),
    h('ul', { class: 'rows', role: 'list' },
      ...game.themes().map((t) => {
        const v = game.theme(t.id);
        return h('li', {}, h('a', { href: themeHref(t.id), class: `topic-row${v.revealed ? ' done' : ''}` },
          h('span', { class: 'name' }, t.title),
          h('span', { class: 'state' }, state(v)),
        ));
      })),
    ...extra,
  );
}

/** Progress inside a theme: one bar per question of the same kind (base or follow-up). */
function progress(items: QuestionItem[], current: string): HTMLElement {
  return h('ol', { class: 'progress-bars', 'aria-hidden': 'true' },
    ...items.map((q) => h('li', { class: q.question.id === current ? 'current' : q.choice !== null ? 'done' : '' })));
}

/** A question: its 3 approaches as cards; a tap opens the confirmation sheet. */
export function questionView(game: Game, questionId: string, actions: QuestionActions): HTMLElement {
  const view = game.question(questionId);
  const theme = game.theme(view.question.theme);
  const { number, total, followUp } = view.progress;
  const category = `${theme.theme.title} · ${followUp ? 'Para afinar' : 'Pregunta'} ${number} de ${total}`;
  const reader = createReader((id) => {
    for (const c of section.querySelectorAll<HTMLElement>('.option[data-value]')) c.classList.toggle('playing', c.dataset.value === id);
    listen?.replaceChildren(...listenLabel(id !== null));
  });

  const press = (value: string | null) => {
    for (const c of section.querySelectorAll<HTMLElement>('[data-value]')) c.setAttribute('aria-pressed', String(c.dataset.value === value));
  };
  const confirm = (value: string) => {
    reader.stop();
    press(value);
    navigator.vibrate?.(10); // short haptic tap where supported
    const chosen = view.approaches.find((a) => a.letter === value);
    const sheet = openSheet({
      title: chosen ? `Te quedas con la ${value}` : 'No te convence ninguna',
      content: [
        chosen
          ? h('div', { class: 'sheet-choice' }, h('span', { class: 'letter', 'aria-hidden': 'true' }, chosen.letter), h('strong', {}, chosen.what))
          : h('p', {}, 'No sumará a ningún partido.'),
        button('Confirmar y seguir', 'primary', () => {
          sheet.close();
          actions.choose(value);
        }),
        button('Cambiar mi elección', 'text-link', () => sheet.close()),
      ],
      onClose: () => {
        press(null);
        section.querySelector<HTMLElement>(`[data-value="${value}"]`)?.focus();
      },
    });
  };

  const option = (a: (typeof view.approaches)[number]) => {
    const b = h('button', { type: 'button', class: 'option', 'aria-pressed': 'false', 'data-value': a.letter, 'aria-label': `Propuesta ${a.letter}: ${a.what}` },
      h('span', { class: 'letter', 'aria-hidden': 'true' }, a.letter),
      h('span', { class: 'text' },
        h('strong', { class: 'what' }, a.what),
        h('span', { class: 'how' }, a.how),
        a.figure ? h('span', { class: 'figure' }, a.figure) : null),
    );
    b.addEventListener('click', () => confirm(a.letter));
    return h('li', {}, b);
  };
  const none = h('button', { type: 'button', class: 'secondary', 'aria-pressed': 'false', 'data-value': NONE }, 'Ninguna me convence');
  none.addEventListener('click', () => confirm(NONE));

  const sentence = (t: string) => `${t.trim().replace(/[.\s]+$/, '')}.`;
  const listen = reader.available
    ? button('', 'secondary listen', () => {
        if (reader.current !== null) return reader.stop();
        reader.read(view.approaches.map((a) => ({ id: a.letter, text: `Propuesta ${a.letter}. ${sentence(a.what)} ${sentence(a.how)}${a.figure ? ` ${sentence(a.figure)}` : ''}` })));
      })
    : null;
  listen?.replaceChildren(...listenLabel(false));

  const section = h('section', { class: 'question' },
    progress(followUp ? theme.followUps : theme.questions, questionId),
    h('p', { class: 'category' }, category),
    h('h1', { tabindex: '-1' }, view.question.text),
    listen ? h('div', { class: 'utilities' }, listen) : null,
    h('ol', { class: 'options', role: 'list' }, ...view.approaches.map(option)),
    h('p', { class: 'hint' }, 'Toca la propuesta que más te convenza.'),
    h('p', { class: 'grey ai-note' }, aiLabel(), ' Resumidas con IA con la misma plantilla y un largo parecido. Quién defiende cada una lo verás al terminar la temática.'),
    h('div', { class: 'action-bar' }, h('div', {}, none)),
  );
  return section;
}

const listenLabel = (reading: boolean): (Node | string)[] => [icon(reading ? 'stop' : 'speaker'), reading ? 'Parar' : 'Escuchar las tres'];

/** Every base question answered: what the voter chose, each one changeable, then "Destapar". */
export function summaryView(game: Game, themeId: string, onReveal: () => void): HTMLElement {
  const v = game.theme(themeId);
  const row = (q: QuestionItem) =>
    h('li', {}, h('a', { href: themeHref(themeId, q.question.id), class: 'summary-row' },
      h('span', { class: 'name' }, q.question.text),
      h('span', { class: 'state' }, choiceText(q.choice), h('span', { class: 'change' }, 'Cambiar'))));
  return h('section', { class: 'summary' },
    h('p', { class: 'category' }, v.theme.title),
    h('h1', { tabindex: '-1' }, 'Esto es lo que has elegido'),
    h('p', {}, 'Antes de destapar puedes cambiar cualquier respuesta. Al destapar verás qué partidos defienden cada propuesta.'),
    h('ul', { class: 'summary-list', role: 'list' }, ...v.questions.map(row)),
    h('div', { class: 'action-bar' }, h('div', {}, button(`Destapar ${v.theme.title}`, 'primary', onReveal))),
  );
}

export interface RevealActions {
  /** Go on with the next picked theme (or pick more when none is left). */
  next(): void;
  /** "Repetir": confirmed in a sheet. */
  repeat(): void;
}

/** The revealed theme: the reveal itself, then the follow-up questions, "Repetir" and the next theme. */
export function revealView(game: Game, themeId: string, actions: RevealActions): HTMLElement {
  const v = game.theme(themeId);
  const left = v.followUps.filter((q) => q.choice === null).length;
  const next = game.nextTheme(themeId);
  const repeat = button('Repetir esta temática', 'text-link', () => {
    const sheet = openSheet({
      title: `¿Repetir ${v.theme.title}?`,
      content: [
        h('p', {}, 'Se borrarán tus respuestas de esta temática y volverás a elegir a ciegas.'),
        button('Repetir', 'primary', () => {
          sheet.close();
          actions.repeat();
        }),
        button('Cancelar', 'text-link', () => sheet.close()),
      ],
      onClose: () => repeat.isConnected && repeat.focus(),
    });
  });
  return h('section', { class: 'reveal' },
    h('p', { class: 'category' }, `${v.theme.title} · Destapada`),
    h('h1', { tabindex: '-1' }, 'Quién defiende cada propuesta'),
    themeRevealContent(game.themeReveal(themeId)!),
    v.nextFollowUp
      ? h('div', { class: 'follow-ups' },
          h('h2', {}, 'Para afinar'),
          h('p', {}, `${left === 1 ? 'Una pregunta más' : `${left} preguntas más`} sobre ${v.theme.title}, opcionales, si quieres dar más fondo a tu resultado.`),
          h('a', { href: themeHref(themeId, v.nextFollowUp), class: 'secondary link-button' }, left === 1 ? 'Contestarla' : 'Contestarlas'))
      : null,
    h('div', { class: 'list-links' }, h('a', { href: '#resultado' }, 'Ver mi resultado'), repeat),
    h('div', { class: 'action-bar' }, h('div', {},
      next
        ? button(`Seguir con ${next.title}`, 'primary', actions.next)
        : h('a', { href: '#elegir', class: 'primary link-button' }, 'Elegir otra temática'))),
  );
}

/** The reveal proper (src/web/reveal.ts, #27): every answered question, then the AI note. */
function themeRevealContent(r: ThemeReveal): DocumentFragment {
  const f = document.createDocumentFragment();
  f.append(
    ...r.questions.map(questionReveal),
    h('p', { class: 'note' }, aiLabel(), ' Las propuestas y su agrupación están hechas con IA. Cada partido va con la cita literal de su programa.'),
  );
  return f;
}
