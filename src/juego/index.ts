// Game engine (test point B). Pure functions over the dataset, no I/O: runs in the browser.
//   crearPartida(dataset, provincia, semilla, estado?) → Partida (immutable; actions return a new one)
import type { Dataset, NotaViabilidad, Partido, Postura, Tema } from '../dataset/esquema';
import { barajar } from './azar';

export const NINGUNA = 'ninguna' as const;
export type Ninguna = typeof NINGUNA;

/** INE province codes of the Canary Islands (Las Palmas, Santa Cruz de Tenerife). */
export const PROVINCIAS_CANARIAS = ['35', '38'];

/** Serializable state: what the voter chose per topic (party id, never leaves the browser). */
export interface EstadoPartida {
  elecciones: Record<string, string | Ninguna>;
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

export interface Partida {
  readonly estado: EstadoPartida;
  /** Topics for this province, in their fixed order. */
  temas(): Tema[];
  tema(temaId: string): VistaTema;
  /** Choose a card by letter, or NINGUNA ("Ninguna me convence"). */
  elegir(temaId: string, letra: string | Ninguna): Partida;
  /** Null until the voter has chosen on this topic. */
  revelar(temaId: string): Revelacion | null;
}

type PosturaPropone = Extract<Postura, { estado: 'propone' }>;
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function crearPartida(
  dataset: Dataset,
  provincia: string | null,
  semilla: string,
  estado: EstadoPartida = { elecciones: {} },
): Partida {
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

  return {
    estado,
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
      return crearPartida(dataset, provincia, semilla, { elecciones: { ...estado.elecciones, [temaId]: eleccion } });
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
          };
        }),
        sinPropuesta: conEstado('no_propone'),
        sinVerificar: conEstado('sin_verificar'),
        pendientes: pendientes.map(revelarPartido),
      };
    },
  };
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
