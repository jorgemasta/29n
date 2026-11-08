// 'Aa' button: 18px base ↔ 22px large. Everything is in rem, so the whole page scales (and the system
// text size still applies on top). The preference is kept only on this phone. The <head> of every
// page applies it before the first paint (see LetraInicial.astro), so there is no jump.
import { guardar, leer } from './almacen';

export const CLAVE_LETRA = '29n:letra';

export const letraGrande = (): boolean => leer<{ grande?: boolean }>(CLAVE_LETRA)?.grande === true;

function aplicar(grande: boolean): void {
  if (grande) document.documentElement.dataset.letra = 'grande';
  else delete document.documentElement.dataset.letra;
}

/** Wires the header button (a toggle: aria-pressed). */
export function montarBotonLetra(boton: HTMLButtonElement): void {
  const pintar = (grande: boolean) => {
    aplicar(grande);
    boton.setAttribute('aria-pressed', String(grande));
  };
  pintar(letraGrande());
  boton.addEventListener('click', () => {
    const grande = boton.getAttribute('aria-pressed') !== 'true';
    guardar(CLAVE_LETRA, { grande });
    pintar(grande);
  });
}
