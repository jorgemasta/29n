// Data pipeline (test point A). Single entry point:
//   procesarPrograma(pdf, partido, ia) → { posturas, informe, publicable }
// Stages: V7 (source) → PDF text by page → per topic (`procesarTema`): extract postura (V12 confirms
// absences) → V1/V2 → neutralise with V3–V6 + V10 (`neutralizar`, rewrite loop) → V11 over every
// posture of the topic (`rebajarReconocibilidad`) → V13/V8 → V9 → publication decision.
// Then the answers to the suggested questions (src/pregunta: V1, V3–V6, V10), which never block.
import type {
  Cita,
  EntradaInforme,
  Informe,
  Partido,
  Postura,
  Pregunta,
  RespuestaPregunta,
  ResumenPostura,
  Tema,
  TextoNeutral,
} from '../dataset/esquema';
import { Postura as EsquemaPostura, RespuestaPregunta as EsquemaRespuesta } from '../dataset/esquema';
import { responderPregunta, VERSION_PROMPT_PREGUNTA } from '../pregunta';
import { PREGUNTAS_SUGERIDAS } from '../registro/preguntas';
import type { AdaptadorIA } from '../ia/adaptador';
import { comprobacionConCache, conCache, type AlmacenCache } from '../ia/cache';
import { TEMAS } from '../registro/temas';
import { PARTIDOS } from '../registro/partidos';
import { PALABRAS_CLAVE, type PalabrasClave } from '../registro/palabras-clave';
import { TERMINOS, type TerminosIdentificativos } from '../registro/terminos';
import { DOMINIOS_OFICIALES, type DominiosOficiales } from '../registro/dominios';
import { confirmarAusencia } from './ausencia';
import { verificarCita } from './barreras';
import { verificarFidelidad } from './fidelidad';
import { verificarFuente } from './fuente';
import { contarPalabras, limpiarTexto, mediana, revisarTexto, TOLERANCIA_MEDIANA, type BarreraTexto } from './texto';
import { extraerPaginas, hashPdf } from './pdf';
import type { TextoPrograma } from '../pregunta/textos';
import {
  INSTRUCCIONES_EXTRAER,
  INSTRUCCIONES_NEUTRALIZAR,
  RespuestaExtraer,
  RespuestaNeutralizar,
  VERSION_PROMPT,
} from './prompts';
import { comprobarReconocibilidad, type ResultadoReconocibilidad } from './reconocibilidad';
import { comprobarUrlHttp, evaluarViabilidad, type ComprobarUrl } from './viabilidad';

export interface OpcionesProceso {
  temas?: Tema[];
  terminos?: TerminosIdentificativos;
  cache?: AlmacenCache;
  versionPrompt?: string;
  /** V12: keywords per topic for the second pass (default: registro/palabras-clave). */
  palabrasClave?: PalabrasClave;
  /**
   * Already-published parties and posturas (e.g. the current dataset). Their posturas on each topic
   * go to the guesser with this one (V11) and set the topic median (V5); they are re-checked too,
   * and their findings come back in `revisiones` (never rewritten here).
   */
  publicado?: { partidos: Partido[]; posturas: Postura[] };
  /** V11: parties the guesser chooses from (default: the registry, plus `publicado`'s parties). */
  partidos?: Pick<Partido, 'id' | 'nombre' | 'siglas'>[];
  /** V8 HTTP 200 check for feasibility sources (default: real fetch). */
  comprobarUrl?: ComprobarUrl;
  /** Official domains per party (V7). */
  dominios?: DominiosOficiales;
  /** Capture date of the PDF, recorded with its hash (V7). Defaults to the programme's date. */
  fecha?: string;
  /** Suggested questions to precompute answers for (default: registro/preguntas). */
  preguntas?: Pregunta[];
}

export interface ResultadoProceso {
  posturas: Postura[];
  informe: Informe;
  publicable: boolean;
  /** One answer per suggested question (anonymous until revealed in the Preguntar tab). */
  respuestas: RespuestaPregunta[];
  /**
   * Page text of the programme, published next to the site (public/textos/<partido>.json) so the
   * live free question can answer and run V1/V2 on it. Null when blocked before reading the PDF (V7).
   */
  texto: TextoPrograma | null;
  /**
   * Findings on OTHER parties' published posturas when this one joins the topic (V11 recognisable,
   * V5 outside the new median). `fusionarPrograma` writes them into those parties' reports as warnings.
   */
  revisiones: Revision[];
}

/** A warning about another party's published postura, triggered by this programme. */
export interface Revision {
  partido: string;
  tema: string;
  barrera: 'V5' | 'V11';
  detalle: string;
}

/** Max rewrites after a failed rewrite-barrier before the postura is discarded. */
export const MAX_REINTENTOS = 2;
/** A programme with more than this share of extracted posturas discarded is blocked. */
export const MAX_DESCARTE = 0.3;

export async function procesarPrograma(
  pdf: Uint8Array,
  partido: Partido,
  iaBase: AdaptadorIA,
  opciones: OpcionesProceso = {},
): Promise<ResultadoProceso> {
  const versionPrompt = opciones.versionPrompt ?? VERSION_PROMPT;
  const hash = hashPdf(pdf);
  const contextoCache = { hashPdf: hash, versionPrompt };
  const comprobarBase = opciones.comprobarUrl ?? comprobarUrlHttp;
  const fecha = opciones.fecha ?? (partido.programa.estado === 'publicado' ? partido.programa.fecha : undefined);
  const entradas: EntradaInforme[] = [];

  const informe = (resumen: ResumenPostura[], cuenta: { extraidas: number; descartadas: number }, motivos: string[], url?: string): Informe => ({
    partido: partido.id,
    hashPdf: hash,
    ...(url ? { url } : {}),
    ...(fecha ? { fecha } : {}),
    versionPrompt,
    ...cuenta,
    publicable: motivos.length === 0,
    ...(motivos.length ? { motivo: motivos.join('; ') } : {}),
    posturas: resumen,
    entradas,
  });

  // V7: official source. A non-official PDF blocks the programme before any AI call.
  const fuente = verificarFuente(partido, opciones.dominios ?? DOMINIOS_OFICIALES);
  entradas.push({ barrera: 'V7', resultado: fuente.ok ? 'pasa' : 'bloquear', detalle: fuente.detalle });
  if (!fuente.ok)
    return {
      posturas: [],
      respuestas: [],
      texto: null,
      revisiones: [],
      publicable: false,
      informe: informe([], { extraidas: 0, descartadas: 0 }, [`V7: ${fuente.detalle}`], fuente.url),
    };

  const publicado = opciones.publicado ?? { partidos: [], posturas: [] };
  const ctx: Contexto = {
    ia: opciones.cache ? conCache(iaBase, opciones.cache, contextoCache) : iaBase,
    partido,
    hash,
    versionPrompt,
    terminos: opciones.terminos ?? TERMINOS,
    palabrasClave: opciones.palabrasClave ?? PALABRAS_CLAVE,
    paginas: await extraerPaginas(pdf),
    comprobarUrl: opciones.cache ? comprobacionConCache(comprobarBase, opciones.cache, contextoCache) : comprobarBase,
    otras: publicado.posturas.filter((p): p is PosturaPropone => p.partido !== partido.id && p.estado === 'propone'),
    candidatos: candidatosV11(partido, opciones.partidos ?? Object.values(PARTIDOS), publicado.partidos),
    entradas,
  };

  const temas: ResultadoTema[] = [];
  for (const tema of opciones.temas ?? TEMAS) temas.push(await procesarTema(ctx, tema));
  const posturas = temas.map((t) => t.postura);
  const cuenta = { extraidas: temas.filter((t) => t.extraida).length, descartadas: temas.filter((t) => t.descartada).length };

  // Suggested questions: one answer per question, with the same quote/marks/fidelity barriers.
  // They never count towards the publication rule (a programme is not about our questions).
  const respuestas: RespuestaPregunta[] = [];
  for (const pregunta of opciones.preguntas ?? PREGUNTAS_SUGERIDAS) {
    const r = await responderPregunta(ctx.ia, pregunta, ctx.paginas, {
      terminos: ctx.terminos,
      anotar: (barrera, resultado, detalle) => entradas.push({ pregunta: pregunta.id, barrera, resultado, detalle }),
    });
    const base = { partido: partido.id, pregunta: pregunta.id, versiones: { prompt: VERSION_PROMPT_PREGUNTA } };
    if (r.estado === 'responde') respuestas.push({ ...base, estado: 'responde', texto: r.texto, citas: r.citas });
    else {
      if (r.estado === 'no_menciona') entradas.push({ pregunta: pregunta.id, barrera: 'V12', resultado: 'pasa', detalle: `no lo menciona: ${r.detalle}` });
      respuestas.push({ ...base, estado: r.estado });
    }
  }

  // V9: every postura validates against the schema (an invalid answer is just not published).
  const invalidas = posturas.filter((p) => !EsquemaPostura.safeParse(p).success);
  for (const p of invalidas) entradas.push({ tema: p.tema, barrera: 'V9', resultado: 'descartar', detalle: 'no valida contra el esquema' });
  const respuestasValidas = respuestas.filter((r) => {
    const ok = EsquemaRespuesta.safeParse(r).success;
    if (!ok) entradas.push({ pregunta: r.pregunta, barrera: 'V9', resultado: 'descartar', detalle: 'la respuesta no valida contra el esquema' });
    return ok;
  });

  // Publication rule: blocked if more than MAX_DESCARTE of the extracted posturas were discarded.
  const motivos: string[] = [];
  if (invalidas.length) motivos.push(`${invalidas.length} postura(s) no validan contra el esquema`);
  if (cuenta.extraidas > 0 && cuenta.descartadas / cuenta.extraidas > MAX_DESCARTE)
    motivos.push(`descartado el ${Math.round((cuenta.descartadas / cuenta.extraidas) * 100)} % de las posturas extraídas (máximo ${MAX_DESCARTE * 100} %)`);

  return {
    posturas,
    respuestas: respuestasValidas,
    texto: { partido: partido.id, hashPdf: hash, paginas: ctx.paginas },
    revisiones: temas.flatMap((t) => t.revisiones),
    publicable: motivos.length === 0,
    informe: informe(
      temas.map((t) => t.resumen),
      cuenta,
      motivos,
      fuente.url,
    ),
  };
}

type PosturaPropone = Extract<Postura, { estado: 'propone' }>;
type TemaIA = Pick<Tema, 'id' | 'titulo' | 'pregunta'>;
type Anotar = (barrera: EntradaInforme['barrera'], resultado: EntradaInforme['resultado'], detalle: string) => void;
/** A failed barrier on a neutral text, with what to tell the AI in the rewrite. */
interface Fallo {
  barrera: EntradaInforme['barrera'];
  detalle: string;
  evitar?: string[];
  corregir?: string;
}

/** What every topic of one programme shares. */
interface Contexto {
  ia: AdaptadorIA;
  partido: Partido;
  hash: string;
  versionPrompt: string;
  terminos: TerminosIdentificativos;
  palabrasClave: PalabrasClave;
  paginas: string[];
  comprobarUrl: ComprobarUrl;
  /** Other parties' published proposals (V5 median, V11). */
  otras: PosturaPropone[];
  /** V11 party list, sorted by id (the order never hints at the party being processed). */
  candidatos: Pick<Partido, 'id' | 'nombre' | 'siglas'>[];
  entradas: EntradaInforme[];
}

interface ResultadoTema {
  postura: Postura;
  resumen: ResumenPostura;
  extraida: boolean;
  descartada: boolean;
  revisiones: Revision[];
}

function candidatosV11(partido: Partido, ...listas: Pick<Partido, 'id' | 'nombre' | 'siglas'>[][]) {
  const porId = new Map([partido, ...listas.flat()].map(({ id, nombre, siglas }) => [id, { id, nombre, siglas }]));
  return [...porId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** One topic: extraction (V12) → quotes (V1/V2) → neutral text (V3–V6, V10) → V11 → feasibility (V13/V8). */
async function procesarTema(ctx: Contexto, tema: Tema): Promise<ResultadoTema> {
  const base = { partido: ctx.partido.id, tema: tema.id, versiones: { prompt: ctx.versionPrompt } };
  const temaIA: TemaIA = { id: tema.id, titulo: tema.titulo, pregunta: tema.pregunta };
  const anotar: Anotar = (barrera, resultado, detalle) => ctx.entradas.push({ tema: tema.id, barrera, resultado, detalle });
  const palabras = ctx.palabrasClave[tema.id] ?? [tema.titulo];
  const noPropone = (reescrituras: number, descartada: boolean, motivo?: string): ResultadoTema => ({
    postura: { ...base, estado: 'no_propone' },
    resumen: { tema: tema.id, estado: 'no_propone', reescrituras, ...(motivo ? { motivo } : {}) },
    extraida: descartada,
    descartada,
    revisiones: [],
  });

  const extraccion = await ctx.ia.completar({
    tarea: 'extraer-postura',
    instrucciones: INSTRUCCIONES_EXTRAER,
    entrada: { tema: temaIA, paginas: ctx.paginas.map((texto, i) => ({ pagina: i + 1, texto })) },
    esquema: RespuestaExtraer,
  });

  // V12: "proposes nothing" only after a second pass confirms it; if it finds something, extract it.
  let citasIA = extraccion.propone ? extraccion.citas : [];
  let ausenciaRevisada = false;
  if (citasIA.length === 0) {
    const v12 = await confirmarAusencia(ctx.ia, temaIA, ctx.paginas, palabras);
    if (v12.confirmada) {
      anotar('V12', 'pasa', v12.detalle);
      return noPropone(0, false);
    }
    anotar('V12', 'extraer', `la segunda pasada encontró ${v12.citas.length} cita(s) que la primera no vio`);
    citasIA = v12.citas;
    ausenciaRevisada = true;
  }

  /**
   * A discarded postura shows as "proposes nothing" only if V12 confirms the absence;
   * otherwise as "No pudimos verificar su propuesta". Quotes already found in the PDF prove
   * there is a proposal, so V12 only runs when they were not verified.
   */
  const descartar = async (fallos: Fallo[], reescrituras: number, citasVerificadas: boolean): Promise<ResultadoTema> => {
    for (const f of fallos) anotar(f.barrera, 'descartar', f.detalle);
    const motivo = fallos.map((f) => `${f.barrera}: ${f.detalle}`).join('; ');
    if (!citasVerificadas && !ausenciaRevisada) {
      const v12 = await confirmarAusencia(ctx.ia, temaIA, ctx.paginas, palabras);
      if (v12.confirmada) {
        anotar('V12', 'pasa', `${v12.detalle}; se muestra como "no propone nada"`);
        return noPropone(reescrituras, true, motivo);
      }
      anotar('V12', 'aviso', 'la segunda pasada encontró una propuesta: se muestra como "No pudimos verificar su propuesta"');
    }
    return {
      postura: { ...base, estado: 'sin_verificar' },
      resumen: { tema: tema.id, estado: 'sin_verificar', reescrituras, motivo },
      extraida: true,
      descartada: true,
      revisiones: [],
    };
  };

  // V1 + V2: every quote exists in the PDF (page fixed if needed).
  const citas: Cita[] = [];
  const correcciones: string[] = [];
  for (const cita of citasIA) {
    const r = verificarCita(cita, ctx.paginas);
    if (!r.ok) return descartar([{ barrera: 'V1', detalle: r.motivo }], 0, false);
    if (r.paginaCorregida) correcciones.push(`página ${cita.pagina} → ${r.cita.pagina}`);
    citas.push(r.cita);
  }
  anotar('V1', 'pasa', `${citas.length} cita(s) localizadas`);
  if (correcciones.length) for (const c of correcciones) anotar('V2', 'corregir', c);
  else anotar('V2', 'pasa', 'páginas declaradas correctas');

  const neutral = await neutralizar(ctx, temaIA, citas, anotar);
  if ('fallos' in neutral) return descartar(neutral.fallos, neutral.reescrituras, true);
  const v11 = await rebajarReconocibilidad(ctx, temaIA, citas, neutral.texto, anotar);

  // V13 + V8: double-blind feasibility note on the final neutral text.
  const viabilidad = await evaluarViabilidad({
    ia: ctx.ia, tema: temaIA, texto: v11.texto, citas, terminos: ctx.terminos, comprobarUrl: ctx.comprobarUrl, anotar,
  });
  return {
    postura: { ...base, estado: 'propone', texto: v11.texto, citas, viabilidad },
    resumen: { tema: tema.id, estado: 'propone', reescrituras: neutral.reescrituras + v11.reescrituras },
    extraida: true,
    descartada: false,
    revisiones: [...v11.revisiones, ...revisarLongitudes(ctx, tema.id, v11.texto)],
  };
}

/** Word counts of the other parties' published proposals on a topic (V5 median). */
const longitudesDe = (ctx: Contexto, temaId: string) =>
  ctx.otras.filter((p) => p.tema === temaId).map((p) => ({ partido: p.partido, palabras: contarPalabras(p.texto) }));

/**
 * Neutralise, then V3–V6 (deterministic) and V10 (independent fidelity check, only on a text that
 * passed V3–V6). Any failure is fed back to the next rewrite, up to MAX_REINTENTOS times.
 * `pista`: what gave the party away (V11).
 */
async function neutralizar(
  ctx: Contexto,
  tema: TemaIA,
  citas: Cita[],
  anotar: Anotar,
  pista?: string[],
): Promise<({ texto: TextoNeutral } | { fallos: Fallo[] }) & { reescrituras: number }> {
  const longitudesTema = longitudesDe(ctx, tema.id).map((l) => l.palabras);
  let evitar: string[] = [];
  let corregir: string[] = [];
  for (let intento = 0; ; intento++) {
    const propuesta = limpiarTexto(
      await ctx.ia.completar({
        tarea: 'neutralizar',
        instrucciones: INSTRUCCIONES_NEUTRALIZAR,
        entrada: {
          tema,
          citas,
          ...(evitar.length ? { evitar } : {}),
          ...(corregir.length ? { corregir } : {}),
          ...(pista?.length ? { pista } : {}),
        },
        esquema: RespuestaNeutralizar,
      }),
    );
    const fallos: Fallo[] = revisarTexto(propuesta, { citas, terminos: ctx.terminos, longitudesTema });
    if (fallos.length === 0) {
      const fidelidad = await verificarFidelidad(ctx.ia, tema, citas, propuesta);
      if (fidelidad.fiel) {
        const pasa: Record<BarreraTexto | 'V10', string> = {
          V3: 'sin marcas identificativas',
          V4: 'cifras trazables a las citas',
          V5: 'longitud dentro del rango',
          V6: 'plantilla completa',
          V10: 'fiel a la cita según un verificador independiente',
        };
        for (const [barrera, detalle] of Object.entries(pasa)) anotar(barrera as BarreraTexto | 'V10', 'pasa', detalle);
        return { texto: propuesta, reescrituras: intento };
      }
      fallos.push({ barrera: 'V10', detalle: `no es fiel a la cita: ${fidelidad.motivo}`, corregir: fidelidad.motivo });
    }
    if (intento === MAX_REINTENTOS)
      return {
        fallos: fallos.map((f) => ({ barrera: f.barrera, detalle: `${f.detalle} (tras ${MAX_REINTENTOS} reintentos)` })),
        reescrituras: intento,
      };
    for (const f of fallos) anotar(f.barrera, 'reescribir', f.detalle);
    evitar = [...new Set([...evitar, ...fallos.flatMap((f) => f.evitar ?? [])])];
    corregir = fallos.flatMap((f) => (f.corregir ? [f.corregir] : []));
  }
}

/**
 * V11: the guesser sees this text with every other published proposal of the topic. A recognisable
 * text is rewritten with the clue (up to MAX_REINTENTOS); if it persists it is published with an
 * internal warning. Other parties found recognisable come back as revisions, never rewritten here.
 */
async function rebajarReconocibilidad(
  ctx: Contexto,
  tema: TemaIA,
  citas: Cita[],
  texto: TextoNeutral,
  anotar: Anotar,
): Promise<{ texto: TextoNeutral; reescrituras: number; revisiones: Revision[] }> {
  if (ctx.candidatos.length < 2) {
    anotar('V11', 'pasa', 'no aplica: no hay otros partidos entre los que elegir');
    return { texto, reescrituras: 0, revisiones: [] };
  }
  const otras = ctx.otras.filter((p) => p.tema === tema.id).map((p) => ({ partido: p.partido, texto: p.texto }));
  let reescrituras = 0;
  for (let ronda = 0; ; ronda++) {
    const veredictos = await comprobarReconocibilidad(ctx.ia, {
      tema,
      posturas: [{ partido: ctx.partido.id, texto }, ...otras],
      partidos: ctx.candidatos,
      semilla: `${ctx.hash}:${ronda}`,
    });
    const terminar = () => ({ texto, reescrituras, revisiones: revisionesV11(ctx, tema.id, veredictos) });
    const propio = veredictos.get(ctx.partido.id)!;
    if (!propio.reconocible) {
      anotar('V11', 'pasa', propio.detalle);
      return terminar();
    }
    const pistas = propio.pistas.join(' / ');
    if (ronda === MAX_REINTENTOS) {
      anotar('V11', 'aviso', `sigue siendo reconocible tras ${MAX_REINTENTOS} reescrituras (${propio.detalle}; pista: ${pistas}); se publica`);
      return terminar();
    }
    anotar('V11', 'reescribir', `${propio.detalle}; pista: ${pistas}`);
    reescrituras++;
    const nuevo = await neutralizar(ctx, tema, citas, anotar, propio.pistas);
    reescrituras += nuevo.reescrituras;
    if ('fallos' in nuevo) {
      const barreras = nuevo.fallos.map((f) => f.barrera).join(', ');
      anotar('V11', 'aviso', `la reescritura no pasó ${barreras}; se publica la versión anterior, reconocible (pista: ${pistas})`);
      return terminar();
    }
    texto = nuevo.texto;
  }
}

const alPublicarse = (ctx: Contexto) => `al publicarse el programa de ${ctx.partido.nombre}`;
const seReescribira = 'se reescribirá cuando se vuelva a procesar su programa';

function revisionesV11(ctx: Contexto, tema: string, veredictos: Map<string, ResultadoReconocibilidad>): Revision[] {
  return [...veredictos].flatMap(([partido, v]) =>
    partido !== ctx.partido.id && v.reconocible
      ? [{ partido, tema, barrera: 'V11' as const, detalle: `${alPublicarse(ctx)}, el adivinador la reconoce (${v.detalle}; pista: ${v.pistas.join(' / ')}); ${seReescribira}` }]
      : [],
  );
}

/** V5 re-check of the published proposals against the topic median with this text in it. */
function revisarLongitudes(ctx: Contexto, tema: string, texto: TextoNeutral): Revision[] {
  const otras = longitudesDe(ctx, tema);
  if (otras.length === 0) return [];
  const m = mediana([...otras.map((o) => o.palabras), contarPalabras(texto)])!;
  return otras
    .filter((o) => Math.abs(o.palabras - m) > m * TOLERANCIA_MEDIANA)
    .map((o) => ({
      partido: o.partido,
      tema,
      barrera: 'V5' as const,
      detalle: `${alPublicarse(ctx)}, tiene ${o.palabras} palabras, fuera del ±${TOLERANCIA_MEDIANA * 100} % de la mediana del tema (${m}); ${seReescribira}`,
    }));
}
