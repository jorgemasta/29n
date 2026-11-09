// Renders the blind feasibility note of a revealed card (V13). One tone, never a traffic light;
// "sin concreción" and "sin consenso" sit outside the scale with their own icon. Always labelled IA.
import type { Assessment, Source, FeasibilityNote } from '../dataset/schema';
import { CRITERIA, OFF_SCALE, LEVELS, levelName } from '../registry/rubric';
import { aiLabel } from './ai';
import { h } from './dom';

export const RUBRIC_URL = '/rubrica/';


/** Short chip for the card header: "Viable con matices · IA". */
export function feasibilityChip(note: FeasibilityNote | null): HTMLElement | null {
  if (!note) return null;
  return h('span', { class: 'feasibility-chip' }, `${shortName(note)} · IA`);
}

/**
 * Full note: scale, "por qué" with sources, rubric reasons and method box. `noSources`: the argument
 * was published without verifiable sources (V8 gave up after its repeats); said up front.
 */
export function feasibilityNote(note: FeasibilityNote | null, noSources = false): HTMLElement | null {
  if (!note) return null;
  const consensus = note.result !== 'noConsensus';
  const published = consensus ? (note.assessments.find((e) => e.why === note.why) ?? note.assessments[0]) : null;
  return h('section', { class: 'feasibility', 'aria-label': 'Viabilidad' },
    h('h3', {}, 'Viabilidad ', aiLabel('/metodologia/#viabilidad')),
    scale(note),
    h('p', { class: 'level' }, h('strong', {}, `${levelName(note.result)}: `), explanation(note)),
    noSources
      ? h('p', { class: 'no-sources' }, h('strong', {}, 'Sin fuentes verificables. '),
          'La IA no aportó fuentes institucionales que pudiéramos comprobar, ni al repetir la evaluación. Tómalo con más cautela.')
      : null,
    published
      ? why(published.why, note.sources)
      : h('div', { class: 'arguments' },
          ...note.assessments.map((e, i) =>
            h('div', { class: 'argument' },
              h('p', {}, h('strong', {}, `Evaluación ${i + 1}: ${levelName(e.level)}`)),
              why(e.why, e.sources),
              rubric(e),
            ),
          ),
        ),
    published ? rubric(published) : null,
    h('p', { class: 'method' },
      'Evaluación hecha por IA, sin revisión humana, dos veces y sin saber de qué partido era. Puede equivocarse. ',
      h('a', { href: RUBRIC_URL }, 'Cómo se valora →'),
    ),
  );
}

function shortName(note: FeasibilityNote): string {
  if (note.result === 'notConcrete') return 'Sin concreción';
  if (note.result === 'noConsensus') return 'Sin consenso';
  return levelName(note.result);
}

function explanation(note: FeasibilityNote): string {
  if (note.result === 'noConsensus') {
    const [a, b] = note.assessments.map((e) => levelName(e.level));
    return `dos evaluaciones de la IA no coincidieron (una: ${a}; otra: ${b}). Preferimos enseñártelo a elegir una.`;
  }
  if (note.result === 'notConcrete') return OFF_SCALE.notConcrete.explanation;
  return LEVELS.find((n) => n.id === note.result)!.explanation;
}

/** Four steps in a single tone; out-of-scale results get their own icon instead. */
function scale(note: FeasibilityNote): HTMLElement {
  const i = LEVELS.findIndex((n) => n.id === note.result);
  if (i === -1)
    return h('p', { class: 'off-scale', 'aria-hidden': 'true' }, note.result === 'noConsensus' ? '≠' : '?');
  return h('ol', { class: 'scale', 'aria-hidden': 'true' },
    ...LEVELS.map((n, j) => h('li', { class: j === i ? 'current' : '' }, n.name)),
  );
}

function why(text: string, sources: Source[]): HTMLElement {
  return h('div', { class: 'why' },
    h('p', {}, h('strong', {}, 'Por qué: '), text),
    sources.length
      ? h('ul', { class: 'sources', 'aria-label': 'Fuentes' },
          ...sources.map((f) => h('li', {}, h('a', { href: f.url, target: '_blank', rel: 'noopener' }, `${f.title} ↗`))))
      : h('p', { class: 'grey' }, 'Sin fuentes verificables.'),
  );
}

function rubric(e: Assessment): HTMLElement {
  return h('details', { class: 'rubric' },
    h('summary', {}, 'Criterio a criterio'),
    h('dl', {}, ...CRITERIA.flatMap((c) => [h('dt', {}, c.title), h('dd', {}, e.reasons[c.id])])),
  );
}
