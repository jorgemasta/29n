// Merging one processed programme into the published dataset (shared by `npm run procesar` and
// the watcher). Real data replaces simulated data entirely; the party's previous posturas and
// report are replaced by the new ones, the other parties are kept as they were.
import { construirDataset, validarDataset } from '../dataset';
import type { Dataset, Partido, Pregunta, Tema } from '../dataset/esquema';
import { PREGUNTAS_SUGERIDAS } from '../registro/preguntas';
import type { OpcionesProceso, ResultadoProceso } from './index';
import { contarPalabras } from './texto';

/** What procesarPrograma needs from the current dataset: V5 lengths and V11's published posturas. */
export function contextoPublicado(anterior: Dataset, partido: string): Pick<OpcionesProceso, 'longitudesTema' | 'publicado'> {
  const previos = anterior.origen === 'real' ? anterior : { partidos: [], posturas: [] };
  const longitudesTema: Record<string, number[]> = {};
  for (const p of previos.posturas)
    if (p.estado === 'propone' && p.partido !== partido) (longitudesTema[p.tema] ??= []).push(contarPalabras(p.texto));
  return { longitudesTema, publicado: { partidos: previos.partidos, posturas: previos.posturas } };
}

export type Fusion = { ok: true; dataset: Dataset } | { ok: false; motivo: string };

/** New dataset with the programme published, or the V9 reason it cannot be. */
export function fusionarPrograma(
  anterior: Dataset,
  partido: Partido,
  resultado: ResultadoProceso,
  args: {
    temas: Tema[];
    /** Suggested questions (default: registro/preguntas). */
    preguntas?: Pregunta[];
    generado: string;
    fecha?: string;
    /** Party registry (src/registro/partidos.ts): when given, every registered party without a
     * processed programme is listed as "⏳ programa pendiente", scope always comes from the
     * registry (criterion data may have changed) and parties no longer registered are dropped. */
    registro?: Record<string, Omit<Partido, 'programa'>>;
  },
): Fusion {
  if (!resultado.publicable) return { ok: false, motivo: resultado.informe.motivo ?? 'no publicable' };
  if (partido.programa.estado !== 'publicado') return { ok: false, motivo: 'el partido no tiene programa' };
  const previos = anterior.origen === 'real' ? anterior : { partidos: [], posturas: [], informes: [], respuestas: [] };
  const conHash: Partido = {
    ...partido,
    programa: { ...partido.programa, hashPdf: resultado.informe.hashPdf, ...(args.fecha ? { fecha: args.fecha } : {}) },
  };
  const { registro } = args;
  const procesados = [...previos.partidos.filter((p) => p.id !== partido.id), conHash];
  const partidos: Partido[] = registro
    ? Object.values(registro).map(
        (base) => ({ ...base, programa: procesados.find((p) => p.id === base.id)?.programa ?? { estado: 'pendiente' } }) as Partido,
      )
    : procesados;
  const dataset = construirDataset({
    partidos,
    temas: args.temas,
    preguntas: args.preguntas ?? PREGUNTAS_SUGERIDAS,
    resultados: [
      ...previos.informes
        .filter((i) => i.partido !== partido.id && (!registro || registro[i.partido]))
        .map((informe) => ({
          informe,
          posturas: previos.posturas.filter((p) => p.partido === informe.partido),
          // Answers to questions no longer suggested are dropped (V9 rejects unknown questions).
          respuestas: (previos.respuestas ?? []).filter(
            (r) => r.partido === informe.partido && (args.preguntas ?? PREGUNTAS_SUGERIDAS).some((q) => q.id === r.pregunta),
          ),
        })),
      resultado,
    ],
    generado: args.generado,
    origen: 'real',
  });
  const v = validarDataset(dataset);
  if (!v.valido) return { ok: false, motivo: `V9: el dataset no valida: ${v.errores.join('; ')}` };
  return { ok: true, dataset };
}
