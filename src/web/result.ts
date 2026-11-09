// "Mi resultado" (#25) and "Tus datos". Rendering only: the numbers come from the engine
// (Game.affinity, computed on the device). Nothing here leaves the browser.
import { MIN_THEMES_FOR_RANKING, type AffinityRow, type Game, type ThemeAffinity } from '../game';
import { provinceName } from './province';
import { button, h } from './dom';

const link = (text: string, href: string, cls = '') => h('a', { href, class: cls }, text);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const joinList = (l: string[]): string => (l.length <= 1 ? (l[0] ?? '') : `${l.slice(0, -1).join(', ')} y ${l.at(-1)}`);

/** Inline confirmation for "Empezar de cero" (no browser dialog). */
export function startOver(onClear: () => void, text = 'Empezar de cero'): HTMLElement {
  const box = h('div', { class: 'start-over' });
  const initial = () =>
    box.replaceChildren(button(text, 'text-link', () => {
      box.replaceChildren(
        h('p', { role: 'alert' }, 'Se borrarán tus elecciones de este móvil. ¿Seguro?'),
        h('div', { class: 'button-row' },
          button('Borrar', 'secondary danger', onClear),
          button('Cancelar', 'secondary', initial)),
      );
      box.querySelector<HTMLElement>('button')?.focus();
    }));
  initial();
  return box;
}

export interface ResultActions {
  /** "Seguir con otra temática": the next picked theme not revealed yet (or the picker). */
  nextTheme(): void;
  clearAll(): void;
}

/**
 * Per revealed theme "con quién coincidiste" and, from MIN_THEMES_FOR_RANKING themes, every party
 * in play together (also at 0 %). Only revealed themes count.
 */
export function resultView(game: Game, actions: ResultActions): HTMLElement {
  const r = game.affinity();
  const title = h('h1', { tabindex: '-1' }, 'Mi resultado');
  const keepPlaying = h('div', { class: 'actions' }, button('Seguir con otra temática', 'primary', actions.nextTheme));
  if (!r.themes.length)
    return h('section', { class: 'result' },
      title,
      h('p', {}, 'Termina y destapa una temática para ver con quién coincidiste.'),
      keepPlaying,
    );
  const counted = r.themes.reduce((s, t) => s + t.questions, 0);
  return h('section', { class: 'result' },
    title,
    r.ranking
      ? h('section', { class: 'result-block', 'aria-labelledby': 'r-overall' },
          h('h2', { id: 'r-overall' }, `En conjunto: ${plural(r.themes.length, 'temática', 'temáticas')}, ${plural(counted, 'pregunta', 'preguntas')}`),
          rankingList(r.ranking, true),
        )
      : h('p', { class: 'grey' }, `Desde ${MIN_THEMES_FOR_RANKING} temáticas verás también con quién coincides en conjunto.`),
    ...r.themes.map(themeBlock),
    // #26: "cuántas veces acertaste" (bets in the sheet) goes here, between the themes and the notes.
    ...r.missingManifestos.map((p) => h('p', { class: 'grey-row' }, `⏳ Falta el programa de ${p.name}: aún no lo ha publicado. Tu resultado puede cambiar.`)),
    r.noProvince ? h('p', { class: 'grey-row' }, 'Solo partidos nacionales. ', link('Elige provincia', '#provincia'), ' para incluir los de tu zona.') : null,
    h('p', { class: 'grey' },
      'Cómo se calcula: el enfoque que eliges suma 1 a cada partido que lo defiende de lleno y 0,5 a los que lo defienden en parte. ',
      '«Ninguna me convence», los enfoques que no defiende ningún partido y los que solo defienden partidos de otras provincias no suman. ',
      'El porcentaje es lo que suma cada partido sobre las preguntas que contestaste. ',
      link('Más en la metodología', '/metodologia/')),
    h('p', { class: 'note' }, 'Esto no es una recomendación de voto. Es un resumen de lo que elegiste.'),
    keepPlaying,
    h('div', { class: 'list-links' }, link('Ver las temáticas', '#tematicas'), startOver(actions.clearAll)),
  );
}

/** One theme: the parties that coincided with the voter, then the rest named in one line. */
function themeBlock(t: ThemeAffinity): HTMLElement {
  const id = `r-theme-${t.theme.id}`;
  const coincided = t.rows.filter((r) => r.points > 0);
  const rest = t.rows.filter((r) => r.points === 0).map((r) => r.party.name);
  return h('section', { class: 'result-block', 'aria-labelledby': id },
    h('h2', { id }, `${t.theme.title}: con quién coincidiste`),
    h('p', { class: 'grey' }, `${plural(t.questions, 'pregunta', 'preguntas')}.${t.none ? ` En ${t.none} no te convenció ninguna.` : ''}`),
    coincided.length ? rankingList(coincided, false) : h('p', {}, 'No coincidiste con ningún partido en esta temática.'),
    coincided.length && rest.length ? h('p', { class: 'grey' }, `Sin coincidencias: ${joinList(rest)}.`) : null,
  );
}

function rankingList(rows: AffinityRow[], ranked: boolean): HTMLElement {
  return h('ol', { class: 'ranking', role: 'list' },
    ...rows.map((f) =>
      h('li', { class: 'ranking-row' },
        h('p', {},
          ranked ? h('span', { class: 'rank' }, `${f.rank}. `) : null,
          h('strong', {}, f.party.name),
          ` · ${f.percent} %`,
          ranked && f.tie ? h('span', { class: 'tie-label' }, 'empate') : null),
        h('div', { class: 'bar', 'aria-hidden': 'true' }, h('span', { style: `width: ${f.percent}%` })),
      )));
}

export interface DataActions {
  changeGuess(enabled: boolean): void;
  clearAll(): void;
}

/** "Tus datos": what is stored (only on this phone), the bet switch and "Borrar todo". */
export function dataView(game: Game, options: { chosenProvince: boolean; guessEnabled: boolean; storage: boolean; largeText?: boolean }, actions: DataActions): HTMLElement {
  const answered = Object.keys(game.state.questionChoices ?? {}).length;
  const revealed = game.themes().filter((t) => game.theme(t.id).revealed).length;
  const toggle = h('input', { type: 'checkbox', id: 'guess-pref', class: 'toggle' }) as HTMLInputElement;
  toggle.checked = !options.guessEnabled;
  toggle.addEventListener('change', () => actions.changeGuess(!toggle.checked));
  return h('section', { class: 'data' },
    h('h1', { tabindex: '-1' }, 'Tus datos'),
    h('p', {}, options.storage
      ? 'Lo que hay guardado (solo en este móvil):'
      : 'En este modo no podemos guardar nada: tu progreso se perderá al cerrar.'),
    h('ul', {},
      h('li', {}, `Provincia: ${options.chosenProvince ? provinceName(game.province) : 'sin elegir'}`),
      h('li', {}, `Preguntas contestadas: ${answered}, con lo que elegiste en cada una`),
      h('li', {}, `Temáticas destapadas: ${revealed}`),
      h('li', {}, 'Tu barajado (la semilla que ordena las propuestas)'),
      h('li', {}, `Tamaño de letra: ${options.largeText ? 'grande' : 'normal'} (botón Aa)`),
    ),
    h('p', { class: 'grey' }, 'Nada de esto sale de tu móvil: ni tus elecciones, ni tus apuestas, ni tu resultado.'),
    h('p', { class: 'toggle-row' }, toggle, ' ', h('label', { for: 'guess-pref' }, 'No preguntarme la apuesta')),
    startOver(actions.clearAll, 'Borrar todo y empezar de cero'),
  );
}
