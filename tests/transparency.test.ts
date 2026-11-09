// Transparency data (#11): what the methodology, parties and report pages show, and the report-issue links.
import { describe, expect, it } from 'vitest';
import {
  REPORT_REASONS,
  manifestos,
  feasibilityDistribution,
  reportSummary,
  missingPartyUrl,
  reportErrorUrl,
} from '../src/transparency';
import { CHECKS } from '../src/registry/checks';
import { createFeedback, FEEDBACK_LIMIT, DAILY_FEEDBACK_LIMIT } from '../src/transparency/feedback';
import { createMemoryStore } from '../src/questions/free';
import { Check, type Dataset, type Report, type FeasibilityNote, type Position } from '../src/dataset/schema';
import { sampleDataset, sampleNote } from './fixtures/sample-dataset';

const note = (result: FeasibilityNote['result']): FeasibilityNote => ({ ...sampleNote, result, why: result === 'noConsensus' ? null : 'Por esto.' });
const withNote = (ds: Dataset, party: string, topic: string, result: FeasibilityNote['result']): Dataset => ({
  ...ds,
  positions: ds.positions.map((p) => (p.party === party && p.topic === topic && p.state === 'proposes' ? ({ ...p, feasibility: note(result) } as Position) : p)),
});

describe('feasibilityDistribution', () => {
  const ds = withNote(withNote(sampleDataset, 'bbb', 'vivienda', 'viable'), 'ccc', 'vivienda', 'viable');

  it('counts the published feasibility results per party, in the fixed scale order', () => {
    const r = feasibilityDistribution(ds);
    expect(r.categories).toEqual(['viable', 'viableWithCaveats', 'difficult', 'veryDifficult', 'notConcrete', 'noConsensus']);
    const aaa = r.byParty.find((f) => f.party.id === 'aaa')!;
    expect(aaa.counts.noConsensus).toBe(1);
    expect(aaa.counts.viable).toBe(0);
    // aaa proposes on 'ref' too, without a note.
    expect(aaa.noNote).toBe(1);
    expect(aaa.total).toBe(2);
    expect(r.byParty.find((f) => f.party.id === 'bbb')!.counts.viable).toBe(1);
  });

  it('only lists parties with a published programme', () => {
    const ids = feasibilityDistribution(ds).byParty.map((f) => f.party.id);
    expect(ids).not.toContain('pend');
    expect(ids).not.toContain('penreg');
    expect(ids).toContain('nada');
  });

  it('gives one cell per party and topic with the result or the reason there is none', () => {
    const r = feasibilityDistribution(ds);
    const vivienda = r.byTopic.find((t) => t.topic.id === 'vivienda')!;
    const cell = (p: string) => vivienda.cells[r.byParty.findIndex((f) => f.party.id === p)];
    expect(cell('aaa')).toBe('noConsensus');
    expect(cell('bbb')).toBe('viable');
    expect(cell('nada')).toBe('noProposal');
    expect(cell('isla')).toBe('noNote');
    const ref = r.byTopic.find((t) => t.topic.id === 'ref')!;
    expect(ref.cells[r.byParty.findIndex((f) => f.party.id === 'bbb')]).toBe('unverified');
  });

  it('works with the published dataset', async () => {
    const published = (await import('../data/dataset.json')).default as Dataset;
    const r = feasibilityDistribution(published);
    for (const f of r.byParty) {
      const sum = r.categories.reduce((s, c) => s + f.counts[c], 0) + f.noNote;
      expect(sum).toBe(f.total);
    }
  });
});

describe('manifestos', () => {
  const ds: Dataset = {
    ...sampleDataset,
    parties: sampleDataset.parties.map((p) => (p.id === 'aaa' && p.manifesto.state === 'published' ? { ...p, manifesto: { ...p.manifesto, date: '2026-11-05' } } : p)),
    reports: [{ party: 'aaa', hashPdf: 'a'.repeat(64), promptVersion: 'v2', extracted: 2, discarded: 0, publishable: true, positions: [], entries: [] }],
  };

  it('splits parties into published and pending, sorted by name', () => {
    const r = manifestos(ds);
    expect(r.withManifesto.map((p) => p.id)).toEqual(['aaa', 'bbb', 'bcn', 'ccc', 'isla', 'nada']);
    expect(r.pending.map((p) => p.id)).toEqual(['pend', 'penreg']);
  });

  it('gives date, PDF link, scope and whether there is a verification report', () => {
    const aaa = manifestos(ds).withManifesto[0];
    expect(aaa).toMatchObject({ date: '2026-11-05', url: 'https://ejemplo.org/aaa.pdf', title: 'Programa 2026', scope: 'Toda España', report: true });
    const island = manifestos(ds).withManifesto.find((p) => p.id === 'isla')!;
    expect(island.scope).toBe('Las Palmas, Santa Cruz de Tenerife');
    expect(island.report).toBe(false);
    expect(island.date).toBeNull();
  });
});

describe('reportSummary', () => {
  const report: Report = {
    party: 'aaa',
    hashPdf: 'a'.repeat(64),
    promptVersion: 'v2',
    extracted: 2,
    discarded: 1,
    publishable: true,
    positions: [
      { topic: 'ref', state: 'unverified', rewrites: 0, reason: 'V1: la cita no aparece' },
      { topic: 'vivienda', state: 'proposes', rewrites: 1 },
    ],
    entries: [
      { check: 'V7', result: 'pass', detail: 'dominio oficial' },
      { topic: 'vivienda', check: 'V1', result: 'pass', detail: 'ok' },
      { topic: 'vivienda', check: 'V3', result: 'rewrite', detail: 'marca' },
      { topic: 'ref', check: 'V1', result: 'discard', detail: 'no aparece' },
    ],
  };

  it('groups the entries by topic in the published topic order, programme-level ones apart', () => {
    const r = reportSummary(report, sampleDataset.topics);
    expect(r.manifesto.map((e) => e.check)).toEqual(['V7']);
    expect(r.topics.map((t) => t.topic.id)).toEqual(['vivienda', 'ref']);
    expect(r.topics[0]!).toMatchObject({ state: 'proposes', rewrites: 1 });
    expect(r.topics[0]!.entries.map((e) => e.check)).toEqual(['V1', 'V3']);
    expect(r.topics[1]!).toMatchObject({ state: 'unverified', reason: 'V1: la cita no aparece' });
    expect(r.published).toBe(1);
  });

  it('groups the checks of the answers to suggested questions apart, in the questions\' order', () => {
    const withAnswers: Report = {
      ...report,
      entries: [
        ...report.entries,
        { suggestedQuestion: 'mili', check: 'V12', result: 'pass', detail: 'no lo menciona' },
        { suggestedQuestion: 'luz', check: 'V1', result: 'pass', detail: 'ok' },
      ],
    };
    const questions = [
      { id: 'mili', text: '¿Servicio militar?', keywords: ['mili'], order: 2 },
      { id: 'luz', text: '¿IVA de la luz?', keywords: ['luz'], order: 1 },
    ];
    const r = reportSummary(withAnswers, sampleDataset.topics, questions);
    expect(r.manifesto.map((e) => e.check)).toEqual(['V7']);
    expect(r.suggestedQuestions.map((p) => [p.question.text, p.entries.map((e) => e.check)])).toEqual([
      ['¿IVA de la luz?', ['V1']],
      ['¿Servicio militar?', ['V12']],
    ]);
  });

  it('labels each entry with its barrier name', () => {
    const r = reportSummary(report, sampleDataset.topics);
    expect(r.manifesto[0]!.name).toBe(CHECKS.V7.name);
  });
});

describe('CHECKS', () => {
  it('describes every barrier of the schema', () => {
    for (const b of Check.options) {
      expect(CHECKS[b].name.length).toBeGreaterThan(3);
      expect(CHECKS[b].description.length).toBeGreaterThan(20);
    }
    expect(Object.keys(CHECKS)).toHaveLength(13);
  });
});

describe('reportErrorUrl', () => {
  const data = { topic: { id: 'vivienda', title: 'Vivienda y alquiler' }, party: { id: 'aaa', name: 'Partido AAA' }, letter: 'B', pages: [7, 9] };
  const read = (url: string) => {
    const u = new URL(url);
    return { base: `${u.origin}${u.pathname}`, title: u.searchParams.get('title')!, body: u.searchParams.get('body')!, labels: u.searchParams.get('labels') };
  };

  it('opens a new GitHub issue in the project repository with the card context filled in', () => {
    const r = read(reportErrorUrl({ ...data, reason: 'quote', comment: 'La página es la 8.' }));
    expect(r.base).toBe('https://github.com/jorgemasta/29n/issues/new');
    expect(r.title).toContain('Vivienda y alquiler');
    expect(r.title).toContain('Partido AAA');
    expect(r.body).toContain(REPORT_REASONS.find((m) => m.id === 'quote')!.text);
    expect(r.body).toContain('vivienda');
    expect(r.body).toContain('aaa');
    expect(r.body).toContain('7, 9');
    expect(r.body).toContain('La página es la 8.');
    expect(r.labels).toBe('reporte');
  });

  it('caps the comment at 300 characters and works without one', () => {
    const long = 'x'.repeat(400);
    expect(read(reportErrorUrl({ ...data, reason: 'other', comment: long })).body).not.toContain('x'.repeat(301));
    expect(read(reportErrorUrl({ ...data, reason: 'other' })).body).not.toContain('undefined');
  });

  it('never sends what the voter chose or their province', () => {
    const r = read(reportErrorUrl({ ...data, reason: 'meaning' }));
    expect(r.body).not.toMatch(/elegiste|elección|provincia/i);
  });
});

describe('missingPartyUrl', () => {
  it('opens a new GitHub issue asking which party is missing', () => {
    const u = new URL(missingPartyUrl());
    expect(`${u.origin}${u.pathname}`).toBe('https://github.com/jorgemasta/29n/issues/new');
    expect(u.searchParams.get('title')).toMatch(/Falta un partido/);
    expect(u.searchParams.get('body')).toMatch(/criterio/i);
  });
});

describe('feedback without a GitHub account (Cloudflare function, POST /api/feedback)', () => {
  const reportError = {
    type: 'report-error' as const,
    topic: { id: 'vivienda', title: 'Vivienda y alquiler' },
    party: { id: 'aaa', name: 'Partido AAA' },
    letter: 'B',
    pages: [7, 9],
    reason: 'quote' as const,
    comment: 'La página es la 8.',
  };
  const missing = { type: 'missing-party' as const, party: 'Partido Nuevo', provinces: 'Teruel', reason: 'Candidatura proclamada (BOE).', link: 'https://ejemplo.org/programa.pdf' };

  function mount(withToken = true) {
    const created: { title: string; body: string; labels: string[] }[] = [];
    const store = createMemoryStore();
    const feedback = createFeedback({
      store,
      createIssue: withToken
        ? async (i) => {
            created.push(i);
            return { url: `https://github.com/jorgemasta/29n/issues/${created.length}` };
          }
        : undefined,
    });
    return { feedback, created, store };
  }

  it('files the report as a GitHub issue with the same content as the prefilled link', async () => {
    const { feedback, created } = mount();
    const r = await feedback.send(reportError, 's1');
    expect(r).toEqual({ state: 'created', url: 'https://github.com/jorgemasta/29n/issues/1' });
    const link = new URL(reportErrorUrl(reportError));
    expect(created[0]!.title).toBe(link.searchParams.get('title'));
    expect(created[0]!.body).toContain(link.searchParams.get('body')!);
    expect(created[0]!.labels).toEqual(['reporte']);
  });

  it('files "Falta un partido" with what the voter wrote', async () => {
    const { feedback, created } = mount();
    expect(await feedback.send(missing, 's1')).toMatchObject({ state: 'created' });
    expect(created[0]!.title).toBe('[Falta un partido] Partido Nuevo');
    expect(created[0]!.body).toContain('Teruel');
    expect(created[0]!.body).toContain('https://ejemplo.org/programa.pdf');
    expect(created[0]!.labels).toEqual(['falta-partido']);
  });

  it('without a token, tells the page to fall back to the prefilled GitHub link', async () => {
    const { feedback } = mount(false);
    expect(await feedback.send(reportError, 's1')).toEqual({ state: 'unavailable', fallbackUrl: reportErrorUrl(reportError) });
    expect(await feedback.send(missing, 's1')).toMatchObject({ state: 'unavailable', fallbackUrl: expect.stringContaining('/issues/new') });
  });

  it('rejects malformed requests and never mentions GitHub users', async () => {
    const { feedback, created } = mount();
    for (const bad of [{}, { ...reportError, reason: 'nada' }, { ...reportError, comment: 'x'.repeat(301) }, { ...missing, party: '' }, { ...missing, link: 'javascript:alert(1)' }])
      expect(await feedback.send(bad, 's1')).toMatchObject({ state: 'invalid' });
    expect(created).toHaveLength(0);
    await feedback.send({ ...reportError, comment: 'Avisad a @alguien' }, 's1');
    expect(created[0]!.body).not.toMatch(/@alguien/);
  });

  it('caps notices per day across all sessions, so a fresh session id per request cannot flood the repo', async () => {
    const { feedback, created } = mount();
    for (let i = 0; i < DAILY_FEEDBACK_LIMIT; i++) expect(await feedback.send(reportError, `sesion-${i}`)).toMatchObject({ state: 'created' });
    expect(await feedback.send(reportError, 'sesion-nueva')).toMatchObject({ state: 'limit', fallbackUrl: expect.stringContaining('github.com') });
    expect(created).toHaveLength(DAILY_FEEDBACK_LIMIT);
  });

  it('limits notices per session and falls back to the link when GitHub fails', async () => {
    const { feedback, store } = mount();
    for (let i = 0; i < FEEDBACK_LIMIT; i++) expect(await feedback.send(reportError, 's1')).toMatchObject({ state: 'created' });
    expect(await feedback.send(reportError, 's1')).toMatchObject({ state: 'limit', fallbackUrl: expect.stringContaining('github.com') });
    expect(JSON.stringify(store.dump())).not.toContain('s1');
    const failing = createFeedback({ createIssue: async () => { throw new Error('502'); } });
    expect(await failing.send(reportError, 's2')).toMatchObject({ state: 'error', fallbackUrl: expect.stringContaining('/issues/new') });
  });
});
