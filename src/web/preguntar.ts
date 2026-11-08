// "Preguntar" tab (docs/ux-spec.md §12): 7 suggested questions as row buttons, anonymous answers
// with "Ver de quién es cada una", then the reveal with quote and PDF (no feasibility note).
// The free text box (#15) is live only when built with PUBLIC_PREGUNTA_LIBRE=1 (and the function's
// own flag is on); otherwise it is shown disabled ("Muy pronto"). Live answers are anonymised by the
// same engine calls (Partida.pregunta / revelarPregunta with the answers); this only renders.
import { PREGUNTA_LIBRE_ACTIVA, preguntarEnDirecto, type RespuestaPreguntaLibre, type SinRed } from '../cliente/api';
import type { Partida, PartidoRevelado, PreguntaVista, RevelacionPregunta, TarjetaPreguntaRevelada, VistaPregunta } from '../juego';
import type { RespuestaPregunta } from '../dataset/esquema';
import { LIMITE_SESION, MAX_CARACTERES, MIN_CARACTERES } from '../pregunta/limites';
import { chipProvincia } from './provincia';

/** Questions left this session, from the last answer of the function (null = not asked yet). */
let quedan: number | null = null;

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
    PREGUNTA_LIBRE_ACTIVA ? formularioLibre(partida) : formularioCerrado(),
    AVISO_IA(),
  );
}

function formularioCerrado(): HTMLElement {
  return h('form', { class: 'pregunta-libre', 'aria-describedby': 'muy-pronto' },
    h('label', { for: 'texto-pregunta', class: 'etiqueta-buscador' }, 'O escribe tu pregunta'),
    h('textarea', { id: 'texto-pregunta', class: 'buscador', rows: '2', disabled: '', 'aria-disabled': 'true' }),
    h('p', { id: 'muy-pronto', class: 'aviso-zona', role: 'note' }, h('strong', {}, 'Muy pronto. '), 'De momento, elige una de las preguntas de arriba.'),
    h('button', { type: 'submit', class: 'secundario', disabled: '' }, 'Preguntar'),
  );
}

/** Live free question: text box, counter, loading state and every non-answer outcome. */
function formularioLibre(partida: Partida): HTMLElement {
  const programas = partida.partidos().conPrograma.length;
  const texto = h('textarea', {
    id: 'texto-pregunta', class: 'buscador', rows: '2', minlength: String(MIN_CARACTERES), maxlength: String(MAX_CARACTERES), required: '',
    'aria-describedby': 'contador-preguntas privacidad-pregunta',
  }) as HTMLTextAreaElement;
  const enviar = h('button', { type: 'submit', class: 'principal' }, 'Preguntar') as HTMLButtonElement;
  const estado = h('div', { class: 'estado-pregunta', role: 'status', 'aria-live': 'polite' });
  const contador = h('p', { id: 'contador-preguntas', class: 'gris' },
    quedan === null ? `Hasta ${LIMITE_SESION} preguntas por sesión.` : quedan === 1 ? 'Te queda 1 pregunta.' : `Te quedan ${quedan} preguntas.`);
  const form = h('form', { class: 'pregunta-libre' },
    h('label', { for: 'texto-pregunta', class: 'etiqueta-buscador' }, 'O escribe tu pregunta'),
    texto,
    contador,
    enviar,
    h('p', { id: 'privacidad-pregunta', class: 'nota' },
      'Tu pregunta se envía a Anthropic (Claude) sin datos tuyos para buscar la respuesta en los programas. No guardamos registros. ',
      h('a', { href: '/metodologia/#privacidad' }, 'Más detalles')),
    estado,
  ) as HTMLFormElement;

  const preguntar = async (pregunta: string) => {
    enviar.disabled = true;
    texto.disabled = true;
    estado.replaceChildren(
      h('p', {}, `Buscando en ${programas} ${programas === 1 ? 'programa' : 'programas'}…`),
      ...[1, 2, 3].map(() => h('div', { class: 'tarjeta esqueleto', 'aria-hidden': 'true' })),
    );
    const r = await preguntarEnDirecto(pregunta);
    enviar.disabled = false;
    texto.disabled = false;
    if (r.estado === 'ok') {
      quedan = r.quedan;
      form.closest('section')?.replaceWith(vistaRespuesta(partida, r.pregunta, { respuestas: r.respuestas, alVolver: (s) => s.replaceWith(vistaPreguntas(partida)) }));
      return;
    }
    estado.replaceChildren(...mensajeSinRespuesta(r, preguntar).filter((x): x is Node | string => !!x));
    if (r.estado === 'limite') {
      quedan = 0;
      contador.textContent = 'Te quedan 0 preguntas.';
    }
  };
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const q = texto.value.trim();
    if (q.length < MIN_CARACTERES) {
      estado.replaceChildren(h('p', { class: 'aviso-zona' }, `Escribe una pregunta un poco más larga (al menos ${MIN_CARACTERES} caracteres).`));
      return;
    }
    void preguntar(q);
  });
  return form;
}

function mensajeSinRespuesta(r: Exclude<RespuestaPreguntaLibre, { estado: 'ok' }> | SinRed, preguntar: (q: string) => void): Hijo[] {
  const frecuentes = 'frecuentes' in r && r.frecuentes.length
    ? h('div', {},
        h('p', {}, 'Preguntas frecuentes, ya respondidas:'),
        h('ul', { class: 'filas', role: 'list' },
          ...r.frecuentes.map((q) => {
            const b = h('button', { type: 'button', class: 'fila-tema fila-pregunta' }, h('span', { class: 'nombre' }, q), h('span', { class: 'estado', 'aria-hidden': 'true' }, '→'));
            b.addEventListener('click', () => preguntar(q));
            return h('li', {}, b);
          })))
    : null;
  return [h('p', { class: 'aviso-zona' }, r.mensaje), frecuentes];
}

interface OpcionesRespuesta {
  /** Live answers (free question); absent = the dataset's precomputed ones. */
  respuestas?: RespuestaPregunta[];
  /** "Otra pregunta" for an in-memory answer (default: back to #preguntar). */
  alVolver?: (seccion: HTMLElement) => void;
}

/** One question: anonymous answers first; "Ver de quién es cada una" reveals them in place. */
export function vistaRespuesta(partida: Partida, preguntaId: string | PreguntaVista, opciones: OpcionesRespuesta = {}): HTMLElement {
  const seccion = h('section', { class: 'respuesta' });
  const { respuestas } = opciones;
  const pintar = (revelada: boolean) => {
    const vista = partida.pregunta(preguntaId, respuestas);
    const hijos: Hijo[] = [
      cabecera(partida, { href: '#preguntar', texto: '← Preguntas' }),
      h('p', { class: 'antetitulo' }, 'Pregunta a los programas'),
      h('h1', { tabindex: '-1' }, vista.pregunta.texto),
      ...(revelada || vista.ninguno ? revelacion(partida.revelarPregunta(preguntaId, respuestas)) : aCiegas(vista)),
      h('p', { class: 'nota' }, 'Esto no cuenta para tu resultado.'),
      AVISO_IA(),
      h('div', { class: 'barra-fija' },
        revelada || vista.ninguno ? null : boton('Ver de quién es cada una', 'principal', () => pintar(true)),
        boton('Otra pregunta', 'secundario', () => {
          if (opciones.alVolver) opciones.alVolver(seccion);
          else location.hash = 'preguntar';
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
