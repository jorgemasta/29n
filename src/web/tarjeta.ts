// Revealed cards, shared by the topics and the Preguntar tab: who wrote it, the literal quotes with a
// link to the PDF page, and the grey row of a party with no card.
import type { PartidoRevelado, TarjetaDePartido } from '../juego';
import { h, type Hijo } from './dom';

/**
 * `<details>` card: summary = letter + `titulo` (+ PRUEBA / SOLO PRIVADO labels and `chips`),
 * body = the neutral text, every quote, then `extra` (source line, feasibility note, report button…).
 */
export function tarjetaRevelada(
  t: TarjetaDePartido,
  opciones: { abierta: boolean; titulo?: string; chips?: Hijo[]; extra?: Hijo[] },
): HTMLElement {
  const det = h('details', { class: 'revelada' },
    h('summary', {},
      h('span', { class: 'letra', 'aria-hidden': 'true' }, t.letra),
      h('span', { class: 'partido' }, opciones.titulo ?? t.partido.nombre),
      t.partido.prueba ? h('span', { class: 'etiqueta' }, 'PRUEBA') : null,
      t.fuente.soloPrivado ? h('span', { class: 'etiqueta' }, 'SOLO PRIVADO') : null,
      ...(opciones.chips ?? []),
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
      ...(opciones.extra ?? []),
    ),
  );
  if (opciones.abierta) det.setAttribute('open', '');
  return det;
}

/** Grey, non-interactive row: a party without a card (proposes nothing, not verified…). */
export function tarjetaGris(p: PartidoRevelado, mensaje: string): HTMLElement {
  return h('div', { class: 'sin-propuesta', role: 'note' },
    h('span', { class: 'partido' }, p.nombre),
    p.prueba ? h('span', { class: 'etiqueta' }, 'PRUEBA') : null,
    h('p', {}, mensaje),
  );
}
