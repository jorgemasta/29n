// FICTIONAL test programmes for the private prototype. Nothing here comes from, or is attributed
// to, a real party: the four "Partido de prueba" exist only to make every topic playable while no
// real programme can be processed. Each entry is [literal text in the fictional PDF, neutral
// rewrite: que, como, cifra]. A missing topic means "proposes nothing".
import type { TipoFuente } from '../src/dataset/esquema';

export type Propuesta = [cita: string, que: string, como: string, cifra: string | null];

export interface Ficticio {
  id: string;
  letra: string;
  fuente: TipoFuente;
  titulo: string;
  propuestas: Record<string, Propuesta>;
}

export const FICTICIOS: Ficticio[] = [
  {
    id: 'prueba-a',
    letra: 'A',
    fuente: 'programa-29n',
    titulo: 'Programa de prueba A',
    propuestas: {
      vivienda: [
        'Crearemos una empresa pública estatal de vivienda que construya 50.000 viviendas de alquiler asequible al año, con precios que no superen el 30 % de los ingresos.',
        'Crear una empresa pública estatal que construya vivienda de alquiler asequible.',
        'Los alquileres de esas viviendas no superarían el 30 % de los ingresos del hogar que viva en ellas, y la empresa dependería del Estado.',
        '50.000 viviendas al año',
      ],
      empleo: [
        'Reduciremos la jornada laboral máxima a 35 horas semanales sin pérdida de salario y subiremos el salario mínimo hasta el 60 % del salario medio.',
        'Bajar la jornada laboral máxima sin bajar el sueldo.',
        'Se aprobaría por ley para todos los sectores. Además, subir el salario mínimo hasta el 60 % del salario medio del país.',
        '35 horas semanales',
      ],
      sanidad: [
        'Garantizaremos por ley un tiempo máximo de espera de 60 días para cualquier operación y contrataremos 10.000 profesionales sanitarios en atención primaria.',
        'Fijar por ley un plazo máximo de espera para operarse.',
        'El plazo se garantizaría por ley en todo el país. Además, contratar más médicos, enfermeras y otros profesionales en los centros de salud de atención primaria.',
        '60 días de espera como máximo; 10.000 profesionales',
      ],
      inmigracion: [
        'Abriremos vías legales y seguras de entrada vinculadas a ofertas de empleo y aprobaremos una regularización de las personas que ya viven y trabajan en España.',
        'Abrir vías legales para venir a trabajar con una oferta de empleo.',
        'Y aprobar una regularización para dar papeles a quienes ya viven y trabajan en España sin ellos, con requisitos de residencia y empleo.',
        null,
      ],
      pensiones: [
        'Mantendremos la revalorización de todas las pensiones con el IPC y eliminaremos el tope máximo de las cotizaciones para los salarios más altos.',
        'Subir todas las pensiones cada año lo mismo que los precios.',
        'Se pagaría haciendo que los sueldos más altos coticen a la Seguridad Social por todo lo que ganan, sin el límite máximo actual.',
        null,
      ],
      'coste-vida': [
        'Bajaremos el IVA de los alimentos básicos al 0 % de forma permanente y crearemos una empresa pública de energía que venda electricidad a precio de coste.',
        'Quitar el IVA a los alimentos básicos de forma permanente.',
        'La rebaja del IVA sería permanente. Además, crear una empresa pública de energía que venda la electricidad a los hogares a precio de coste.',
        'IVA del 0 % en alimentos básicos',
      ],
      impuestos: [
        'Crearemos un impuesto permanente a las grandes fortunas a partir de 3 millones de euros y subiremos dos puntos el tipo del impuesto de sociedades a las grandes empresas.',
        'Crear un impuesto permanente a los patrimonios más grandes.',
        'Lo pagarían quienes tengan un patrimonio grande. Además, subir el impuesto de sociedades, el que pagan las grandes empresas por sus beneficios.',
        'Desde 3 millones de euros; dos puntos más',
      ],
      educacion: [
        'Haremos gratuita la educación de 0 a 3 años en toda España y bajaremos las tasas universitarias de grado hasta hacerlas gratuitas en la primera matrícula.',
        'Hacer gratis la escuela infantil de 0 a 3 años.',
        'Sería gratis en toda España para todas las familias. Además, bajar las tasas de la universidad pública hasta quitarlas en la primera matrícula.',
        null,
      ],
      instituciones: [
        'Crearemos una autoridad independiente contra la corrupción con capacidad de investigar contratos públicos y prohibiremos las donaciones de empresas a partidos.',
        'Crear un organismo independiente que investigue los contratos públicos.',
        'Ese organismo podría investigar los contratos públicos por su cuenta. Además, prohibir que las empresas den dinero a los partidos políticos.',
        null,
      ],
      'energia-clima': [
        'Cerraremos las centrales nucleares en el calendario previsto y aprobaremos un plan para que el 100 % de la electricidad sea renovable en 2035.',
        'Cerrar las centrales nucleares según el calendario ya previsto.',
        'Las centrales se cerrarían según el calendario de cierre ya previsto. Además, aprobar un plan para que toda la electricidad venga de fuentes renovables.',
        '100 % renovable en 2035',
      ],
      cuidados: [
        'Eliminaremos la lista de espera de la dependencia en dos años y ampliaremos el permiso por nacimiento a 24 semanas para cada progenitor.',
        'Acabar con la lista de espera para recibir la ayuda a la dependencia.',
        'Atender a todas las personas que esperan la ayuda a la dependencia. Además, alargar el permiso por nacimiento para cada uno de los progenitores.',
        'En dos años; 24 semanas',
      ],
      igualdad: [
        'Aprobaremos una ley de igualdad salarial que obligue a todas las empresas de más de 25 personas a publicar sus salarios por sexo y categoría.',
        'Obligar a las empresas a publicar lo que pagan a mujeres y a hombres.',
        'Lo harían por ley: las empresas tendrían que publicar sus salarios separados por sexo y por categoría profesional para que se puedan comparar.',
        'Empresas de más de 25 personas',
      ],
      transporte: [
        'Implantaremos un abono único estatal de transporte público de 30 euros al mes válido en trenes de cercanías, media distancia y autobuses interurbanos.',
        'Crear un abono único para todo el transporte público estatal.',
        'Valdría para los trenes de cercanías y de media distancia y para los autobuses entre ciudades, con un precio fijo al mes en todo el país.',
        '30 euros al mes',
      ],
      'europa-exterior': [
        'Defenderemos que la Unión Europea apruebe un presupuesto común mayor financiado con impuestos europeos a las grandes tecnológicas.',
        'Pedir un presupuesto común europeo más grande.',
        'Se pagaría con nuevos impuestos europeos a las grandes empresas tecnológicas, y la Unión Europea tendría más dinero propio para sus políticas comunes.',
        null,
      ],
    },
  },
  {
    id: 'prueba-b',
    letra: 'B',
    fuente: 'programa-29n',
    titulo: 'Programa de prueba B',
    propuestas: {
      vivienda: [
        'Eliminaremos el impuesto de transmisiones patrimoniales en la compra de la primera vivienda y liberaremos suelo público para que se construya más vivienda.',
        'Quitar el impuesto que se paga al comprar la primera vivienda.',
        'Además, liberar suelo público para que se construyan más viviendas en venta y en alquiler, con el objetivo de que aumente la oferta disponible.',
        null,
      ],
      empleo: [
        'Rebajaremos las cotizaciones sociales de las empresas que contraten a menores de 30 años durante sus tres primeros años de contrato indefinido.',
        'Bajar lo que pagan las empresas a la Seguridad Social por contratar a jóvenes.',
        'La rebaja sería solo para contratos indefinidos y duraría los tres primeros años de cada contrato, para animar a contratar a jóvenes.',
        'Menores de 30 años',
      ],
      sanidad: [
        'Usaremos todos los recursos sanitarios disponibles, públicos y privados, mediante conciertos para reducir las listas de espera quirúrgicas a la mitad.',
        'Reducir las listas de espera para operarse.',
        'Se haría usando todos los recursos disponibles, públicos y privados, y pagando también operaciones en clínicas privadas con dinero público mediante conciertos.',
        'A la mitad',
      ],
      inmigracion: [
        'Vincularemos la inmigración a las necesidades del mercado laboral con contratos en origen y reforzaremos el control de fronteras y los acuerdos de devolución.',
        'Que la inmigración dependa de los empleos que haga falta cubrir.',
        'Se contrataría en el país de origen según los empleos que haga falta cubrir. Además, reforzar el control de fronteras y los acuerdos de devolución.',
        null,
      ],
      pensiones: [
        'Crearemos un sistema complementario de ahorro para la jubilación en las empresas, con aportaciones automáticas de los trabajadores salvo que decidan no participar.',
        'Crear un ahorro para la jubilación en las empresas, además de la pensión pública.',
        'Los trabajadores aportarían una parte de su sueldo de forma automática salvo que digan que no, y sería un ahorro gestionado desde las empresas.',
        null,
      ],
      'coste-vida': [
        'Deflactaremos el IRPF cada año según la inflación para que nadie pague más impuestos solo porque suban los precios.',
        'Ajustar cada año el IRPF a la subida de los precios.',
        'Se actualizarían cada año los tramos del impuesto sobre la renta según la inflación, para que nadie pague más solo porque suben los precios.',
        null,
      ],
      impuestos: [
        'Bajaremos el IRPF a todas las rentas, con un tipo mínimo del 15 %, y suprimiremos el impuesto de patrimonio y el de sucesiones entre padres e hijos.',
        'Bajar el IRPF a todos.',
        'La rebaja llegaría a todas las rentas. Además, quitar el impuesto de patrimonio y el impuesto de sucesiones en las herencias entre padres e hijos.',
        'Tipo mínimo del 15 %',
      ],
      educacion: [
        'Garantizaremos la libertad de elección de centro educativo con un cheque escolar y evaluaremos a todos los alumnos con una prueba común en todo el país.',
        'Dar a las familias un cheque para elegir colegio.',
        'Las familias recibirían un cheque para pagar el colegio que elijan. Además, hacer a todos los alumnos un mismo examen común en todo el país.',
        null,
      ],
      instituciones: [
        'Reformaremos la elección del órgano de gobierno de los jueces para que la mayoría de sus miembros sean elegidos por los propios jueces.',
        'Cambiar cómo se elige el órgano que gobierna a los jueces.',
        'La mayoría de los miembros del órgano de gobierno de los jueces los elegirían los propios jueces, en lugar de elegirlos el Parlamento como ahora.',
        null,
      ],
      'energia-clima': [
        'Alargaremos la vida útil de las centrales nucleares mientras sean seguras y bajaremos los impuestos a la generación eléctrica.',
        'Mantener abiertas las centrales nucleares mientras sean seguras.',
        'Las centrales seguirían funcionando más años si los organismos de control dicen que son seguras. Además, bajar los impuestos a la producción de electricidad.',
        null,
      ],
      cuidados: [
        'Aprobaremos una deducción fiscal de 2.000 euros al año por cada hijo menor de tres años para las familias trabajadoras.',
        'Rebajar los impuestos a las familias trabajadoras con hijos pequeños.',
        'Sería una deducción en el impuesto sobre la renta por cada hijo menor de tres años, para las familias en las que se trabaje.',
        '2.000 euros al año',
      ],
      'seguridad-justicia': [
        'Incorporaremos 8.000 nuevos agentes a las fuerzas de seguridad del Estado y endureceremos las penas por la reincidencia en delitos leves.',
        'Contratar más policías y guardias civiles.',
        'Se incorporarían nuevos agentes a la Policía Nacional y a la Guardia Civil. Además, castigar con penas más duras a quien repite delitos leves.',
        '8.000 agentes',
      ],
      territorial: [
        'Aprobaremos un nuevo sistema de financiación autonómica igual para todas las comunidades, con un fondo de nivelación que garantice los servicios públicos.',
        'Hacer un nuevo sistema de financiación igual para todas las comunidades.',
        'Las reglas serían iguales para todas las comunidades, con un fondo común de nivelación que asegure los mismos servicios públicos en todas ellas.',
        null,
      ],
      'campo-agua': [
        'Aprobaremos un plan hidrológico nacional que conecte cuencas y construiremos nuevas infraestructuras de almacenamiento de agua para el regadío.',
        'Hacer un plan nacional del agua que lleve agua de unas cuencas a otras.',
        'El plan conectaría unas cuencas con otras para llevar agua donde falta. Además, construir más embalses y depósitos de agua para el regadío.',
        null,
      ],
      defensa: [
        'Alcanzaremos el objetivo de gasto en defensa acordado con los aliados de la OTAN y modernizaremos el equipamiento de las Fuerzas Armadas.',
        'Llegar al gasto en defensa acordado con los aliados de la OTAN.',
        'Se llegaría al nivel de gasto acordado con los aliados de la alianza. Además, renovar y modernizar el material y el equipamiento de las Fuerzas Armadas.',
        null,
      ],
    },
  },
  {
    id: 'prueba-c',
    letra: 'C',
    fuente: 'programa-29n',
    titulo: 'Programa de prueba C',
    propuestas: {
      vivienda: [
        'Limitaremos el precio del alquiler en las zonas tensionadas y penalizaremos en el IBI las viviendas vacías durante más de dos años.',
        'Limitar el precio del alquiler en las zonas con más demanda.',
        'Y subir el IBI, el impuesto municipal sobre la casa, a las viviendas que estén vacías durante más de dos años.',
        null,
      ],
      empleo: [
        'Crearemos una prestación pública de formación para que cualquier trabajador pueda reciclarse durante seis meses cobrando el 70 % de su sueldo.',
        'Pagar a los trabajadores mientras se forman para cambiar de oficio.',
        'Cualquier trabajador podría reciclarse durante seis meses cobrando una parte de su sueldo mientras se forma, con una prestación pública para ello.',
        'Seis meses al 70 % del sueldo',
      ],
      sanidad: [
        'Incluiremos la atención dental y la salud mental en la sanidad pública, con un psicólogo en cada centro de atención primaria.',
        'Incluir el dentista y la salud mental en la sanidad pública.',
        'El dentista y la atención a la salud mental pasarían a ser gratis en la sanidad pública, con un psicólogo en cada centro de salud.',
        null,
      ],
      pensiones: [
        'Permitiremos compatibilizar al cien por cien la pensión con un trabajo y subiremos las pensiones mínimas hasta el umbral de la pobreza.',
        'Permitir cobrar la pensión entera y trabajar a la vez.',
        'Se podría cobrar la pensión completa mientras se sigue trabajando. Además, subir las pensiones más bajas hasta llegar al umbral de la pobreza.',
        null,
      ],
      'coste-vida': [
        'Crearemos un cheque de 200 euros para la compra de alimentos destinado a los hogares con ingresos inferiores a 20.000 euros al año.',
        'Dar una ayuda para la compra de comida a los hogares con menos ingresos.',
        'Sería un cheque para comprar alimentos, solo para los hogares que ingresen menos de 20.000 euros al año, gestionado por las administraciones públicas.',
        '200 euros',
      ],
      impuestos: [
        'Simplificaremos el IRPF a solo tres tramos y eliminaremos la mayoría de las deducciones, manteniendo la recaudación total.',
        'Simplificar el IRPF a pocos tramos.',
        'El impuesto sobre la renta pasaría a tener solo tres tramos, quitando casi todas las deducciones sin cambiar lo que se recauda en total.',
        'Tres tramos',
      ],
      educacion: [
        'Reduciremos las ratios a un máximo de 20 alumnos por aula y duplicaremos las plazas de FP dual en colaboración con las empresas.',
        'Bajar el número de alumnos por clase.',
        'Habría un máximo de alumnos en cada aula. Además, ofrecer más plazas de FP dual, que combina las clases con el trabajo en empresas.',
        'Máximo 20 por aula; el doble de plazas',
      ],
      instituciones: [
        'Publicaremos en tiempo real todas las agendas de los cargos públicos y sus reuniones con grupos de interés en un registro obligatorio.',
        'Publicar al momento las agendas de los cargos públicos.',
        'Las agendas de los cargos públicos se publicarían al momento, con un registro obligatorio de todas sus reuniones con empresas y grupos de interés.',
        null,
      ],
      'energia-clima': [
        'Instalaremos placas solares en todos los edificios públicos y subvencionaremos el 50 % del autoconsumo en comunidades de vecinos.',
        'Poner placas solares en todos los edificios públicos.',
        'Las placas se pondrían en todos los edificios públicos. Además, pagar con dinero público la mitad del autoconsumo solar de las comunidades de vecinos.',
        '50 % de subvención',
      ],
      'seguridad-justicia': [
        'Digitalizaremos todos los juzgados y crearemos 500 nuevas plazas de jueces para reducir a la mitad el tiempo medio de los juicios.',
        'Digitalizar los juzgados y nombrar más jueces.',
        'Todos los juzgados trabajarían de forma digital y se crearían nuevas plazas de jueces, con el objetivo de que los juicios tarden la mitad.',
        '500 jueces más',
      ],
      territorial: [
        'Convertiremos el Senado en una cámara de representación territorial donde se negocien las leyes que afectan a las comunidades.',
        'Convertir el Senado en la cámara de las comunidades autónomas.',
        'El Senado pasaría a ser una cámara de representación de los territorios, donde se negociarían las leyes que afectan a las comunidades autónomas.',
        null,
      ],
      igualdad: [
        'Crearemos juzgados especializados en violencia contra las mujeres en todas las provincias, con atención psicológica gratuita para las víctimas.',
        'Crear juzgados especializados en violencia contra las mujeres en cada provincia.',
        'Habría juzgados especializados en violencia contra las mujeres en todas las provincias, con atención psicológica gratis para las víctimas.',
        null,
      ],
      'campo-agua': [
        'Garantizaremos por ley que los agricultores no vendan por debajo del coste de producción y crearemos un observatorio público de precios.',
        'Prohibir que los agricultores vendan por debajo de lo que les cuesta producir.',
        'Se garantizaría por ley que nadie pague a los agricultores menos de lo que cuesta producir, con un observatorio público que vigile los precios.',
        null,
      ],
      transporte: [
        'Recuperaremos los trenes nocturnos y las líneas de tren regional cerradas en la última década para conectar la España rural.',
        'Volver a poner trenes nocturnos y líneas regionales que se cerraron.',
        'Se recuperarían los trenes nocturnos y las líneas de tren regional que se cerraron en los últimos años, para conectar mejor los pueblos y las zonas rurales.',
        null,
      ],
      defensa: [
        'Impulsaremos un ejército europeo común y destinaremos el aumento del gasto en defensa a proyectos compartidos con otros países de la Unión.',
        'Impulsar un ejército común europeo.',
        'El aumento del gasto en defensa iría a proyectos compartidos con otros países de la Unión Europea, con el objetivo de crear un ejército común.',
        null,
      ],
      'europa-exterior': [
        'Propondremos eliminar la unanimidad en las decisiones de política exterior de la Unión Europea para que pueda actuar con una sola voz.',
        'Quitar la unanimidad en las decisiones europeas de política exterior.',
        'Las decisiones de política exterior de la Unión Europea se tomarían por mayoría y no por unanimidad, para que pueda actuar con una sola voz.',
        null,
      ],
    },
  },
  {
    // Provisional source (fictional "2023 programme"): only shown in the private prototype.
    id: 'prueba-d',
    letra: 'D',
    fuente: 'programa-2023',
    titulo: 'Programa de prueba D (2023)',
    propuestas: {
      vivienda: [
        'Daremos avales públicos para que los jóvenes menores de 35 años puedan financiar el 100 % de la compra de su primera vivienda.',
        'Que el Estado avale a los jóvenes para comprar su primera vivienda.',
        'El Estado daría avales públicos para que puedan pedir una hipoteca por el precio completo de la casa, sin tener que pagar una entrada.',
        'Menores de 35 años',
      ],
      inmigracion: [
        'Crearemos un sistema de puntos para la inmigración laboral que valore la formación, el idioma y la oferta de empleo de cada solicitante.',
        'Crear un sistema de puntos para decidir quién puede venir a trabajar.',
        'Un sistema de puntos decidiría quién puede venir a trabajar, valorando la formación, el conocimiento del idioma y tener una oferta de empleo.',
        null,
      ],
      pensiones: [
        'Permitiremos retrasar voluntariamente la jubilación hasta los 72 años con un incremento del 4 % de la pensión por cada año adicional trabajado.',
        'Permitir retrasar la jubilación de forma voluntaria.',
        'Quien quiera podría jubilarse más tarde, y la pensión subiría por cada año de más que trabaje, con un límite de edad para retrasarla.',
        'Hasta los 72 años; 4 % por año',
      ],
      'seguridad-justicia': [
        'Crearemos una unidad especializada contra la ciberdelincuencia en cada provincia y una oficina de atención a víctimas de estafas en internet.',
        'Crear una unidad contra los delitos por internet en cada provincia.',
        'Habría una unidad especializada en delitos por internet en cada provincia. Además, crear una oficina para atender a las víctimas de estafas en internet.',
        null,
      ],
      territorial: [
        'Proponemos un acuerdo bilateral de financiación para cada comunidad autónoma que tenga en cuenta su población, su dispersión y su envejecimiento.',
        'Negociar la financiación con cada comunidad por separado.',
        'Cada comunidad tendría su propio acuerdo de financiación, teniendo en cuenta su población, lo dispersa que está y lo envejecida que está.',
        null,
      ],
      igualdad: [
        'Extenderemos los planes de igualdad obligatorios a todas las administraciones públicas y a las empresas que reciban subvenciones públicas.',
        'Obligar a tener planes de igualdad a las administraciones.',
        'Los planes de igualdad serían obligatorios en todas las administraciones públicas y también en las empresas que reciban subvenciones o dinero público.',
        null,
      ],
      'campo-agua': [
        'Aprobaremos una ayuda de incorporación de 50.000 euros para jóvenes que se instalen como agricultores o ganaderos en municipios de menos de 5.000 habitantes.',
        'Dar una ayuda a los jóvenes que empiecen como agricultores o ganaderos en pueblos pequeños.',
        'Sería una ayuda para empezar como agricultor o ganadero, solo en los municipios de menos de 5.000 habitantes, para atraer a gente joven al campo.',
        '50.000 euros',
      ],
      transporte: [
        'Completaremos los corredores ferroviarios de mercancías Mediterráneo y Atlántico antes de 2030 con prioridad sobre nuevas líneas de alta velocidad.',
        'Terminar los grandes corredores de tren de mercancías.',
        'Los corredores de tren de mercancías del Mediterráneo y del Atlántico se terminarían primero, con prioridad sobre nuevas líneas de alta velocidad.',
        'Antes de 2030',
      ],
      defensa: [
        'Mantendremos el gasto en defensa en el nivel actual y priorizaremos la participación en misiones de paz con mandato de Naciones Unidas.',
        'Mantener el gasto en defensa como está.',
        'El gasto en defensa se quedaría en el nivel actual. Además, dar prioridad a la participación en misiones de paz con mandato de Naciones Unidas.',
        null,
      ],
      'europa-exterior': [
        'Reforzaremos las relaciones con América Latina y el Mediterráneo y pediremos que España tenga un puesto permanente en el G20.',
        'Reforzar las relaciones con América Latina y el Mediterráneo.',
        'Se reforzarían las relaciones con los países de América Latina y del Mediterráneo, y se pediría que España sea miembro permanente del G20.',
        null,
      ],
      empleo: [
        'Aprobaremos un estatuto del trabajador autónomo con cuota según ingresos reales y derecho a paro cuando cierre su negocio.',
        'Hacer que los autónomos paguen su cuota según lo que ganen de verdad.',
        'Los autónomos pagarían su cuota según lo que ganen de verdad cada año. Además, tendrían derecho a cobrar el paro si cierran su negocio.',
        null,
      ],
      cuidados: [
        'Crearemos una red pública de centros de día en todos los municipios de más de 10.000 habitantes para personas mayores dependientes.',
        'Crear centros de día públicos para personas mayores dependientes.',
        'Se crearía una red pública de centros de día para personas mayores dependientes en todos los municipios de más de 10.000 habitantes.',
        null,
      ],
    },
  },
];
