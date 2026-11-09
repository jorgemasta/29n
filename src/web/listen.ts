// "🔊 Escuchar todas": reads the cards in order with the browser's own voice (Web Speech API, works
// offline on most phones; nothing is sent anywhere by us). The caller highlights the card being read.

export interface Reading {
  id: string;
  text: string;
}

export interface Reader {
  readonly available: boolean;
  /** Id of the card being read, or null. */
  readonly current: string | null;
  read(readings: Reading[]): void;
  stop(): void;
}

/** `onChange(id)` fires when a card starts (id) and when the reading ends or stops (null). */
export function createReader(onChange: (id: string | null) => void): Reader {
  let current: string | null = null;
  let turn = 0; // invalidates callbacks of a stopped reading
  const voice = () => (typeof window !== 'undefined' ? window.speechSynthesis : undefined);
  const change = (id: string | null) => {
    current = id;
    onChange(id);
  };
  const reader: Reader = {
    get available() {
      return !!voice() && typeof SpeechSynthesisUtterance !== 'undefined';
    },
    get current() {
      return current;
    },
    read(readings) {
      const s = voice();
      if (!s || !readings.length) return;
      reader.stop();
      const mine = ++turn;
      readings.forEach((l, i) => {
        const u = new SpeechSynthesisUtterance(l.text);
        u.lang = 'es-ES';
        u.rate = 0.95;
        u.onstart = () => {
          if (mine === turn) change(l.id);
        };
        u.onend = u.onerror = () => {
          if (mine === turn && i === readings.length - 1) change(null);
        };
        s.speak(u);
      });
    },
    stop() {
      turn++;
      voice()?.cancel();
      if (current !== null) change(null);
    },
  };
  return reader;
}
