// "¿Algo no cuadra?" on each revealed card (screen 8, story 27): pick a reason, optional comment,
// then a prefilled public GitHub issue opens in a new tab. Sends only the topic, the card and the comment.
import { MAX_COMENTARIO, MOTIVOS_REPORTE, urlReportarError, type MotivoReporte } from '../transparencia';

type Hijo = Node | string | null | undefined | false;
function h(tag: string, attrs: Record<string, string> = {}, ...hijos: Hijo[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of hijos) if (c) el.append(c);
  return el;
}

let contador = 0;

export function botonReportar(datos: {
  tema: { id: string; titulo: string };
  partido: { id: string; nombre: string };
  letra: string;
  paginas: number[];
}): HTMLElement {
  const n = ++contador;
  const grupo = `reportar-${n}`;
  const comentario = h('textarea', { id: `${grupo}-texto`, maxlength: String(MAX_COMENTARIO), rows: '3' }) as HTMLTextAreaElement;
  const form = h('form', {},
    h('fieldset', {},
      h('legend', {}, '¿Qué no cuadra?'),
      ...MOTIVOS_REPORTE.map((m, i) =>
        h('label', {}, h('input', { type: 'radio', name: grupo, value: m.id, ...(i === 0 ? { checked: '' } : {}) }), m.texto)),
    ),
    h('label', { for: `${grupo}-texto`, class: 'etiqueta-buscador' }, `Cuéntanos más (opcional, ${MAX_COMENTARIO} caracteres como máximo)`),
    comentario,
    h('p', { class: 'nota' }, 'Solo enviamos el tema, la tarjeta y lo que escribas. No enviamos qué elegiste ni tu provincia.'),
    h('button', { type: 'submit', class: 'secundario' }, 'Enviar aviso ↗'),
    h('p', { class: 'nota' }, 'Se abre un aviso público en GitHub (necesitas una cuenta de GitHub). Las correcciones quedan en el historial del repositorio.'),
  ) as HTMLFormElement;
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const motivo = (form.querySelector<HTMLInputElement>(`input[name="${grupo}"]:checked`)?.value ?? 'otra') as MotivoReporte;
    window.open(urlReportarError({ ...datos, motivo, comentario: comentario.value }), '_blank', 'noopener');
  });
  return h('details', { class: 'reportar' }, h('summary', {}, '¿Algo no cuadra? Reportar error'), form);
}
