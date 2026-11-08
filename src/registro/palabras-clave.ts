// V12: keywords per topic for the second pass before marking "proposes nothing".
// Public ("¿Cómo decidimos que un partido no propone nada?"). Matched ignoring case and accents,
// as word prefixes ("alquiler" also finds "alquileres").
export type PalabrasClave = Record<string, string[]>;

export const PALABRAS_CLAVE: PalabrasClave = {
  vivienda: ['vivienda', 'alquiler', 'alquilar', 'hipoteca', 'desahucio', 'inquilin', 'arrendamiento', 'suelo', 'parque público', 'okupa'],
};
