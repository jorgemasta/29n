// V8: institutional domains a viability "por qué" may cite. Versioned in the repo; a source
// on any other domain is removed. Subdomains are allowed (www.ine.es, sede.agenciatributaria.gob.es).
export const INSTITUTIONAL_DOMAINS = [
  'airef.es', // AIReF
  'ine.es', // INE
  'bde.es', // Banco de España
  'boe.es', // BOE
  'congreso.es',
  'senado.es',
  'lamoncloa.gob.es',
  'gob.es', // ministries and state agencies (hacienda.gob.es, mivau.gob.es, seg-social.es below…)
  'seg-social.es',
  'sepe.es',
  'agenciatributaria.es',
  'tribunalconstitucional.es',
  'poderjudicial.es',
  'cis.es',
  'istac.es', // ISTAC (Canarias)
  'gobiernodecanarias.org',
  'ec.europa.eu', // Comisión Europea and Eurostat (ec.europa.eu/eurostat)
  'europa.eu', // EUR-Lex, Parlamento Europeo, BCE (ecb.europa.eu)
  'oecd.org', // OCDE
  'imf.org',
  'who.int',
] as const;

/** True if the URL is https and its host is (a subdomain of) an allowed institutional domain. */
export function isInstitutionalDomain(url: string, domains: readonly string[] = INSTITUTIONAL_DOMAINS): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}
