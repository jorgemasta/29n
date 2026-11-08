// First-visit home (ux-spec screen 2): the mechanics in 5 seconds, trust, and one button to start.
// The links of the footer ("Cómo funciona" · "Partidos y programas" · "Código abierto") are the page
// footer, shared with every screen.
import { h } from './dom';


/** Three face-down cards A, B, C; B lights up and turns over to show a generic mark (no party). */
function cartas(): HTMLElement {
  const carta = (letra: string, gira = false) =>
    h('div', { class: gira ? 'carta gira' : 'carta' },
      h('span', { class: 'cara' }, letra),
      gira ? h('span', { class: 'dorso' }, h('span', { class: 'logo-generico' })) : null);
  return h('div', { class: 'cartas', 'aria-hidden': 'true' }, carta('A'), carta('B', true), carta('C'));
}

export function vistaPortada(alEmpezar: () => void): HTMLElement {
  const empezar = h('button', { type: 'button', class: 'principal' }, 'Empezar por vivienda');
  empezar.addEventListener('click', alEmpezar);
  return h('section', { class: 'portada' },
    h('p', { class: 'antetitulo' }, '29N · Elecciones generales · 29 de noviembre'),
    h('h1', { tabindex: '-1' }, 'Lee lo que proponen sin saber de quién es.'),
    h('p', { class: 'subtitulo' }, 'Elige la que más te convence. Después te enseñamos de qué partido era cada una.'),
    cartas(),
    h('ol', { class: 'pasos', role: 'list' },
      h('li', {}, h('span', { 'aria-hidden': 'true' }, '📖 '), '1 · Lees'),
      h('li', {}, h('span', { 'aria-hidden': 'true' }, '👆 '), '2 · Eliges'),
      h('li', {}, h('span', { 'aria-hidden': 'true' }, '🔍 '), '3 · Descubres')),
    h('div', { class: 'barra-fija' }, empezar),
    h('ul', { class: 'confianza', role: 'list' },
      h('li', {}, 'No pedimos nombre, teléfono ni dinero. Nunca.'),
      h('li', {}, 'No te decimos a quién votar. Vota a quien quieras.'),
      h('li', {}, 'Proyecto personal e independiente. Sin vínculo con ningún partido, medio ni institución.')),
  );
}
