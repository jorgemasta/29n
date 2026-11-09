// localStorage access that never throws (private mode, blocked storage…): the game still works.
export function read<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v === null ? null : (JSON.parse(v) as T);
  } catch {
    return null;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sin almacenamiento: la partida sigue, pero no se recuerda */
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nada */
  }
}

/** False in private modes or with blocked site data: the game then runs in memory only. */
export function storageAvailable(): boolean {
  try {
    const test = '29n:test';
    localStorage.setItem(test, '1');
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}
