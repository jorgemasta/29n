// Keyword retrieval over a programme's pages (no AI): the pages where any keyword appears,
// ignoring case and accents, as a word prefix ("alquiler" also finds "alquileres").
// Shared by V12 (confirmed absence) and the answers to questions (src/questions).
import { normalizeTerm } from './normalize';

export interface Fragment {
  page: number;
  text: string;
}

export function candidatePages(pages: string[], words: string[]): Fragment[] {
  const patterns = words.map((p) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(normalizeTerm(p))}`, 'u'));
  return pages
    .map((text, i) => ({ page: i + 1, text }))
    .filter((p) => {
      const n = normalizeTerm(p.text);
      return patterns.some((re) => re.test(n));
    });
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
