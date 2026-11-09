// 'Aa' button: 18px base ↔ 22px large. Everything is in rem, so the whole page scales (and the system
// text size still applies on top). The preference is kept only on this phone. The <head> of every
// page applies it before the first paint (see TextSizeInit.astro), so there is no jump.
import { save, read } from './storage';

export const TEXT_SIZE_KEY = '29n:text-size';

export const largeText = (): boolean => read<{ large?: boolean }>(TEXT_SIZE_KEY)?.large === true;

function apply(large: boolean): void {
  if (large) document.documentElement.dataset.textSize = 'large';
  else delete document.documentElement.dataset.textSize;
}

/** Wires the header button (a toggle: aria-pressed). */
export function mountTextSizeButton(button: HTMLButtonElement): void {
  const render = (large: boolean) => {
    apply(large);
    button.setAttribute('aria-pressed', String(large));
  };
  render(largeText());
  button.addEventListener('click', () => {
    const large = button.getAttribute('aria-pressed') !== 'true';
    save(TEXT_SIZE_KEY, { large });
    render(large);
  });
}
