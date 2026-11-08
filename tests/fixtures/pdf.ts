import { PDFDocument, StandardFonts } from 'pdf-lib';

/**
 * Builds a tiny PDF for tests. Each page is a list of lines, drawn top to bottom,
 * so a word split across two lines ("alqui-" / "ler") reproduces real hyphenation.
 * Helvetica uses WinAnsi: accents and curly quotes work, ligature glyphs don't.
 */
export async function crearPdfDePrueba(paginas: string[][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  // Fixed dates: same content → same bytes → same hash (else cache tests flake across seconds).
  doc.setCreationDate(new Date('2026-11-01T00:00:00Z'));
  doc.setModificationDate(new Date('2026-11-01T00:00:00Z'));
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  for (const lineas of paginas) {
    const pagina = doc.addPage();
    let y = 780;
    for (const linea of lineas) {
      pagina.drawText(linea, { x: 40, y, size: 10, font: fuente });
      y -= 14;
    }
  }
  return doc.save();
}
