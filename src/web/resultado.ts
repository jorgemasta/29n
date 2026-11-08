// "Mi resultado", the returning-visit home and "Tus datos". Rendering only: the numbers come from
// the engine (Partida.resultado / novedades). Nothing here leaves the browser.
import { META_TEMAS, MAX_PRIORITARIOS, NINGUNA, type Partida, type Resultado } from '../juego';
import { nombreProvincia } from './provincia';
import { boton, h } from './dom';



const enlace = (texto: string, href: string, clase = '') => h('a', { href, class: clase }, texto);

export const unir = (l: string[]): string => (l.length <= 1 ? (l[0] ?? '') : `${l.slice(0, -1).join(', ')} y ${l.at(-1)}`);
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Five boxes: an X per done topic, a dash for "Ninguna me convence". */
export function papeleta(partida: Partida): HTMLElement {
  const marcas = partida.hechos().slice(0, META_TEMAS).map((t) => (partida.estado.elecciones[t] === NINGUNA ? '—' : '✕'));
  return h('ol', { class: 'papeleta', 'aria-hidden': 'true' },
    ...Array.from({ length: META_TEMAS }, (_, i) => h('li', { class: marcas[i] ? 'hecho' : '' }, marcas[i] ?? '')));
}

/** "Lo tienes claro." / "Con matices." / "Vas por libre." */
export function etiquetaDistintos(n: number): string {
  return n <= 1 ? 'Lo tienes claro.' : n <= 3 ? 'Con matices.' : 'Vas por libre.';
}

/** Inline confirmation for "Empezar de cero" (no browser dialog). */
export function empezarDeCero(alBorrar: () => void, texto = 'Empezar de cero'): HTMLElement {
  const caja = h('div', { class: 'empezar-de-cero' });
  const inicial = () =>
    caja.replaceChildren(boton(texto, 'enlace', () => {
      caja.replaceChildren(
        h('p', { role: 'alert' }, 'Se borrarán tus elecciones de este móvil. ¿Seguro?'),
        h('div', { class: 'fila-botones' },
          boton('Borrar', 'secundario peligro', alBorrar),
          boton('Cancelar', 'secundario', inicial)),
      );
      caja.querySelector<HTMLElement>('button')?.focus();
    }));
  inicial();
  return caja;
}

export interface AccionesResultado {
  marcarPrioritario(temaId: string, marcado: boolean): void;
  siguienteTema(): void;
}

export function vistaResultado(partida: Partida, acciones: AccionesResultado, aviso: string | null = null): HTMLElement {
  const r = partida.resultado();
  const titulo = h('h1', { tabindex: '-1' }, 'Mi resultado');
  if (!r.disponible) {
    return h('section', { class: 'resultado' },
      titulo,
      h('p', {}, `Haz ${META_TEMAS} temas para ver con quién coincides. Llevas ${r.temas}.`),
      papeleta(partida),
      h('div', { class: 'acciones' }, boton('Seguir con los temas', 'principal', acciones.siguienteTema)),
    );
  }
  if (r.todoNinguna) {
    return h('section', { class: 'resultado' },
      titulo,
      h('p', { class: 'grande' }, 'No te ha convencido ninguna propuesta todavía. Eso también es una respuesta.'),
      h('div', { class: 'acciones' }, boton('Seguir con más temas', 'principal', acciones.siguienteTema)),
      aCompartir(),
    );
  }
  return h('section', { class: 'resultado' },
    titulo,
    bloqueNumero(r),
    r.apuestas.total >= 3 ? bloqueApuestas(r) : null,
    bloqueRanking(partida, r, acciones, aviso),
  );
}

function bloqueNumero(r: Resultado): HTMLElement {
  return h('section', { class: 'bloque-resultado', 'aria-labelledby': 'r-numero' },
    h('h2', { id: 'r-numero' }, `En ${r.temas} temas has elegido a `, h('strong', {}, plural(r.partidosDistintos, 'partido', 'partidos distintos')), '.'),
    h('p', { class: 'grande' }, etiquetaDistintos(r.partidosDistintos)),
    h('a', { href: '#r-ranking', class: 'siguiente-bloque' }, 'Siguiente ↓'),
  );
}

function bloqueApuestas(r: Resultado): HTMLElement {
  const { total, falladas, sorpresas } = r.apuestas;
  return h('section', { class: 'bloque-resultado', 'aria-labelledby': 'r-apuestas' },
    h('h2', { id: 'r-apuestas' }, 'En ', h('strong', {}, `${falladas} de ${total}`), ' temas, tu elegida no era de quien pensabas.'),
    ...sorpresas.map((s) => h('p', {}, `Elegiste propuestas de ${s.partido.nombre} en ${unir(s.temas.map((t) => t.titulo))}.`)),
    h('a', { href: '#r-ranking', class: 'siguiente-bloque' }, 'Siguiente ↓'),
  );
}

function bloqueRanking(partida: Partida, r: Resultado, acciones: AccionesResultado, aviso: string | null): HTMLElement {
  const filas = r.ranking.map((f) =>
    h('li', { class: 'fila-ranking' },
      h('p', {},
        h('span', { class: 'puesto' }, `${f.puesto}.`), ' ',
        h('strong', {}, f.partido.nombre),
        ` · ${f.porcentaje} % · ${f.temas} de ${r.temas} temas`,
        f.empate ? h('span', { class: 'etiqueta-empate' }, 'empate') : null),
      h('div', { class: 'barra', 'aria-hidden': 'true' }, h('span', { style: `width: ${f.porcentaje}%` })),
    ));
  const prioritarios = partida.prioritarios();
  const chips = partida.hechos().map((id) => {
    const tema = partida.temas().find((t) => t.id === id)!;
    const marcado = prioritarios.includes(id);
    return boton(tema.titulo, 'chip', () => acciones.marcarPrioritario(id, !marcado), { 'aria-pressed': String(marcado), 'data-tema': id });
  });
  return h('section', { class: 'bloque-resultado', id: 'r-ranking', 'aria-labelledby': 'r-ranking-t', tabindex: '-1' },
    h('h2', { id: 'r-ranking-t' }, 'Con quién has coincidido, tema a tema.'),
    h('ol', { class: 'ranking', role: 'list' }, ...filas),
    h('p', { class: 'gris' }, `Con ${r.temas} temas es una foto parcial.`),
    r.ninguna ? h('p', { class: 'gris' }, `En ${plural(r.ninguna, 'tema', 'temas')} no te convenció ninguna.`) : null,
    ...r.pendientes.map((p) => h('p', { class: 'fila-gris' }, `⏳ Falta ${p.nombre}: aún no ha publicado su programa. Tu resultado puede cambiar.`)),
    r.temasConNovedades
      ? h('p', { class: 'fila-gris' }, `${plural(r.temasConNovedades, 'tema tiene propuestas', 'temas tienen propuestas')} que aún no has visto. `, enlace('Ver temas', '#temas'))
      : null,
    r.sinProvincia ? h('p', { class: 'fila-gris' }, 'Solo partidos nacionales. ', enlace('Elige provincia', '#provincia'), ' para incluir los de tu zona.') : null,
    h('p', { class: 'gris' }, 'Cada elección suma 1 punto (2 en tus temas importantes). «Ninguna» no suma. Nada más.'),
    h('section', { class: 'prioridades', 'aria-labelledby': 'r-prioridades' },
      h('h3', { id: 'r-prioridades' }, `¿Algún tema te importa más? Marca hasta ${MAX_PRIORITARIOS} y contarán doble.`),
      h('div', { class: 'chips' }, ...chips),
      h('p', { class: 'gris', role: 'status' }, aviso ?? ''),
    ),
    h('p', { class: 'nota' }, 'Esto no es una recomendación de voto. Es un resumen de lo que elegiste.'),
    h('div', { class: 'acciones' },
      aCompartir(),
      boton('Seguir con más temas', 'secundario', acciones.siguienteTema),
      enlace('Ver tema a tema', '#temas', 'secundario boton-enlace'),
    ),
  );
}

/** Opens screen 11 (#compartir): the card is made there, on the phone. */
function aCompartir(): HTMLElement {
  return enlace('Compartir', '#compartir', 'principal boton-enlace');
}

export interface AccionesVuelta {
  seguir(): void;
  verNovedades(): void;
  mantenerElecciones(): void;
  borrarTodo(): void;
}

/** Returning visit: progress, news ("[Partido] ha publicado su programa") and where to go next. */
export function vistaVuelta(partida: Partida, nuevosPartidos: { nombre: string }[], acciones: AccionesVuelta): HTMLElement {
  const n = partida.hechos().length;
  const temasNuevos = partida.novedades().temas;
  const siguiente = partida.siguiente();
  const hayNovedades = nuevosPartidos.length > 0 || temasNuevos.length > 0;
  const nombres = nuevosPartidos.map((p) => p.nombre);
  return h('section', { class: 'vuelta' },
    h('h1', { tabindex: '-1' }, n < META_TEMAS ? `Hola de nuevo. Llevas ${n} de ${META_TEMAS} temas.` : `Hola de nuevo. Llevas ${n} temas.`),
    papeleta(partida),
    hayNovedades
      ? h('div', { class: 'novedades', role: 'status' },
          nombres.length ? h('p', {}, `${unir(nombres)} ${nombres.length === 1 ? 'ha publicado su programa' : 'han publicado su programa'}.`) : null,
          temasNuevos.length ? h('p', {}, `Hay ${plural(temasNuevos.length, 'tema', 'temas')} con una propuesta nueva.`) : null,
        )
      : null,
    h('div', { class: 'acciones' },
      temasNuevos.length
        ? boton('Ver las propuestas nuevas', 'principal', acciones.verNovedades)
        : siguiente
          ? boton(`Seguir: ${siguiente.titulo}`, 'principal', acciones.seguir)
          : enlace('Ver los temas', '#temas', 'principal boton-enlace'),
      temasNuevos.length ? boton('Mantener mis elecciones', 'secundario', acciones.mantenerElecciones) : null,
      n >= META_TEMAS ? enlace('Ver mi resultado', '#resultado', 'secundario boton-enlace') : h('span', { class: 'secundario desactivado', 'aria-disabled': 'true' }, `Ver mi resultado (desde ${META_TEMAS} temas)`),
    ),
    empezarDeCero(acciones.borrarTodo),
  );
}

export interface AccionesDatos {
  cambiarApuesta(activa: boolean): void;
  borrarTodo(): void;
}

/** "Tus datos": what is stored (only on this phone), the bet switch and "Borrar todo". */
export function vistaDatos(partida: Partida, opciones: { provinciaElegida: boolean; apuestaActiva: boolean; almacenamiento: boolean; letraGrande?: boolean }, acciones: AccionesDatos): HTMLElement {
  const prioritarios = partida.prioritarios().map((id) => partida.temas().find((t) => t.id === id)!.titulo);
  const interruptor = h('input', { type: 'checkbox', id: 'pref-apuesta', class: 'interruptor' }) as HTMLInputElement;
  interruptor.checked = !opciones.apuestaActiva;
  interruptor.addEventListener('change', () => acciones.cambiarApuesta(!interruptor.checked));
  return h('section', { class: 'datos' },
    h('h1', { tabindex: '-1' }, 'Tus datos'),
    h('p', {}, opciones.almacenamiento
      ? 'Lo que hay guardado (solo en este móvil):'
      : 'En este modo no podemos guardar nada: tu progreso se perderá al cerrar.'),
    h('ul', {},
      h('li', {}, `Provincia: ${opciones.provinciaElegida ? nombreProvincia(partida.provincia) : 'sin elegir'}`),
      h('li', {}, `Temas hechos: ${partida.hechos().length}, con tus elecciones y apuestas`),
      h('li', {}, `Tus temas importantes: ${prioritarios.length ? unir(prioritarios) : 'ninguno'}`),
      h('li', {}, 'Tu barajado (la semilla que ordena las tarjetas)'),
      h('li', {}, `Tamaño de letra: ${opciones.letraGrande ? 'grande' : 'normal'} (botón Aa)`),
    ),
    h('p', { class: 'gris' }, 'Nada de esto sale de tu móvil: ni tus elecciones, ni tus apuestas, ni tu resultado.'),
    h('p', { class: 'fila-interruptor' }, interruptor, ' ', h('label', { for: 'pref-apuesta' }, 'No preguntarme la apuesta')),
    empezarDeCero(acciones.borrarTodo, 'Borrar todo y empezar de cero'),
  );
}
