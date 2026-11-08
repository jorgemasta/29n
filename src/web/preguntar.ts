// "Preguntar" tab (docs/ux-spec.md §12): 7 suggested questions as row buttons, anonymous answers
// with "Ver de quién es cada una", then the reveal with quote and PDF (no feasibility note).
// The free text box is shown disabled ("Muy pronto") until the live endpoint opens (#15).
// All logic is in the game engine (Partida.pregunta / revelarPregunta); this only renders.
import type { Partida, PartidoRevelado, RevelacionPregunta, TarjetaPreguntaRevelada, VistaPregunta } from '../juego';
import { chipProvincia } from './provincia';

type Hijo = Node | string | null | undefined | false;
function h(tag: string, attrs: Record<string, string> = {}, ...hijos: Hijo[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of hijos) if (c) el.append(c);
  return el;
}

const AVISO_IA = () =>
  h('p', { class: 'nota' }, h('span', { class: 'etiqueta-ia' }, 'IA'), ' Respuestas escritas por IA a partir de los programas. Comprueba la cita.');

const cabecera = (partida: Partida, volver: { href: string; texto: string }) =>
  h('header', { class: 'cabecera' },
    h('div', { class: 'cabecera-fila' }, h('a', { href: volver.href, class: 'volver' }, volver.texto), chipProvincia(partida.provincia)));

/** List of suggested questions plus the (disabled) free text box. */
export function vistaPreguntas(partida: Partida): HTMLElement {
  const preguntas = partida.preguntas();
  return h('section', { class: 'preguntar' },
    cabecera(partida, { href: '#temas', texto: '← Temas' }),
    h('h1', { tabindex: '-1' }, 'Pregunta a los programas'),
    h('p', {}, 'Respondemos solo con lo que está escrito en los programas, siempre con cita. Si no lo dicen, te lo decimos.'),
    preguntas.length
      ? h('ul', { class: 'filas', role: 'list' },
          ...preguntas.map((p) => h('li', {}, h('a', { href: `#preguntar/${encodeURIComponent(p.id)}`, class: 'fila-tema fila-pregunta' },
            h('span', { class: 'nombre' }, p.texto), h('span', { class: 'estado', 'aria-hidden': 'true' }, '→')))))
      : h('p', { class: 'gris' }, 'Todavía no hay preguntas respondidas.'),
    h('form', { class: 'pregunta-libre', 'aria-describedby': 'muy-pronto' },
      h('label', { for: 'texto-pregunta', class: 'etiqueta-buscador' }, 'O escribe tu pregunta'),
      h('textarea', { id: 'texto-pregunta', class: 'buscador', rows: '2', disabled: '', 'aria-disabled': 'true' }),
      h('p', { id: 'muy-pronto', class: 'aviso-zona', role: 'note' }, h('strong', {}, 'Muy pronto. '), 'De momento, elige una de las preguntas de arriba.'),
      h('button', { type: 'submit', class: 'secundario', disabled: '' }, 'Preguntar'),
    ),
    AVISO_IA(),
  );
}

/** One question: anonymous answers first; "Ver de quién es cada una" reveals them in place. */
export function vistaRespuesta(partida: Partida, preguntaId: string): HTMLElement {
  const seccion = h('section', { class: 'respuesta' });
  const pintar = (revelada: boolean) => {
    const vista = partida.pregunta(preguntaId);
    const hijos: Hijo[] = [
      cabecera(partida, { href: '#preguntar', texto: '← Preguntas' }),
      h('p', { class: 'antetitulo' }, 'Pregunta a los programas'),
      h('h1', { tabindex: '-1' }, vista.pregunta.texto),
      ...(revelada || vista.ninguno ? revelacion(partida.revelarPregunta(preguntaId)) : aCiegas(vista)),
      h('p', { class: 'nota' }, 'Esto no cuenta para tu resultado.'),
      AVISO_IA(),
      h('div', { class: 'barra-fija' },
        revelada || vista.ninguno ? null : boton('Ver de quién es cada una', 'principal', () => pintar(true)),
        boton('Otra pregunta', 'secundario', () => {
          location.hash = 'preguntar';
        }),
      ),
    ];
    seccion.replaceChildren(...hijos.filter((x): x is Node | string => !!x));
    seccion.querySelector<HTMLElement>('h1')?.focus();
  };
  pintar(false);
  return seccion;
}

function aCiegas(v: VistaPregunta): Hijo[] {
  const noMencionan = v.noMencionan
    ? ` ${v.noMencionan} ${v.noMencionan === 1 ? 'programa no lo menciona' : 'programas no lo mencionan'} (los verás al descubrir).`
    : '';
  return [
    h('p', { class: 'ayuda' }, 'No pone de quién es cada respuesta: lo verás después.'),
    h('ol', { class: 'tarjetas', role: 'list' },
      ...v.tarjetas.map((t) => h('li', {}, h('div', { class: 'tarjeta tarjeta-respuesta' },
        h('span', { class: 'letra', 'aria-hidden': 'true' }, t.letra),
        h('span', { class: 'texto' },
          h('span', { class: 'visually-hidden' }, `Respuesta ${t.letra}: `),
          h('strong', { class: 'titular' }, t.titular),
          h('span', { class: 'detalle' }, t.detalle),
          h('span', { class: 'gris' }, 'Cita disponible al descubrir'),
        ))))),
    h('p', { class: 'gris' }, `${v.tarjetas.length === 1 ? 'Hay 1 respuesta' : `Hay ${v.tarjetas.length} respuestas`}.${noMencionan}`),
  ];
}

function revelacion(r: RevelacionPregunta): Hijo[] {
  return [
    r.ninguno ? h('p', { class: 'aviso-zona', role: 'status' }, h('strong', {}, 'Ningún programa habla de esto.')) : null,
    ...r.tarjetas.map(tarjetaRevelada),
    ...r.noMencionan.map((p) => filaGris(p, `El programa de ${p.nombre} no lo menciona`)),
    ...r.sinVerificar.map((p) => filaGris(p, 'No pudimos verificar su respuesta')),
    r.pendientes.length ? h('p', { class: 'fila-gris' }, `⏳ Sin programa todavía: ${r.pendientes.map((p) => p.nombre).join(', ')}`) : null,
  ];
}

function filaGris(p: PartidoRevelado, mensaje: string): HTMLElement {
  return h('div', { class: 'sin-propuesta', role: 'note' },
    h('span', { class: 'partido' }, p.nombre),
    p.prueba ? h('span', { class: 'etiqueta' }, 'PRUEBA') : null,
    h('p', {}, mensaje),
  );
}

function tarjetaRevelada(t: TarjetaPreguntaRevelada): HTMLElement {
  const det = h('details', { class: 'revelada', open: '' },
    h('summary', {},
      h('span', { class: 'letra', 'aria-hidden': 'true' }, t.letra),
      h('span', { class: 'partido' }, `La ${t.letra} es de ${t.partido.nombre}`),
      t.partido.prueba ? h('span', { class: 'etiqueta' }, 'PRUEBA') : null,
      t.fuente.soloPrivado ? h('span', { class: 'etiqueta' }, 'SOLO PRIVADO') : null,
    ),
    h('div', { class: 'cuerpo' },
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
    ),
  );
  return det;
}

function boton(texto: string, clase: string, alPulsar: () => void): HTMLElement {
  const b = h('button', { type: 'button', class: clase }, texto);
  b.addEventListener('click', alPulsar);
  return b;
}
