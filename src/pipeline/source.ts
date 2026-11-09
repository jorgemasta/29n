// V7: the programme PDF comes from an official domain of that party.
import type { Party } from '../dataset/schema';
import type { OfficialDomains } from '../registry/domains';

export type SourceResult = { ok: true; url: string; detail: string } | { ok: false; url?: string; detail: string };

export function verifySource(party: Party, domains: OfficialDomains): SourceResult {
  if (party.manifesto.state !== 'published') return { ok: false, detail: 'el programa no tiene URL de origen' };
  const url = party.manifesto.url;
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return { ok: false, url, detail: `el PDF no se sirve por HTTPS: ${url}` };
    host = u.hostname.toLowerCase();
  } catch {
    return { ok: false, url, detail: `URL no válida: ${url}` };
  }
  const allowed = domains[party.id] ?? [];
  if (allowed.length === 0) return { ok: false, url, detail: `no hay dominios oficiales registrados para ${party.id}` };
  const domain = allowed.find((d) => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`));
  if (!domain) return { ok: false, url, detail: `${host} no es un dominio oficial de ${party.id} (${allowed.join(', ')})` };
  return { ok: true, url, detail: `${host} pertenece al dominio oficial ${domain}` };
}
