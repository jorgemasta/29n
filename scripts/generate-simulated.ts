// Builds data/dataset.json from FICTIONAL test programmes, through the real pipeline with the
// fake AI adapter. Used while no real programme can be processed (no credentials / PDF on this
// machine). The dataset is marked origin: "simulated" and every party test: true. Content lives in
// scripts/simulated-data.ts; party D is a provisional source (private prototype only), E is a
// regional (Canary) party and F a regional party with its programme pending. Each fictional PDF
// ends with a page of answers to the suggested questions (Preguntar), see SIMULATED_ANSWERS.
//   npx tsx scripts/generate-simulated.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { textPath } from '../src/questions/texts';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { buildDataset, validateDataset, type Party } from '../src/dataset';
import { createFakeAI } from '../src/ai/fake';
import { processManifesto } from '../src/pipeline';
import { TOPICS } from '../src/registry/topics';
import { SUGGESTED_QUESTIONS } from '../src/registry/questions';
import { FICTIONAL, FICTIONAL_PENDING, SIMULATED_ANSWERS } from './simulated-data';
import { simulatedThemes } from './simulated-themes';

// Simulated feasibility (V13): fictional, generic answers that vary by party and topic so the
// reveal shows every kind of note (agreement, "sin concreción", "sin consenso").
const SIMULATED_LEVELS = ['viable', 'viableWithCaveats', 'difficult', 'veryDifficult', 'notConcrete'] as const;
const SIMULATED_SOURCES = [
  { title: 'INE: portada', url: 'https://www.ine.es/' },
  { title: 'BOE: portada', url: 'https://www.boe.es/' },
];
const SIMULATED_REASONS = {
  competence: '[Simulado] Texto de ejemplo sobre quién tiene la competencia.',
  cost: '[Simulado] Texto de ejemplo sobre el coste y cómo se paga.',
  legal: '[Simulado] Texto de ejemplo sobre el encaje legal.',
  precedents: '[Simulado] Texto de ejemplo sobre precedentes.',
  majority: '[Simulado] Texto de ejemplo sobre los votos necesarios.',
};
function simulatedFeasibility(party: string, topic: string, assessment: number) {
  const n = [...`${party}:${topic}`].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  // About one pair in 7 disagrees: the second evaluation moves one level.
  const i = (n % 7 === 0 && assessment === 2 ? n + 1 : n) % SIMULATED_LEVELS.length;
  const level = SIMULATED_LEVELS[i]!;
  return {
    level,
    reasons: SIMULATED_REASONS,
    why: `[Simulado] Nota de ejemplo generada sin IA para el prototipo. No evalúa la propuesta real.`,
    sources: level === 'notConcrete' ? [] : SIMULATED_SOURCES,
  };
}

/** Wraps a paragraph into lines that fit an A4 page in 10pt Helvetica. */
function lines(text: string, max = 95): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && (line + ' ' + word).length > max) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

async function fictionalPdf(pages: string[][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const source = await doc.embedFont(StandardFonts.Helvetica);
  // Fixed dates: regenerating gives byte-identical PDFs (stable hashes, no binary churn).
  doc.setCreationDate(new Date('2026-11-01T00:00:00Z'));
  doc.setModificationDate(new Date('2026-11-01T00:00:00Z'));
  for (const lines of pages) {
    const page = doc.addPage();
    lines.forEach((l, i) => page.drawText(l, { x: 40, y: 780 - i * 14, size: 10, font: source }));
  }
  return doc.save();
}

const parties: Party[] = [];
const results = [];
await mkdir('public/programas', { recursive: true });
await mkdir('public/texts', { recursive: true });
for (const f of FICTIONAL) {
  // Cover page, then one page per topic the fictional party talks about.
  const pages: string[][] = [[`${f.title.toUpperCase()} (documento ficticio para el prototipo)`]];
  const page: Record<string, number> = {};
  for (const topic of TOPICS) {
    const p = f.proposals[topic.id];
    if (!p) continue;
    pages.push([topic.title, ...lines(p[0])]);
    page[topic.id] = pages.length;
  }
  // Last page: what the fictional programme says about the suggested questions.
  const fictionalAnswers = SIMULATED_ANSWERS[f.id] ?? {};
  const answersPage = pages.length + 1;
  pages.push(['Otras propuestas', ...Object.values(fictionalAnswers).flatMap((r) => [...lines(r[0]), ''])]);
  const pdf = await fictionalPdf(pages);
  await writeFile(`public/programas/${f.id}.pdf`, pdf);
  const party: Party = {
    id: f.id,
    name: `Partido de prueba ${f.letter}`,
    acronym: `PR${f.letter}`,
    scope: f.scope ?? { type: 'national' },
    manifesto: { state: 'published', source: f.source, url: `https://29n.jorgemasta.com/programas/${f.id}.pdf`, title: f.title },
    test: true,
  };
  const proposalOf = (e: { topic: { id: string } }) => f.proposals[e.topic.id];
  const ai = createFakeAI({
    'extract-position': (e) => (proposalOf(e) ? { proposes: true, quotes: [{ text: proposalOf(e)![0], page: page[e.topic.id]! }] } : { proposes: false, quotes: [] }),
    neutralize: (e) => ({ what: proposalOf(e)![1], how: proposalOf(e)![2], figure: proposalOf(e)![3] }),
    'verify-fidelity': () => ({ adds: false, omits: false, changesMeaning: false, explanation: 'Fiel a la cita.' }),
    'guess-party': () => ({ assignments: [] }),
    'confirm-absence': () => ({ proposes: false, quotes: [] }),
    'assess-feasibility': (e) => simulatedFeasibility(f.id, e.topic.id, e.assessment),
    'answer-question': (e) => {
      const r = fictionalAnswers[e.question.id];
      if (!r) return { mentions: false, what: '', how: '', figure: null, quotes: [] };
      if (!e.pages.some((p: { page: number }) => p.page === answersPage))
        throw new Error(`${f.id}/${e.question.id}: las palabras clave no encuentran la página de respuestas`);
      return { mentions: true, what: r[1], how: r[2], figure: r[3], quotes: [{ text: r[0], page: answersPage }] };
    },
  });
  const r = await processManifesto(pdf, party, ai, {
    topics: TOPICS,
    domains: { [f.id]: ['29n.jorgemasta.com'] },
    // V5 and V11 compare each programme with the ones already processed.
    published: { parties, positions: results.flatMap((x) => x.positions) },
    // Simulated: the feasibility sources are institutional home pages; skip the network check.
    checkUrl: async () => true,
  });
  if (r.revisions.length) throw new Error(`${f.id}: deja fuera de rango a otros partidos: ${JSON.stringify(r.revisions)}`);
  if (!r.publishable) throw new Error(`${f.id} no publicable: ${r.report.reason}`);
  const failed = r.positions.filter((p) => p.state === 'unverified');
  const unverified = r.answers.filter((x) => x.state === 'unverified');
  if (unverified.length) throw new Error(`${f.id}: respuestas sin verificar ${unverified.map((x) => x.question).join(', ')}: ${JSON.stringify(r.report.entries.filter((e) => e.suggestedQuestion && e.result !== 'pass'))}`);
  if (failed.length) throw new Error(`${f.id}: sin verificar ${failed.map((p) => p.topic).join(', ')}: ${JSON.stringify(r.report.entries.filter((e) => e.result === 'discard'))}`);
  parties.push({ ...party, manifesto: { ...party.manifesto, hashPdf: r.report.hashPdf } } as Party);
  // Page text for the live free question (read by the Cloudflare function).
  await writeFile(`public/${textPath(f.id)}`, JSON.stringify(r.text) + '\n');
  results.push(r);
}

for (const f of FICTIONAL_PENDING)
  parties.push({ id: f.id, name: `Partido de prueba ${f.letter}`, acronym: `PR${f.letter}`, scope: f.scope, manifesto: { state: 'pending' }, test: true });

const dataset = buildDataset({
  parties,
  topics: TOPICS,
  suggestedQuestions: SUGGESTED_QUESTIONS,
  ...simulatedThemes(results.flatMap((r) => r.positions)),
  results,
  generated: new Date().toISOString(),
  origin: 'simulated',
  note: 'Datos de PRUEBA: partidos y programas ficticios, procesados con el adaptador de IA falso, también las respuestas de Preguntar. No representan a ningún partido real. El partido D simula una fuente provisional (solo privado); E es regional (Canarias) y F, regional con programa pendiente.',
});
const v = validateDataset(dataset);
if (!v.valid) throw new Error(`V9: ${v.errors.join('\n')}`);
await writeFile('data/dataset.json', JSON.stringify(dataset, null, 2) + '\n');
console.log(`data/dataset.json: ${dataset.parties.length} partidos, ${dataset.positions.length} posturas (simulado)`);
