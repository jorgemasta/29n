// Builds data/dataset.json from FICTIONAL test programmes, through the real pipeline with the
// fake AI adapter. Used while no real programme can be processed (no credentials / PDF on this
// machine). The dataset is marked origen: "simulado" and every party prueba: true. Content lives in
// scripts/datos-simulados.ts; party D is a provisional source (private prototype only), E is a
// regional (Canary) party and F a regional party with its programme pending. Each fictional PDF
// ends with a page of answers to the suggested questions (Preguntar), see RESPUESTAS_SIMULADAS.
//   npx tsx scripts/generar-simulado.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { construirDataset, validarDataset, type Partido } from '../src/dataset';
import { crearIAFalsa } from '../src/ia/falsa';
import { procesarPrograma } from '../src/pipeline';
import { TEMAS } from '../src/registro/temas';
import { contarPalabras } from '../src/pipeline/texto';
import { PREGUNTAS_SUGERIDAS } from '../src/registro/preguntas';
import { FICTICIOS, PENDIENTES_FICTICIOS, RESPUESTAS_SIMULADAS } from './datos-simulados';

// Simulated feasibility (V13): fictional, generic answers that vary by party and topic so the
// reveal shows every kind of note (agreement, "sin concreción", "sin consenso").
const NIVELES_SIMULADOS = ['viable', 'viable_con_matices', 'dificil', 'muy_dificil', 'sin_concrecion'] as const;
const FUENTES_SIMULADAS = [
  { titulo: 'INE: portada', url: 'https://www.ine.es/' },
  { titulo: 'BOE: portada', url: 'https://www.boe.es/' },
];
const RAZONES_SIMULADAS = {
  competencia: '[Simulado] Texto de ejemplo sobre quién tiene la competencia.',
  coste: '[Simulado] Texto de ejemplo sobre el coste y cómo se paga.',
  legal: '[Simulado] Texto de ejemplo sobre el encaje legal.',
  precedentes: '[Simulado] Texto de ejemplo sobre precedentes.',
  mayoria: '[Simulado] Texto de ejemplo sobre los votos necesarios.',
};
function viabilidadSimulada(partido: string, tema: string, evaluacion: number) {
  const n = [...`${partido}:${tema}`].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  // About one pair in 7 disagrees: the second evaluation moves one level.
  const i = (n % 7 === 0 && evaluacion === 2 ? n + 1 : n) % NIVELES_SIMULADOS.length;
  const nivel = NIVELES_SIMULADOS[i]!;
  return {
    nivel,
    razones: RAZONES_SIMULADAS,
    porque: `[Simulado] Nota de ejemplo generada sin IA para el prototipo. No evalúa la propuesta real.`,
    fuentes: nivel === 'sin_concrecion' ? [] : FUENTES_SIMULADAS,
  };
}

/** Wraps a paragraph into lines that fit an A4 page in 10pt Helvetica. */
function lineas(texto: string, max = 95): string[] {
  const out: string[] = [];
  let linea = '';
  for (const palabra of texto.split(' ')) {
    if (linea && (linea + ' ' + palabra).length > max) {
      out.push(linea);
      linea = palabra;
    } else linea = linea ? `${linea} ${palabra}` : palabra;
  }
  if (linea) out.push(linea);
  return out;
}

async function pdfFicticio(paginas: string[][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
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
  // Cover page, then one page per topic the fictional party talks about.
  const paginas: string[][] = [[`${f.titulo.toUpperCase()} (documento ficticio para el prototipo)`]];
  const pagina: Record<string, number> = {};
  for (const tema of TEMAS) {
    const p = f.propuestas[tema.id];
    if (!p) continue;
    paginas.push([tema.titulo, ...lineas(p[0])]);
    pagina[tema.id] = paginas.length;
  }
  // Last page: what the fictional programme says about the suggested questions.
  const respuestasF = RESPUESTAS_SIMULADAS[f.id] ?? {};
  const paginaRespuestas = paginas.length + 1;
  paginas.push(['Otras propuestas', ...Object.values(respuestasF).flatMap((r) => [...lineas(r[0]), ''])]);
  const pdf = await pdfFicticio(paginas);
  await writeFile(`public/programas/${f.id}.pdf`, pdf);
  const partido: Partido = {
    id: f.id,
    nombre: `Partido de prueba ${f.letra}`,
    siglas: `PR${f.letra}`,
    ambito: f.ambito ?? { tipo: 'estatal' },
    programa: { estado: 'publicado', fuente: f.fuente, url: `https://29n.jorgemasta.com/programas/${f.id}.pdf`, titulo: f.titulo },
    prueba: true,
  };
  const de = (e: { tema: { id: string } }) => f.propuestas[e.tema.id];
  const ia = crearIAFalsa({
    'extraer-postura': (e) => (de(e) ? { propone: true, citas: [{ texto: de(e)![0], pagina: pagina[e.tema.id]! }] } : { propone: false, citas: [] }),
    neutralizar: (e) => ({ que: de(e)![1], como: de(e)![2], cifra: de(e)![3] }),
    'verificar-fidelidad': () => ({ anade: false, omite: false, cambiaSentido: false, explicacion: 'Fiel a la cita.' }),
    'adivinar-partido': () => ({ asignaciones: [] }),
    'confirmar-ausencia': () => ({ propone: false, citas: [] }),
    'evaluar-viabilidad': (e) => viabilidadSimulada(f.id, e.tema.id, e.evaluacion),
    'responder-pregunta': (e) => {
      const r = respuestasF[e.pregunta.id];
      if (!r) return { menciona: false, que: '', como: '', cifra: null, citas: [] };
      if (!e.paginas.some((p: { pagina: number }) => p.pagina === paginaRespuestas))
        throw new Error(`${f.id}/${e.pregunta.id}: las palabras clave no encuentran la página de respuestas`);
      return { menciona: true, que: r[1], como: r[2], cifra: r[3], citas: [{ texto: r[0], pagina: paginaRespuestas }] };
    },
  });
  const r = await procesarPrograma(pdf, partido, ia, {
    temas: TEMAS,
    dominios: { [f.id]: ['29n.jorgemasta.com'] },
    longitudesTema,
    publicado: { partidos, posturas: resultados.flatMap((x) => x.posturas) },
    // Simulated: the feasibility sources are institutional home pages; skip the network check.
    comprobarUrl: async () => true,
  });
  for (const p of r.posturas) if (p.estado === 'propone') (longitudesTema[p.tema] ??= []).push(contarPalabras(p.texto));
  if (!r.publicable) throw new Error(`${f.id} no publicable: ${r.informe.motivo}`);
  const fallidas = r.posturas.filter((p) => p.estado === 'sin_verificar');
  const sinVerificar = r.respuestas.filter((x) => x.estado === 'sin_verificar');
  if (sinVerificar.length) throw new Error(`${f.id}: respuestas sin verificar ${sinVerificar.map((x) => x.pregunta).join(', ')}: ${JSON.stringify(r.informe.entradas.filter((e) => e.pregunta && e.resultado !== 'pasa'))}`);
  if (fallidas.length) throw new Error(`${f.id}: sin verificar ${fallidas.map((p) => p.tema).join(', ')}: ${JSON.stringify(r.informe.entradas.filter((e) => e.resultado === 'descartar'))}`);
  partidos.push({ ...partido, programa: { ...partido.programa, hashPdf: r.informe.hashPdf } } as Partido);
  resultados.push(r);
}

for (const f of PENDIENTES_FICTICIOS)
  partidos.push({ id: f.id, nombre: `Partido de prueba ${f.letra}`, siglas: `PR${f.letra}`, ambito: f.ambito, programa: { estado: 'pendiente' }, prueba: true });

const dataset = construirDataset({
  partidos,
  temas: TEMAS,
  preguntas: PREGUNTAS_SUGERIDAS,
  resultados,
  generado: new Date().toISOString(),
  origen: 'simulado',
  nota: 'Datos de PRUEBA: partidos y programas ficticios, procesados con el adaptador de IA falso, también las respuestas de Preguntar. No representan a ningún partido real. El partido D simula una fuente provisional (solo privado); E es regional (Canarias) y F, regional con programa pendiente.',
});
const v = validarDataset(dataset);
if (!v.valido) throw new Error(`V9: ${v.errores.join('\n')}`);
await writeFile('data/dataset.json', JSON.stringify(dataset, null, 2) + '\n');
console.log(`data/dataset.json: ${dataset.partidos.length} partidos, ${dataset.posturas.length} posturas (simulado)`);
