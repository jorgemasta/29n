// Builds data/dataset.json from FICTIONAL test programmes, through the real pipeline with the
// fake AI adapter. Used while no real programme can be processed (no credentials / PDF on this
// machine). The dataset is marked origen: "simulado" and every party prueba: true.
//   npx tsx scripts/generar-simulado.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { construirDataset, validarDataset, type Partido } from '../src/dataset';
import { crearIAFalsa } from '../src/ia/falsa';
import { procesarPrograma } from '../src/pipeline';
import { TEMAS } from '../src/registro/temas';
import { contarPalabras } from '../src/pipeline/texto';

interface Ficticio {
  id: string;
  nombre: string;
  paginas: string[][];
  /** null: the programme proposes nothing on vivienda (shows the "no propone nada" card). */
  cita: { texto: string; pagina: number } | null;
  neutro: { que: string; como: string; cifra: string | null } | null;
  /** Fake feasibility answers of evaluations 1 and 2 (fictional); null when there is no proposal. */
  viabilidad: [Simulada, Simulada] | null;
}

interface Simulada {
  nivel: 'viable' | 'viable_con_matices' | 'dificil' | 'muy_dificil' | 'sin_concrecion';
  porque: string;
}

const FUENTES = [
  { titulo: 'INE: estadísticas de vivienda (portada)', url: 'https://www.ine.es/' },
  { titulo: 'BOE: legislación consolidada (portada)', url: 'https://www.boe.es/' },
];
const RAZONES = {
  competencia: '[Simulado] La vivienda es competencia autonómica; el Estado puede fijar bases y financiar.',
  coste: '[Simulado] El coste depende del alcance; la propuesta no detalla toda la financiación.',
  legal: '[Simulado] Encaja en el marco legal actual con cambios de ley ordinaria.',
  precedentes: '[Simulado] Hay medidas parecidas en otros países europeos.',
  mayoria: '[Simulado] Basta una ley ordinaria en el Congreso.',
};

const FICTICIOS: Ficticio[] = [
  {
    id: 'prueba-a',
    nombre: 'Partido de prueba A',
    paginas: [
      ['PROGRAMA DE PRUEBA A (documento ficticio para el prototipo)'],
      [
        'Vivienda',
        'Crearemos una empresa pública estatal de vivienda que construya 50.000 vivien-',
        'das de alquiler asequible al año, con precios que no superen el 30 % de los ingresos.',
      ],
    ],
    cita: {
      texto: 'Crearemos una empresa pública estatal de vivienda que construya 50.000 viviendas de alquiler asequible al año, con precios que no superen el 30 % de los ingresos.',
      pagina: 2,
    },
    neutro: {
      que: 'Crear una empresa pública estatal que construya vivienda de alquiler asequible.',
      como: 'Los alquileres de esas viviendas no superarían el 30 % de los ingresos del hogar.',
      cifra: '50.000 viviendas al año',
    },
    viabilidad: [
      { nivel: 'viable_con_matices', porque: '[Simulado] Se puede aplicar, pero exige acuerdos con las comunidades autónomas y una financiación plurianual que la propuesta no detalla.' },
      { nivel: 'viable_con_matices', porque: '[Simulado] Es aplicable con condiciones: depende de suelo autonómico y municipal.' },
    ],
  },
  {
    id: 'prueba-b',
    nombre: 'Partido de prueba B',
    paginas: [
      ['PROGRAMA DE PRUEBA B (documento ficticio para el prototipo)'],
      ['Economía', 'Bajaremos impuestos.'],
      [
        'Vivienda',
        'Eliminaremos el impuesto de transmisiones patrimoniales en la compra de la primera vivienda',
        'y liberaremos suelo público para que se construya más vivienda.',
      ],
    ],
    cita: {
      texto: 'Eliminaremos el impuesto de transmisiones patrimoniales en la compra de la primera vivienda y liberaremos suelo público para que se construya más vivienda.',
      pagina: 3,
    },
    neutro: {
      que: 'Quitar el impuesto que se paga al comprar la primera vivienda de cada hogar.',
      como: 'Además, liberar suelo público para que se construyan más viviendas en venta y en alquiler.',
      cifra: null,
    },
    viabilidad: [
      { nivel: 'viable', porque: '[Simulado] El impuesto está cedido a las comunidades, pero el Estado puede reformar su regulación básica.' },
      { nivel: 'dificil', porque: '[Simulado] El impuesto lo gestionan las comunidades autónomas y quitarlo exige compensar su recaudación.' },
    ],
  },
  {
    id: 'prueba-c',
    nombre: 'Partido de prueba C',
    paginas: [
      [
        'PROGRAMA DE PRUEBA C (documento ficticio para el prototipo)',
        'Vivienda',
        'Limitaremos el precio del alquiler en las zonas tensionadas y penalizaremos en el IBI',
        'las viviendas vacías durante más de dos años.',
      ],
    ],
    cita: {
      texto: 'Limitaremos el precio del alquiler en las zonas tensionadas y penalizaremos en el IBI las viviendas vacías durante más de dos años.',
      pagina: 1,
    },
    neutro: {
      que: 'Limitar el precio del alquiler en las zonas con más demanda.',
      como: 'Y subir el IBI, el impuesto municipal sobre la casa, a viviendas vacías más de dos años.',
      cifra: null,
    },
    viabilidad: [
      { nivel: 'viable', porque: '[Simulado] La ley estatal de vivienda ya permite declarar zonas tensionadas y el recargo del IBI a viviendas vacías.' },
      { nivel: 'viable', porque: '[Simulado] Existe marco legal estatal para ambas medidas; su aplicación depende de comunidades y ayuntamientos.' },
    ],
  },
  {
    id: 'prueba-d',
    nombre: 'Partido de prueba D',
    paginas: [
      ['PROGRAMA DE PRUEBA D (documento ficticio para el prototipo)'],
      ['Pensiones', 'Revalorizaremos las pensiones con el IPC cada año.'],
    ],
    cita: null,
    neutro: null,
    viabilidad: null,
  },
];

async function pdfFicticio(paginas: string[][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  // Fixed dates: same bytes (and hash) on every run.
  doc.setCreationDate(new Date('2026-11-01T00:00:00Z'));
  doc.setModificationDate(new Date('2026-11-01T00:00:00Z'));
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  // Fixed dates: regenerating gives byte-identical PDFs (stable hashes, no binary churn).
  doc.setCreationDate(new Date('2026-11-01T00:00:00Z'));
  doc.setModificationDate(new Date('2026-11-01T00:00:00Z'));
  for (const lineas of paginas) {
    const pagina = doc.addPage();
    lineas.forEach((l, i) => pagina.drawText(l, { x: 40, y: 780 - i * 14, size: 10, font: fuente }));
  }
  return doc.save();
}

const partidos: Partido[] = [];
// V5: each text is compared with the median length of the ones already processed for that topic.
const longitudesTema: Record<string, number[]> = {};
const resultados = [];
await mkdir('public/programas', { recursive: true });
for (const f of FICTICIOS) {
  const pdf = await pdfFicticio(f.paginas);
  await writeFile(`public/programas/${f.id}.pdf`, pdf);
  const partido: Partido = {
    id: f.id,
    nombre: f.nombre,
    siglas: `PR${f.id.slice(-1).toUpperCase()}`,
    ambito: { tipo: 'estatal' },
    programa: { estado: 'publicado', url: `https://29n.jorgemasta.com/programas/${f.id}.pdf`, titulo: 'Programa de prueba' },
    prueba: true,
  };
  const ia = crearIAFalsa({
    'extraer-postura': () => (f.cita ? { propone: true, citas: [f.cita] } : { propone: false, citas: [] }),
    neutralizar: () => f.neutro,
    'evaluar-viabilidad': (e) => ({ ...f.viabilidad![e.evaluacion === 1 ? 0 : 1], razones: RAZONES, fuentes: FUENTES }),
    'verificar-fidelidad': () => ({ anade: false, omite: false, cambiaSentido: false, explicacion: 'Fiel a la cita.' }),
    'adivinar-partido': () => ({ asignaciones: [] }),
    'confirmar-ausencia': () => ({ propone: false, citas: [] }),
  });
  const r = await procesarPrograma(pdf, partido, ia, {
    temas: TEMAS,
    dominios: { [f.id]: ['29n.jorgemasta.com'] },
    longitudesTema,
    // Simulated: the feasibility sources are institutional home pages; skip the network check.
    comprobarUrl: async () => true,
    publicado: { partidos, posturas: resultados.flatMap((x) => x.posturas) },
  });
  for (const p of r.posturas) if (p.estado === 'propone') (longitudesTema[p.tema] ??= []).push(contarPalabras(p.texto));
  if (!r.publicable) throw new Error(`${f.id} no publicable: ${r.informe.motivo}`);
  partidos.push({ ...partido, programa: { ...partido.programa, hashPdf: r.informe.hashPdf } } as Partido);
  resultados.push(r);
}

const dataset = construirDataset({
  partidos,
  temas: TEMAS,
  resultados,
  generado: new Date().toISOString(),
  origen: 'simulado',
  nota: 'Datos de PRUEBA: partidos y programas ficticios, procesados con el adaptador de IA falso. No representan a ningún partido real.',
});
const v = validarDataset(dataset);
if (!v.valido) throw new Error(`V9: ${v.errores.join('\n')}`);
await writeFile('data/dataset.json', JSON.stringify(dataset, null, 2) + '\n');
console.log(`data/dataset.json: ${dataset.partidos.length} partidos, ${dataset.posturas.length} posturas (simulado)`);
