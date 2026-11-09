// Province screen ("¿Dónde votas?") and the summary shown after choosing. The search runs over a
// static JSON (INE municipalities), loaded lazily: provinces and islands work before it arrives.
import type { Game } from '../game';
import { createFinder, PROVINCES, provinceByCode, type Finder, type Place, type Municipalities } from '../registry/territory';
import { h } from './dom';
import { icon } from './icons';


let finder: Finder = createFinder({ municipalities: {} });
let loading: Promise<void> | null = null;
function loadMunicipalities(): Promise<void> {
  loading ??= import('../../data/municipalities.json')
    .then((m) => {
      finder = createFinder((m.default ?? m) as Municipalities);
    })
    .catch(() => {
      loading = null; // offline: provinces and islands still work; retry next time
    });
  return loading;
}

export const provinceName = (code: string | null): string =>
  code === null ? 'Toda España' : (provinceByCode(code)?.name ?? code);

/** Chip "Votas en Las Palmas", a link to change it. */
export function provinceChip(code: string | null): HTMLElement {
  return h('a', { href: '#provincia', class: 'province-chip', 'aria-label': `Dónde votas: ${provinceName(code)}. Cambiar` }, `Votas en ${provinceName(code)}`);
}

/** "Telde → Las Palmas" with an SVG arrow (read as "Telde, Las Palmas"); a province is just its name. */
function placeName(p: Place): Node | string {
  if (p.type === 'province') return p.name;
  const f = document.createDocumentFragment();
  f.append(p.name, icon('arrowRight'), h('span', { class: 'visually-hidden' }, ', '), provinceByCode(p.province)?.name ?? '');
  return f;
}

/** `onChoose(null)` = "Prefiero no decirlo". */
export function provinceView(current: string | null | undefined, onChoose: (code: string | null) => void): HTMLElement {
  const row = (text: string | Node, code: string | null, secondary?: string) => {
    const b = h('button', { type: 'button', class: `topic-row province-row${code === current ? ' done' : ''}` },
      h('span', { class: 'name' }, text),
      secondary ? h('span', { class: 'state' }, secondary) : code === current && current !== undefined ? h('span', { class: 'state' }, icon('check'), 'Ahora') : null);
    b.addEventListener('click', () => onChoose(code));
    return h('li', {}, b);
  };

  const input = h('input', {
    id: 'place-search',
    type: 'search',
    class: 'finder',
    autocomplete: 'off',
    autocapitalize: 'none',
    spellcheck: 'false',
    placeholder: 'Por ejemplo: Telde',
    'aria-describedby': 'search-help',
    'aria-controls': 'place-results',
  }) as HTMLInputElement;
  const results = h('ul', { id: 'place-results', class: 'rows results', role: 'list', 'aria-live': 'polite' });
  const renderResults = () => {
    const q = input.value;
    if (!q.trim()) return results.replaceChildren();
    const places: Place[] = finder.search(q);
    if (!places.length)
      return results.replaceChildren(h('li', { class: 'grey' }, 'No lo encontramos. Prueba con el nombre de tu provincia.'));
    results.replaceChildren(...places.map((l) => row(placeName(l), l.province, l.type === 'island' ? 'Isla' : l.type === 'municipality' ? undefined : 'Provincia')));
  };
  input.addEventListener('input', renderResults);
  input.addEventListener('focus', () => void loadMunicipalities().then(renderResults), { once: true });
  void loadMunicipalities().then(renderResults);

  const list = [...PROVINCES].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return h('section', { class: 'province' },
    h('h1', { tabindex: '-1' }, '¿Dónde votas?'),
    h('p', {}, 'Así añadimos los partidos que se presentan en tu provincia.'),
    h('label', { for: 'place-search', class: 'finder-label' }, 'Escribe tu provincia, tu pueblo o tu isla'),
    input,
    h('p', { id: 'search-help', class: 'grey' }, 'No hace falta poner tildes.'),
    results,
    h('h2', {}, 'O elige tu provincia'),
    h('ul', { class: 'rows', role: 'list' }, ...list.map((p) => row(p.name, p.code)), row('Prefiero no decirlo (solo partidos de toda España)', null)),
    h('p', { class: 'note' }, 'Se guarda solo en este móvil. Puedes cambiarla cuando quieras. No te pedimos tu ubicación.'),
  );
}

/** "Las Palmas: 9 partidos, incluidos X e Y. 1 con programa pendiente · Cambiar". */
export function zoneNotice(game: Game): HTMLElement {
  const { withManifesto, pending } = game.parties();
  const total = withManifesto.length + pending.length;
  const regionals = [...withManifesto, ...pending].filter((p) => p.regional).map((p) => p.name);
  const regionalTheme = game.themes().find((t) => t.region !== undefined);
  const sentence =
    game.province === null
      ? `Solo partidos de toda España: ${total}.`
      : `${provinceName(game.province)}: ${total} ${total === 1 ? 'partido' : 'partidos'}${regionals.length ? `, incluidos ${joinList(regionals)}` : ''}.`;
  return h('div', { class: 'zone-notice', role: 'status' },
    h('p', {}, sentence, pending.length ? ` ${pending.length} con programa pendiente.` : '', ' ', h('a', { href: '#provincia' }, 'Cambiar')),
    regionalTheme ? h('p', {}, `Además, una temática solo de tu comunidad: ${regionalTheme.title}.`) : null,
  );
}

/** "Partidos" block for the theme list: who is in play here and who is still pending. */
export function partiesBlock(game: Game): HTMLElement {
  const { withManifesto, pending } = game.parties();
  return h('section', { class: 'parties-block', 'aria-labelledby': 'parties-title' },
    h('h2', { id: 'parties-title' }, `Partidos en ${provinceName(game.province)}`),
    h('p', { class: 'grey' }, `Con programa (${withManifesto.length}): ${withManifesto.map((p) => p.name).join(', ') || 'ninguno todavía'}.`),
    pending.length
      ? h('ul', { class: 'pending', role: 'list' },
          ...pending.map((p) => h('li', {}, h('strong', {}, p.name), ' · programa pendiente')))
      : null,
    pending.length ? h('p', { class: 'grey' }, 'Aún no han publicado su programa. Mientras falte, no aparecen en las temáticas.') : null,
    game.province === null ? h('p', { class: 'grey' }, 'Solo partidos de toda España. Elige provincia para incluir los de tu zona.') : null,
    h('a', { href: '#provincia' }, 'Cambiar provincia'),
  );
}

function joinList(l: string[]): string {
  return l.length <= 1 ? (l[0] ?? '') : `${l.slice(0, -1).join(', ')} y ${l.at(-1)}`;
}
