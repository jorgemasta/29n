// Keyword retrieval over a programme's pages (no AI): the pages where any keyword appears,
// ignoring case and accents, as a word prefix ("alquiler" also finds "alquileres").
// Shared by V12 (confirmed absence) and the answers to questions (src/pregunta).
import { normalizarTermino } from './normalizar';

export interface Fragmento {
  pagina: number;
  texto: string;
}

export function paginasCandidatas(paginas: string[], palabras: string[]): Fragmento[] {
  const patrones = palabras.map((p) => new RegExp(`(?<![\\p{L}\\p{N}])${escapar(normalizarTermino(p))}`, 'u'));
  return paginas
    .map((texto, i) => ({ pagina: i + 1, texto }))
    .filter((p) => {
      const n = normalizarTermino(p.texto);
      return patrones.some((re) => re.test(n));
    });
}

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
