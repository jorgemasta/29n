// "Mi resultado", the returning-visit home and "Tus datos". Rendering only: the numbers come from
// the engine (Game.result / news). Nothing here leaves the browser.
import { GOAL_TOPICS, MAX_PRIORITIES, NONE, type Game, type Result } from '../game';
import { provinceName } from './province';
import { button, h } from './dom';



const link = (text: string, href: string, cls = '') => h('a', { href, class: cls }, text);

export const joinList = (l: string[]): string => (l.length <= 1 ? (l[0] ?? '') : `${l.slice(0, -1).join(', ')} y ${l.at(-1)}`);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Five boxes: an X per done topic, a dash for "Ninguna me convence". */
export function ballot(game: Game): HTMLElement {
  const marks = game.done().slice(0, GOAL_TOPICS).map((t) => (game.state.choices[t] === NONE ? '—' : '✕'));
  return h('ol', { class: 'ballot', 'aria-hidden': 'true' },
    ...Array.from({ length: GOAL_TOPICS }, (_, i) => h('li', { class: marks[i] ? 'done' : '' }, marks[i] ?? '')));
}

/** "Lo tienes claro." / "Con matices." / "Vas por libre." */
export function differentLabel(n: number): string {
  return n <= 1 ? 'Lo tienes claro.' : n <= 3 ? 'Con matices.' : 'Vas por libre.';
}

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
  markPriority(topicId: string, marked: boolean): void;
  nextTopic(): void;
}

export function resultView(game: Game, actions: ResultActions, warning: string | null = null): HTMLElement {
  const r = game.result();
  const title = h('h1', { tabindex: '-1' }, 'Mi resultado');
  if (!r.available) {
    return h('section', { class: 'result' },
      title,
      h('p', {}, `Haz ${GOAL_TOPICS} temas para ver con quién coincides. Llevas ${r.topics}.`),
      ballot(game),
      h('div', { class: 'actions' }, button('Seguir con los temas', 'primary', actions.nextTopic)),
    );
  }
  if (r.allNone) {
    return h('section', { class: 'result' },
      title,
      h('p', { class: 'large' }, 'No te ha convencido ninguna propuesta todavía. Eso también es una respuesta.'),
      h('div', { class: 'actions' }, button('Seguir con más temas', 'primary', actions.nextTopic)),
      shareBlock(),
    );
  }
  return h('section', { class: 'result' },
    title,
    numberBlock(r),
    r.guesses.total >= 3 ? guessesBlock(r) : null,
    rankingBlock(game, r, actions, warning),
  );
}

function numberBlock(r: Result): HTMLElement {
  return h('section', { class: 'result-block', 'aria-labelledby': 'r-number' },
    h('h2', { id: 'r-number' }, `En ${r.topics} temas has elegido a `, h('strong', {}, plural(r.distinctParties, 'partido', 'partidos distintos')), '.'),
    h('p', { class: 'large' }, differentLabel(r.distinctParties)),
    h('a', { href: '#r-ranking', class: 'next-block' }, 'Siguiente ↓'),
  );
}

function guessesBlock(r: Result): HTMLElement {
  const { total, wrong, surprises } = r.guesses;
  return h('section', { class: 'result-block', 'aria-labelledby': 'r-guesses' },
    h('h2', { id: 'r-guesses' }, 'En ', h('strong', {}, `${wrong} de ${total}`), ' temas, tu elegida no era de quien pensabas.'),
    ...surprises.map((s) => h('p', {}, `Elegiste propuestas de ${s.party.name} en ${joinList(s.topics.map((t) => t.title))}.`)),
    h('a', { href: '#r-ranking', class: 'next-block' }, 'Siguiente ↓'),
  );
}

function rankingBlock(game: Game, r: Result, actions: ResultActions, warning: string | null): HTMLElement {
  const rows = r.ranking.map((f) =>
    h('li', { class: 'ranking-row' },
      h('p', {},
        h('span', { class: 'rank' }, `${f.rank}.`), ' ',
        h('strong', {}, f.party.name),
        ` · ${f.percent} % · ${f.topics} de ${r.topics} temas`,
        f.tie ? h('span', { class: 'tie-label' }, 'empate') : null),
      h('div', { class: 'bar', 'aria-hidden': 'true' }, h('span', { style: `width: ${f.percent}%` })),
    ));
  const priorities = game.priorities();
  const chips = game.done().map((id) => {
    const topic = game.topics().find((t) => t.id === id)!;
    const marked = priorities.includes(id);
    return button(topic.title, 'chip', () => actions.markPriority(id, !marked), { 'aria-pressed': String(marked), 'data-topic': id });
  });
  return h('section', { class: 'result-block', id: 'r-ranking', 'aria-labelledby': 'r-ranking-t', tabindex: '-1' },
    h('h2', { id: 'r-ranking-t' }, 'Con quién has coincidido, tema a tema.'),
    h('ol', { class: 'ranking', role: 'list' }, ...rows),
    h('p', { class: 'grey' }, `Con ${r.topics} temas es una foto parcial.`),
    r.none ? h('p', { class: 'grey' }, `En ${plural(r.none, 'tema', 'temas')} no te convenció ninguna.`) : null,
    ...r.pending.map((p) => h('p', { class: 'grey-row' }, `⏳ Falta ${p.name}: aún no ha publicado su programa. Tu resultado puede cambiar.`)),
    r.topicsWithNews
      ? h('p', { class: 'grey-row' }, `${plural(r.topicsWithNews, 'tema tiene propuestas', 'temas tienen propuestas')} que aún no has visto. `, link('Ver temas', '#temas'))
      : null,
    r.noProvince ? h('p', { class: 'grey-row' }, 'Solo partidos nacionales. ', link('Elige provincia', '#provincia'), ' para incluir los de tu zona.') : null,
    h('p', { class: 'grey' }, 'Cada elección suma 1 punto (2 en tus temas importantes). «Ninguna» no suma. Nada más.'),
    h('section', { class: 'priorities', 'aria-labelledby': 'r-priorities' },
      h('h3', { id: 'r-priorities' }, `¿Algún tema te importa más? Marca hasta ${MAX_PRIORITIES} y contarán doble.`),
      h('div', { class: 'chips' }, ...chips),
      h('p', { class: 'grey', role: 'status' }, warning ?? ''),
    ),
    h('p', { class: 'note' }, 'Esto no es una recomendación de voto. Es un resumen de lo que elegiste.'),
    h('div', { class: 'actions' },
      shareBlock(),
      button('Seguir con más temas', 'secondary', actions.nextTopic),
      link('Ver tema a tema', '#temas', 'secondary link-button'),
    ),
  );
}

/** Opens screen 11 (#compartir): the card is made there, on the phone. */
function shareBlock(): HTMLElement {
  return link('Compartir', '#compartir', 'primary link-button');
}

export interface ReturnActions {
  proceed(): void;
  seeNews(): void;
  keepChoices(): void;
  clearAll(): void;
}

/** Returning visit: progress, news ("[Partido] ha publicado su programa") and where to go next. */
export function returnView(game: Game, newParties: { name: string }[], actions: ReturnActions): HTMLElement {
  const n = game.done().length;
  const newTopics = game.news().topics;
  const next = game.next();
  const hasNews = newParties.length > 0 || newTopics.length > 0;
  const names = newParties.map((p) => p.name);
  return h('section', { class: 'return-visit' },
    h('h1', { tabindex: '-1' }, n < GOAL_TOPICS ? `Hola de nuevo. Llevas ${n} de ${GOAL_TOPICS} temas.` : `Hola de nuevo. Llevas ${n} temas.`),
    ballot(game),
    hasNews
      ? h('div', { class: 'news', role: 'status' },
          names.length ? h('p', {}, `${joinList(names)} ${names.length === 1 ? 'ha publicado su programa' : 'han publicado su programa'}.`) : null,
          newTopics.length ? h('p', {}, `Hay ${plural(newTopics.length, 'tema', 'temas')} con una propuesta nueva.`) : null,
        )
      : null,
    h('div', { class: 'actions' },
      newTopics.length
        ? button('Ver las propuestas nuevas', 'primary', actions.seeNews)
        : next
          ? button(`Seguir: ${next.title}`, 'primary', actions.proceed)
          : link('Ver los temas', '#temas', 'primary link-button'),
      newTopics.length ? button('Mantener mis elecciones', 'secondary', actions.keepChoices) : null,
      n >= GOAL_TOPICS ? link('Ver mi resultado', '#resultado', 'secondary link-button') : h('span', { class: 'secondary disabled', 'aria-disabled': 'true' }, `Ver mi resultado (desde ${GOAL_TOPICS} temas)`),
    ),
    startOver(actions.clearAll),
  );
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
