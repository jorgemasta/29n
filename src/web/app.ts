// Client app: topic list ↔ topic (blind choice → confirm/bet → reveal) → result. All logic lives in the
// game engine; this file only renders and routes (#provincia, #inicio, #temas, #tema/<id>, #resultado,
// #datos). Choices, bets and the result never leave the browser.
import type { Dataset, Modo, TipoFuente } from '../dataset/esquema';
import {
  crearPartida,
  META_TEMAS,
  MAX_PRIORITARIOS,
  NINGUNA,
  type EstadoPartida,
  type ItemTema,
  type Partida,
  type PartidoRevelado,
  type Recorrido,
  type Revelacion,
  type TarjetaRevelada,
} from '../juego';
import { nuevaSemilla } from '../juego/azar';
import { almacenamientoDisponible, borrar, guardar, leer } from './almacen';
import { avisoZona, bloquePartidos, chipProvincia, vistaProvincia } from './provincia';
import { boton, empezarDeCero, papeleta, unir, vistaDatos, vistaResultado, vistaVuelta } from './resultado';
import { chipViabilidad, notaViabilidad } from './viabilidad';
import { botonReportar } from './reportar';

const CLAVE_SEMILLA = '29n:semilla';
const CLAVE_ESTADO = '29n:estado';
/** { codigo: "35" } or { codigo: null } ("Prefiero no decirlo"); absent = not asked yet. */
const CLAVE_PROVINCIA = '29n:provincia';
/** { sinApuesta: true } after "No preguntarme más"; reactivated in Tus datos. */
const CLAVE_PREFERENCIAS = '29n:preferencias';
const CLAVES = [CLAVE_SEMILLA, CLAVE_ESTADO, CLAVE_PROVINCIA, CLAVE_PREFERENCIAS];

export const ETIQUETA_FUENTE: Record<TipoFuente, string> = {
  'programa-29n': 'Programa 29N',
  'programa-2023': 'Programa de 2023',
  'documento-partido': 'Documento del partido',
  declaraciones: 'Declaraciones públicas',
};

type Hijo = Node | string | null | undefined | false;
function h(tag: string, attrs: Record<string, string> = {}, ...hijos: Hijo[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of hijos) if (c) el.append(c);
  return el;
}

const irA = (ruta: string) => {
  location.hash = ruta;
};

export function montarApp(raiz: HTMLElement, dataset: Dataset, modo: Modo): void {
  // ?provincia=08 overrides the saved one (handy for testing and shared links).
  const forzada = new URLSearchParams(location.search).get('provincia');
  const guardada = leer<{ codigo: string | null }>(CLAVE_PROVINCIA);
  let provincia: string | null | undefined = forzada ?? (guardada ? guardada.codigo : undefined);
  let mostrarAviso = false;
  // Without storage (private mode…) everything works in memory; we say so once.
  const hayAlmacen = almacenamientoDisponible();
  let avisoAlmacen = !hayAlmacen;
  let semilla = leer<string>(CLAVE_SEMILLA);
  if (!semilla) {
    semilla = nuevaSemilla();
    guardar(CLAVE_SEMILLA, semilla);
  }
  let preferencias = leer<{ sinApuesta?: boolean }>(CLAVE_PREFERENCIAS) ?? {};
  const nueva = (estado?: EstadoPartida) => crearPartida(dataset, provincia ?? null, semilla!, estado, { modo });
  let partida: Partida = nueva(leer<EstadoPartida>(CLAVE_ESTADO) ?? undefined);
  /** Saved on every confirmed action; an unconfirmed round is never saved. */
  const actualizar = (p: Partida) => {
    partida = p;
    guardar(CLAVE_ESTADO, partida.estado);
  };
  // Returning visit: parties published since the last one are announced once, then marked as known.
  const nuevosPartidos = partida.estado.conocidos ? partida.novedades().partidos : [];
  actualizar(partida.marcarConocidos());
  let inicioMostrado = false;
  let seleccion: string | null = null;
  let avisoPrioridad: string | null = null;

  const pintar = (enfocar: string | null = 'h1') => {
    const ruta = location.hash.slice(1);
    const temaId = ruta.startsWith('tema/') ? decodeURIComponent(ruta.slice(5)) : null;
    const existe = temaId !== null && partida.temas().some((t) => t.id === temaId);
    if (ruta === 'provincia') raiz.replaceChildren(vistaProvincia(provincia, elegirProvincia));
    else if (ruta === 'datos') raiz.replaceChildren(vistaDatosApp());
    else if (provincia === undefined) return irA('provincia'); // first visit: ask where they vote
    else if (ruta === 'inicio') raiz.replaceChildren(vistaVueltaApp());
    else if (ruta === 'temas') raiz.replaceChildren(vistaLista());
    else if (ruta === 'resultado') raiz.replaceChildren(vistaResultadoApp());
    else if (existe) raiz.replaceChildren(vistaTema(temaId!));
    else if (!inicioMostrado && partida.hechos().length > 0) {
      inicioMostrado = true;
      return irA('inicio');
    } else {
      // Start: straight to the next pending topic (vivienda first), or the list if all are done.
      const siguiente = partida.siguiente();
      return irA(siguiente ? `tema/${siguiente.id}` : 'temas');
    }
    if (mostrarAviso && ruta !== 'provincia') {
      // Once, on the screen after choosing: who is in play here.
      raiz.prepend(avisoZona(partida));
      mostrarAviso = false;
    }
    if (avisoAlmacen) {
      raiz.prepend(h('p', { class: 'aviso-zona', role: 'status' }, 'En este modo no podemos recordar tu progreso si cierras.'));
      avisoAlmacen = false;
    }
    if (enfocar) raiz.querySelector<HTMLElement>(enfocar)?.focus();
  };

  const elegirProvincia = (codigo: string | null) => {
    provincia = codigo;
    guardar(CLAVE_PROVINCIA, { codigo });
    // Choices are kept; topics not available in the new province simply stop counting.
    // Parties of the new zone are shown right away (avisoZona), so they are not "news" later.
    actualizar(nueva(partida.estado).marcarConocidos());
    mostrarAviso = true;
    const siguiente = partida.siguiente();
    irA(siguiente ? `tema/${siguiente.id}` : 'temas');
  };
  const irASiguiente = () => {
    const s = partida.siguiente();
    irA(s ? `tema/${s.id}` : 'temas');
  };
  const borrarTodo = () => {
    for (const c of CLAVES) borrar(c);
    location.hash = '';
    location.reload();
  };

  const vistaVueltaApp = () =>
    vistaVuelta(partida, nuevosPartidos, {
      seguir: irASiguiente,
      verNovedades: () => {
        const t = partida.novedades().temas[0];
        irA(t ? `tema/${t.tema.id}` : 'temas');
      },
      mantenerElecciones: () => {
        actualizar(partida.mantenerElecciones());
        pintar();
      },
      borrarTodo,
    });

  const vistaResultadoApp = () =>
    h('div', {},
      h('header', { class: 'cabecera' }, h('a', { href: '#temas', class: 'volver' }, '← Temas'), chipProvincia(partida.provincia)),
      vistaResultado(partida, {
        marcarPrioritario: (id, marcado) => {
          if (marcado && partida.prioritarios().length >= MAX_PRIORITARIOS) avisoPrioridad = `Ya tienes ${MAX_PRIORITARIOS}. Quita uno.`;
          else {
            avisoPrioridad = null;
            actualizar(partida.marcarPrioritario(id, marcado));
          }
          pintar(`[aria-pressed][data-tema="${id}"]`);
          avisoPrioridad = null;
        },
        siguienteTema: irASiguiente,
      }, avisoPrioridad),
    );

  const vistaDatosApp = () =>
    h('div', {},
      h('header', { class: 'cabecera' }, h('a', { href: '#temas', class: 'volver' }, '← Temas')),
      vistaDatos(partida, { provinciaElegida: provincia !== undefined, apuestaActiva: !preferencias.sinApuesta, almacenamiento: hayAlmacen }, {
        cambiarApuesta: (activa) => {
          preferencias = { ...preferencias, sinApuesta: !activa };
          guardar(CLAVE_PREFERENCIAS, preferencias);
        },
        borrarTodo,
      }),
    );

  window.addEventListener('hashchange', () => {
    seleccion = null;
    pintar();
    window.scrollTo(0, 0);
  });

  const vistaLista = (): HTMLElement => {
    const lista = partida.lista();
    const hechos = partida.hechos().length;
    const fila = (i: ItemTema) => {
      const estado = i.nuevas
        ? `Nuevo: ${i.nuevas} ${i.nuevas === 1 ? 'propuesta' : 'propuestas'}`
        : i.estado === 'hecho' ? '✓ Hecho' : i.estado === 'ninguna' ? '— Ninguna me convenció' : 'Sin empezar';
      const a = h('a', { href: `#tema/${i.tema.id}`, class: `fila-tema ${i.estado}` },
        h('span', { class: 'nombre' }, i.tema.titulo, i.tema.ambito === 'canarias' ? h('span', { class: 'etiqueta-canarias' }, 'Solo Canarias') : null),
        h('span', { class: 'estado' }, estado),
      );
      return h('li', {}, a);
    };
    return h('section', { class: 'lista' },
      h('header', { class: 'cabecera' }, h('span', {}), chipProvincia(partida.provincia)),
      h('h1', { tabindex: '-1' }, 'Temas'),
      papeleta(partida),
      h('p', { class: 'gris' }, hechos < META_TEMAS
        ? `Tu papeleta · ${hechos} de ${META_TEMAS}. Te ${META_TEMAS - hechos === 1 ? 'falta 1 tema' : `faltan ${META_TEMAS - hechos} temas`} para ver tu resultado.`
        : `${hechos} hechos · Haz más para afinar tu resultado.`),
      hechos >= META_TEMAS ? h('a', { href: '#resultado', class: 'secundario boton-enlace' }, 'Ver mi resultado') : null,
      h('ol', { class: 'filas', role: 'list' }, ...lista.sugeridos.map(fila)),
      lista.extra.length ? h('h2', {}, 'Temas extra') : null,
      lista.extra.length ? h('ul', { class: 'filas', role: 'list' }, ...lista.extra.map(fila)) : null,
      bloquePartidos(partida),
      h('p', {}, h('a', { href: '#datos' }, 'Tus datos')),
      hechos ? empezarDeCero(borrarTodo) : null,
    );
  };

  const vistaTema = (temaId: string): HTMLElement => {
    const revelacion = partida.revelar(temaId);
    return revelacion ? vistaRevelacion(revelacion) : vistaElegir(temaId);
  };

  const vistaElegir = (temaId: string): HTMLElement => {
    const vista = partida.tema(temaId);
    const lista = h('ol', { class: 'tarjetas', role: 'list' });
    const opciones = [...vista.tarjetas.map((t) => t.letra), NINGUNA];
    const tarjeta = (valor: string, ...contenido: Hijo[]) => {
      const b = h('button', {
        type: 'button',
        class: valor === NINGUNA ? 'tarjeta ninguna' : 'tarjeta',
        'aria-pressed': String(seleccion === valor),
        'aria-label': valor === NINGUNA ? 'Ninguna me convence' : `Propuesta ${valor}`,
        'data-valor': valor,
      }, ...contenido);
      b.addEventListener('click', () => {
        seleccion = valor;
        pintar(`[data-valor="${valor}"]`);
      });
      return b;
    };
    for (const t of vista.tarjetas) {
      lista.append(h('li', {}, tarjeta(t.letra, h('span', { class: 'letra', 'aria-hidden': 'true' }, t.letra),
        h('span', { class: 'texto' }, h('strong', { class: 'titular' }, t.titular), h('span', { class: 'detalle' }, t.detalle)))));
    }
    lista.append(h('li', {}, tarjeta(NINGUNA, h('span', { class: 'texto' }, h('strong', { class: 'titular' }, 'Ninguna me convence')))));

    const sinPropuesta = vista.sinPropuesta
      ? ` ${vista.sinPropuesta} ${vista.sinPropuesta === 1 ? 'partido no propone' : 'partidos no proponen'} nada sobre esto (los verás al final).`
      : '';
    const confirmar = seleccion && opciones.includes(seleccion) ? hojaConfirmar(temaId, seleccion) : null;

    return h('section', { class: 'elegir' },
      cabecera(partida, temaId),
      h('h1', { tabindex: '-1' }, vista.tema.pregunta),
      vista.tema.explicacion ? h('p', { class: 'explicacion' }, vista.tema.explicacion) : null,
      h('p', { class: 'ayuda' }, 'Lee y toca la que más te convenza. No pone de quién es: lo verás después.'),
      lista,
      h('p', { class: 'gris' }, `Hay ${vista.tarjetas.length} propuestas.${sinPropuesta}`),
      h('p', { class: 'gris' }, `El orden y las letras se barajan para ti en cada tema. Tu barajado: #${vista.barajado} `,
        boton('Barajar otra vez', 'enlace', () => {
          actualizar(partida.barajarOtraVez(temaId));
          seleccion = null;
          pintar();
        })),
      confirmar,
    );
  };

  /** Confirm + optional bet in one tap: a chip reveals with that bet, the big button without. */
  const hojaConfirmar = (temaId: string, valor: string): HTMLElement => {
    const confirmar = (apuesta?: string) => {
      actualizar(partida.elegir(temaId, valor, apuesta ? { apuesta } : undefined));
      seleccion = null;
      pintar();
    };
    if (valor === NINGUNA)
      return h('div', { class: 'barra-fija', role: 'region', 'aria-label': 'Confirmar elección' },
        h('p', {}, 'No te convence ninguna.'),
        boton('Ver de quién era cada una', 'principal', () => confirmar()),
      );
    const apostar = !preferencias.sinApuesta;
    return h('div', { class: 'barra-fija hoja', role: 'region', 'aria-label': 'Confirmar elección' },
      h('p', {}, `Has elegido la ${valor}.`),
      apostar ? h('p', { class: 'pregunta-apuesta', id: 'pregunta-apuesta' }, '¿De quién crees que es? ', h('span', { class: 'gris' }, '(opcional, solo lo ves tú)')) : null,
      apostar
        ? h('div', { class: 'chips', role: 'group', 'aria-labelledby': 'pregunta-apuesta' },
            ...partida.opcionesApuesta(temaId).map((p) => boton(p.nombre, 'chip', () => confirmar(p.id))))
        : null,
      boton(apostar ? 'Descubrir sin apostar' : 'Descubrir de quién es', 'principal', () => confirmar()),
      h('div', { class: 'fila-botones' },
        boton('Cambiar', 'enlace', () => {
          seleccion = null;
          pintar(`[data-valor="${valor}"]`);
        }),
        apostar
          ? boton('No preguntarme más', 'enlace', () => {
              preferencias = { ...preferencias, sinApuesta: true };
              guardar(CLAVE_PREFERENCIAS, preferencias);
              pintar('.barra-fija .principal');
            })
          : null,
      ),
    );
  };

  const vistaRevelacion = (r: Revelacion): HTMLElement => {
    const mia = r.tarjetas.find((t) => t.elegida);
    const banner = !mia
      ? 'No te convenció ninguna. Esto proponía cada uno:'
      : r.apuesta?.acertada
        ? `Era de ${mia.partido.nombre}. Lo pensabas.`
        : r.apuesta
          ? `Era de ${mia.partido.nombre}. Tu apuesta: ${r.apuesta.partido.nombre}.`
          : `La ${mia.letra} era de ${mia.partido.nombre}.`;
    const otras = r.tarjetas.filter((t) => !t.elegida);
    const siguiente = partida.siguiente(r.tema.id);
    const pos = partida.posicion(r.tema.id);
    const alResultado = pos.tipo === 'meta' && pos.numero === META_TEMAS;
    const nuevas = partida.lista().sugeridos.concat(partida.lista().extra).find((i) => i.tema.id === r.tema.id)?.nuevas ?? 0;
    const volverAElegir = () => {
      actualizar(partida.volverAElegir(r.tema.id));
      pintar();
    };
    return h('section', { class: 'revelacion' },
      cabecera(partida, r.tema.id),
      h('p', { class: 'antetitulo' }, '¿De quién era?'),
      h('h1', { tabindex: '-1' }, banner),
      r.recorrido ? h('p', { class: 'recorrido' }, textoRecorrido(r.recorrido)) : null,
      nuevas
        ? h('div', { class: 'aviso-zona', role: 'status' },
            h('p', {}, nuevas === 1 ? 'Hay una propuesta nueva. ¿Sigues prefiriendo la misma?' : `Hay ${nuevas} propuestas nuevas. ¿Sigues prefiriendo la misma?`),
            boton('Volver a elegir', 'secundario', volverAElegir))
        : null,
      mia ? h('div', { class: 'mia' }, h('h2', {}, 'Tu elección'), tarjetaRevelada(mia, true, r.tema)) : null,
      otras.length ? h('h2', {}, mia ? 'Las demás' : 'Todas las propuestas') : null,
      ...otras.map((t) => tarjetaRevelada(t, false, r.tema)),
      ...r.sinPropuesta.map((p) => tarjetaSinPropuesta(p, 'Este partido no propone nada sobre esto')),
      ...r.sinVerificar.map((p) => tarjetaSinPropuesta(p, 'No pudimos verificar su propuesta')),
      r.pendientes.length
        ? h('p', { class: 'fila-gris' }, `⏳ Sin programa todavía: ${unir(r.pendientes.map((p) => p.nombre))}. `,
            'Mientras falte, no aparece en los temas ni en tu resultado. ', h('a', { href: '/partidos/' }, 'Partidos y programas'))
        : null,
      h('p', { class: 'nota' }, 'Las propuestas están reescritas con IA en un estilo común. La cita es el texto literal del documento.'),
      r.tarjetas.some((t) => t.viabilidad)
        ? h('p', { class: 'nota' }, 'La viabilidad dice qué haría falta para aplicarla, no si es buena idea.')
        : null,
      nuevas ? null : boton('Volver a elegir', 'enlace', volverAElegir),
      h('div', { class: 'barra-fija' },
        alResultado
          ? boton('Ver mi resultado', 'principal', () => irA('resultado'))
          : siguiente
            ? boton(`Siguiente: ${siguiente.titulo}`, 'principal', () => irA(`tema/${siguiente.id}`))
            : h('p', {}, 'Has hecho todos los temas.'),
        boton('Elegir otro tema', 'secundario', () => irA('temas')),
      ),
    );
  };

  pintar();
}

/** Factual, never a judgement: "Tu primera elección." / "Primera vez que eliges a X." / "3 temas, 2 partidos distintos." */
function textoRecorrido(r: Recorrido): string {
  if (r.tipo === 'primera') return 'Tu primera elección.';
  if (r.tipo === 'partido_nuevo') return `Primera vez que eliges a ${r.partido.nombre}.`;
  return `${r.temas} temas, ${r.partidos} ${r.partidos === 1 ? 'partido' : 'partidos distintos'}.`;
}

function cabecera(partida: Partida, temaId: string): HTMLElement {
  const tema = partida.temas().find((t) => t.id === temaId)!;
  const pos = partida.posicion(temaId);
  const hechos = partida.hechos().length;
  return h('header', { class: 'cabecera' },
    h('div', { class: 'cabecera-fila' }, h('a', { href: '#temas', class: 'volver' }, '← Temas'), chipProvincia(partida.provincia)),
    h('p', {}, pos.tipo === 'meta' ? `Tema ${pos.numero} de ${pos.meta} · ${tema.titulo}` : `Tema extra · ${tema.titulo}`),
    pos.tipo === 'meta'
      ? h('ol', { class: 'progreso', 'aria-hidden': 'true' },
          ...Array.from({ length: pos.meta }, (_, i) => h('li', { class: i + 1 === pos.numero ? 'actual' : i < hechos ? 'hecho' : '' })))
      : null,
  );
}

/** Grey, non-interactive card: these parties have no card to choose in the blind phase. */
function tarjetaSinPropuesta(p: PartidoRevelado, mensaje: string): HTMLElement {
  return h('div', { class: 'sin-propuesta', role: 'note' },
    h('span', { class: 'partido' }, p.nombre),
    p.prueba ? h('span', { class: 'etiqueta' }, 'PRUEBA') : null,
    h('p', {}, mensaje),
  );
}

function tarjetaRevelada(t: TarjetaRevelada, abierta: boolean, tema: { id: string; titulo: string }): HTMLElement {
  const fuente = `${ETIQUETA_FUENTE[t.fuente.tipo]}${t.fuente.soloPrivado ? ' · solo privado' : ''}`;
  const cuerpo = h('div', { class: 'cuerpo' },
    h('p', { class: 'titular' }, h('strong', {}, t.titular)),
    h('p', { class: 'detalle' }, t.detalle),
    ...t.citas.map((c) =>
      h('blockquote', {},
        h('p', {}, `«${c.texto}»`),
        h('footer', {},
          `— ${t.tituloPrograma}, pág. ${c.pagina} · `,
          h('a', { href: c.enlace, target: '_blank', rel: 'noopener' }, 'Abrir PDF en la página ↗'),
        ),
      ),
    ),
    h('p', { class: `fuente${t.fuente.soloPrivado ? ' provisional' : ''}` }, `Fuente: ${fuente}`),
    notaViabilidad(t.viabilidad),
    botonReportar({ tema, partido: t.partido, letra: t.letra, paginas: t.citas.map((c) => c.pagina) }),
  );
  const resumen = h('summary', {},
    h('span', { class: 'letra', 'aria-hidden': 'true' }, t.letra),
    h('span', { class: 'partido' }, t.partido.nombre),
    t.partido.prueba ? h('span', { class: 'etiqueta' }, 'PRUEBA') : null,
    t.fuente.soloPrivado ? h('span', { class: 'etiqueta' }, 'SOLO PRIVADO') : null,
    chipViabilidad(t.viabilidad),
  );
  const det = h('details', { class: 'revelada' }, resumen, cuerpo);
  if (abierta) det.setAttribute('open', '');
  return det;
}
