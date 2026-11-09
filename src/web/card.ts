// Revealed cards, shared by the topics and the Preguntar tab: who wrote it, the literal quotes with a
// link to the PDF page, and the grey row of a party with no card.
import type { RevealedParty, PartyCard } from '../game';
import { h, type Child } from './dom';
import { icon } from './icons';

/**
 * `<details>` card: summary = letter + `title` (+ PRUEBA / SOLO PRIVADO labels and `chips`),
 * body = the neutral text, every quote, then `extra` (source line, feasibility note, report button…).
 */
export function revealedCard(
  t: PartyCard,
  options: { open: boolean; title?: string; chips?: Child[]; extra?: Child[] },
): HTMLElement {
  const details = h('details', { class: 'revealed' },
    h('summary', {},
      h('span', { class: 'letter', 'aria-hidden': 'true' }, t.letter),
      h('span', { class: 'party' }, options.title ?? t.party.name),
      t.party.test ? h('span', { class: 'label' }, 'PRUEBA') : null,
      t.source.privateOnly ? h('span', { class: 'label' }, 'SOLO PRIVADO') : null,
      ...(options.chips ?? []),
    ),
    h('div', { class: 'body' },
      h('p', { class: 'headline' }, h('strong', {}, t.headline)),
      h('p', { class: 'detail' }, t.detail),
      ...t.quotes.map((c) =>
        h('blockquote', {},
          h('p', {}, `«${c.text}»`),
          h('footer', {},
            `— ${t.manifestoTitle}, pág. ${c.page} · `,
            h('a', { href: c.link, target: '_blank', rel: 'noopener' }, 'Abrir PDF en la página', icon('external')),
          ),
        ),
      ),
      ...(options.extra ?? []),
    ),
  );
  if (options.open) details.setAttribute('open', '');
  return details;
}

/** Grey, non-interactive row: a party without a card (proposes nothing, not verified…). */
export function greyCard(p: RevealedParty, message: string): HTMLElement {
  return h('div', { class: 'no-proposal', role: 'note' },
    h('span', { class: 'party' }, p.name),
    p.test ? h('span', { class: 'label' }, 'PRUEBA') : null,
    h('p', {}, message),
  );
}
