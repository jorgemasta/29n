// Game engine (test point B). Pure functions over the dataset, no I/O: runs in the browser.
//   crearPartida(dataset, provincia, semilla, estado?, opciones?) → Partida (immutable; actions return a new one)
import { aplicarModo, esSoloPrivado, fuenteDe } from '../dataset';
import type { Dataset, Modo, NotaViabilidad, Partido, Postura, Pregunta, RespuestaPregunta, Tema, TipoFuente } from '../dataset/esquema';
import { barajar } from './azar';

export const NINGUNA = 'ninguna' as const;
export type Ninguna = typeof NINGUNA;

/** INE province codes of the Canary Islands (Las Palmas, Santa Cruz de Tenerife). */
export const PROVINCIAS_CANARIAS = ['35', '38'];

/** Serializable state: what the voter chose per topic (party id, never leaves the browser). */
export interface EstadoPartida {
  /** Insertion order = order in which topics were done. */
  elecciones: Record<string, string | Ninguna>;
}

export interface OpcionesPartida {
  /** 'publico' (default) only uses official programmes; 'privado' adds provisional sources. */
  modo?: Modo;
}

/** Visible goal: the result is offered after this many topics; later ones are "extra". */
export const META_TEMAS = 5;

/** "Tema 2 de 5" or "Tema extra". */
export type Posicion = { tipo: 'meta'; numero: number; meta: number } | { tipo: 'extra' };

export interface ItemTema {
  tema: Tema;
  estado: 'sin_empezar' | 'hecho' | 'ninguna';
}

export interface ListaTemas {
  /** The first META_TEMAS topics in the fixed order. */
  sugeridos: ItemTema[];
  /** The rest, alphabetically. */
  extra: ItemTema[];
}

export interface Tarjeta {
  letra: string;
  titular: string;
  detalle: string;
}

export interface VistaTema {
  tema: Tema;
  tarjetas: Tarjeta[];
  /** Parties that propose nothing on this topic (cards hidden until the reveal). */
  sinPropuesta: number;
}

export interface PartidoRevelado {
  id: string;
  nombre: string;
  siglas: string;
  prueba: boolean;
}

export interface TarjetaRevelada extends Tarjeta {
  partido: PartidoRevelado;
  elegida: boolean;
  citas: { texto: string; pagina: number; enlace: string }[];
  tituloPrograma: string;
  /** Blind feasibility note (V13); null if the postura has none. Only shown after choosing. */
  viabilidad: NotaViabilidad | null;
  /** Source type; provisional sources are marked "solo privado". */
  fuente: { tipo: TipoFuente; soloPrivado: boolean };
}

export interface Revelacion {
  tema: Tema;
  eleccion: string | Ninguna;
  tarjetas: TarjetaRevelada[];
  sinPropuesta: PartidoRevelado[];
  /** Extracted but failed verification: "No pudimos verificar su propuesta". */
  sinVerificar: PartidoRevelado[];
  /** Parties whose programme is not published yet. */
  pendientes: PartidoRevelado[];
}

/** A party in play for this province; `regional` = only runs in some provinces. */
export interface PartidoZona extends PartidoRevelado {
  regional: boolean;
}

export interface PartidosZona {
  /** National parties plus those running in the province, with a published programme. */
  conPrograma: PartidoZona[];
  /** Same scope, programme not published yet: "⏳ programa pendiente", never a card. */
  pendientes: PartidoZona[];
}

/** Question to answer: a suggested one (dataset) or a live free question (#15). */
export type PreguntaVista = Pick<Pregunta, 'id' | 'texto'>;

/** Preguntar, blind phase: anonymous answers A, B, C… ("Cita disponible al descubrir"). */
export interface VistaPregunta {
  pregunta: PreguntaVista;
  tarjetas: Tarjeta[];
  /** Parties in play whose programme does not mention it. */
  noMencionan: number;
  /** No programme in play talks about it: "Ningún programa habla de esto". */
  ninguno: boolean;
}

export interface TarjetaPreguntaRevelada extends Tarjeta {
  partido: PartidoRevelado;
  citas: { texto: string; pagina: number; enlace: string }[];
  tituloPrograma: string;
  /** Source type; provisional sources are marked "solo privado". */
  fuente: { tipo: TipoFuente; soloPrivado: boolean };
}

/** Preguntar, after "Ver de quién es cada una". No feasibility note; does not count for the result. */
export interface RevelacionPregunta {
  pregunta: PreguntaVista;
  tarjetas: TarjetaPreguntaRevelada[];
  /** "El programa de X no lo menciona". */
  noMencionan: PartidoRevelado[];
  /** "No pudimos verificar su respuesta". */
  sinVerificar: PartidoRevelado[];
  pendientes: PartidoRevelado[];
  ninguno: boolean;
}

export interface Partida {
  readonly estado: EstadoPartida;
  /** INE province code, or null for "Prefiero no decirlo" (national parties only). */
  readonly provincia: string | null;
  /** Parties in play here, alphabetically by name. */
  partidos(): PartidosZona;
  /** Topics for this province, in their fixed order. */
  temas(): Tema[];
  tema(temaId: string): VistaTema;
  /** Choose a card by letter, or NINGUNA ("Ninguna me convence"). */
  elegir(temaId: string, letra: string | Ninguna): Partida;
  /** Null until the voter has chosen on this topic. */
  revelar(temaId: string): Revelacion | null;
  /** Done topic ids, in the order they were done ("Ninguna" counts as done). */
  hechos(): string[];
  /** "Tema N de 5" for the goal topics, "extra" afterwards. */
  posicion(temaId: string): Posicion;
  /** Next topic not done yet in the fixed order, after `temaId` (wrapping); null if all done. */
  siguiente(temaId?: string): Tema | null;
  /** Topic list: 5 suggested topics first, then the extra ones alphabetically. */
  lista(): ListaTemas;
  /** Suggested questions of the Preguntar tab, in their fixed order. */
  preguntas(): Pregunta[];
  /**
   * Anonymous answers to a suggested question (by id, answers from the dataset), or to any
   * question with the given answers (live free question, #15). Same province and pending rules
   * as the topics; order shuffled stably per seed and question.
   */
  pregunta(pregunta: string | PreguntaVista, respuestas?: RespuestaPregunta[]): VistaPregunta;
  /** Who wrote each answer, with quotes. Revealing never changes the game state. */
  revelarPregunta(pregunta: string | PreguntaVista, respuestas?: RespuestaPregunta[]): RevelacionPregunta;
}

type PosturaPropone = Extract<Postura, { estado: 'propone' }>;
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function crearPartida(
  dataset: Dataset,
  provincia: string | null,
  semilla: string,
  estado: EstadoPartida = { elecciones: {} },
  opciones: OpcionesPartida = {},
): Partida {
  dataset = aplicarModo(dataset, opciones.modo ?? 'publico');
  const enJuego = (p: Partido) => p.ambito.tipo === 'estatal' || (provincia !== null && p.ambito.provincias.includes(provincia));
  const partidosZona = dataset.partidos.filter(enJuego);
  const publicados = partidosZona.filter((p) => p.programa.estado === 'publicado');
  const pendientes = partidosZona.filter((p) => p.programa.estado === 'pendiente');
  const porId = new Map(publicados.map((p) => [p.id, p]));
  const esCanarias = provincia !== null && PROVINCIAS_CANARIAS.includes(provincia);
  const temas = dataset.temas
    .filter((t) => t.ambito === 'nacional' || esCanarias)
    .sort((a, b) => a.orden - b.orden);

  const buscarTema = (temaId: string) => {
    const tema = temas.find((t) => t.id === temaId);
    if (!tema) throw new Error(`Tema no disponible: ${temaId}`);
    return tema;
  };
  const posturasDe = (temaId: string) => dataset.posturas.filter((p) => p.tema === temaId && porId.has(p.partido));

  /** Cards in their shuffled order, stable for (semilla, tema). */
  const barajadas = (temaId: string) => {
    const conPropuesta = posturasDe(temaId)
      .filter((p): p is PosturaPropone => p.estado === 'propone')
      .sort((a, b) => a.partido.localeCompare(b.partido));
    return barajar(conPropuesta, `${semilla}:${temaId}`).map((postura, i) => ({
      postura,
      tarjeta: aTarjeta(postura, LETRAS[i]!),
    }));
  };

  const preguntas = [...(dataset.preguntas ?? [])].sort((a, b) => a.orden - b.orden);
  /** Answers of the parties in play, in their shuffled order (stable per seed and question). */
  const respuestasDe = (q: string | PreguntaVista, dadas?: RespuestaPregunta[]) => {
    const pregunta = typeof q === 'string' ? preguntas.find((p) => p.id === q) : q;
    if (!pregunta) throw new Error(`Pregunta no disponible: ${String(q)}`);
    const todas = (dadas ?? dataset.respuestas ?? []).filter((r) => r.pregunta === pregunta.id && porId.has(r.partido));
    const conRespuesta = todas
      .filter((r): r is Extract<RespuestaPregunta, { estado: 'responde' }> => r.estado === 'responde')
      .sort((a, b) => a.partido.localeCompare(b.partido));
    const barajadas = barajar(conRespuesta, `${semilla}:pregunta:${pregunta.id}`).map((respuesta, i) => ({
      respuesta,
      tarjeta: aTarjeta(respuesta, LETRAS[i]!),
    }));
    const conEstado = (e: RespuestaPregunta['estado']) =>
      todas.filter((r) => r.estado === e).map((r) => revelarPartido(porId.get(r.partido)!)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return { pregunta: { id: pregunta.id, texto: pregunta.texto }, barajadas, conEstado };
  };

  const zona = (p: Partido): PartidoZona => ({ ...revelarPartido(p), regional: p.ambito.tipo === 'provincias' });
  const porNombre = (a: PartidoZona, b: PartidoZona) => a.nombre.localeCompare(b.nombre, 'es');

  return {
    estado,
    provincia,
    partidos: () => ({ conPrograma: publicados.map(zona).sort(porNombre), pendientes: pendientes.map(zona).sort(porNombre) }),
    temas: () => temas,
    tema(temaId) {
      const tema = buscarTema(temaId);
      return {
        tema,
        tarjetas: barajadas(temaId).map((b) => b.tarjeta),
        sinPropuesta: posturasDe(temaId).filter((p) => p.estado === 'no_propone').length,
      };
    },
    elegir(temaId, letra) {
      buscarTema(temaId);
      let eleccion: string;
      if (letra === NINGUNA) eleccion = NINGUNA;
      else {
        const b = barajadas(temaId).find((x) => x.tarjeta.letra === letra);
        if (!b) throw new Error(`No hay tarjeta ${letra} en ${temaId}`);
        eleccion = b.postura.partido;
      }
      return crearPartida(dataset, provincia, semilla, { elecciones: { ...estado.elecciones, [temaId]: eleccion } }, opciones);
    },
    revelar(temaId) {
      const tema = buscarTema(temaId);
      const eleccion = estado.elecciones[temaId];
      if (eleccion === undefined) return null;
      const lista = barajadas(temaId);
      const conEstado = (e: Postura['estado']) =>
        posturasDe(temaId).filter((p) => p.estado === e).map((p) => revelarPartido(porId.get(p.partido)!));
      return {
        tema,
        eleccion: eleccion === NINGUNA ? NINGUNA : (lista.find((b) => b.postura.partido === eleccion)?.tarjeta.letra ?? NINGUNA),
        tarjetas: lista.map(({ postura, tarjeta }) => {
          const partido = porId.get(postura.partido)!;
          const url = partido.programa.estado === 'publicado' ? partido.programa.url : '';
          return {
            ...tarjeta,
            partido: revelarPartido(partido),
            elegida: postura.partido === eleccion,
            tituloPrograma: partido.programa.estado === 'publicado' ? partido.programa.titulo : '',
            citas: postura.citas.map((c) => ({ ...c, enlace: `${url}#page=${c.pagina}` })),
            viabilidad: postura.viabilidad ?? null,
            fuente: { tipo: fuenteDe(partido)!, soloPrivado: esSoloPrivado(fuenteDe(partido)!) },
          };
        }),
        sinPropuesta: conEstado('no_propone'),
        sinVerificar: conEstado('sin_verificar'),
        pendientes: pendientes.map(revelarPartido),
      };
    },
    hechos,
    posicion(temaId) {
      buscarTema(temaId);
      const lista = hechos();
      const i = lista.indexOf(temaId);
      const numero = (i === -1 ? lista.length : i) + 1;
      return numero <= META_TEMAS ? { tipo: 'meta', numero, meta: META_TEMAS } : { tipo: 'extra' };
    },
    siguiente(temaId) {
      const desde = temaId === undefined ? -1 : temas.indexOf(buscarTema(temaId));
      const hecho = new Set(hechos());
      for (let k = 1; k <= temas.length; k++) {
        const t = temas[(desde + k) % temas.length]!;
        if (!hecho.has(t.id)) return t;
      }
      return null;
    },
    lista() {
      const item = (tema: Tema): ItemTema => {
        const e = estado.elecciones[tema.id];
        return { tema, estado: e === undefined ? 'sin_empezar' : e === NINGUNA ? 'ninguna' : 'hecho' };
      };
      return {
        sugeridos: temas.slice(0, META_TEMAS).map(item),
        extra: temas.slice(META_TEMAS).sort((a, b) => a.titulo.localeCompare(b.titulo, 'es')).map(item),
      };
    },
    preguntas: () => preguntas,
    pregunta(q, dadas) {
      const { pregunta, barajadas, conEstado } = respuestasDe(q, dadas);
      return {
        pregunta,
        tarjetas: barajadas.map((b) => b.tarjeta),
        noMencionan: conEstado('no_menciona').length,
        ninguno: barajadas.length === 0,
      };
    },
    revelarPregunta(q, dadas) {
      const { pregunta, barajadas, conEstado } = respuestasDe(q, dadas);
      return {
        pregunta,
        tarjetas: barajadas.map(({ respuesta, tarjeta }) => {
          const partido = porId.get(respuesta.partido)!;
          const url = partido.programa.estado === 'publicado' ? partido.programa.url : '';
          return {
            ...tarjeta,
            partido: revelarPartido(partido),
            tituloPrograma: partido.programa.estado === 'publicado' ? partido.programa.titulo : '',
            citas: respuesta.citas.map((c) => ({ ...c, enlace: `${url}#page=${c.pagina}` })),
            fuente: { tipo: fuenteDe(partido)!, soloPrivado: esSoloPrivado(fuenteDe(partido)!) },
          };
        }),
        noMencionan: conEstado('no_menciona'),
        sinVerificar: conEstado('sin_verificar'),
        pendientes: pendientes.map(revelarPartido),
        ninguno: barajadas.length === 0,
      };
    },
  };

  function hechos(): string[] {
    return Object.keys(estado.elecciones).filter((id) => temas.some((t) => t.id === id));
  }
}

/** Same card text for a postura and for an answer (both use the que / como / cifra template). */
function aTarjeta(p: { texto: PosturaPropone['texto'] }, letra: string): Tarjeta {
  return {
    letra,
    titular: p.texto.que,
    detalle: p.texto.cifra ? `${p.texto.como} Cifra: ${p.texto.cifra}.` : p.texto.como,
  };
}

function revelarPartido(p: Partido): PartidoRevelado {
  return { id: p.id, nombre: p.nombre, siglas: p.siglas, prueba: p.prueba === true };
}
