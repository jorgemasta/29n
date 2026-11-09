// v2 screens (#19): the theme list, a question with its 3 approaches (tap → confirmation sheet), the
// summary before revealing a theme, and the reveal. All the logic lives in the engine
// (src/game/themes.ts); these functions only render and call back. Routes (Spanish: the voter sees
// them): #tematicas, #tematica/<theme>, #tematica/<theme>/<question>.
import { NONE, type Game, type QuestionItem, type ThemeView } from '../game';
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

/** First theme not revealed yet, in order; null when every theme is revealed. */
export function nextTheme(game: Game, after?: string): Theme | null {
  const themes = game.themes();
  const start = after === undefined ? 0 : themes.findIndex((t) => t.id === after) + 1;
  const pending = (t: Theme) => !game.theme(t.id).revealed;
  return themes.slice(start).find(pending) ?? themes.slice(0, start).find(pending) ?? null;
}

/** "Temáticas · 1/8": themes revealed out of themes available here. */
export function themesProgress(game: Game): string {
  const themes = game.themes();
  return `Temáticas · ${themes.filter((t) => game.theme(t.id).revealed).length}/${themes.length}`;
}

export function themesListView(game: Game, extra: Child[] = []): HTMLElement {
  const state = (v: ThemeView) => {
    if (v.revealed) return 'Destapada';
    if (v.done) return 'Lista para destapar';
    const answered = v.questions.filter((q) => q.choice !== null).length;
    return answered ? `${answered} de ${v.questions.length}` : `${v.questions.length} ${v.questions.length === 1 ? 'pregunta' : 'preguntas'}`;
  };
  return h('section', { class: 'themes' },
    h('h1', { tabindex: '-1' }, 'Temáticas'),
    h('p', { class: 'grey' }, 'Elige una. Al terminarla verás qué partidos defienden cada propuesta.'),
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

/** Progress inside a theme: one bar per base question ("Pregunta 2 de 3"). */
function progress(v: ThemeView, current: string): HTMLElement {
  const i = v.questions.findIndex((q) => q.question.id === current);
  return h('ol', { class: 'progress-bars', 'aria-hidden': 'true' },
    ...v.questions.map((q, k) => h('li', { class: k === i ? 'current' : q.choice !== null ? 'done' : '' })));
}

/** A question: its 3 approaches as cards; a tap opens the confirmation sheet. */
export function questionView(game: Game, questionId: string, actions: QuestionActions): HTMLElement {
  const view = game.question(questionId);
  const theme = game.theme(view.question.theme);
  const position = theme.questions.findIndex((q) => q.question.id === questionId);
  const category = view.question.followUp
    ? `${theme.theme.title} · Para afinar`
    : `${theme.theme.title} · Pregunta ${position + 1} de ${theme.questions.length}`;
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
    view.question.followUp ? null : progress(theme, questionId),
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

/** The revealed theme: every answered question with who defends each approach, fully or in part. */
export function revealView(game: Game, themeId: string, onContinue: () => void): HTMLElement {
  const r = game.themeReveal(themeId)!;
  const followUps = game.theme(themeId).followUps.filter((q) => q.choice === null);
  return h('section', { class: 'reveal' },
    h('p', { class: 'category' }, `${r.theme.title} · Destapada`),
    h('h1', { tabindex: '-1' }, 'Quién defiende cada propuesta'),
    ...r.questions.map(questionReveal),
    followUps.length
      ? h('div', { class: 'follow-ups' },
          h('h2', {}, 'Para afinar'),
          h('p', {}, `${followUps.length === 1 ? 'Una pregunta más' : `${followUps.length} preguntas más`} sobre ${r.theme.title}, si quieres dar más fondo a tu resultado.`),
          h('a', { href: themeHref(themeId, followUps[0]!.question.id), class: 'secondary link-button' }, 'Contestar'))
      : null,
    h('p', { class: 'note' }, aiLabel(), ' Las propuestas y su agrupación están hechas con IA. Cada partido va con la cita literal de su programa.'),
    h('div', { class: 'action-bar' }, h('div', {}, button('Seguir con otra temática', 'primary', onContinue))),
  );
}
