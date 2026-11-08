// Client app: first-visit home → province → topic (blind choice → confirm/bet → reveal) → result. All
// logic lives in the game engine; this file only renders and routes (#portada, #provincia, #inicio,
// #temas, #tema/<id>, #resultado, #compartir, #preguntar[/<id>], #datos) and drives the bottom tab bar
// (static in index.astro). Choices, bets and the result never leave the browser.
import type { Dataset, Modo, TipoFuente } from '../dataset/esquema';
import { textoPortadaReto } from '../compartir';
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
import { vistaPreguntas, vistaRespuesta } from './preguntar';
import { avisoZona, bloquePartidos, chipProvincia, vistaProvincia } from './provincia';
import { boton, empezarDeCero, papeleta, unir, vistaDatos, vistaResultado, vistaVuelta } from './resultado';
import { chipViabilidad, notaViabilidad } from './viabilidad';
import { etiquetaIA } from './ia';
import { botonReportar } from './reportar';
import { vistaPortada } from './portada';
import { crearLector } from './escuchar';
import { CLAVE_LETRA, letraGrande } from './letra';
import { analiticaConfirmar, analiticaResultado, analiticaVerTema, configurarAnalitica } from './analitica';
import { avisoReto, vistaCompartir } from './compartir';

const CLAVE_SEMILLA = '29n:semilla';
const CLAVE_ESTADO = '29n:estado';
/** { codigo: "35" } or { codigo: null } ("Prefiero no decirlo"); absent = not asked yet. */
const CLAVE_PROVINCIA = '29n:provincia';
/** { sinApuesta: true } after "No preguntarme más" (reactivated in Tus datos); { ayudaVista: true } after
 * the first-time help layer of topic 1. */
const CLAVE_PREFERENCIAS = '29n:preferencias';
const CLAVES = [CLAVE_SEMILLA, CLAVE_ESTADO, CLAVE_PROVINCIA, CLAVE_PREFERENCIAS, CLAVE_LETRA];
/** The province summary shows ~2 s on the screen after choosing (ux-spec screen 3). */
const DURACION_AVISO_ZONA = 2000;
/** Routes without the bottom tab bar (onboarding). */
const SIN_PESTANAS = new Set(['portada', 'provincia']);
type Preferencias = { sinApuesta?: boolean; ayudaVista?: boolean };

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
  let reto = textoPortadaReto(location.search);
  let semilla = leer<string>(CLAVE_SEMILLA);
  if (!semilla) {
    semilla = nuevaSemilla();
    guardar(CLAVE_SEMILLA, semilla);
  }
  let preferencias = leer<Preferencias>(CLAVE_PREFERENCIAS) ?? {};
  const cambiarPreferencias = (cambios: Preferencias) => {
    preferencias = { ...preferencias, ...cambios };
    guardar(CLAVE_PREFERENCIAS, preferencias);
  };
  const nueva = (estado?: EstadoPartida) => crearPartida(dataset, provincia ?? null, semilla!, estado, { modo });
  let partida: Partida = nueva(leer<EstadoPartida>(CLAVE_ESTADO) ?? undefined);
  configurarAnalitica(dataset.partidos.map((p) => p.id));
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
  /** Only right after confirming: the reveal flips (or fades, with reduced motion) once. */
  let animarRevelacion = false;
  let leyendo = false;
  const lector = crearLector((id) => {
    leyendo = id !== null;
    marcarLectura();
  });
  /** Highlights the card being read and keeps the button label in sync (survives re-renders). */
  const marcarLectura = () => {
    for (const t of raiz.querySelectorAll<HTMLElement>('.tarjeta[data-valor]')) t.classList.toggle('sonando', t.dataset.valor === lector.actual);
    const b = raiz.querySelector<HTMLElement>('.escuchar');
    if (b) b.replaceChildren(...etiquetaEscuchar(leyendo));
  };

  const pintar = (enfocar: string | null = 'h1') => {
    const ruta = location.hash.slice(1);
    const temaId = ruta.startsWith('tema/') ? decodeURIComponent(ruta.slice(5)) : null;
    const existe = temaId !== null && partida.temas().some((t) => t.id === temaId);
    if (ruta === 'provincia') raiz.replaceChildren(vistaProvincia(provincia, elegirProvincia));
    else if (ruta === 'datos') raiz.replaceChildren(vistaDatosApp());
    else if (ruta === 'portada') raiz.replaceChildren(vistaPortada(() => (provincia === undefined ? irA('provincia') : irASiguiente())));
    else if (provincia === undefined) return irA('portada'); // first visit: the home page, then the province
    else if (ruta === 'inicio') raiz.replaceChildren(vistaVueltaApp());
    else if (ruta === 'temas') raiz.replaceChildren(vistaLista());
    else if (ruta === 'preguntar') raiz.replaceChildren(vistaPreguntas(partida));
    else if (ruta.startsWith('preguntar/') && partida.preguntas().some((p) => p.id === decodeURIComponent(ruta.slice(10))))
      raiz.replaceChildren(vistaRespuesta(partida, decodeURIComponent(ruta.slice(10))));
    else if (ruta === 'resultado') raiz.replaceChildren(vistaResultadoApp()), analiticaResultado(partida);
    else if (ruta === 'compartir') raiz.replaceChildren(vistaCompartirApp());
    else if (existe) raiz.replaceChildren(vistaTema(temaId!)), analiticaVerTema(partida);
    else if (!inicioMostrado && partida.hechos().length > 0) {
      inicioMostrado = true;
      return irA('inicio');
    } else {
      // Start: straight to the next pending topic (vivienda first), or the list if all are done.
      const siguiente = partida.siguiente();
      return irA(siguiente ? `tema/${siguiente.id}` : 'temas');
    }
    if (mostrarAviso && ruta !== 'provincia') {
      // Once, on the screen after choosing: who is in play here. It goes away after ~2 s.
      const aviso = avisoZona(partida);
      raiz.prepend(aviso);
      retirarTras(aviso, DURACION_AVISO_ZONA);
      mostrarAviso = false;
    }
    if (reto) {
      // ?r=reto: once, on the first screen shown; on the first-visit home, above its headline.
      const linea = avisoReto(reto);
      const titular = ruta === 'portada' ? raiz.querySelector('h1') : null;
      if (titular) titular.before(linea);
      else raiz.prepend(linea);
      reto = null;
    }
    pintarPestanas(ruta);
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

  const vistaCompartirApp = () =>
    h('div', {},
      h('header', { class: 'cabecera' }, h('a', { href: '#resultado', class: 'volver' }, '← Mi resultado')),
      vistaCompartir(partida),
    );

  const vistaDatosApp = () =>
    h('div', {},
      h('header', { class: 'cabecera' }, h('a', { href: '#temas', class: 'volver' }, '← Temas')),
      vistaDatos(partida, { provinciaElegida: provincia !== undefined, apuestaActiva: !preferencias.sinApuesta, almacenamiento: hayAlmacen, letraGrande: letraGrande() }, {
        cambiarApuesta: (activa) => cambiarPreferencias({ sinApuesta: !activa }),
        borrarTodo,
      }),
    );

  window.addEventListener('hashchange', () => {
    seleccion = null;
    lector.parar();
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
      partida.preguntas().length
        ? h('p', {}, h('a', { href: '#preguntar', class: 'fila-tema' }, h('span', { class: 'nombre' }, 'Pregunta a los programas'), h('span', { class: 'estado' }, '→')))
        : null,
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
        navigator.vibrate?.(10); // short haptic tap where supported
        pintar(`[data-valor="${valor}"]`);
        marcarLectura();
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
      utilidades(vista.tarjetas),
      lista,
      h('p', { class: 'gris' }, `Hay ${vista.tarjetas.length} propuestas.${sinPropuesta}`),
      h('p', { class: 'gris nota-ia' }, etiquetaIA(), ' Reescritas con IA en el mismo estilo y largo parecido. El texto original lo verás después de elegir.'),
      ayudaPrimeraVez(temaId),
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
      const antes = partida;
      actualizar(partida.elegir(temaId, valor, apuesta ? { apuesta } : undefined));
      analiticaConfirmar(antes, partida, temaId);
      seleccion = null;
      lector.parar();
      animarRevelacion = true;
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
              cambiarPreferencias({ sinApuesta: true });
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
    const animar = animarRevelacion;
    animarRevelacion = false;
    let orden = 0;
    const enCascada = (el: HTMLElement) => {
      el.style.setProperty('--i', String(orden++));
      return el;
    };
    const seccion = h('section', { class: animar ? 'revelacion animar' : 'revelacion' },
      cabecera(partida, r.tema.id),
      h('p', { class: 'antetitulo' }, '¿De quién era?'),
      h('h1', { tabindex: '-1' }, banner),
      r.recorrido ? h('p', { class: 'recorrido' }, textoRecorrido(r.recorrido)) : null,
      nuevas
        ? h('div', { class: 'aviso-zona', role: 'status' },
            h('p', {}, nuevas === 1 ? 'Hay una propuesta nueva. ¿Sigues prefiriendo la misma?' : `Hay ${nuevas} propuestas nuevas. ¿Sigues prefiriendo la misma?`),
            boton('Volver a elegir', 'secundario', volverAElegir))
        : null,
      mia ? h('div', { class: 'mia' }, h('h2', {}, 'Tu elección'), enCascada(tarjetaRevelada(mia, true, r.tema))) : null,
      otras.length ? h('h2', {}, mia ? 'Las demás' : 'Todas las propuestas') : null,
      ...otras.map((t) => enCascada(tarjetaRevelada(t, false, r.tema))),
      ...r.sinPropuesta.map((p) => enCascada(tarjetaSinPropuesta(p, 'Este partido no propone nada sobre esto'))),
      ...r.sinVerificar.map((p) => enCascada(tarjetaSinPropuesta(p, 'No pudimos verificar su propuesta'))),
      r.pendientes.length
        ? h('p', { class: 'fila-gris' }, `⏳ Sin programa todavía: ${unir(r.pendientes.map((p) => p.nombre))}. `,
            'Mientras falte, no aparece en los temas ni en tu resultado. ', h('a', { href: '/partidos/' }, 'Partidos y programas'))
        : null,
      h('p', { class: 'nota' }, etiquetaIA(), ' Las propuestas están reescritas con IA en un estilo común. La cita es el texto literal del documento.'),
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
    // One tap skips the flip.
    if (animar) seccion.addEventListener('pointerdown', () => seccion.classList.remove('animar'), { once: true });
    return seccion;
  };

  /** "🔊 Escuchar todas" (only if the browser has a voice). Reads the cards in their order. */
  const utilidades = (tarjetas: { letra: string; titular: string; detalle: string }[]): HTMLElement | null => {
    if (!lector.disponible || !tarjetas.length) return null;
    const frase = (t: string) => `${t.trim().replace(/[.\s]+$/, '')}.`;
    const b = boton('', 'secundario escuchar', () => {
      if (leyendo) return lector.parar();
      leyendo = true;
      marcarLectura();
      lector.leer(tarjetas.map((t) => ({ id: t.letra, texto: `Propuesta ${t.letra}. ${frase(t.titular)} ${frase(t.detalle)}` })));
    });
    b.replaceChildren(...etiquetaEscuchar(leyendo));
    return h('div', { class: 'utilidades' }, b);
  };

  /** First time only, on topic 1: a layer closed with one tap (anywhere) or Escape. */
  const ayudaPrimeraVez = (temaId: string): HTMLElement | null => {
    const pos = partida.posicion(temaId);
    if (preferencias.ayudaVista || pos.tipo !== 'meta' || pos.numero !== 1) return null;
    const capa = h('dialog', { class: 'ayuda', 'aria-labelledby': 'ayuda-texto' },
      h('p', { id: 'ayuda-texto' }, 'Lee y toca la que más te convenza. No pone de quién es: lo verás después.'),
      h('button', { type: 'button', class: 'principal', autofocus: '' }, 'Entendido'),
    ) as HTMLDialogElement;
    capa.addEventListener('click', () => capa.close());
    capa.addEventListener('close', () => {
      cambiarPreferencias({ ayudaVista: true });
      capa.remove();
    });
    // Opened once it is in the document (pintar has already focused the heading, which gets the
    // focus back when the layer closes).
    queueMicrotask(() => {
      if (capa.isConnected && !capa.open) capa.showModal();
    });
    return capa;
  };

  pintar();
}

const etiquetaEscuchar = (leyendo: boolean): (Node | string)[] => [
  h('span', { 'aria-hidden': 'true' }, leyendo ? '⏹ ' : '🔊 '),
  leyendo ? 'Parar' : 'Escuchar todas',
];

let observada = false;
/** Bottom tab bar (Temas · Preguntar · Mi resultado): hidden during onboarding, current tab marked. */
function pintarPestanas(ruta: string): void {
  const nav = document.querySelector<HTMLElement>('.pestanas');
  if (!nav) return;
  const visible = !SIN_PESTANAS.has(ruta);
  nav.hidden = !visible;
  document.body.dataset.pestanas = visible ? 'si' : 'no';
  // Fixed bars stack above the tabs, whatever their height (large text, 200 % zoom…).
  if (!observada) {
    observada = true;
    new ResizeObserver(() => document.documentElement.style.setProperty('--alto-pestanas', `${nav.offsetHeight}px`)).observe(nav);
  }
  const actual = ruta.startsWith('tema/') ? null : ruta.split('/')[0];
  for (const a of nav.querySelectorAll('a')) {
    if (a.getAttribute('href') === `#${actual}`) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

/** Removes a transient notice after `ms`, but not while it is focused or covered by a layer. */
function retirarTras(el: HTMLElement, ms: number): void {
  setTimeout(() => {
    if (!el.isConnected) return;
    // Behind the help layer nobody has seen it yet: start again once the layer is closed.
    if (document.querySelector('dialog[open]')) return retirarTras(el, ms);
    // Not while a keyboard/screen-reader user is on its "Cambiar" link. (No :hover check: on phones
    // hover sticks after a tap and the notice would never go.)
    if (el.matches(':focus-within')) return retirarTras(el, 1000);
    el.classList.add('saliendo');
    setTimeout(() => el.remove(), 300);
  }, ms);
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
