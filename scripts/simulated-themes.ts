// FICTIONAL v2 themes for the private prototype (#19, #24): four national themes and a regional one
// ("Tu comunidad: Canarias"), each with 3 base questions and 2 follow-up ones, and 3 approaches per
// question, written by hand over the fictional v1 proposals. Each stance quotes the party's literal
// text, taken from its processed v1 position on the given topic (so the quote is in its fictional PDF).
// The first question on each topic takes the topic's id: until #21 keys positions by question, each
// party's position on that topic is its concrete proposal there (exact figures and feasibility, shown
// at the reveal). Other questions show no concrete proposal yet.
// #20/#21 replace this with processManifesto per question + settleApproaches on the fake AI.
import type { Approach, PartyStance, Position, Question, Theme } from '../src/dataset/schema';

/** Fictional party by letter: "a" → prueba-a. */
type Letter = 'a' | 'b' | 'c' | 'd' | 'e';

interface ApproachDraft {
  id: string;
  what: string;
  how: string;
  figure?: string;
  full?: Letter[];
  partial?: Letter[];
  /** Defended by no party: added to reach 3. */
  filler?: boolean;
}

interface QuestionDraft {
  id: string;
  text: string;
  /** v1 topic whose positions give the quotes. */
  topic: string;
  followUp?: boolean;
  cis?: string;
  approaches: [ApproachDraft, ApproachDraft, ApproachDraft];
  /** Parties that propose something else ("propone otra cosa"). */
  other?: Letter[];
}

interface ThemeDraft {
  theme: Theme;
  questions: QuestionDraft[];
}

const THEMES: ThemeDraft[] = [
  {
    theme: { id: 'vivienda', title: 'Vivienda', order: 1 },
    questions: [
      {
        id: 'vivienda',
        text: '¿Qué harían para que la vivienda sea asequible?',
        topic: 'vivienda',
        cis: 'La vivienda es el primer problema para una parte importante de la población (dato simulado).',
        approaches: [
          {
            id: 'public-housing',
            what: 'Que el Estado construya vivienda pública de alquiler asequible.',
            how: 'Una empresa o un plan públicos levantarían viviendas cuyo alquiler no superaría una parte fija de los ingresos de quien viva en ellas.',
            figure: 'decenas de miles de viviendas al año',
            full: ['a'],
            partial: ['e'],
          },
          {
            id: 'regulate-market',
            what: 'Poner límites al mercado del alquiler.',
            how: 'Se limitaría el precio del alquiler o los nuevos pisos turísticos donde falte vivienda, y se penalizarían las viviendas que lleven años vacías.',
            full: ['c'],
            partial: ['e'],
          },
          {
            id: 'ease-buying',
            what: 'Facilitar que la gente compre su primera vivienda.',
            how: 'Se bajarían los impuestos o se darían avales públicos para comprar la primera casa, y se liberaría suelo para que se construya más.',
            full: ['b'],
            partial: ['d'],
          },
        ],
      },
      {
        id: 'vivienda-jovenes',
        text: '¿Cómo ayudarían a los jóvenes a tener casa propia o de alquiler?',
        topic: 'vivienda',
        approaches: [
          {
            id: 'youth-guarantees',
            what: 'Que el Estado avale a los jóvenes para pedir la hipoteca.',
            how: 'Un aval público cubriría la parte del precio que los bancos no financian, para que no haga falta tener ahorros previos.',
            full: ['d'],
            partial: ['b'],
          },
          {
            id: 'youth-public-rent',
            what: 'Reservar para jóvenes parte de la vivienda pública de alquiler.',
            how: 'Las nuevas promociones públicas guardarían un cupo para menores de cierta edad, con un alquiler ligado a sus ingresos.',
            figure: 'miles de viviendas al año',
            full: ['a'],
          },
          {
            id: 'youth-rent-aid',
            what: 'Dar una ayuda mensual a los jóvenes para pagar el alquiler.',
            how: 'Los jóvenes con ingresos bajos recibirían cada mes una cantidad fija para el alquiler durante unos años.',
            filler: true,
          },
        ],
      },
      {
        id: 'vivienda-vacia',
        text: '¿Qué harían con las viviendas que llevan años vacías?',
        topic: 'vivienda',
        approaches: [
          {
            id: 'tax-empty',
            what: 'Cobrar más impuestos a las viviendas vacías.',
            how: 'Los ayuntamientos podrían subir el impuesto municipal a los pisos que lleven tiempo sin nadie viviendo en ellos.',
            full: ['c'],
          },
          {
            id: 'buy-empty',
            what: 'Que lo público compre o alquile esas viviendas.',
            how: 'Una entidad pública compraría o alquilaría pisos vacíos para sumarlos al parque de alquiler asequible.',
            partial: ['a'],
          },
          {
            id: 'guarantee-owners',
            what: 'Dar garantías a los dueños para que alquilen.',
            how: 'Un seguro público cubriría impagos y desperfectos a quien saque su vivienda vacía al alquiler.',
            filler: true,
          },
        ],
        other: ['e'],
      },
      {
        id: 'vivienda-turistica',
        text: '¿Qué harían con los pisos turísticos?',
        topic: 'vivienda',
        followUp: true,
        approaches: [
          {
            id: 'limit-licences',
            what: 'Limitar las nuevas licencias de pisos turísticos.',
            how: 'Donde falte vivienda no se darían licencias nuevas y una parte de lo recaudado iría a vivienda para residentes.',
            full: ['e'],
            partial: ['c'],
          },
          {
            id: 'tax-tourist',
            what: 'Cobrar una tasa a cada piso turístico.',
            how: 'Cada vivienda turística pagaría una cantidad al año que se destinaría a construir vivienda pública.',
            partial: ['a'],
          },
          {
            id: 'leave-to-councils',
            what: 'Dejar que cada ayuntamiento decida.',
            how: 'Las normas sobre pisos turísticos serían solo municipales, sin una regla general para todo el país.',
            filler: true,
          },
        ],
      },
      {
        id: 'vivienda-compra-impuestos',
        text: '¿Qué harían con lo que cuesta comprar la primera vivienda?',
        topic: 'vivienda',
        followUp: true,
        approaches: [
          {
            id: 'remove-purchase-tax',
            what: 'Quitar el impuesto que se paga al comprar la primera casa.',
            how: 'La compra de la primera vivienda habitual dejaría de pagar el impuesto de transmisiones.',
            full: ['b'],
          },
          {
            id: 'full-mortgage',
            what: 'Permitir hipotecas por el precio entero con aval público.',
            how: 'El Estado garantizaría la parte de la hipoteca que pasa del límite habitual de los bancos.',
            full: ['d'],
          },
          {
            id: 'rent-first',
            what: 'Priorizar el alquiler público antes que la compra.',
            how: 'El dinero público iría a vivienda de alquiler en lugar de a ayudas para comprar.',
            partial: ['a'],
          },
        ],
      },
    ],
  },
  {
    theme: { id: 'trabajo-pensiones', title: 'Trabajo y pensiones', order: 2 },
    questions: [
      {
        id: 'empleo',
        text: '¿Qué harían para mejorar el trabajo?',
        topic: 'empleo',
        cis: 'El paro y la calidad del empleo están entre las primeras preocupaciones (dato simulado).',
        approaches: [
          {
            id: 'shorter-week',
            what: 'Trabajar menos horas por el mismo sueldo.',
            how: 'Se bajaría por ley la jornada máxima semanal sin que bajen los salarios.',
            figure: 'unas pocas horas menos a la semana',
            full: ['a'],
          },
          {
            id: 'cheaper-hiring',
            what: 'Abaratar a las empresas la contratación.',
            how: 'Las empresas pagarían menos a la Seguridad Social durante un tiempo por cada persona que contraten.',
            full: ['b'],
            partial: ['d'],
          },
          {
            id: 'paid-retraining',
            what: 'Pagar a la gente mientras se forma para cambiar de oficio.',
            how: 'Quien quiera reciclarse cobraría una prestación pública durante la formación.',
            full: ['c'],
          },
        ],
      },
      {
        id: 'pensiones',
        text: '¿Qué harían con las pensiones?',
        topic: 'pensiones',
        approaches: [
          {
            id: 'index-prices',
            what: 'Subir todas las pensiones cada año como los precios.',
            how: 'Las pensiones se actualizarían por ley con la inflación y se subirían más las más bajas.',
            full: ['a'],
            partial: ['c'],
          },
          {
            id: 'company-savings',
            what: 'Añadir a la pensión pública un ahorro en las empresas.',
            how: 'Empresas y trabajadores aportarían a un fondo para la jubilación, además de la pensión pública.',
            full: ['b'],
          },
          {
            id: 'later-voluntary',
            what: 'Dejar retrasar la jubilación a quien quiera, con más pensión.',
            how: 'Cada año que se retrase la jubilación de forma voluntaria aumentaría la pensión que se cobra.',
            full: ['d'],
          },
        ],
      },
      {
        id: 'trabajo-autonomos',
        text: '¿Qué harían por los autónomos?',
        topic: 'empleo',
        approaches: [
          {
            id: 'income-quota',
            what: 'Que la cuota de autónomos dependa de lo que se gana.',
            how: 'Cada autónomo pagaría según sus ingresos reales y tendría las mismas prestaciones que un asalariado.',
            full: ['d'],
          },
          {
            id: 'lower-quota',
            what: 'Bajar la cuota a los autónomos que empiezan o contratan.',
            how: 'Durante los primeros años, o al contratar a alguien, la cuota sería más baja.',
            partial: ['b'],
          },
          {
            id: 'less-paperwork',
            what: 'Quitar papeleo a los autónomos.',
            how: 'Se reducirían las declaraciones y trámites obligatorios para quien trabaja por su cuenta.',
            filler: true,
          },
        ],
      },
      {
        id: 'pensiones-trabajar',
        text: '¿Qué harían con quien quiere seguir trabajando al jubilarse?',
        topic: 'pensiones',
        followUp: true,
        approaches: [
          {
            id: 'combine-full',
            what: 'Permitir cobrar la pensión entera y trabajar a la vez.',
            how: 'Quien se jubile podría seguir trabajando sin que le recorten la pensión.',
            full: ['c'],
          },
          {
            id: 'delay-bonus',
            what: 'Premiar a quien retrase la jubilación.',
            how: 'Seguir trabajando más allá de la edad legal subiría la pensión futura cada año.',
            full: ['d'],
            partial: ['b'],
          },
          {
            id: 'partial-retirement',
            what: 'Facilitar la jubilación a media jornada.',
            how: 'Se podría trabajar a tiempo parcial cobrando a la vez una parte de la pensión.',
            filler: true,
          },
        ],
      },
      {
        id: 'trabajo-jovenes',
        text: '¿Qué harían para que los jóvenes encuentren trabajo?',
        topic: 'empleo',
        followUp: true,
        approaches: [
          {
            id: 'youth-contributions',
            what: 'Que contratar a un joven le cueste menos a la empresa.',
            how: 'Las cotizaciones de la empresa bajarían durante los primeros años de contrato de un joven.',
            full: ['b'],
          },
          {
            id: 'youth-training',
            what: 'Formar a los jóvenes en oficios con salida.',
            how: 'Habría formación pagada en los sectores que más personal necesitan.',
            partial: ['c'],
          },
          {
            id: 'youth-wage',
            what: 'Subir el sueldo mínimo de los contratos de jóvenes.',
            how: 'Los contratos de prácticas y de formación tendrían un sueldo mínimo más alto.',
            partial: ['a'],
          },
        ],
      },
    ],
  },
  {
    theme: { id: 'impuestos-precios', title: 'Impuestos y precios', order: 3 },
    questions: [
      {
        id: 'impuestos',
        text: '¿Cómo cambiarían los impuestos?',
        topic: 'impuestos',
        approaches: [
          {
            id: 'tax-wealth',
            what: 'Que paguen más los grandes patrimonios.',
            how: 'Habría un impuesto permanente a las fortunas más grandes y se subiría lo que pagan las rentas altas.',
            figure: 'a partir de varios millones de euros',
            full: ['a'],
          },
          {
            id: 'lower-income-tax',
            what: 'Bajar el impuesto sobre la renta a todos.',
            how: 'Se bajarían los tipos del IRPF en todos los tramos y se quitarían algunos impuestos.',
            full: ['b'],
          },
          {
            id: 'simpler-tax',
            what: 'Hacer el impuesto sobre la renta más sencillo.',
            how: 'Habría pocos tramos y casi ninguna deducción, para que la declaración sea más fácil.',
            full: ['c'],
          },
        ],
      },
      {
        id: 'coste-vida',
        text: '¿Qué harían para que la compra sea más barata?',
        topic: 'coste-vida',
        cis: 'La subida de precios preocupa a buena parte de los hogares (dato simulado).',
        approaches: [
          {
            id: 'zero-vat-food',
            what: 'Quitar el IVA a los alimentos básicos.',
            how: 'Los alimentos básicos dejarían de pagar IVA de forma permanente.',
            full: ['a'],
          },
          {
            id: 'food-cheque',
            what: 'Dar una ayuda para la compra a los hogares con menos ingresos.',
            how: 'Los hogares por debajo de un nivel de ingresos recibirían un cheque para alimentos.',
            figure: 'unos cientos de euros',
            full: ['c'],
          },
          {
            id: 'tax-for-inflation',
            what: 'Ajustar los impuestos a la subida de precios.',
            how: 'Los tramos del IRPF subirían cada año con la inflación para que nadie pague más solo porque suben los precios.',
            partial: ['b'],
          },
        ],
      },
      {
        id: 'precios-inflacion',
        text: '¿Qué harían para que la subida de precios no se coma los sueldos?',
        topic: 'coste-vida',
        approaches: [
          {
            id: 'index-brackets',
            what: 'Actualizar cada año los tramos del IRPF con la inflación.',
            how: 'Si los precios suben, los tramos del impuesto subirían igual y se pagaría lo mismo en términos reales.',
            full: ['b'],
          },
          {
            id: 'targeted-aid',
            what: 'Ayudas directas solo a quien más lo necesita.',
            how: 'En lugar de rebajas generales, habría ayudas para los hogares con menos ingresos.',
            partial: ['c'],
          },
          {
            id: 'price-caps',
            what: 'Poner precios máximos a algunos productos básicos.',
            how: 'El Gobierno podría fijar un precio tope temporal a ciertos alimentos y productos de primera necesidad.',
            filler: true,
          },
        ],
      },
      {
        id: 'impuestos-deducciones',
        text: '¿Qué harían con las deducciones de la declaración de la renta?',
        topic: 'impuestos',
        followUp: true,
        approaches: [
          {
            id: 'fewer-deductions',
            what: 'Quitar la mayoría de deducciones a cambio de tipos más bajos.',
            how: 'La declaración tendría menos casillas y menos excepciones, con tipos más bajos para todos.',
            full: ['c'],
          },
          {
            id: 'lower-rates',
            what: 'Mantener las deducciones y bajar los tipos.',
            how: 'Se bajaría lo que se paga en cada tramo sin tocar las deducciones actuales.',
            partial: ['b'],
          },
          {
            id: 'deductions-for-families',
            what: 'Más deducciones para las familias con menos ingresos.',
            how: 'Se ampliarían las deducciones por hijos y por alquiler para las rentas bajas.',
            filler: true,
          },
        ],
      },
      {
        id: 'precios-distribucion',
        text: '¿Qué papel daría al sector público en los precios de la comida?',
        topic: 'coste-vida',
        followUp: true,
        approaches: [
          {
            id: 'public-distributor',
            what: 'Crear una empresa pública que venda alimentos más baratos.',
            how: 'Una distribuidora pública compraría a productores y vendería a precios ajustados.',
            partial: ['a'],
          },
          {
            id: 'market-only',
            what: 'Dejar los precios al mercado y bajar impuestos.',
            how: 'El Estado no intervendría en los precios y se limitaría a bajar impuestos.',
            partial: ['b'],
          },
          {
            id: 'aid-not-prices',
            what: 'No tocar los precios y ayudar a las familias que lo necesitan.',
            how: 'El apoyo iría directamente a los hogares con menos ingresos, sin intervenir en las tiendas.',
            full: ['c'],
          },
        ],
      },
    ],
  },
  {
    theme: { id: 'sanidad-cuidados', title: 'Sanidad, cuidados y educación', order: 4 },
    questions: [
      {
        id: 'sanidad',
        text: '¿Qué harían con las listas de espera para operarse?',
        topic: 'sanidad',
        cis: 'La sanidad aparece entre los cinco primeros problemas (dato simulado).',
        approaches: [
          {
            id: 'legal-max-wait',
            what: 'Fijar por ley un tiempo máximo de espera.',
            how: 'Pasado ese plazo, el paciente tendría derecho a operarse en otro centro sin coste.',
            figure: 'unas semanas',
            full: ['a'],
          },
          {
            id: 'use-private',
            what: 'Usar también la sanidad privada para operar antes.',
            how: 'La sanidad pública pagaría operaciones en centros privados mientras haya listas de espera.',
            full: ['b'],
          },
          {
            id: 'more-staff',
            what: 'Contratar más personal sanitario público.',
            how: 'Se ampliarían las plantillas de los hospitales públicos para operar también por la tarde.',
            filler: true,
          },
        ],
        other: ['c'],
      },
      {
        id: 'cuidados',
        text: '¿Cómo cuidarían a las personas mayores que dependen de otros?',
        topic: 'cuidados',
        approaches: [
          {
            id: 'end-dependency-wait',
            what: 'Acabar con la espera para recibir la ayuda a la dependencia.',
            how: 'Se pondría más dinero para que nadie espere meses a tener reconocida y pagada su ayuda.',
            full: ['a'],
          },
          {
            id: 'day-centres',
            what: 'Crear centros de día públicos en todos los municipios grandes.',
            how: 'Las personas mayores tendrían un centro público cerca de casa durante el día.',
            full: ['d'],
          },
          {
            id: 'family-tax-relief',
            what: 'Bajar impuestos a las familias que cuidan.',
            how: 'Las familias con personas a su cargo pagarían menos en la declaración de la renta.',
            partial: ['b'],
          },
        ],
      },
      {
        id: 'educacion',
        text: '¿Qué cambiarían en la escuela?',
        topic: 'educacion',
        approaches: [
          {
            id: 'free-early-years',
            what: 'Hacer gratis la escuela infantil de 0 a 3 años.',
            how: 'Todas las familias tendrían plaza gratuita para sus hijos pequeños.',
            full: ['a'],
          },
          {
            id: 'school-voucher',
            what: 'Dar a las familias un cheque para elegir colegio.',
            how: 'El dinero público seguiría al alumno al colegio que elija su familia.',
            full: ['b'],
          },
          {
            id: 'smaller-classes',
            what: 'Menos alumnos por clase.',
            how: 'Se bajaría por ley el número máximo de alumnos en cada aula.',
            figure: 'unos veinte alumnos por aula',
            full: ['c'],
          },
        ],
      },
      {
        id: 'sanidad-cobertura',
        text: '¿Qué añadirían a la sanidad pública?',
        topic: 'sanidad',
        followUp: true,
        approaches: [
          {
            id: 'dental-mental',
            what: 'Incluir el dentista y la salud mental.',
            how: 'La sanidad pública cubriría el dentista y tendría más psicólogos en los centros de salud.',
            full: ['c'],
          },
          {
            id: 'guaranteed-times',
            what: 'Garantizar plazos también para especialistas y pruebas.',
            how: 'Los tiempos máximos de espera se aplicarían también a consultas y pruebas diagnósticas.',
            partial: ['a'],
          },
          {
            id: 'free-glasses',
            what: 'Pagar gafas y audífonos a quien lo necesite.',
            how: 'La sanidad pública cubriría gafas y audífonos para niños y personas con pocos ingresos.',
            filler: true,
          },
        ],
      },
      {
        id: 'cuidados-crianza',
        text: '¿Cómo ayudarían a las familias con hijos pequeños?',
        topic: 'cuidados',
        followUp: true,
        approaches: [
          {
            id: 'child-deduction',
            what: 'Una deducción en la renta por cada hijo pequeño.',
            how: 'Las familias que trabajan pagarían menos impuestos por cada hijo menor de tres años.',
            figure: 'unos miles de euros al año',
            full: ['b'],
          },
          {
            id: 'longer-leave',
            what: 'Alargar el permiso por nacimiento.',
            how: 'Madres y padres tendrían más semanas de permiso pagado tras el nacimiento.',
            partial: ['a'],
          },
          {
            id: 'monthly-allowance',
            what: 'Una paga mensual por cada hijo.',
            how: 'Todas las familias recibirían cada mes una cantidad fija por hijo hasta cierta edad.',
            filler: true,
          },
        ],
      },
    ],
  },
  {
    theme: { id: 'canarias', title: 'Tu comunidad: Canarias', order: 9, region: '05' },
    questions: [
      {
        id: 'ref-canarias',
        text: '¿Qué harían con las reglas fiscales especiales de Canarias?',
        topic: 'ref-canarias',
        approaches: [
          {
            id: 'extend-low-tax-zone',
            what: 'Pedir a Europa que mantenga la zona de impuestos bajos para empresas.',
            how: 'Se negociaría con la Unión Europea alargar los beneficios fiscales a las empresas que se instalen en las islas.',
            full: ['a'],
          },
          {
            id: 'lower-igic',
            what: 'Bajar el impuesto canario sobre lo que se compra.',
            how: 'Se rebajaría el tipo general del IGIC, el equivalente canario al IVA.',
            full: ['b'],
          },
          {
            id: 'protect-by-law',
            what: 'Proteger esas reglas con una ley difícil de cambiar.',
            how: 'Las reglas fiscales de Canarias irían a una ley que necesite una mayoría amplia para tocarse.',
            full: ['c'],
            partial: ['e'],
          },
        ],
      },
      {
        id: 'migracion-atlantica',
        text: '¿Qué harían ante la llegada de migrantes por mar a Canarias?',
        topic: 'migracion-atlantica',
        approaches: [
          {
            id: 'share-minors',
            what: 'Repartir a los menores que llegan solos entre todas las comunidades.',
            how: 'Un sistema estatal obligaría a cada comunidad a acoger a una parte de los menores.',
            full: ['a'],
          },
          {
            id: 'state-pays',
            what: 'Que el Estado pague todo lo que cuesta atenderlos.',
            how: 'El Estado asumiría el coste completo de la acogida de los menores que llegan a las islas.',
            full: ['e'],
          },
          {
            id: 'eu-patrols',
            what: 'Pedir a Europa vigilancia permanente en el mar.',
            how: 'La agencia europea de fronteras tendría medios fijos en aguas de Canarias.',
            full: ['b'],
          },
        ],
      },
      {
        id: 'transporte',
        text: '¿Qué harían con el transporte entre islas y con la Península?',
        topic: 'transporte',
        approaches: [
          {
            id: 'resident-discount-law',
            what: 'Asegurar por ley el descuento a residentes en vuelos y barcos.',
            how: 'El descuento para residentes quedaría fijado en una ley y no dependería de cada presupuesto.',
            full: ['e'],
          },
          {
            id: 'single-pass',
            what: 'Un abono único y barato para el transporte público.',
            how: 'Un mismo abono mensual serviría para guaguas, tranvía y barcos públicos.',
            partial: ['a'],
          },
          {
            id: 'more-routes',
            what: 'Más rutas y frecuencias entre las islas pequeñas.',
            how: 'Se pagarían con dinero público conexiones que hoy no son rentables para las navieras.',
            filler: true,
          },
        ],
      },
      {
        id: 'canarias-inversion',
        text: '¿Qué pedirían al Estado para invertir en Canarias?',
        topic: 'ref-canarias',
        followUp: true,
        approaches: [
          {
            id: 'meet-investments',
            what: 'Que cumpla las inversiones que fijan las reglas fiscales canarias.',
            how: 'El Estado tendría que invertir cada año en las islas lo que marcan esas reglas, sin recortes.',
            full: ['e'],
          },
          {
            id: 'law-guarantee',
            what: 'Blindar esas inversiones en una ley de rango alto.',
            how: 'Las inversiones mínimas quedarían en una ley difícil de cambiar.',
            partial: ['c'],
          },
          {
            id: 'island-fund',
            what: 'Crear un fondo propio para infraestructuras de las islas.',
            how: 'Una parte de los impuestos estatales recaudados en Canarias iría a un fondo para obras en las islas.',
            filler: true,
          },
        ],
      },
      {
        id: 'canarias-acogida',
        text: '¿Cómo organizarían la acogida de quienes llegan?',
        topic: 'migracion-atlantica',
        followUp: true,
        approaches: [
          {
            id: 'eu-border-agency',
            what: 'Que Europa se implique con medios propios.',
            how: 'La Unión Europea pondría medios de vigilancia y apoyo de forma estable.',
            full: ['b'],
          },
          {
            id: 'state-reception',
            what: 'Un sistema estatal de acogida con reparto entre comunidades.',
            how: 'La acogida se organizaría desde el Estado con plazas en todas las comunidades.',
            partial: ['a'],
          },
          {
            id: 'island-centres',
            what: 'Más centros de acogida en las propias islas.',
            how: 'Se ampliarían los centros de primera acogida en Canarias con fondos estatales.',
            filler: true,
          },
        ],
      },
    ],
  },
];

export function simulatedThemes(positions: Position[]): { themes: Theme[]; questions: Question[] } {
  const quoteOf = (letter: Letter, topic: string) => {
    const party = `prueba-${letter}`;
    const p = positions.find((x) => x.party === party && x.topic === topic);
    if (p?.state !== 'proposes') throw new Error(`${party} no tiene propuesta de ${topic}`);
    return { party, quote: p.quotes[0]! };
  };
  const toQuestion = (theme: string, q: QuestionDraft, order: number): Question => ({
    id: q.id,
    theme,
    text: q.text,
    followUp: q.followUp ?? false,
    order,
    origin: { cis: q.cis ?? null, manifestos: new Set(q.approaches.flatMap((a) => [...(a.full ?? []), ...(a.partial ?? [])])).size },
    approaches: q.approaches.map(
      (a): Approach => ({
        id: a.id,
        what: a.what,
        how: a.how,
        figure: a.figure ?? null,
        filler: a.filler ?? false,
        stances: [
          ...(a.full ?? []).map((l): PartyStance => ({ ...quoteOf(l, q.topic), stance: 'full' })),
          ...(a.partial ?? []).map((l): PartyStance => ({ ...quoteOf(l, q.topic), stance: 'partial' })),
        ],
      }),
    ),
    otherProposals: (q.other ?? []).map((l) => quoteOf(l, q.topic)),
  });
  return {
    themes: THEMES.map((t) => t.theme),
    questions: THEMES.flatMap((t) => t.questions.map((q, i) => toQuestion(t.theme.id, q, i + 1))),
  };
}
