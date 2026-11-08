// Province screen ("¿Dónde votas?") and the summary shown after choosing. The search runs over a
// static JSON (INE municipalities), loaded lazily: provinces and islands work before it arrives.
import type { Partida } from '../juego';
import { crearBuscador, PROVINCIAS, provinciaPorCodigo, type Buscador, type Lugar, type Municipios } from '../registro/territorio';
import { h } from './dom';


let buscador: Buscador = crearBuscador({ municipios: {} });
let cargando: Promise<void> | null = null;
function cargarMunicipios(): Promise<void> {
  cargando ??= import('../../data/municipios.json')
    .then((m) => {
      buscador = crearBuscador((m.default ?? m) as Municipios);
    })
    .catch(() => {
      cargando = null; // offline: provinces and islands still work; retry next time
    });
  return cargando;
}

export const nombreProvincia = (codigo: string | null): string =>
  codigo === null ? 'Toda España' : (provinciaPorCodigo(codigo)?.nombre ?? codigo);

/** Header chip: "📍 Las Palmas", a link to change it. */
export function chipProvincia(codigo: string | null): HTMLElement {
  return h('a', { href: '#provincia', class: 'chip-provincia', 'aria-label': `Dónde votas: ${nombreProvincia(codigo)}. Cambiar` }, `📍 ${nombreProvincia(codigo)}`);
}

/** `alElegir(null)` = "Prefiero no decirlo". */
export function vistaProvincia(actual: string | null | undefined, alElegir: (codigo: string | null) => void): HTMLElement {
  const fila = (texto: string, codigo: string | null, secundario?: string) => {
    const b = h('button', { type: 'button', class: `fila-tema fila-provincia${codigo === actual ? ' hecho' : ''}` },
      h('span', { class: 'nombre' }, texto),
      secundario ? h('span', { class: 'estado' }, secundario) : codigo === actual && actual !== undefined ? h('span', { class: 'estado' }, '✓ Ahora') : null);
    b.addEventListener('click', () => alElegir(codigo));
    return h('li', {}, b);
  };

  const entrada = h('input', {
    id: 'buscar-lugar',
    type: 'search',
    class: 'buscador',
    autocomplete: 'off',
    autocapitalize: 'none',
    spellcheck: 'false',
    placeholder: 'Por ejemplo: Telde',
    'aria-describedby': 'buscar-ayuda',
    'aria-controls': 'resultados-lugar',
  }) as HTMLInputElement;
  const resultados = h('ul', { id: 'resultados-lugar', class: 'filas resultados', role: 'list', 'aria-live': 'polite' });
  const pintarResultados = () => {
    const q = entrada.value;
    if (!q.trim()) return resultados.replaceChildren();
    const lugares: Lugar[] = buscador.buscar(q);
    if (!lugares.length)
      return resultados.replaceChildren(h('li', { class: 'gris' }, 'No lo encontramos. Prueba con el nombre de tu provincia.'));
    resultados.replaceChildren(...lugares.map((l) => fila(l.resolucion, l.provincia, l.tipo === 'isla' ? 'Isla' : l.tipo === 'municipio' ? undefined : 'Provincia')));
  };
  entrada.addEventListener('input', pintarResultados);
  entrada.addEventListener('focus', () => void cargarMunicipios().then(pintarResultados), { once: true });
  void cargarMunicipios().then(pintarResultados);

  const lista = [...PROVINCIAS].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return h('section', { class: 'provincia' },
    h('h1', { tabindex: '-1' }, '¿Dónde votas?'),
    h('p', {}, 'Así añadimos los partidos que se presentan en tu provincia.'),
    h('label', { for: 'buscar-lugar', class: 'etiqueta-buscador' }, 'Escribe tu provincia, tu pueblo o tu isla'),
    entrada,
    h('p', { id: 'buscar-ayuda', class: 'gris' }, 'No hace falta poner tildes.'),
    resultados,
    h('h2', {}, 'O elige tu provincia'),
    h('ul', { class: 'filas', role: 'list' }, ...lista.map((p) => fila(p.nombre, p.codigo)), fila('Prefiero no decirlo (solo partidos de toda España)', null)),
    h('p', { class: 'nota' }, 'Se guarda solo en este móvil. Puedes cambiarla cuando quieras. No te pedimos tu ubicación.'),
  );
}

/** "Las Palmas: 9 partidos, incluidos X e Y. 1 con programa pendiente · Cambiar". */
export function avisoZona(partida: Partida): HTMLElement {
  const { conPrograma, pendientes } = partida.partidos();
  const total = conPrograma.length + pendientes.length;
  const regionales = [...conPrograma, ...pendientes].filter((p) => p.regional).map((p) => p.nombre);
  const canarios = partida.temas().filter((t) => t.ambito === 'canarias').length;
  const frase =
    partida.provincia === null
      ? `Solo partidos de toda España: ${total}.`
      : `${nombreProvincia(partida.provincia)}: ${total} ${total === 1 ? 'partido' : 'partidos'}${regionales.length ? `, incluidos ${unir(regionales)}` : ''}.`;
  return h('div', { class: 'aviso-zona', role: 'status' },
    h('p', {}, frase, pendientes.length ? ` ${pendientes.length} con programa pendiente.` : '', ' ', h('a', { href: '#provincia' }, 'Cambiar')),
    canarios ? h('p', {}, `Además, ${canarios} temas solo de Canarias.`) : null,
  );
}

/** "Partidos" block for the topic list: who is in play here and who is still pending. */
export function bloquePartidos(partida: Partida): HTMLElement {
  const { conPrograma, pendientes } = partida.partidos();
  return h('section', { class: 'bloque-partidos', 'aria-labelledby': 'titulo-partidos' },
    h('h2', { id: 'titulo-partidos' }, `Partidos en ${nombreProvincia(partida.provincia)}`),
    h('p', { class: 'gris' }, `Con programa (${conPrograma.length}): ${conPrograma.map((p) => p.nombre).join(', ') || 'ninguno todavía'}.`),
    pendientes.length
      ? h('ul', { class: 'pendientes', role: 'list' },
          ...pendientes.map((p) => h('li', {}, h('strong', {}, p.nombre), ' · ⏳ programa pendiente')))
      : null,
    pendientes.length ? h('p', { class: 'gris' }, 'Aún no han publicado su programa. Mientras falte, no aparecen en los temas.') : null,
    partida.provincia === null ? h('p', { class: 'gris' }, 'Solo partidos de toda España. Elige provincia para incluir los de tu zona.') : null,
    h('a', { href: '#provincia' }, 'Cambiar provincia'),
  );
}

function unir(l: string[]): string {
  return l.length <= 1 ? (l[0] ?? '') : `${l.slice(0, -1).join(', ')} y ${l.at(-1)}`;
}
