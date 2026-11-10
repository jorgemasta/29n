// Bottom sheet ("hoja", the pattern validated in docs/prototypes/choose-pattern-round-2/?v=1): a
// native modal <dialog> that slides up from the bottom. The browser gives the focus trap, Escape and
// the backdrop; tapping the backdrop closes it too. With reduced motion it fades instead (CSS).
import { h, type Child } from './dom';

/** Close animation length; the CSS transition is the same (shorter with reduced motion). */
const CLOSE_MS = 340;

export interface Sheet {
  /** Slides the sheet down and removes it; `onClose` runs once it is gone. */
  close(): void;
}

export function openSheet(options: { title: string; content: Child[]; onClose?: () => void }): Sheet {
  const heading = h('h2', { id: 'sheet-title', tabindex: '-1' }, options.title);
  const dialog = h('dialog', { class: 'sheet', 'aria-labelledby': 'sheet-title' },
    h('div', { class: 'sheet-body' }, h('div', { class: 'sheet-handle', 'aria-hidden': 'true' }), heading, ...options.content),
  ) as HTMLDialogElement;
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    dialog.classList.remove('open');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => {
      dialog.close();
      dialog.remove();
      options.onClose?.();
      // A screen rendered while the modal sheet was open could not take the focus (the page behind a
      // modal is inert): give it to the new screen's headline now.
      const active = document.activeElement;
      if (!active || active === document.body || !active.isConnected) document.querySelector<HTMLElement>('main h1')?.focus();
    }, reduced ? 160 : CLOSE_MS);
  };
  // A click on the dialog itself (not its body) is a click on the backdrop.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  document.body.append(dialog);
  dialog.showModal();
  heading.focus();
  // Two frames so the closed position is painted before sliding up.
  requestAnimationFrame(() => requestAnimationFrame(() => dialog.classList.add('open')));
  return { close };
}
