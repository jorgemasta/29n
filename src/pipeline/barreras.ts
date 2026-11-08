// Deterministic verification barriers (no AI).
import type { Cita } from '../dataset/esquema';
import type { TerminosIdentificativos } from '../registro/terminos';
import { normalizarCita, normalizarTermino } from './normalizar';

export const LONGITUD_CITA = { min: 40, max: 600 };

export type ResultadoCita =
  | { ok: true; cita: Cita; paginaCorregida: boolean }
  | { ok: false; motivo: string };

/**
 * V1 (the quote exists, 40–600 chars) + V2 (correct page: fixed automatically).
 * Returns the quote as the AI gave it, with the page where it really is.
 */
export function verificarCita(cita: Cita, paginas: string[]): ResultadoCita {
  const buscada = normalizarCita(cita.texto);
  if (buscada.length < LONGITUD_CITA.min || buscada.length > LONGITUD_CITA.max)
    return { ok: false, motivo: `la cita tiene ${buscada.length} caracteres (debe tener entre ${LONGITUD_CITA.min} y ${LONGITUD_CITA.max})` };
  const normalizadas = paginas.map(normalizarCita);
  if (normalizadas[cita.pagina - 1]?.includes(buscada)) return { ok: true, cita, paginaCorregida: false };
  const i = normalizadas.findIndex((p) => p.includes(buscada));
  if (i === -1) return { ok: false, motivo: `la cita no aparece en el PDF: «${cita.texto.slice(0, 80)}…»` };
  return { ok: true, cita: { ...cita, pagina: i + 1 }, paginaCorregida: true };
}

/** V3: identifying terms of ANY party found in the text (case/accent-insensitive, whole words). */
export function buscarMarcas(texto: string, terminos: TerminosIdentificativos): string[] {
  const t = normalizarTermino(texto);
  const encontradas = new Set<string>();
  for (const lista of Object.values(terminos)) {
    for (const termino of lista) {
      const n = normalizarTermino(termino).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(?<![\\p{L}\\p{N}])${n}(?![\\p{L}\\p{N}])`, 'u').test(t)) encontradas.add(termino);
    }
  }
  return [...encontradas];
}
