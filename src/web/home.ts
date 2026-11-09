// First-visit home (ux-spec screen 2): the mechanics in 5 seconds, trust, and one button to start.
// The links of the footer ("Cómo funciona" · "Partidos y programas" · "Código abierto") are the page
// footer, shared with every screen.
import { h } from './dom';


/** Three face-down cards A, B, C; B lights up and turns over to show a generic mark (no party). */
function cards(): HTMLElement {
  const card = (letter: string, flip = false) =>
    h('div', { class: flip ? 'mock-card flip' : 'mock-card' },
      h('span', { class: 'face' }, letter),
      flip ? h('span', { class: 'back' }, h('span', { class: 'generic-logo' })) : null);
  return h('div', { class: 'mock-cards', 'aria-hidden': 'true' }, card('A'), card('B', true), card('C'));
}

export function homeView(onStart: () => void): HTMLElement {
  const start = h('button', { type: 'button', class: 'primary' }, 'Empezar');
  start.addEventListener('click', onStart);
  return h('section', { class: 'home' },
    h('p', { class: 'kicker' }, '29N · Elecciones generales · 29 de noviembre'),
    h('h1', { tabindex: '-1' }, 'Lee lo que proponen sin saber de quién es.'),
    h('p', { class: 'subtitle' }, 'Elige la que más te convence. Al terminar cada temática te enseñamos qué partidos defienden cada una.'),
    cards(),
    h('ol', { class: 'steps', role: 'list' },
      h('li', {}, '1 · Lees tres propuestas'),
      h('li', {}, '2 · Eliges una'),
      h('li', {}, '3 · Destapas quién la defiende')),
    h('div', { class: 'action-bar' }, h('div', {}, start)),
    h('ul', { class: 'confidence', role: 'list' },
      h('li', {}, 'No pedimos nombre, teléfono ni dinero. Nunca.'),
      h('li', {}, 'No te decimos a quién votar. Vota a quien quieras.'),
      h('li', {}, 'Proyecto personal e independiente. Sin vínculo con ningún partido, medio ni institución.')),
  );
}
