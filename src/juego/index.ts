// Game engine (test point B). Pure functions over the dataset, no I/O: runs in the browser.
//   crearPartida(dataset, provincia, semilla, estado?, opciones?) → Partida (immutable; actions return a new one)
import { aplicarModo, esSoloPrivado, fuenteDe } from '../dataset';
import type { Dataset, Modo, NotaViabilidad, Partido, Postura, Tema, TipoFuente } from '../dataset/esquema';
import { barajar } from './azar';

export const NINGUNA = 'ninguna' as const;
export type Ninguna = typeof NINGUNA;

/** INE province codes of the Canary Islands (Las Palmas, Santa Cruz de Tenerife). */
export const PROVINCIAS_CANARIAS = ['35', '38'];

/** Serializable state: what the voter chose per topic (party id, never leaves the browser). */
export interface EstadoPartida {
  /** Insertion order = order in which topics were done. */
  elecciones: Record<string, string | Ninguna>;
  /** Optional bet per topic: the party the voter thought their card was from. */
  apuestas?: Record<string, string>;
  /** Up to MAX_PRIORITARIOS done topics that count double. */
  prioritarios?: string[];
  /** Times each topic was re-shuffled ("Volver a elegir", "Barajar otra vez"). */
  barajados?: Record<string, number>;
  /** Parties with a card in each done topic when it was chosen (to spot new proposals). */
  vistas?: Record<string, string[]>;
  /** Parties with a published programme already announced to the voter; absent = none announced yet. */
  conocidos?: string[];
}

export interface OpcionesEleccion {
  /** Party id the voter bets the chosen card is from. Not allowed with NINGUNA. */
  apuesta?: string;
}

/** Topics that can be marked as important (they count double). */
export const MAX_PRIORITARIOS = 3;

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
  /** Proposals published since the voter chose ("Nuevo: 1 propuesta"); 0 if none. */
  nuevas: number;
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
  /** Public shuffle id shown to the voter ("Tu barajado: #4F2A"). */
  barajado: string;
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
  /** Parties in play here whose programme is not published yet, by name. */
  pendientes: PartidoZona[];
  /** The bet, if any, and whether it was right. */
  apuesta: { partido: PartidoRevelado; acertada: boolean } | null;
  /** Factual journey label ("Tu primera elección"…); never a judgement. */
  recorrido: Recorrido | null;
}

export type Recorrido =
  | { tipo: 'primera' }
  | { tipo: 'partido_nuevo'; partido: PartidoRevelado }
  | { tipo: 'distintos'; temas: number; partidos: number };

export interface FilaRanking {
  partido: PartidoZona;
  /** 1 per choice, 2 in a priority topic. */
  puntos: number;
  /** Rounded share of the points possible over every done topic ("Ninguna" included). */
  porcentaje: number;
  /** Topics where this party's card was chosen. */
  temas: number;
  /** Same place for ties (1, 2, 2, 4). */
  puesto: number;
  empate: boolean;
}

export interface Resultado {
  /** True from META_TEMAS done topics. */
  disponible: boolean;
  temas: number;
  /** Topics where nothing convinced the voter (they add to no party). */
  ninguna: number;
  todoNinguna: boolean;
  partidosDistintos: number;
  /** Every party in play with a programme, also at 0 %. Empty if every choice was "Ninguna". */
  ranking: FilaRanking[];
  /** "⏳ Falta [Partido]": parties in play without a published programme. */
  pendientes: PartidoZona[];
  /** "Solo partidos nacionales…": the voter did not give a province. */
  sinProvincia: boolean;
  /** Done topics with proposals the voter has not seen yet. */
  temasConNovedades: number;
  apuestas: {
    total: number;
    /** Bets where the chosen card was not from the party guessed. */
    falladas: number;
    /** Failed bets grouped by the party actually chosen, by name. */
    sorpresas: { partido: PartidoRevelado; temas: Tema[] }[];
  };
}

export interface Novedades {
  /** Parties that published their programme since they were last announced. */
  partidos: PartidoZona[];
  /** Done topics with proposals published after the voter chose. */
  temas: { tema: Tema; nuevas: number }[];
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

export interface Partida {
  readonly estado: EstadoPartida;
  /** INE province code, or null for "Prefiero no decirlo" (national parties only). */
  readonly provincia: string | null;
  /** Parties in play here, alphabetically by name. */
  partidos(): PartidosZona;
  /** Topics for this province, in their fixed order. */
  temas(): Tema[];
  tema(temaId: string): VistaTema;
  /** Choose a card by letter, or NINGUNA ("Ninguna me convence"), with an optional bet. */
  elegir(temaId: string, letra: string | Ninguna, opciones?: OpcionesEleccion): Partida;
  /** Bet chips: parties with a card in this topic, by name. */
  opcionesApuesta(temaId: string): PartidoRevelado[];
  /** Forget this topic's choice and bet, and re-shuffle its cards. */
  volverAElegir(temaId: string): Partida;
  /** Re-shuffle a topic not chosen yet. */
  barajarOtraVez(temaId: string): Partida;
  /** Mark (or unmark) a done topic as important; throws on a 4th one. */
  marcarPrioritario(temaId: string, marcado: boolean): Partida;
  /** Priority topics that are done here. */
  prioritarios(): string[];
  /** Affinity result: full ranking in percentages. */
  resultado(): Resultado;
  /** What changed since the last visit. */
  novedades(): Novedades;
  /** The voter has seen the published-programme news. */
  marcarConocidos(): Partida;
  /** "Mantener mis elecciones": the new proposals are marked as seen in every done topic. */
  mantenerElecciones(): Partida;
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

  /** "4F2A", then "4F2A-1", "4F2A-2"… after each re-shuffle of the topic. */
  const barajado = (temaId: string) => {
    const n = estado.barajados?.[temaId] ?? 0;
    return n ? `${semilla}-${n}` : semilla;
  };
  /** Cards in their shuffled order, stable for (semilla, tema, re-shuffles). */
  const barajadas = (temaId: string) => {
    const conPropuesta = posturasDe(temaId)
      .filter((p): p is PosturaPropone => p.estado === 'propone')
      .sort((a, b) => a.partido.localeCompare(b.partido));
    return barajar(conPropuesta, `${barajado(temaId)}:${temaId}`).map((postura, i) => ({
      postura,
      tarjeta: aTarjeta(postura, LETRAS[i]!),
    }));
  };

  const zona = (p: Partido): PartidoZona => ({ ...revelarPartido(p), regional: p.ambito.tipo === 'provincias' });
  const porNombre = (a: PartidoRevelado, b: PartidoRevelado) => a.nombre.localeCompare(b.nombre, 'es');
  const pendientesZona = () => pendientes.map(zona).sort(porNombre);
  /** Same dataset, province and options; new state. */
  const con = (cambios: Partial<EstadoPartida>) => crearPartida(dataset, provincia, semilla, { ...estado, ...cambios }, opciones);
  const sin = <T>(r: Record<string, T> | undefined, clave: string) => {
    const { [clave]: _, ...resto } = r ?? {};
    return resto;
  };
  const partidosConTarjeta = (temaId: string) => barajadas(temaId).map((b) => b.postura.partido);
  const nuevasEn = (temaId: string) => {
    const vistas = estado.vistas?.[temaId];
    return vistas ? partidosConTarjeta(temaId).filter((id) => !vistas.includes(id)).length : 0;
  };
  /** Choice for a topic, ignoring parties no longer in play here (they add to no one). */
  const eleccionDe = (temaId: string) => estado.elecciones[temaId];

  return {
    estado,
    provincia,
    partidos: () => ({ conPrograma: publicados.map(zona).sort(porNombre), pendientes: pendientesZona() }),
    temas: () => temas,
    tema(temaId) {
      const tema = buscarTema(temaId);
      return {
        tema,
        tarjetas: barajadas(temaId).map((b) => b.tarjeta),
        barajado: barajado(temaId),
        sinPropuesta: posturasDe(temaId).filter((p) => p.estado === 'no_propone').length,
      };
    },
    elegir(temaId, letra, { apuesta } = {}) {
      buscarTema(temaId);
      let eleccion: string;
      if (letra === NINGUNA) {
        if (apuesta !== undefined) throw new Error('No se puede apostar con «Ninguna me convence»');
        eleccion = NINGUNA;
      } else {
        const b = barajadas(temaId).find((x) => x.tarjeta.letra === letra);
        if (!b) throw new Error(`No hay tarjeta ${letra} en ${temaId}`);
        eleccion = b.postura.partido;
      }
      if (apuesta !== undefined && !partidosConTarjeta(temaId).includes(apuesta))
        throw new Error(`No se puede apostar por ${apuesta} en ${temaId}: no tiene tarjeta`);
      const { [temaId]: _, ...otras } = estado.elecciones;
      return con({
        // Re-inserted at the end: a topic chosen again counts as the latest one done.
        elecciones: { ...otras, [temaId]: eleccion },
        apuestas: apuesta === undefined ? sin(estado.apuestas, temaId) : { ...estado.apuestas, [temaId]: apuesta },
        vistas: { ...estado.vistas, [temaId]: partidosConTarjeta(temaId) },
      });
    },
    opcionesApuesta(temaId) {
      buscarTema(temaId);
      return partidosConTarjeta(temaId).map((id) => revelarPartido(porId.get(id)!)).sort(porNombre);
    },
    volverAElegir(temaId) {
      buscarTema(temaId);
      return con({
        elecciones: sin(estado.elecciones, temaId),
        apuestas: sin(estado.apuestas, temaId),
        vistas: sin(estado.vistas, temaId),
        barajados: { ...estado.barajados, [temaId]: (estado.barajados?.[temaId] ?? 0) + 1 },
      });
    },
    barajarOtraVez(temaId) {
      buscarTema(temaId);
      if (eleccionDe(temaId) !== undefined) throw new Error(`Ya has elegido en ${temaId}: usa «Volver a elegir»`);
      return con({ barajados: { ...estado.barajados, [temaId]: (estado.barajados?.[temaId] ?? 0) + 1 } });
    },
    marcarPrioritario(temaId, marcado) {
      buscarTema(temaId);
      const actuales = prioritarios();
      if (!marcado) return con({ prioritarios: (estado.prioritarios ?? []).filter((t) => t !== temaId) });
      if (actuales.includes(temaId)) return con({});
      if (!hechos().includes(temaId)) throw new Error(`Solo se pueden marcar temas hechos: ${temaId}`);
      if (actuales.length >= MAX_PRIORITARIOS) throw new Error(`Ya tienes ${MAX_PRIORITARIOS}. Quita uno.`);
      return con({ prioritarios: [...actuales, temaId] });
    },
    prioritarios,
    revelar(temaId) {
      const tema = buscarTema(temaId);
      const eleccion = eleccionDe(temaId);
      if (eleccion === undefined) return null;
      const lista = barajadas(temaId);
      const conEstado = (e: Postura['estado']) =>
        posturasDe(temaId).filter((p) => p.estado === e).map((p) => revelarPartido(porId.get(p.partido)!));
      const apostado = estado.apuestas?.[temaId];
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
        pendientes: pendientesZona(),
        apuesta:
          apostado !== undefined && porId.has(apostado)
            ? { partido: revelarPartido(porId.get(apostado)!), acertada: apostado === eleccion }
            : null,
        recorrido: recorrido(temaId),
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
        const e = eleccionDe(tema.id);
        return { tema, estado: e === undefined ? 'sin_empezar' : e === NINGUNA ? 'ninguna' : 'hecho', nuevas: nuevasEn(tema.id) };
      };
      return {
        sugeridos: temas.slice(0, META_TEMAS).map(item),
        extra: temas.slice(META_TEMAS).sort((a, b) => a.titulo.localeCompare(b.titulo, 'es')).map(item),
      };
    },
    resultado() {
      const hechosIds = hechos();
      const peso = (t: string) => (prioritarios().includes(t) ? 2 : 1);
      const posibles = hechosIds.reduce((s, t) => s + peso(t), 0);
      const puntos = new Map<string, { puntos: number; temas: number }>();
      let ninguna = 0;
      for (const t of hechosIds) {
        const e = eleccionDe(t)!;
        if (e === NINGUNA) ninguna++;
        else if (porId.has(e)) {
          const p = puntos.get(e) ?? { puntos: 0, temas: 0 };
          puntos.set(e, { puntos: p.puntos + peso(t), temas: p.temas + 1 });
        }
      }
      const todoNinguna = hechosIds.length > 0 && ninguna === hechosIds.length;
      const filas = publicados
        .map(zona)
        .map((partido) => {
          const p = puntos.get(partido.id) ?? { puntos: 0, temas: 0 };
          return { partido, ...p, porcentaje: posibles ? Math.round((100 * p.puntos) / posibles) : 0 };
        })
        .sort((a, b) => b.puntos - a.puntos || porNombre(a.partido, b.partido));
      const ranking: FilaRanking[] = todoNinguna
        ? []
        : filas.map((f) => {
            const iguales = filas.filter((g) => g.puntos === f.puntos).length;
            return { ...f, puesto: 1 + filas.filter((g) => g.puntos > f.puntos).length, empate: iguales > 1 };
          });

      const apostados = hechosIds.filter((t) => estado.apuestas?.[t] !== undefined);
      const falladas = apostados.filter((t) => estado.apuestas![t] !== eleccionDe(t));
      const sorpresas = new Map<string, Tema[]>();
      for (const t of falladas) {
        const e = eleccionDe(t)!;
        if (porId.has(e)) sorpresas.set(e, [...(sorpresas.get(e) ?? []), buscarTema(t)]);
      }
      return {
        disponible: hechosIds.length >= META_TEMAS,
        temas: hechosIds.length,
        ninguna,
        todoNinguna,
        partidosDistintos: [...puntos.keys()].length,
        ranking,
        pendientes: pendientesZona(),
        sinProvincia: provincia === null,
        temasConNovedades: hechosIds.filter((t) => nuevasEn(t) > 0).length,
        apuestas: {
          total: apostados.length,
          falladas: falladas.length,
          sorpresas: [...sorpresas]
            .map(([id, temas]) => ({ partido: revelarPartido(porId.get(id)!), temas }))
            .sort((a, b) => porNombre(a.partido, b.partido)),
        },
      };
    },
    novedades() {
      const conocidos = estado.conocidos;
      return {
        partidos: conocidos ? publicados.filter((p) => !conocidos.includes(p.id)).map(zona).sort(porNombre) : [],
        temas: hechos()
          .map((id) => ({ tema: buscarTema(id), nuevas: nuevasEn(id) }))
          .filter((t) => t.nuevas > 0),
      };
    },
    marcarConocidos() {
      // Keep parties known from other provinces: changing province must not re-announce them.
      const ids = new Set([...(estado.conocidos ?? []), ...publicados.map((p) => p.id)]);
      return con({ conocidos: [...ids].sort() });
    },
    mantenerElecciones() {
      const vistas = { ...estado.vistas };
      for (const t of hechos()) vistas[t] = partidosConTarjeta(t);
      return con({ vistas });
    },
  };

  function hechos(): string[] {
    return Object.keys(estado.elecciones).filter((id) => temas.some((t) => t.id === id));
  }

  function prioritarios(): string[] {
    const h = hechos();
    return (estado.prioritarios ?? []).filter((t) => h.includes(t));
  }

  /** Label for the topic as it was when chosen: only choices made up to it count. */
  function recorrido(temaId: string): Recorrido | null {
    const lista = hechos();
    const hasta = lista.slice(0, lista.indexOf(temaId) + 1);
    if (hasta.length === 1) return { tipo: 'primera' };
    const e = eleccionDe(temaId)!;
    if (e === NINGUNA || !porId.has(e)) return null;
    const antes = hasta.slice(0, -1).map(eleccionDe);
    if (!antes.includes(e)) return { tipo: 'partido_nuevo', partido: revelarPartido(porId.get(e)!) };
    if (hasta.length < 3) return null;
    const distintos = new Set(hasta.map(eleccionDe).filter((x): x is string => x !== NINGUNA && x !== undefined && porId.has(x)));
    return { tipo: 'distintos', temas: hasta.length, partidos: distintos.size };
  }
}

function aTarjeta(p: PosturaPropone, letra: string): Tarjeta {
  return {
    letra,
    titular: p.texto.que,
    detalle: p.texto.cifra ? `${p.texto.como} Cifra: ${p.texto.cifra}.` : p.texto.como,
  };
}

function revelarPartido(p: Partido): PartidoRevelado {
  return { id: p.id, nombre: p.nombre, siglas: p.siglas, prueba: p.prueba === true };
}
