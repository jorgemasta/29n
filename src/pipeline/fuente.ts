// V7: the programme PDF comes from an official domain of that party.
import type { Partido } from '../dataset/esquema';
import type { DominiosOficiales } from '../registro/dominios';

export type ResultadoFuente = { ok: true; url: string; detalle: string } | { ok: false; url?: string; detalle: string };

export function verificarFuente(partido: Partido, dominios: DominiosOficiales): ResultadoFuente {
  if (partido.programa.estado !== 'publicado') return { ok: false, detalle: 'el programa no tiene URL de origen' };
  const url = partido.programa.url;
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return { ok: false, url, detalle: `el PDF no se sirve por HTTPS: ${url}` };
    host = u.hostname.toLowerCase();
  } catch {
    return { ok: false, url, detalle: `URL no válida: ${url}` };
  }
  const permitidos = dominios[partido.id] ?? [];
  if (permitidos.length === 0) return { ok: false, url, detalle: `no hay dominios oficiales registrados para ${partido.id}` };
  const dominio = permitidos.find((d) => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`));
  if (!dominio) return { ok: false, url, detalle: `${host} no es un dominio oficial de ${partido.id} (${permitidos.join(', ')})` };
  return { ok: true, url, detalle: `${host} pertenece al dominio oficial ${dominio}` };
}
