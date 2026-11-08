// Dataset schema: the contract between the data pipeline, the game engine and the web.
// Single source of truth: zod schemas give both the TS types and the published JSON Schema
// (`npm run schema` writes data/dataset.schema.json).
import { z } from 'zod';

const id = z.string().regex(/^[a-z0-9-]+$/, 'id en minúsculas, cifras y guiones');

export const Ambito = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('estatal') }),
  /** Regional party: only shown to voters in these provinces (INE province codes, e.g. "08"). */
  z.object({ tipo: z.literal('provincias'), provincias: z.array(z.string()).min(1) }),
]);

/**
 * What kind of document a party's posturas come from. Only the official 29N programme counts in
 * public; the others are provisional sources allowed only in the private prototype.
 */
export const TipoFuente = z.enum(['programa-29n', 'programa-2023', 'documento-partido', 'declaraciones']);
export const FUENTES_PUBLICAS: readonly TipoFuente[] = ['programa-29n'];
/** Sources usable in public ('publico') or also provisional ones ('privado', private prototype). */
export const Modo = z.enum(['publico', 'privado']);

export const Programa = z.discriminatedUnion('estado', [
  z.object({
    estado: z.literal('publicado'),
    /** Source type of this document; absent means the official 29N programme. */
    fuente: TipoFuente.optional(),
    url: z.url(),
    titulo: z.string(),
    hashPdf: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    fecha: z.string().optional(),
  }),
  z.object({ estado: z.literal('pendiente') }),
]);

export const Partido = z.object({
  id,
  nombre: z.string().min(1),
  siglas: z.string().min(1),
  ambito: Ambito,
  programa: Programa,
  /** Placeholder data used only to fill the private prototype; never shown as real. */
  prueba: z.boolean().optional(),
});

export const Tema = z.object({
  id,
  titulo: z.string().min(1),
  /** Neutral question shown above the cards. */
  pregunta: z.string().min(1),
  /** Plain-language explanation, only for topics with jargon. */
  explicacion: z.string().optional(),
  ambito: z.enum(['nacional', 'canarias']),
  /** Fixed, published order: vivienda first. */
  orden: z.number().int(),
});

export const Cita = z.object({
  texto: z.string().min(40).max(600),
  pagina: z.number().int().min(1),
});

/** Neutral rewrite with the common template: what / how / figure (optional). */
export const TextoNeutral = z.object({
  que: z.string().min(1),
  como: z.string().min(1),
  cifra: z.string().min(1).nullable(),
});

export const Versiones = z.object({ prompt: z.string() });

const basePostura = { partido: id, tema: id, versiones: Versiones };

export const Postura = z.discriminatedUnion('estado', [
  z.object({ ...basePostura, estado: z.literal('propone'), texto: TextoNeutral, citas: z.array(Cita).min(1) }),
  z.object({ ...basePostura, estado: z.literal('no_propone') }),
  /** Extracted but discarded by a barrier: "No pudimos verificar su propuesta". */
  z.object({ ...basePostura, estado: z.literal('sin_verificar') }),
]);

export const Barrera = z.enum(['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V9', 'V10', 'V11', 'V12']);

export const EntradaInforme = z.object({
  /** Absent for programme-level barriers (V7). */
  tema: id.optional(),
  barrera: Barrera,
  /** `extraer`: V12 found a proposal the first pass missed. `aviso`: V11 internal warning, published anyway. */
  resultado: z.enum(['pasa', 'corregir', 'reescribir', 'descartar', 'bloquear', 'extraer', 'aviso']),
  detalle: z.string(),
});

/** Outcome of one postura in the report: final state, rewrites asked for, why it was discarded. */
export const ResumenPostura = z.object({
  tema: id,
  estado: z.enum(['propone', 'no_propone', 'sin_verificar']),
  reescrituras: z.number().int().min(0),
  motivo: z.string().optional(),
});

/** Public verification report, one per programme. */
export const Informe = z.object({
  partido: id,
  hashPdf: z.string().regex(/^[0-9a-f]{64}$/),
  /** Where the PDF was downloaded from (V7) and when. */
  url: z.string().optional(),
  fecha: z.string().optional(),
  versionPrompt: z.string(),
  extraidas: z.number().int().min(0),
  descartadas: z.number().int().min(0),
  publicable: z.boolean(),
  motivo: z.string().optional(),
  posturas: z.array(ResumenPostura),
  entradas: z.array(EntradaInforme),
});

export const Dataset = z
  .object({
    version: z.literal(1),
    generado: z.string(),
    /** "real": produced by the real AI on official PDFs. Anything else must be shown as such. */
    origen: z.enum(['real', 'simulado', 'prueba']),
    nota: z.string().optional(),
    partidos: z.array(Partido),
    temas: z.array(Tema).min(1),
    posturas: z.array(Postura),
    informes: z.array(Informe),
  })
  .superRefine((d, ctx) => {
    const partidos = new Set(d.partidos.map((p) => p.id));
    const temas = new Set(d.temas.map((t) => t.id));
    const vistas = new Set<string>();
    d.posturas.forEach((p, i) => {
      const clave = `${p.partido}/${p.tema}`;
      if (!partidos.has(p.partido)) ctx.addIssue({ code: 'custom', path: ['posturas', i, 'partido'], message: `partido desconocido: ${p.partido}` });
      if (!temas.has(p.tema)) ctx.addIssue({ code: 'custom', path: ['posturas', i, 'tema'], message: `tema desconocido: ${p.tema}` });
      if (vistas.has(clave)) ctx.addIssue({ code: 'custom', path: ['posturas', i], message: `más de un estado para ${clave}` });
      vistas.add(clave);
    });
    // Every published party has exactly one state per topic.
    for (const partido of d.partidos) {
      if (partido.programa.estado !== 'publicado') continue;
      for (const tema of d.temas) {
        if (!vistas.has(`${partido.id}/${tema.id}`))
          ctx.addIssue({ code: 'custom', path: ['posturas'], message: `falta el estado de ${partido.id}/${tema.id}` });
      }
    }
  });

export type TipoFuente = z.infer<typeof TipoFuente>;
export type Modo = z.infer<typeof Modo>;
export type Ambito = z.infer<typeof Ambito>;
export type Partido = z.infer<typeof Partido>;
export type Tema = z.infer<typeof Tema>;
export type Cita = z.infer<typeof Cita>;
export type TextoNeutral = z.infer<typeof TextoNeutral>;
export type Postura = z.infer<typeof Postura>;
export type EntradaInforme = z.infer<typeof EntradaInforme>;
export type ResumenPostura = z.infer<typeof ResumenPostura>;
export type Informe = z.infer<typeof Informe>;
export type Dataset = z.infer<typeof Dataset>;
