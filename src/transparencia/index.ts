// Transparency data (#11): derived views of the dataset for the methodology, parties-and-programmes
// and verification-report pages, plus the prefilled GitHub issue links ("Reportar error", "Falta un partido").
// Pure functions: the pages only render what these return.
import type { Dataset, EntradaInforme, Informe, Partido, Pregunta, ResultadoViabilidad, ResumenPostura, Tema, TipoFuente } from '../dataset/esquema';
import { BARRERAS } from '../registro/barreras';
import { provinciaPorCodigo } from '../registro/territorio';

export const REPO = 'https://github.com/jorgemasta/29n';
/** Link to a file of the public repository (main branch). */
export const enlaceRepo = (ruta: string) => `${REPO}/blob/main/${ruta}`;

// --- Feasibility breakdown per party (story 42) -------------------------------------------------

export const CATEGORIAS_VIABILIDAD: readonly ResultadoViabilidad[] = ['viable', 'viable_con_matices', 'dificil', 'muy_dificil', 'sin_concrecion', 'sin_consenso'];

/** What a party × topic cell shows: the published result, or why there is none. */
export type CeldaReparto = ResultadoViabilidad | 'sin_nota' | 'no_propone' | 'sin_verificar' | 'sin_dato';

export interface FilaReparto {
  partido: { id: string; nombre: string; siglas: string; prueba?: boolean };
  conteos: Record<ResultadoViabilidad, number>;
  /** Proposals published without a feasibility note (older data). */
  sinNota: number;
  /** Proposals published (cards), with or without a note. */
  total: number;
}

export interface RepartoViabilidad {
  categorias: readonly ResultadoViabilidad[];
  porPartido: FilaReparto[];
  /** One cell per party, in porPartido order. */
  porTema: { tema: { id: string; titulo: string }; celdas: CeldaReparto[] }[];
}

const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, 'es');

export function repartoViabilidad(ds: Dataset): RepartoViabilidad {
  const partidos = ds.partidos.filter((p) => p.programa.estado === 'publicado').sort(porNombre);
  const temas = [...ds.temas].sort((a, b) => a.orden - b.orden);
  const celda = new Map<string, CeldaReparto>();
  for (const p of ds.posturas) {
    celda.set(`${p.partido}/${p.tema}`, p.estado === 'propone' ? (p.viabilidad?.resultado ?? 'sin_nota') : p.estado);
  }
  const porPartido = partidos.map((p): FilaReparto => {
    const conteos = Object.fromEntries(CATEGORIAS_VIABILIDAD.map((c) => [c, 0])) as Record<ResultadoViabilidad, number>;
    let sinNota = 0;
    let total = 0;
    for (const t of temas) {
      const c = celda.get(`${p.id}/${t.id}`);
      if (c === undefined || c === 'no_propone' || c === 'sin_verificar' || c === 'sin_dato') continue;
      total++;
      if (c === 'sin_nota') sinNota++;
      else conteos[c]++;
    }
    return { partido: { id: p.id, nombre: p.nombre, siglas: p.siglas, ...(p.prueba ? { prueba: true } : {}) }, conteos, sinNota, total };
  });
  const porTema = temas.map((t) => ({
    tema: { id: t.id, titulo: t.titulo },
    celdas: partidos.map((p) => celda.get(`${p.id}/${t.id}`) ?? 'sin_dato'),
  }));
  return { categorias: CATEGORIAS_VIABILIDAD, porPartido, porTema };
}

// --- Parties and programmes (screen 13, story 43) -----------------------------------------------

export interface FilaPrograma {
  id: string;
  nombre: string;
  siglas: string;
  prueba: boolean;
  /** "Toda España" or the provinces where it runs. */
  ambito: string;
  fuente: TipoFuente | null;
  titulo: string | null;
  url: string | null;
  fecha: string | null;
  /** A verification report is published for it. */
  informe: boolean;
}

export const textoAmbito = (a: Partido['ambito']): string =>
  a.tipo === 'estatal' ? 'Toda España' : a.provincias.map((c) => provinciaPorCodigo(c)?.nombre ?? c).join(', ');

export function programas(ds: Dataset): { conPrograma: FilaPrograma[]; pendientes: FilaPrograma[] } {
  const conInforme = new Set(ds.informes.map((i) => i.partido));
  const filas = [...ds.partidos].sort(porNombre).map((p): FilaPrograma => {
    const pub = p.programa.estado === 'publicado' ? p.programa : null;
    return {
      id: p.id,
      nombre: p.nombre,
      siglas: p.siglas,
      prueba: p.prueba === true,
      ambito: textoAmbito(p.ambito),
      fuente: pub ? (pub.fuente ?? 'programa-29n') : null,
      titulo: pub?.titulo ?? null,
      url: pub?.url ?? null,
      fecha: pub?.fecha ?? null,
      informe: conInforme.has(p.id),
    };
  });
  return { conPrograma: filas.filter((f) => f.url !== null), pendientes: filas.filter((f) => f.url === null) };
}

// --- Verification report (story 45) -------------------------------------------------------------

export interface EntradaResumen extends EntradaInforme {
  nombre: string;
}

export interface ResumenInforme {
  informe: Informe;
  publicadas: number;
  /** Programme-level entries (V7…). */
  programa: EntradaResumen[];
  temas: (Omit<ResumenPostura, 'tema'> & { tema: { id: string; titulo: string }; entradas: EntradaResumen[] })[];
  /** Checks of the precomputed answers to the suggested questions (Preguntar), per question. */
  preguntas: { pregunta: { id: string; texto: string }; entradas: EntradaResumen[] }[];
}

export function resumenInforme(informe: Informe, temas: Tema[], preguntas: Pregunta[] = []): ResumenInforme {
  const conNombre = (e: EntradaInforme): EntradaResumen => ({ ...e, nombre: BARRERAS[e.barrera].nombre });
  const orden = new Map(temas.map((t) => [t.id, t]));
  const ids = [...new Set([...informe.posturas.map((p) => p.tema), ...informe.entradas.flatMap((e) => (e.tema ? [e.tema] : []))])];
  ids.sort((a, b) => (orden.get(a)?.orden ?? Infinity) - (orden.get(b)?.orden ?? Infinity) || a.localeCompare(b));
  return {
    informe,
    publicadas: informe.posturas.filter((p) => p.estado === 'propone').length,
    programa: informe.entradas.filter((e) => !e.tema && !e.pregunta).map(conNombre),
    preguntas: [...new Set(informe.entradas.flatMap((e) => (e.pregunta ? [e.pregunta] : [])))]
      .map((id) => preguntas.find((p) => p.id === id) ?? { id, texto: id, orden: Infinity })
      .sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id))
      .map(({ id, texto }) => ({ pregunta: { id, texto }, entradas: informe.entradas.filter((e) => e.pregunta === id).map(conNombre) })),
    temas: ids.map((id) => {
      const resumen = informe.posturas.find((p) => p.tema === id);
      return {
        tema: { id, titulo: orden.get(id)?.titulo ?? id },
        estado: resumen?.estado ?? 'sin_verificar',
        reescrituras: resumen?.reescrituras ?? 0,
        ...(resumen?.motivo ? { motivo: resumen.motivo } : {}),
        entradas: informe.entradas.filter((e) => e.tema === id).map(conNombre),
      };
    }),
  };
}

// --- Prefilled GitHub issues (screen 8, story 27; screen 13 "Falta un partido") -------------------

export const MOTIVOS_REPORTE = [
  { id: 'sentido', texto: 'La versión reescrita cambia el sentido' },
  { id: 'cita', texto: 'La cita o la página no es correcta' },
  { id: 'viabilidad', texto: 'La viabilidad me parece equivocada' },
  { id: 'propone', texto: 'Sí hay propuesta de este partido' },
  { id: 'otra', texto: 'Otra cosa' },
] as const;
export type MotivoReporte = (typeof MOTIVOS_REPORTE)[number]['id'];
export const MAX_COMENTARIO = 300;

const nuevoIssue = (titulo: string, cuerpo: string, etiqueta: string) =>
  `${REPO}/issues/new?${new URLSearchParams({ title: titulo, body: cuerpo, labels: etiqueta })}`;

export interface DatosReporte {
  tema: { id: string; titulo: string };
  partido: { id: string; nombre: string };
  /** Letter the card had for this voter (helps find it; not what they chose). */
  letra: string;
  paginas: number[];
  motivo: MotivoReporte;
  comentario?: string;
}

/**
 * "Reportar error": a new public issue with the card context. Only the topic, the card and the
 * comment are sent; never what the voter chose or their province.
 */
export function urlReportarError(d: DatosReporte): string {
  const motivo = MOTIVOS_REPORTE.find((m) => m.id === d.motivo)!.texto;
  const comentario = (d.comentario ?? '').trim().slice(0, MAX_COMENTARIO);
  const cuerpo = [
    `**Motivo:** ${motivo}`,
    '',
    `- Tema: ${d.tema.titulo} (\`${d.tema.id}\`)`,
    `- Partido: ${d.partido.nombre} (\`${d.partido.id}\`)`,
    `- Tarjeta: ${d.letra}`,
    `- Páginas citadas: ${d.paginas.join(', ') || '—'}`,
    '',
    '**Comentario:**',
    comentario || '(sin comentario)',
  ].join('\n');
  return nuevoIssue(`[Error] ${d.tema.titulo} · ${d.partido.nombre}: ${motivo}`, cuerpo, 'reporte');
}

/** "Falta un partido": a new public issue asking which party and why it meets the criterion. */
export function urlFaltaPartido(): string {
  const cuerpo = [
    '**Partido que falta:** ',
    '',
    '**Provincia(s) donde se presenta:** ',
    '',
    '**Por qué cumple el criterio de inclusión** (candidatura proclamada en esa provincia y representación actual en el Congreso o en su parlamento autonómico; enlace al BOE si puedes):',
    '',
    '**Enlace a su programa (si ya lo ha publicado):** ',
  ].join('\n');
  return nuevoIssue('[Falta un partido] ', cuerpo, 'falta-partido');
}

// --- Versioned prompts (methodology) ------------------------------------------------------------

/** Every AI task, what it does and the repository file holding its exact instructions. */
export const PROMPTS = [
  { tarea: 'extraer-postura', que: 'Extrae la propuesta de cada tema con sus citas literales', archivo: 'src/pipeline/prompts.ts' },
  { tarea: 'neutralizar', que: 'Reescribe la propuesta en el estilo común, sin marcas del partido', archivo: 'src/pipeline/prompts.ts' },
  { tarea: 'verificar-fidelidad', que: 'V10: comprueba que la reescritura es fiel a las citas', archivo: 'src/pipeline/fidelidad.ts' },
  { tarea: 'adivinar-partido', que: 'V11: intenta adivinar de qué partido es cada texto', archivo: 'src/pipeline/reconocibilidad.ts' },
  { tarea: 'confirmar-ausencia', que: 'V12: confirma que un partido no propone nada sobre un tema', archivo: 'src/pipeline/ausencia.ts' },
  { tarea: 'evaluar-viabilidad', que: 'V13: evalúa la viabilidad a ciegas, dos veces', archivo: 'src/pipeline/prompts-viabilidad.ts' },
] as const;
