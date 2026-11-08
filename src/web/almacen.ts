// localStorage access that never throws (private mode, blocked storage…): the game still works.
export function leer<T>(clave: string): T | null {
  try {
    const v = localStorage.getItem(clave);
    return v === null ? null : (JSON.parse(v) as T);
  } catch {
    return null;
  }
}

export function guardar(clave: string, valor: unknown): void {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* sin almacenamiento: la partida sigue, pero no se recuerda */
  }
}

export function borrar(clave: string): void {
  try {
    localStorage.removeItem(clave);
  } catch {
    /* nada */
  }
}

/** False in private modes or with blocked site data: the game then runs in memory only. */
export function almacenamientoDisponible(): boolean {
  try {
    const prueba = '29n:prueba';
    localStorage.setItem(prueba, '1');
    localStorage.removeItem(prueba);
    return true;
  } catch {
    return false;
  }
}
