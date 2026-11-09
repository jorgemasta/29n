// V12: keywords per topic for the second pass before marking "proposes nothing".
// Public ("¿Cómo decidimos que un partido no propone nada?"). Matched ignoring case and accents,
// as word prefixes ("alquiler" also finds "alquileres"), so stems like "inquilin" are intended.
// Wide on purpose: a false hit only costs one extra AI check; a miss wrongly says "proposes nothing".
export type Keywords = Record<string, string[]>;

export const KEYWORDS: Keywords = {
  vivienda: ['vivienda', 'alquiler', 'alquilar', 'hipoteca', 'desahucio', 'inquilin', 'arrendamiento', 'suelo', 'parque público', 'okupa'],
  empleo: ['empleo', 'salario', 'sueldo', 'jornada', 'trabajador', 'paro', 'desemple', 'contrato', 'despido', 'convenio', 'reforma laboral', 'autónomo', 'SMI'],
  sanidad: ['sanidad', 'sanitari', 'salud', 'hospital', 'médic', 'atención primaria', 'lista de espera', 'listas de espera', 'enfermer', 'medicamento', 'farmac', 'salud mental'],
  inmigracion: ['inmigra', 'migrante', 'migratori', 'extranjer', 'regulariza', 'frontera', 'asilo', 'refugiad', 'arraigo', 'irregular', 'integración'],
  pensiones: ['pensión', 'pensiones', 'pensionista', 'jubilación', 'jubilad', 'Seguridad Social', 'cotiza', 'revaloriza', 'Pacto de Toledo'],
  'coste-vida': ['precio', 'inflación', 'IPC', 'coste de la vida', 'cesta de la compra', 'alimento', 'factura', 'luz', 'electricidad', 'carburante', 'poder adquisitivo', 'IVA'],
  impuestos: ['impuesto', 'fiscal', 'tributa', 'IRPF', 'IVA', 'Sociedades', 'patrimonio', 'sucesiones', 'deducción', 'fraude fiscal', 'recaudación', 'tasa'],
  educacion: ['educación', 'educativ', 'escuela', 'colegio', 'docente', 'profesor', 'alumn', 'universidad', 'formación profesional', 'FP', 'beca', 'matrícula', 'infantil'],
  instituciones: ['corrupción', 'transparencia', 'institucion', 'Poder Judicial', 'CGPJ', 'Tribunal Constitucional', 'aforamiento', 'indulto', 'ley electoral', 'puertas giratorias', 'financiación de partidos', 'regeneración'],
  'energia-clima': ['energía', 'energétic', 'renovable', 'clima', 'climático', 'emisiones', 'nuclear', 'solar', 'eólic', 'descarboniza', 'transición ecológica', 'autoconsumo', 'gas'],
  cuidados: ['dependencia', 'cuidad', 'cuidados', 'crianza', 'permiso de', 'natalidad', 'conciliación', 'residencia', 'mayores', 'discapacidad', 'familia', 'infancia'],
  'seguridad-justicia': ['seguridad', 'policía', 'Guardia Civil', 'delito', 'delincuen', 'justicia', 'judicial', 'juzgado', 'Código Penal', 'reincidencia', 'prisión', 'víctima'],
  territorial: ['comunidades autónomas', 'autonómic', 'financiación autonómica', 'competencias', 'descentraliza', 'federal', 'concierto', 'autogobierno', 'Estatuto', 'cupo', 'Constitución', 'referéndum', 'ordinalidad'],
  igualdad: ['igualdad', 'mujer', 'violencia de género', 'violencia machista', 'violencia contra las mujeres', 'brecha salarial', 'feminis', 'paridad', 'LGTBI', 'machis', 'acoso'],
  'campo-agua': ['agricultur', 'agrari', 'ganader', 'agricultor', 'rural', 'campo', 'regadío', 'agua', 'hídric', 'trasvase', 'sequía', 'PAC', 'pesca'],
  transporte: ['transporte', 'tren', 'ferrocarril', 'ferroviari', 'Cercanías', 'carretera', 'autovía', 'autobús', 'movilidad', 'aeropuerto', 'abono', 'peaje', 'infraestructura'],
  defensa: ['defensa', 'OTAN', 'militar', 'Fuerzas Armadas', 'ejército', 'gasto en defensa', 'armamento', 'servicio militar', 'Ministerio de Defensa', 'seguridad nacional'],
  'europa-exterior': ['Unión Europea', 'europe', 'exterior', 'internacional', 'diplomac', 'cooperación al desarrollo', 'Palestina', 'Israel', 'Ucrania', 'Marruecos', 'Gibraltar', 'Latinoamérica', 'Naciones Unidas'],
  'ref-canarias': ['REF', 'Régimen Económico y Fiscal', 'ZEC', 'Zona Especial Canaria', 'AIEM', 'IGIC', 'Canarias', 'canari', 'ultraperiféric', 'RUP', 'insular', 'archipiélago'],
  'migracion-atlantica': ['Canarias', 'canari', 'cayuco', 'patera', 'ruta atlántica', 'Atlántico', 'menores migrantes', 'menores no acompañados', 'acogida', 'Salvamento Marítimo', 'llegadas', 'Mauritania', 'Senegal'],
};
