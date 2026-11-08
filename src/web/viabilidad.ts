// Renders the blind feasibility note of a revealed card (V13). One tone, never a traffic light;
// "sin concreción" and "sin consenso" sit outside the scale with their own icon. Always labelled IA.
import type { Evaluacion, Fuente, NotaViabilidad } from '../dataset/esquema';
import { CRITERIOS, FUERA_DE_ESCALA, NIVELES, nombreNivel } from '../registro/rubrica';
import { etiquetaIA } from './ia';
import { h } from './dom';

export const URL_RUBRICA = '/rubrica/';


/** Short chip for the card header: "Viable con matices · IA". */
export function chipViabilidad(nota: NotaViabilidad | null): HTMLElement | null {
  if (!nota) return null;
  return h('span', { class: 'chip-viabilidad' }, `${nombreCorto(nota)} · IA`);
}

/**
 * Full note: scale, "por qué" with sources, rubric reasons and method box. `sinFuentes`: the argument
 * was published without verifiable sources (V8 gave up after its repeats); said up front.
 */
export function notaViabilidad(nota: NotaViabilidad | null, sinFuentes = false): HTMLElement | null {
  if (!nota) return null;
  const consenso = nota.resultado !== 'sin_consenso';
  const publicada = consenso ? (nota.evaluaciones.find((e) => e.porque === nota.porque) ?? nota.evaluaciones[0]) : null;
  return h('section', { class: 'viabilidad', 'aria-label': 'Viabilidad' },
    h('h3', {}, 'Viabilidad ', etiquetaIA('/metodologia/#viabilidad')),
    escala(nota),
    h('p', { class: 'nivel' }, h('strong', {}, `${nombreNivel(nota.resultado)}: `), explicacion(nota)),
    sinFuentes
      ? h('p', { class: 'sin-fuentes' }, h('strong', {}, 'Sin fuentes verificables. '),
          'La IA no aportó fuentes institucionales que pudiéramos comprobar, ni al repetir la evaluación. Tómalo con más cautela.')
      : null,
    publicada
      ? porque(publicada.porque, nota.fuentes)
      : h('div', { class: 'argumentos' },
          ...nota.evaluaciones.map((e, i) =>
            h('div', { class: 'argumento' },
              h('p', {}, h('strong', {}, `Evaluación ${i + 1}: ${nombreNivel(e.nivel)}`)),
              porque(e.porque, e.fuentes),
              rubrica(e),
            ),
          ),
        ),
    publicada ? rubrica(publicada) : null,
    h('p', { class: 'metodo' },
      'Evaluación hecha por IA, sin revisión humana, dos veces y sin saber de qué partido era. Puede equivocarse. ',
      h('a', { href: URL_RUBRICA }, 'Cómo se valora →'),
    ),
  );
}

function nombreCorto(nota: NotaViabilidad): string {
  if (nota.resultado === 'sin_concrecion') return 'Sin concreción';
  if (nota.resultado === 'sin_consenso') return 'Sin consenso';
  return nombreNivel(nota.resultado);
}

function explicacion(nota: NotaViabilidad): string {
  if (nota.resultado === 'sin_consenso') {
    const [a, b] = nota.evaluaciones.map((e) => nombreNivel(e.nivel));
    return `dos evaluaciones de la IA no coincidieron (una: ${a}; otra: ${b}). Preferimos enseñártelo a elegir una.`;
  }
  if (nota.resultado === 'sin_concrecion') return FUERA_DE_ESCALA.sin_concrecion.explicacion;
  return NIVELES.find((n) => n.id === nota.resultado)!.explicacion;
}

/** Four steps in a single tone; out-of-scale results get their own icon instead. */
function escala(nota: NotaViabilidad): HTMLElement {
  const i = NIVELES.findIndex((n) => n.id === nota.resultado);
  if (i === -1)
    return h('p', { class: 'fuera-escala', 'aria-hidden': 'true' }, nota.resultado === 'sin_consenso' ? '≠' : '?');
  return h('ol', { class: 'escala', 'aria-hidden': 'true' },
    ...NIVELES.map((n, j) => h('li', { class: j === i ? 'actual' : '' }, n.nombre)),
  );
}

function porque(texto: string, fuentes: Fuente[]): HTMLElement {
  return h('div', { class: 'porque' },
    h('p', {}, h('strong', {}, 'Por qué: '), texto),
    fuentes.length
      ? h('ul', { class: 'fuentes', 'aria-label': 'Fuentes' },
          ...fuentes.map((f) => h('li', {}, h('a', { href: f.url, target: '_blank', rel: 'noopener' }, `${f.titulo} ↗`))))
      : h('p', { class: 'gris' }, 'Sin fuentes verificables.'),
  );
}

function rubrica(e: Evaluacion): HTMLElement {
  return h('details', { class: 'rubrica' },
    h('summary', {}, 'Criterio a criterio'),
    h('dl', {}, ...CRITERIOS.flatMap((c) => [h('dt', {}, c.titulo), h('dd', {}, e.razones[c.id])])),
  );
}
