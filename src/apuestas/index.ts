// Periodic bet check (#13, story 55): a topic where people guess the party too often (> 60 %) is not
// neutral enough, so an issue is opened to re-neutralise it. Not an automatic barrier: a human decides.
// Ports: the Umami API (counts of 'apuesta-acierto' / 'apuesta-fallo' per topic) and GitHub (`gh`).
import type { Tema } from '../dataset/esquema';

export const UMBRAL_ACIERTO = 0.6;
/** Below this many bets on a topic the rate is noise (a few friends testing), so nothing is opened. */
export const MINIMO_APUESTAS = 30;
export const ETIQUETA = 'reneutralizar';

export interface ConteoApuestas {
  aciertos: number;
  fallos: number;
}
export interface IssueNuevo {
  titulo: string;
  cuerpo: string;
  etiquetas: string[];
}
export interface PuertosApuestas {
  /** topic id → counts over the checked period. */
  contarApuestas(): Promise<Record<string, ConteoApuestas>>;
  /** Titles of the open issues labelled ETIQUETA. */
  issuesAbiertos(): Promise<string[]>;
  abrirIssue(issue: IssueNuevo): Promise<void>;
}
export type AccionTema = 'abierto' | 'ya_abierto' | 'ok' | 'pocas_apuestas';
export interface ResultadoTema {
  tema: string;
  apuestas: number;
  tasa: number;
  accion: AccionTema;
}

const prefijo = (t: Tema) => `Reneutralizar «${t.titulo}»`;
const porcentaje = (x: number) => `${Math.round(x * 100)} %`;

export async function comprobarApuestas(
  puertos: PuertosApuestas,
  { temas, periodo = 'los últimos 30 días' }: { temas: Tema[]; periodo?: string },
): Promise<{ temas: ResultadoTema[] }> {
  const conteos = await puertos.contarApuestas();
  const abiertos = await puertos.issuesAbiertos();
  const resultados: ResultadoTema[] = [];
  for (const tema of temas) {
    const c = conteos[tema.id];
    if (!c) continue;
    const apuestas = c.aciertos + c.fallos;
    const tasa = apuestas ? c.aciertos / apuestas : 0;
    let accion: AccionTema = 'ok';
    if (apuestas < MINIMO_APUESTAS) accion = 'pocas_apuestas';
    else if (tasa > UMBRAL_ACIERTO) {
      if (abiertos.some((t) => t.startsWith(prefijo(tema)))) accion = 'ya_abierto';
      else {
        await puertos.abrirIssue({
          titulo: `${prefijo(tema)}: ${porcentaje(tasa)} de acierto`,
          cuerpo: [
            `En ${periodo}, quienes apostaron de quién era la postura elegida en **${tema.titulo}** (\`${tema.id}\`) acertaron`,
            `el ${porcentaje(tasa)} de las veces (${c.aciertos} de ${apuestas} apuestas). El umbral es ${porcentaje(UMBRAL_ACIERTO)}.`,
            '',
            'Las posturas de este tema probablemente siguen siendo reconocibles: hay que volver a neutralizarlas',
            '(revisar estilo, términos identificativos y el resultado de V11 en los informes) y relanzar el proceso de datos.',
            '',
            'Datos agregados de Umami (eventos `apuesta-acierto` / `apuesta-fallo`): no incluyen qué partido eligió ni apostó nadie.',
            'Abierto automáticamente por `.github/workflows/apuestas.yml`.',
          ].join('\n'),
          etiquetas: [ETIQUETA],
        });
        accion = 'abierto';
      }
    }
    resultados.push({ tema: tema.id, apuestas, tasa, accion });
  }
  return { temas: resultados };
}
