// Merging one processed programme into the published dataset (shared by `npm run procesar` and
// the watcher). Real data replaces simulated data entirely; the party's previous posturas and
// report are replaced by the new ones, the other parties are kept as they were.
import { construirDataset, validarDataset } from '../dataset';
import type { Dataset, Partido, Tema } from '../dataset/esquema';
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
  args: { temas: Tema[]; generado: string; fecha?: string },
): Fusion {
  if (!resultado.publicable) return { ok: false, motivo: resultado.informe.motivo ?? 'no publicable' };
  if (partido.programa.estado !== 'publicado') return { ok: false, motivo: 'el partido no tiene programa' };
  const previos = anterior.origen === 'real' ? anterior : { partidos: [], posturas: [], informes: [] };
  const conHash: Partido = {
    ...partido,
    programa: { ...partido.programa, hashPdf: resultado.informe.hashPdf, ...(args.fecha ? { fecha: args.fecha } : {}) },
  };
  const dataset = construirDataset({
    partidos: [...previos.partidos.filter((p) => p.id !== partido.id), conHash],
    temas: args.temas,
    resultados: [
      ...previos.informes
        .filter((i) => i.partido !== partido.id)
        .map((informe) => ({ informe, posturas: previos.posturas.filter((p) => p.partido === informe.partido) })),
      resultado,
    ],
    generado: args.generado,
    origen: 'real',
  });
  const v = validarDataset(dataset);
  if (!v.valido) return { ok: false, motivo: `V9: el dataset no valida: ${v.errores.join('; ')}` };
  return { ok: true, dataset };
}
