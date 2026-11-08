// "Reportar error" and "Falta un partido" without a GitHub account (#11, built with #15): the
// Cloudflare function POST /api/avisar files the public issue with the project's token. Without a
// token (or if GitHub fails) the page falls back to the prefilled GitHub link, as before.
//
//   crearAvisos({ crearIssue?, almacen? }).enviar(peticion, sesion) → creado | no_disponible | invalido | limite | error
//
// Same no-logs policy as the free question: only what the voter typed in the form becomes the
// (public) issue; the session id is only kept hashed, as a counter that expires. No IP is received.
import { z } from 'zod';
import type { Almacen } from '../pregunta/libre';
import { issueFaltaPartido, issueReportarError, MAX_COMENTARIO, MOTIVOS_REPORTE, urlFaltaPartido, urlReportarError, type ContenidoIssue } from './index';

/** Notices per session and day. */
export const LIMITE_AVISOS = 5;
const TTL_SESION = 24 * 3600;

const texto = (max: number) => z.string().trim().max(max);
const enlaceSeguro = z
  .string()
  .trim()
  .max(300)
  .refine((u) => u === '' || /^https:\/\/[^\s]+$/.test(u), 'enlace no válido');

export const PeticionAviso = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('reporte'),
    tema: z.object({ id: texto(80).min(1), titulo: texto(150).min(1) }),
    partido: z.object({ id: texto(80).min(1), nombre: texto(150).min(1) }),
    letra: z.string().regex(/^[A-Z]$/),
    paginas: z.array(z.number().int().min(1).max(5000)).max(20),
    motivo: z.enum(MOTIVOS_REPORTE.map((m) => m.id) as [string, ...string[]]),
    comentario: z.string().max(MAX_COMENTARIO).optional(),
  }),
  z.object({
    tipo: z.literal('falta-partido'),
    partido: texto(150).min(1),
    provincias: texto(300).optional(),
    motivo: texto(1000).optional(),
    enlace: enlaceSeguro.optional(),
  }),
]);
export type PeticionAviso = z.infer<typeof PeticionAviso>;

export type ResultadoAviso =
  | { estado: 'creado'; url: string }
  | { estado: 'no_disponible'; alternativa: string }
  | { estado: 'invalido'; mensaje: string }
  | { estado: 'limite'; mensaje: string; alternativa: string }
  | { estado: 'error'; mensaje: string; alternativa: string };

export interface PuertosAvisos {
  /** Files a public issue; absent when no token is configured. */
  crearIssue?: (issue: { titulo: string; cuerpo: string; etiquetas: string[] }) => Promise<{ url: string }>;
  almacen?: Almacen;
}

/** "@usuario" would notify a GitHub user: break the mention with a zero-width space. */
const sinMenciones = (t: string) => t.replace(/@(?=[\w-])/g, '@​');

async function sha256(t: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function crearAvisos(puertos: PuertosAvisos) {
  return {
    async enviar(peticion: unknown, sesion: string): Promise<ResultadoAviso> {
      const p = PeticionAviso.safeParse(peticion);
      if (!p.success) return { estado: 'invalido', mensaje: 'Faltan datos o no son válidos. Revisa el formulario.' };
      const d = p.data;
      const alternativa = d.tipo === 'reporte' ? urlReportarError(d as Parameters<typeof urlReportarError>[0]) : urlFaltaPartido(d);
      if (!puertos.crearIssue) return { estado: 'no_disponible', alternativa };

      const claveSesion = puertos.almacen ? `aviso:${await sha256(`29n-aviso:${sesion}`)}` : null;
      const usados = claveSesion ? Number((await puertos.almacen!.get(claveSesion)) ?? 0) || 0 : 0;
      if (usados >= LIMITE_AVISOS)
        return { estado: 'limite', mensaje: `Has enviado ${LIMITE_AVISOS} avisos hoy. Si necesitas enviar más, puedes hacerlo en GitHub.`, alternativa };

      const issue: ContenidoIssue = d.tipo === 'reporte' ? issueReportarError(d as Parameters<typeof issueReportarError>[0]) : issueFaltaPartido(d);
      try {
        const { url } = await puertos.crearIssue({
          titulo: sinMenciones(issue.titulo),
          cuerpo: `${sinMenciones(issue.cuerpo)}\n\n---\n_Enviado desde la web, sin cuenta de GitHub._`,
          etiquetas: [issue.etiqueta],
        });
        if (claveSesion) await puertos.almacen!.put(claveSesion, String(usados + 1), { expirationTtl: TTL_SESION });
        return { estado: 'creado', url };
      } catch {
        return { estado: 'error', mensaje: 'No hemos podido enviarlo. Puedes hacerlo en GitHub.', alternativa };
      }
    },
  };
}
