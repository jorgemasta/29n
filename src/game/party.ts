// How the engine names a party and links a quote once it is revealed (v1 topics and v2 themes alike).
import type { Party } from '../dataset/schema';

export interface RevealedParty {
  id: string;
  name: string;
  acronym: string;
  test: boolean;
}

/** A literal quote with a link to its page in the party's manifesto PDF. */
export interface LinkedQuote {
  text: string;
  page: number;
  link: string;
}

export function revealParty(p: Party): RevealedParty {
  return { id: p.id, name: p.name, acronym: p.acronym, test: p.test === true };
}

export function linkQuote(p: Party, quote: { text: string; page: number }): LinkedQuote {
  const url = p.manifesto.state === 'published' ? p.manifesto.url : '';
  return { ...quote, link: `${url}#page=${quote.page}` };
}

export const byName = (a: RevealedParty, b: RevealedParty) => a.name.localeCompare(b.name, 'es');
