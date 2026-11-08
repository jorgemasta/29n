// Text normalisation shared by the deterministic barriers.

/**
 * V1 normalisation: Unicode NFKC (also unfolds ligatures like "ﬁ"), unified quotes and dashes,
 * hyphens between letters removed (joins "alqui-\nler" and tolerates "socio-económico" vs
 * "socioeconómico"), whitespace collapsed. Case and accents are kept: the quote must be literal.
 */
export function normalizarCita(texto: string): string {
  return texto
    .normalize('NFKC')
    .replace(/[“”„‟«»″"]/g, '"')
    .replace(/[‘’‚‛′`´']/g, "'")
    .replace(/[­]/g, '') // soft hyphen
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/(\p{L})-\s*(\p{L})/gu, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** V3 normalisation: lowercase, no accents, whitespace collapsed. */
export function normalizarTermino(texto: string): string {
  return texto
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
