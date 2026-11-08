// "🔊 Escuchar todas": reads the cards in order with the browser's own voice (Web Speech API, works
// offline on most phones; nothing is sent anywhere by us). The caller highlights the card being read.

export interface Lectura {
  id: string;
  texto: string;
}

export interface Lector {
  readonly disponible: boolean;
  /** Id of the card being read, or null. */
  readonly actual: string | null;
  leer(lecturas: Lectura[]): void;
  parar(): void;
}

/** `alCambiar(id)` fires when a card starts (id) and when the reading ends or stops (null). */
export function crearLector(alCambiar: (id: string | null) => void): Lector {
  let actual: string | null = null;
  let turno = 0; // invalidates callbacks of a stopped reading
  const voz = () => (typeof window !== 'undefined' ? window.speechSynthesis : undefined);
  const cambiar = (id: string | null) => {
    actual = id;
    alCambiar(id);
  };
  const lector: Lector = {
    get disponible() {
      return !!voz() && typeof SpeechSynthesisUtterance !== 'undefined';
    },
    get actual() {
      return actual;
    },
    leer(lecturas) {
      const s = voz();
      if (!s || !lecturas.length) return;
      lector.parar();
      const mio = ++turno;
      lecturas.forEach((l, i) => {
        const u = new SpeechSynthesisUtterance(l.texto);
        u.lang = 'es-ES';
        u.rate = 0.95;
        u.onstart = () => {
          if (mio === turno) cambiar(l.id);
        };
        u.onend = u.onerror = () => {
          if (mio === turno && i === lecturas.length - 1) cambiar(null);
        };
        s.speak(u);
      });
    },
    parar() {
      turno++;
      voz()?.cancel();
      if (actual !== null) cambiar(null);
    },
  };
  return lector;
}
