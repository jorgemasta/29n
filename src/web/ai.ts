// The "IA" label (ux-spec: text label, never an emoji). Every label is a link that lands on the
// matching explanation: /privacidad/#ia (AI-generated content notice) unless a closer anchor exists.
export const AI_ANCHOR = '/privacidad/#ia';

export function aiLabel(href: string = AI_ANCHOR): HTMLElement {
  const a = document.createElement('a');
  a.className = 'ai-label';
  a.href = href;
  a.title = 'Contenido generado por IA: qué significa';
  a.textContent = 'IA';
  return a;
}
