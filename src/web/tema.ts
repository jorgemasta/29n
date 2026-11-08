// Client screen for one topic: blind choice → reveal. All logic lives in the game engine;
// this file only renders. Choices never leave the browser.
import datos from '../../data/dataset.json';
import type { Dataset } from '../dataset/esquema';
import { crearPartida, NINGUNA, type EstadoPartida, type Partida, type PartidoRevelado, type Revelacion, type TarjetaRevelada } from '../juego';
import { nuevaSemilla } from '../juego/azar';
import { borrar, guardar, leer } from './almacen';

const dataset = datos as Dataset;
const CLAVE_SEMILLA = '29n:semilla';
const CLAVE_ESTADO = '29n:estado';

type Hijo = Node | string | null | undefined | false;
function h(tag: string, attrs: Record<string, string> = {}, ...hijos: Hijo[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of hijos) if (c) el.append(c);
  return el;
}

export function montarTema(raiz: HTMLElement, temaId: string): void {
  const provincia = new URLSearchParams(location.search).get('provincia');
  let semilla = leer<string>(CLAVE_SEMILLA);
  if (!semilla) {
    semilla = nuevaSemilla();
    guardar(CLAVE_SEMILLA, semilla);
  }
  let partida: Partida = crearPartida(dataset, provincia, semilla, leer<EstadoPartida>(CLAVE_ESTADO) ?? undefined);
  let seleccion: string | null = null;

  /** Re-render. Screen changes move focus to the heading; a selection keeps it on the card. */
  const pintar = (enfocar: string | null = 'h1') => {
    const revelacion = partida.revelar(temaId);
    raiz.replaceChildren(revelacion ? vistaRevelacion(revelacion) : vistaElegir());
    if (enfocar) raiz.querySelector<HTMLElement>(enfocar)?.focus();
  };

  const vistaElegir = (): HTMLElement => {
    const vista = partida.tema(temaId);
    const lista = h('ol', { class: 'tarjetas', role: 'list' });
    const opciones = [...vista.tarjetas.map((t) => t.letra), NINGUNA];
    for (const t of vista.tarjetas) {
      lista.append(
        h('li', {}, boton(t.letra, h('span', { class: 'letra', 'aria-hidden': 'true' }, t.letra),
          h('span', { class: 'texto' }, h('strong', { class: 'titular' }, t.titular), h('span', { class: 'detalle' }, t.detalle)))),
      );
    }
    lista.append(h('li', {}, boton(NINGUNA, h('span', { class: 'texto' }, h('strong', { class: 'titular' }, 'Ninguna me convence')))));

    function boton(valor: string, ...contenido: Hijo[]) {
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
    }

    const sinPropuesta = vista.sinPropuesta
      ? ` ${vista.sinPropuesta} ${vista.sinPropuesta === 1 ? 'partido no propone' : 'partidos no proponen'} nada sobre esto (los verás al final).`
      : '';
    const confirmar = seleccion && opciones.includes(seleccion)
      ? h('div', { class: 'barra-confirmar', role: 'region', 'aria-label': 'Confirmar elección' },
          h('p', {}, seleccion === NINGUNA ? 'No te convence ninguna.' : `Has elegido la ${seleccion}.`),
          (() => {
            const b = h('button', { type: 'button', class: 'principal' }, seleccion === NINGUNA ? 'Ver de quién era cada una' : 'Descubrir de quién es');
            b.addEventListener('click', () => {
              partida = partida.elegir(temaId, seleccion!);
              guardar(CLAVE_ESTADO, partida.estado);
              pintar();
            });
            return b;
          })(),
        )
      : null;

    return h('section', { class: 'elegir' },
      cabecera(vista.tema.titulo),
      h('h1', { tabindex: '-1' }, vista.tema.pregunta),
      vista.tema.explicacion ? h('p', { class: 'explicacion' }, vista.tema.explicacion) : null,
      h('p', { class: 'ayuda' }, 'Lee y toca la que más te convenza. No pone de quién es: lo verás después.'),
      lista,
      h('p', { class: 'gris' }, `Hay ${vista.tarjetas.length} propuestas.${sinPropuesta}`),
      h('p', { class: 'gris' }, `El orden y las letras se barajan para ti. Tu barajado: #${semilla}`),
      confirmar,
    );
  };

  const vistaRevelacion = (r: Revelacion): HTMLElement => {
    const mia = r.tarjetas.find((t) => t.elegida);
    const banner = mia ? `La ${mia.letra} era de ${mia.partido.nombre}.` : 'No te convenció ninguna. Esto proponía cada uno:';
    const otras = r.tarjetas.filter((t) => !t.elegida);
    const reiniciar = h('button', { type: 'button', class: 'enlace' }, 'Borrar mi elección y volver a empezar');
    reiniciar.addEventListener('click', () => {
      borrar(CLAVE_ESTADO);
      partida = crearPartida(dataset, provincia, semilla!);
      seleccion = null;
      pintar();
    });
    return h('section', { class: 'revelacion' },
      cabecera(r.tema.titulo),
      h('p', { class: 'antetitulo' }, '¿De quién era?'),
      h('h1', { tabindex: '-1' }, banner),
      mia ? h('div', { class: 'mia' }, h('h2', {}, 'Tu elección'), tarjetaRevelada(mia, true)) : null,
      otras.length ? h('h2', {}, mia ? 'Las demás' : 'Todas las propuestas') : null,
      ...otras.map((t) => tarjetaRevelada(t, false)),
      ...r.sinPropuesta.map((p) => tarjetaSinPropuesta(p, 'Este partido no propone nada sobre esto')),
      ...r.sinVerificar.map((p) => tarjetaSinPropuesta(p, 'No pudimos verificar su propuesta')),
      r.pendientes.length ? h('p', { class: 'fila-gris' }, `⏳ Sin programa todavía: ${r.pendientes.map((p) => p.nombre).join(', ')}`) : null,
      h('p', { class: 'nota' }, 'Las propuestas están reescritas con IA en un estilo común. La cita es el texto literal del programa.'),
      reiniciar,
    );
  };

  pintar();
}

function cabecera(titulo: string): HTMLElement {
  return h('header', { class: 'cabecera' },
    h('p', {}, `Tema 1 de 5 · ${titulo}`),
    h('ol', { class: 'progreso', 'aria-hidden': 'true' }, ...[0, 1, 2, 3, 4].map((i) => h('li', { class: i === 0 ? 'actual' : '' }))),
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
  );
  const resumen = h('summary', {},
    h('span', { class: 'letra', 'aria-hidden': 'true' }, t.letra),
    h('span', { class: 'partido' }, t.partido.nombre),
    t.partido.prueba ? h('span', { class: 'etiqueta' }, 'PRUEBA') : null,
  );
  const det = h('details', { class: 'revelada' }, resumen, cuerpo);
  if (abierta) det.setAttribute('open', '');
  return det;
}
