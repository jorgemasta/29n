// The optional guess (#26): in the confirmation sheet, "¿De qué partido crees que es?" with one
// button per party offered, a large "No lo sé, siguiente" and "No volver a preguntarme" (kept in the
// preferences). After the reveal, a dry "Tú pensabas: X"; in the result, how many times it was right.
// Right or wrong is decided by the engine (src/game/themes.ts); nothing here leaves the phone.
import type { Game, GuessReveal, RevealedParty } from '../game';
import { button, h } from './dom';

export interface GuessActions {
  /** Confirm the choice with this party as the guess. */
  guess(partyId: string): void;
  /** Confirm the choice without a guess. */
  skip(): void;
  /** Confirm without a guess and never ask again. */
  disable(): void;
}

/** The guess part of the sheet: the parties offered, then the ways to skip it. */
export function guessChoices(parties: RevealedParty[], actions: GuessActions): HTMLElement[] {
  return [
    h('div', { class: 'guess' },
      h('span', { class: 'optional-pill' }, 'Opcional'),
      h('p', { class: 'guess-question', id: 'guess-question' }, '¿De qué partido crees que es? Lo verás al final.')),
    h('ul', { class: 'guess-options', role: 'list', 'aria-labelledby': 'guess-question' },
      ...parties.map((p) => h('li', {}, button(p.name, 'guess-option', () => actions.guess(p.id), { 'data-party': p.id })))),
    button('No lo sé, siguiente', 'secondary', actions.skip),
    button('No volver a preguntarme', 'text-link', actions.disable),
  ];
}

/** "Tú pensabas: X." — dry, no verdict: the reveal right above shows who defends what. */
export function guessLine(guess: GuessReveal | null): HTMLElement | null {
  return guess ? h('p', { class: 'your-guess' }, `Tú pensabas: ${guess.party.name}.`) : null;
}

/** For the result screen (#25): "Acertaste el partido en 2 de 5 apuestas." Null without guesses. */
export function guessScoreBlock(game: Game): HTMLElement | null {
  const { hits, total } = game.guessScore();
  if (!total) return null;
  return h('section', { class: 'result-block guess-score', 'aria-labelledby': 'r-guess-score' },
    h('h2', { id: 'r-guess-score' }, 'Acertaste el partido en ', h('strong', {}, `${hits} de ${total}`), total === 1 ? ' apuesta.' : ' apuestas.'),
    h('p', { class: 'grey' }, 'Cuenta como acierto si ese partido defiende, de lleno o en parte, la propuesta que elegiste.'),
  );
}
