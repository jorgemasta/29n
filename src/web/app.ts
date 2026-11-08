// Client app: topic list ↔ topic (blind choice → reveal). All logic lives in the game engine;
// this file only renders and routes (#provincia, #temas, #tema/<id>). Choices never leave the browser.
import type { Dataset, Modo, TipoFuente } from '../dataset/esquema';
import {
  crearPartida,
  META_TEMAS,
  NINGUNA,
  type EstadoPartida,
  type ItemTema,
  type Partida,
  type PartidoRevelado,
  type Revelacion,
  type TarjetaRevelada,
} from '../juego';
import { nuevaSemilla } from '../juego/azar';
import { borrar, guardar, leer } from './almacen';
import { avisoZona, bloquePartidos, chipProvincia, vistaProvincia } from './provincia';

const CLAVE_SEMILLA = '29n:semilla';
const CLAVE_ESTADO = '29n:estado';
/** { codigo: "35" } or { codigo: null } ("Prefiero no decirlo"); absent = not asked yet. */
const CLAVE_PROVINCIA = '29n:provincia';

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

function boton(texto: string, clase: string, alPulsar: () => void, attrs: Record<string, string> = {}): HTMLElement {
  const b = h('button', { type: 'button', class: clase, ...attrs }, texto);
  b.addEventListener('click', alPulsar);
  return b;
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
  let semilla = leer<string>(CLAVE_SEMILLA);
  if (!semilla) {
    semilla = nuevaSemilla();
    guardar(CLAVE_SEMILLA, semilla);
  }
  const nueva = (estado?: EstadoPartida) => crearPartida(dataset, provincia ?? null, semilla!, estado, { modo });
  let partida: Partida = nueva(leer<EstadoPartida>(CLAVE_ESTADO) ?? undefined);
  let seleccion: string | null = null;

  const pintar = (enfocar: string | null = 'h1') => {
    const ruta = location.hash.slice(1);
    const temaId = ruta.startsWith('tema/') ? decodeURIComponent(ruta.slice(5)) : null;
    const existe = temaId !== null && partida.temas().some((t) => t.id === temaId);
    if (ruta === 'provincia') raiz.replaceChildren(vistaProvincia(provincia, elegirProvincia));
    else if (provincia === undefined) return irA('provincia'); // first visit: ask where they vote
    else if (ruta === 'temas') raiz.replaceChildren(vistaLista());
    else if (existe) raiz.replaceChildren(vistaTema(temaId!));
    else {
      // Start: straight to the next pending topic (vivienda first), or the list if all are done.
      const siguiente = partida.siguiente();
      return irA(siguiente ? `tema/${siguiente.id}` : 'temas');
    }
    if (mostrarAviso && ruta !== 'provincia') {
      // Once, on the screen after choosing: who is in play here.
      raiz.prepend(avisoZona(partida));
      mostrarAviso = false;
    }
    if (enfocar) raiz.querySelector<HTMLElement>(enfocar)?.focus();
  };

  const elegirProvincia = (codigo: string | null) => {
    provincia = codigo;
    guardar(CLAVE_PROVINCIA, { codigo });
    // Choices are kept; topics not available in the new province simply stop counting.
    partida = nueva(partida.estado);
    mostrarAviso = true;
    const siguiente = partida.siguiente();
    irA(siguiente ? `tema/${siguiente.id}` : 'temas');
  };
  window.addEventListener('hashchange', () => {
    seleccion = null;
    pintar();
    window.scrollTo(0, 0);
  });

  const vistaLista = (): HTMLElement => {
    const lista = partida.lista();
    const hechos = partida.hechos().length;
    const fila = (i: ItemTema) => {
      const estado = i.estado === 'hecho' ? '✓ Hecho' : i.estado === 'ninguna' ? '— Ninguna me convenció' : 'Sin empezar';
      const a = h('a', { href: `#tema/${i.tema.id}`, class: `fila-tema ${i.estado}` },
        h('span', { class: 'nombre' }, i.tema.titulo, i.tema.ambito === 'canarias' ? h('span', { class: 'etiqueta-canarias' }, 'Solo Canarias') : null),
        h('span', { class: 'estado' }, estado),
      );
      return h('li', {}, a);
    };
    const reiniciar = boton('Borrar mis elecciones y volver a empezar', 'enlace', () => {
      borrar(CLAVE_ESTADO);
      partida = nueva();
      pintar();
    });
    return h('section', { class: 'lista' },
      h('header', { class: 'cabecera' }, h('span', {}), chipProvincia(partida.provincia)),
      h('h1', { tabindex: '-1' }, 'Temas'),
      papeleta(hechos),
      h('p', { class: 'gris' }, hechos < META_TEMAS
        ? `Tu papeleta · ${hechos} de ${META_TEMAS}. Te ${META_TEMAS - hechos === 1 ? 'falta 1 tema' : `faltan ${META_TEMAS - hechos} temas`} para ver tu resultado.`
        : `${hechos} hechos · Haz más para afinar tu resultado.`),
      h('ol', { class: 'filas', role: 'list' }, ...lista.sugeridos.map(fila)),
      lista.extra.length ? h('h2', {}, 'Temas extra') : null,
      lista.extra.length ? h('ul', { class: 'filas', role: 'list' }, ...lista.extra.map(fila)) : null,
      bloquePartidos(partida),
      hechos ? reiniciar : null,
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
    const confirmar = seleccion && opciones.includes(seleccion)
      ? h('div', { class: 'barra-fija', role: 'region', 'aria-label': 'Confirmar elección' },
          h('p', {}, seleccion === NINGUNA ? 'No te convence ninguna.' : `Has elegido la ${seleccion}.`),
          boton(seleccion === NINGUNA ? 'Ver de quién era cada una' : 'Descubrir de quién es', 'principal', () => {
            partida = partida.elegir(temaId, seleccion!);
            guardar(CLAVE_ESTADO, partida.estado);
            seleccion = null;
            pintar();
          }),
        )
      : null;

    return h('section', { class: 'elegir' },
      cabecera(partida, temaId),
      h('h1', { tabindex: '-1' }, vista.tema.pregunta),
      vista.tema.explicacion ? h('p', { class: 'explicacion' }, vista.tema.explicacion) : null,
      h('p', { class: 'ayuda' }, 'Lee y toca la que más te convenza. No pone de quién es: lo verás después.'),
      lista,
      h('p', { class: 'gris' }, `Hay ${vista.tarjetas.length} propuestas.${sinPropuesta}`),
      h('p', { class: 'gris' }, `El orden y las letras se barajan para ti en cada tema. Tu barajado: #${semilla}`),
      confirmar,
    );
  };

  const vistaRevelacion = (r: Revelacion): HTMLElement => {
    const mia = r.tarjetas.find((t) => t.elegida);
    const banner = mia ? `La ${mia.letra} era de ${mia.partido.nombre}.` : 'No te convenció ninguna. Esto proponía cada uno:';
    const otras = r.tarjetas.filter((t) => !t.elegida);
    const siguiente = partida.siguiente(r.tema.id);
    return h('section', { class: 'revelacion' },
      cabecera(partida, r.tema.id),
      h('p', { class: 'antetitulo' }, '¿De quién era?'),
      h('h1', { tabindex: '-1' }, banner),
      mia ? h('div', { class: 'mia' }, h('h2', {}, 'Tu elección'), tarjetaRevelada(mia, true)) : null,
      otras.length ? h('h2', {}, mia ? 'Las demás' : 'Todas las propuestas') : null,
      ...otras.map((t) => tarjetaRevelada(t, false)),
      ...r.sinPropuesta.map((p) => tarjetaSinPropuesta(p, 'Este partido no propone nada sobre esto')),
      ...r.sinVerificar.map((p) => tarjetaSinPropuesta(p, 'No pudimos verificar su propuesta')),
      r.pendientes.length ? h('p', { class: 'fila-gris' }, `⏳ Sin programa todavía: ${r.pendientes.map((p) => p.nombre).join(', ')}`) : null,
      h('p', { class: 'nota' }, 'Las propuestas están reescritas con IA en un estilo común. La cita es el texto literal del documento.'),
      h('div', { class: 'barra-fija' },
        siguiente
          ? boton(`Siguiente: ${siguiente.titulo}`, 'principal', () => irA(`tema/${siguiente.id}`))
          : h('p', {}, 'Has hecho todos los temas.'),
        boton('Elegir otro tema', 'secundario', () => irA('temas')),
      ),
    );
  };

  pintar();
}

function papeleta(hechos: number): HTMLElement {
  return h('ol', { class: 'papeleta', 'aria-hidden': 'true' },
    ...Array.from({ length: META_TEMAS }, (_, i) => h('li', { class: i < hechos ? 'hecho' : '' }, i < hechos ? '✕' : '')));
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

function tarjetaRevelada(t: TarjetaRevelada, abierta: boolean): HTMLElement {
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
  );
  const resumen = h('summary', {},
    h('span', { class: 'letra', 'aria-hidden': 'true' }, t.letra),
    h('span', { class: 'partido' }, t.partido.nombre),
    t.partido.prueba ? h('span', { class: 'etiqueta' }, 'PRUEBA') : null,
    t.fuente.soloPrivado ? h('span', { class: 'etiqueta' }, 'SOLO PRIVADO') : null,
  );
  const det = h('details', { class: 'revelada' }, resumen, cuerpo);
  if (abierta) det.setAttribute('open', '');
  return det;
}
