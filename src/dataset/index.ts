import { Dataset, type Informe, type Partido, type Postura, type Tema } from './esquema';

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
  resultados: { posturas: Postura[]; informe: Informe }[];
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
  };
}
