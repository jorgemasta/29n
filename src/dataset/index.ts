import {
  Dataset,
  FUENTES_PUBLICAS,
  type Informe,
  type Modo,
  type Partido,
  type Postura,
  type Pregunta,
  type RespuestaPregunta,
  type Tema,
  type TipoFuente,
} from './esquema';

export * from './esquema';

export interface ResultadoValidacion {
  valido: boolean;
  errores: string[];
}

/** V9: the dataset validates against the schema (and one state per party × topic). */
export function validarDataset(datos: unknown): ResultadoValidacion {
  const r = Dataset.safeParse(datos);
  if (r.success) return { valido: true, errores: [] };
  return {
    valido: false,
    errores: r.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`),
  };
}

/** Assembles a dataset from per-programme pipeline results. Does not validate: call validarDataset. */
export function construirDataset(args: {
  partidos: Partido[];
  temas: Tema[];
  /** Suggested questions; their answers come from each result's `respuestas`. */
  preguntas?: Pregunta[];
  resultados: { posturas: Postura[]; informe: Informe; respuestas?: RespuestaPregunta[] }[];
  generado: string;
  origen: Dataset['origen'];
  nota?: string;
}): Dataset {
  return {
    version: 1,
    generado: args.generado,
    origen: args.origen,
    ...(args.nota ? { nota: args.nota } : {}),
    partidos: args.partidos,
    temas: [...args.temas].sort((a, b) => a.orden - b.orden),
    posturas: args.resultados.flatMap((r) => r.posturas),
    informes: args.resultados.map((r) => r.informe),
    ...(args.preguntas
      ? {
          preguntas: [...args.preguntas].sort((a, b) => a.orden - b.orden),
          respuestas: args.resultados.flatMap((r) => r.respuestas ?? []),
        }
      : {}),
  };
}

/** Source type of a party's document (absent = official 29N programme). Null if pending. */
export function fuenteDe(p: Partido): TipoFuente | null {
  return p.programa.estado === 'publicado' ? (p.programa.fuente ?? 'programa-29n') : null;
}

export const esSoloPrivado = (t: TipoFuente) => !FUENTES_PUBLICAS.includes(t);

/**
 * Mode switch. In 'publico', parties whose only document is a provisional source (2023
 * programme, party document, public statements) count as "programme pending": their posturas
 * and reports are dropped. 'privado' (private prototype) keeps everything.
 */
export function aplicarModo(d: Dataset, modo: Modo): Dataset {
  if (modo === 'privado') return d;
  const provisionales = new Set(d.partidos.filter((p) => { const f = fuenteDe(p); return f !== null && esSoloPrivado(f); }).map((p) => p.id));
  if (provisionales.size === 0) return d;
  return {
    ...d,
    partidos: d.partidos.map((p) => (provisionales.has(p.id) ? { ...p, programa: { estado: 'pendiente' } } : p)),
    posturas: d.posturas.filter((p) => !provisionales.has(p.partido)),
    informes: d.informes.filter((i) => !provisionales.has(i.partido)),
    ...(d.respuestas ? { respuestas: d.respuestas.filter((r) => !provisionales.has(r.partido)) } : {}),
  };
}
