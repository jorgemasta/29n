// Suggested questions of the "Preguntar" tab (docs/ux-spec.md §12). Their answers are precomputed
// by the data pipeline for every programme; from ~18-nov the free text box opens (#15).
// `keywords` find the candidate pages (ignoring case and accents, as word prefixes, like
// V12's keywords): only those pages go to the AI. Wide on purpose: a false hit costs one more page;
// a miss wrongly says "El programa de X no lo menciona". Public, as part of the methodology.
import type { Question } from '../dataset/schema';

export const SUGGESTED_QUESTIONS: Question[] = [
  {
    id: 'iva-luz',
    text: '¿Quién propone bajar el IVA de la luz?',
    keywords: ['IVA', 'luz', 'electricidad', 'eléctric', 'factura energética', 'bono social'],
    order: 1,
  },
  {
    id: 'alquiler-turistico',
    text: '¿Qué dicen del alquiler turístico?',
    keywords: ['turístic', 'vacacional', 'vacacionales', 'pisos turísticos', 'viviendas de uso turístico', 'turismo'],
    order: 2,
  },
  {
    id: 'semana-4-dias',
    text: '¿Alguien propone la semana de 4 días?',
    keywords: ['cuatro días', '4 días', 'semana laboral', 'jornada', 'horas semanales', '32 horas'],
    order: 3,
  },
  {
    id: 'edad-jubilacion',
    text: '¿Qué pasa con la edad de jubilación?',
    keywords: ['jubilación', 'jubilar', 'edad de retiro', 'retiro', 'pensiones', 'prejubila'],
    order: 4,
  },
  {
    id: 'cuidado-mayores',
    text: '¿Qué proponen para cuidar a personas mayores?',
    keywords: ['personas mayores', 'persona mayor', 'gente mayor', 'dependen', 'residencia', 'cuidados', 'ayuda a domicilio', 'teleasistencia', 'envejecimiento'],
    order: 5,
  },
  {
    id: 'servicio-militar',
    text: '¿Qué dicen sobre el servicio militar?',
    keywords: ['servicio militar', 'mili', 'reclutamiento', 'conscripción', 'reservistas', 'servicio civil', 'Fuerzas Armadas'],
    order: 6,
  },
  {
    id: 'ley-electoral',
    text: '¿Alguien quiere cambiar la ley electoral?',
    keywords: ['ley electoral', 'sistema electoral', 'LOREG', 'circunscripción', 'listas abiertas', 'D’Hondt', "D'Hondt", 'proporcionalidad', 'voto rogado'],
    order: 7,
  },
];
