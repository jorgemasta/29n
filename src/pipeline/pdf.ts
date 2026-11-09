import { createHash } from 'node:crypto';
import { extractText, getDocumentProxy } from 'unpdf';

export function hashPdf(pdf: Uint8Array): string {
  return createHash('sha256').update(pdf).digest('hex');
}

/** Text of each page, in order (index 0 = page 1). */
export async function extractPages(pdf: Uint8Array): Promise<string[]> {
  // pdf.js may detach the buffer it is given: pass a copy.
  const document = await getDocumentProxy(new Uint8Array(pdf));
  const { text } = await extractText(document, { mergePages: false });
  return text;
}
