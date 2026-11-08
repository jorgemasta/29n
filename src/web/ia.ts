// The "IA" label (ux-spec: text label, never an emoji). Every label is a link that lands on the
// matching explanation: /privacidad/#ia (AI-generated content notice) unless a closer anchor exists.
export const ANCLA_IA = '/privacidad/#ia';

export function etiquetaIA(href: string = ANCLA_IA): HTMLElement {
  const a = document.createElement('a');
  a.className = 'etiqueta-ia';
  a.href = href;
  a.title = 'Contenido generado por IA: qué significa';
  a.textContent = 'IA';
  return a;
}
