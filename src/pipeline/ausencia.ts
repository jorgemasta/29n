// V12 (AI barrier): before marking "proposes nothing", a second pass confirms it.
// Keyword search over the programme's pages → targeted question to the AI about the candidates.
import { z } from 'zod';
import type { AdaptadorIA } from '../ia/adaptador';
import { normalizarTermino } from './normalizar';

export const INSTRUCCIONES_AUSENCIA = `Eres un segundo lector de un programa electoral. Una primera lectura concluyó que el
programa NO propone nada sobre el tema indicado. Recibes solo los fragmentos (páginas) donde aparecen
palabras clave del tema. Léelos con atención y di si de verdad no hay ninguna propuesta concreta sobre el tema.
Si la hay, propone=true y entre 1 y 3 citas LITERALES (copiadas carácter a carácter, entre 40 y 600
caracteres) con su número de página. Si no la hay, propone=false y citas=[]. No inventes.`;

export const RespuestaAusencia = z.object({
  propone: z.boolean(),
  citas: z.array(z.object({ texto: z.string(), pagina: z.number().int().min(1) })),
});

export type ResultadoAusencia =
  | { confirmada: true; detalle: string }
  | { confirmada: false; citas: z.infer<typeof RespuestaAusencia>['citas'] };

export async function confirmarAusencia(
  ia: AdaptadorIA,
  tema: { id: string; titulo: string; pregunta: string },
  paginas: string[],
  palabras: string[],
): Promise<ResultadoAusencia> {
  const patrones = palabras.map((p) => new RegExp(`(?<![\\p{L}\\p{N}])${escapar(normalizarTermino(p))}`, 'u'));
  const candidatas = paginas
    .map((texto, i) => ({ pagina: i + 1, texto }))
    .filter((p) => {
      const n = normalizarTermino(p.texto);
      return patrones.some((re) => re.test(n));
    });
  const buscadas = `términos buscados: ${palabras.join(', ')}`;
  if (candidatas.length === 0) return { confirmada: true, detalle: `${buscadas}; ninguna página los menciona` };

  const r = await ia.completar({
    tarea: 'confirmar-ausencia',
    instrucciones: INSTRUCCIONES_AUSENCIA,
    entrada: { tema, paginas: candidatas },
    esquema: RespuestaAusencia,
  });
  if (r.propone && r.citas.length > 0) return { confirmada: false, citas: r.citas };
  return {
    confirmada: true,
    detalle: `${buscadas}; revisadas las páginas ${candidatas.map((c) => c.pagina).join(', ')} sin propuesta`,
  };
}

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
