// "¿Algo no cuadra?" on each revealed card (screen 8, story 27): pick a reason, optional comment,
// then the Cloudflare function files a public GitHub issue (no account needed). If it is not
// available, a link to the prefilled GitHub issue is shown instead. Sends only the topic, the card
// and the comment.
import { sendFeedback } from '../client/api';
import { MAX_COMMENT, REPORT_REASONS, type ReportReason } from '../transparency';
import { h } from './dom';
import { icon } from './icons';


let counter = 0;

export function feedbackButton(data: {
  topic: { id: string; title: string };
  party: { id: string; name: string };
  letter: string;
  pages: number[];
}): HTMLElement {
  const n = ++counter;
  const group = `report-${n}`;
  const comment = h('textarea', { id: `${group}-text`, maxlength: String(MAX_COMMENT), rows: '3' }) as HTMLTextAreaElement;
  const form = h('form', {},
    h('fieldset', {},
      h('legend', {}, '¿Qué no cuadra?'),
      ...REPORT_REASONS.map((m, i) =>
        h('label', {}, h('input', { type: 'radio', name: group, value: m.id, ...(i === 0 ? { checked: '' } : {}) }), m.text)),
    ),
    h('label', { for: `${group}-text`, class: 'finder-label' }, `Cuéntanos más (opcional, ${MAX_COMMENT} caracteres como máximo)`),
    comment,
    h('p', { class: 'note' }, 'Solo enviamos el tema, la tarjeta y lo que escribas. No enviamos qué elegiste ni tu provincia.'),
    h('button', { type: 'submit', class: 'secondary' }, 'Enviar aviso'),
    h('p', { class: 'note' }, 'Se publica como aviso público en GitHub, sin tu nombre y sin cuenta. Las correcciones quedan en el historial del repositorio.'),
  ) as HTMLFormElement;
  const state = h('div', { role: 'status', 'aria-live': 'polite' });
  form.append(state);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const reason = (form.querySelector<HTMLInputElement>(`input[name="${group}"]:checked`)?.value ?? 'other') as ReportReason;
    const send = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    send.disabled = true;
    state.replaceChildren(h('p', { class: 'grey' }, 'Enviando…'));
    const r = await sendFeedback({ type: 'report-error', ...data, reason, comment: comment.value });
    send.disabled = false;
    state.replaceChildren(...feedbackResult(r));
  });
  return h('details', { class: 'report' }, h('summary', {}, '¿Algo no cuadra? Reportar error'), form);
}

/** Outcome of a notice: the public issue, or the prefilled GitHub link as fallback. */
export function feedbackResult(r: Awaited<ReturnType<typeof sendFeedback>>): HTMLElement[] {
  if (r.state === 'created')
    return [h('p', { class: 'zone-notice' }, 'Enviado, gracias. ', h('a', { href: r.url, target: '_blank', rel: 'noopener' }, 'Ver el aviso', icon('external')))];
  if (r.state === 'invalid' || r.state === 'network') return [h('p', { class: 'zone-notice' }, r.message)];
  const reason = r.state === 'unavailable' ? 'El envío directo no está disponible ahora.' : r.message;
  return [h('p', { class: 'zone-notice' }, `${reason} `, h('a', { href: r.fallbackUrl, target: '_blank', rel: 'noopener' }, 'Enviarlo en GitHub', icon('external')), ' (necesitas una cuenta de GitHub).')];
}
