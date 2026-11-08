// Tiny DOM helpers shared by every client view (no framework).

export type Hijo = Node | string | null | undefined | false;

/** `h('p', { class: 'x' }, 'text', child)`: an element with attributes and children (falsy ones skipped). */
export function h(tag: string, attrs: Record<string, string> = {}, ...hijos: Hijo[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of hijos) if (c) el.append(c);
  return el;
}

export function boton(texto: string, clase: string, alPulsar: () => void, attrs: Record<string, string> = {}): HTMLElement {
  const b = h('button', { type: 'button', class: clase, ...attrs }, texto);
  b.addEventListener('click', alPulsar);
  return b;
}
