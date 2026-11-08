// Suggested questions of the "Preguntar" tab (docs/ux-spec.md §12). Their answers are precomputed
// by the data pipeline for every programme; from ~18-nov the free text box opens (#15).
// `palabrasClave` find the candidate pages (ignoring case and accents, as word prefixes, like
// V12's keywords): only those pages go to the AI. Wide on purpose: a false hit costs one more page;
// a miss wrongly says "El programa de X no lo menciona". Public, as part of the methodology.
import type { Pregunta } from '../dataset/esquema';

export const PREGUNTAS_SUGERIDAS: Pregunta[] = [
  {
    id: 'iva-luz',
    texto: '¿Quién propone bajar el IVA de la luz?',
    palabrasClave: ['IVA', 'luz', 'electricidad', 'eléctric', 'factura energética', 'bono social'],
    orden: 1,
  },
  {
    id: 'alquiler-turistico',
    texto: '¿Qué dicen del alquiler turístico?',
    palabrasClave: ['turístic', 'vacacional', 'vacacionales', 'pisos turísticos', 'viviendas de uso turístico', 'turismo'],
    orden: 2,
  },
  {
    id: 'semana-4-dias',
    texto: '¿Alguien propone la semana de 4 días?',
    palabrasClave: ['cuatro días', '4 días', 'semana laboral', 'jornada', 'horas semanales', '32 horas'],
    orden: 3,
  },
  {
    id: 'edad-jubilacion',
    texto: '¿Qué pasa con la edad de jubilación?',
    palabrasClave: ['jubilación', 'jubilar', 'edad de retiro', 'retiro', 'pensiones', 'prejubila'],
    orden: 4,
  },
  {
    id: 'cuidado-mayores',
    texto: '¿Qué proponen para cuidar a personas mayores?',
    palabrasClave: ['personas mayores', 'persona mayor', 'gente mayor', 'dependen', 'residencia', 'cuidados', 'ayuda a domicilio', 'teleasistencia', 'envejecimiento'],
    orden: 5,
  },
  {
    id: 'servicio-militar',
    texto: '¿Qué dicen sobre el servicio militar?',
    palabrasClave: ['servicio militar', 'mili', 'reclutamiento', 'conscripción', 'reservistas', 'servicio civil', 'Fuerzas Armadas'],
    orden: 6,
  },
  {
    id: 'ley-electoral',
    texto: '¿Alguien quiere cambiar la ley electoral?',
    palabrasClave: ['ley electoral', 'sistema electoral', 'LOREG', 'circunscripción', 'listas abiertas', 'D’Hondt', "D'Hondt", 'proporcionalidad', 'voto rogado'],
    orden: 7,
  },
];
