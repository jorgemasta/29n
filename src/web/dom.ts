// Tiny DOM helpers shared by every client view (no framework).

export type Child = Node | string | null | undefined | false;

/** `h('p', { class: 'x' }, 'text', child)`: an element with attributes and children (falsy ones skipped). */
export function h(tag: string, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) if (c) el.append(c);
  return el;
}

export function button(text: string, cls: string, onPress: () => void, attrs: Record<string, string> = {}): HTMLElement {
  const b = h('button', { type: 'button', class: cls, ...attrs }, text);
  b.addEventListener('click', onPress);
  return b;
}
