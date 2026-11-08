// "¿Algo no cuadra?" on each revealed card (screen 8, story 27): pick a reason, optional comment,
// then the Cloudflare function files a public GitHub issue (no account needed). If it is not
// available, a link to the prefilled GitHub issue is shown instead. Sends only the topic, the card
// and the comment.
import { enviarAviso } from '../cliente/api';
import { MAX_COMENTARIO, MOTIVOS_REPORTE, type MotivoReporte } from '../transparencia';

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
    h('button', { type: 'submit', class: 'secundario' }, 'Enviar aviso'),
    h('p', { class: 'nota' }, 'Se publica como aviso público en GitHub, sin tu nombre y sin cuenta. Las correcciones quedan en el historial del repositorio.'),
  ) as HTMLFormElement;
  const estado = h('div', { role: 'status', 'aria-live': 'polite' });
  form.append(estado);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const motivo = (form.querySelector<HTMLInputElement>(`input[name="${grupo}"]:checked`)?.value ?? 'otra') as MotivoReporte;
    const enviar = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    enviar.disabled = true;
    estado.replaceChildren(h('p', { class: 'gris' }, 'Enviando…'));
    const r = await enviarAviso({ tipo: 'reporte', ...datos, motivo, comentario: comentario.value });
    enviar.disabled = false;
    estado.replaceChildren(...resultadoAviso(r));
  });
  return h('details', { class: 'reportar' }, h('summary', {}, '¿Algo no cuadra? Reportar error'), form);
}

/** Outcome of a notice: the public issue, or the prefilled GitHub link as fallback. */
export function resultadoAviso(r: Awaited<ReturnType<typeof enviarAviso>>): HTMLElement[] {
  if (r.estado === 'creado')
    return [h('p', { class: 'aviso-zona' }, 'Enviado, gracias. ', h('a', { href: r.url, target: '_blank', rel: 'noopener' }, 'Ver el aviso ↗'))];
  if (r.estado === 'invalido' || r.estado === 'red') return [h('p', { class: 'aviso-zona' }, r.mensaje)];
  const motivo = r.estado === 'no_disponible' ? 'El envío directo no está disponible ahora.' : r.mensaje;
  return [h('p', { class: 'aviso-zona' }, `${motivo} `, h('a', { href: r.alternativa, target: '_blank', rel: 'noopener' }, 'Enviarlo en GitHub ↗'), ' (necesitas una cuenta de GitHub).')];
}
