// The programme watcher, exercised only through `watch` with fakes for fetching, the AI,
// git/deploy (`save`) and the phone notification (`sendFeedback`). No network.
import { describe, expect, it } from 'vitest';
import { buildDataset, Dataset } from '../src/dataset';
import { createFakeAI, type FakeResponses } from '../src/ai/fake';
import { createMemoryCache } from '../src/ai/cache';
import { watch, type Alert, type Change, type Download, type WatcherState, type WatchedSource } from '../src/watcher';
import { createIssueAlert, WATCHER_LABEL } from '../src/watcher/issue';
import { createTestPdf } from './fixtures/pdf';
import { testDomains, sampleParty, housingTopic, testTerms } from './fixtures/registry';

const QUOTE =
  'Limitaremos el precio del alquiler en las zonas tensionadas y ampliaremos el parque público de vivienda.';
const pages = [['Programa electoral 2026'], ['Vivienda', QUOTE]];
const neutral = {
  what: 'Limitar por ley el precio del alquiler de vivienda en las zonas tensionadas del país.',
  how: 'Declarando esas zonas y ampliando además el parque público de vivienda disponible para alquilar.',
  figure: null,
};
const reasons = { competence: 'a', cost: 'b', legal: 'c', precedents: 'd', majority: 'e' };
const INE_SOURCE = { title: 'INE', url: 'https://www.ine.es/alquiler' };

function answers(extra: Partial<FakeResponses> = {}): FakeResponses {
  return {
    'extract-position': () => ({ proposes: true, quotes: [{ text: QUOTE, page: 2 }] }),
    neutralize: () => neutral,
    'assess-feasibility': () => ({ level: 'viable', reasons, why: 'Es viable con una ley ordinaria.', sources: [INE_SOURCE] }),
    'verify-fidelity': () => ({ adds: false, omits: false, changesMeaning: false, explanation: '' }),
    'guess-party': () => ({ assignments: [] }),
    'confirm-absence': () => ({ proposes: false, quotes: [] }),
    'answer-question': () => ({ mentions: false, what: '', how: '', figure: null, quotes: [] }),
    ...extra,
  };
}
/** An AI that invents the quote: V1 discards the only position ⇒ the programme is blocked. */
const inventedAnswers = () =>
  answers({
    'extract-position': () => ({
      proposes: true,
      quotes: [{ text: 'Regalaremos una vivienda a cada joven que cumpla dieciocho años en todo el país.', page: 2 }],
    }),
  });

const { manifesto: _, ...pejRegistry } = sampleParty;
const PEJ_PAGE = 'https://ejemplo.org/elecciones';
const PDF_PEJ = 'https://ejemplo.org/docs/programa-29n.pdf';
const AGGREGATOR = 'https://agregador.example/programas-29n';

const initialDataset = (): Dataset =>
  buildDataset({ parties: [], topics: [housingTopic], results: [], generated: '2026-11-01T00:00:00.000Z', origin: 'simulated' });

function html(...links: string[]) {
  return `<html><body>${links.map((e) => `<a href="${e}">enlace</a>`).join('\n')}</body></html>`;
}

/** Fake web: url → page or PDF; anything else fails like a network error. */
function createWeb(webPages: Record<string, string | Uint8Array>) {
  const requested: string[] = [];
  const download = async (url: string): Promise<Download> => {
    requested.push(url);
    const r = webPages[url];
    if (r === undefined) throw new Error(`HTTP 404 ${url}`);
    return typeof r === 'string' ? { type: 'html', text: r } : { type: 'pdf', bytes: r };
  };
  return { download, requested, pages: webPages };
}

async function mount(o: {
  web: Record<string, string | Uint8Array>;
  answers?: FakeResponses;
  sources?: WatchedSource[];
  saveFails?: boolean;
  alertFails?: boolean;
}) {
  const web = createWeb(o.web);
  const saved: Change[] = [];
  const alerts: Alert[] = [];
  const ai = createFakeAI(o.answers ?? answers());
  const cache = createMemoryCache();
  let dataset = initialDataset();
  let state: WatcherState = {};
  const run = async (opts: { party?: string; force?: boolean } = {}) => {
    const r = await watch(
      { dataset, state, sources: o.sources ?? [{ party: 'pej', url: PEJ_PAGE }], parties: { pej: pejRegistry } },
      {
        download: web.download,
        ai,
        cache,
        save: async (c) => {
          if (o.saveFails && c.deploy) throw new Error('wrangler deploy: 500');
          saved.push(c);
        },
        sendAlert: async (a) => {
          if (o.alertFails) throw new Error('GitHub caído');
          alerts.push(a);
        },
        now: () => new Date('2026-11-08T10:00:00Z'),
      },
      {
        ...opts,
        processResult: { topics: [housingTopic], terms: testTerms, domains: testDomains, checkUrl: async () => true },
      },
    );
    dataset = r.dataset;
    state = r.state;
    return r;
  };
  return { run, web, saved, alerts, ai, get dataset() { return dataset; }, get state() { return state; } };
}

const pdf = () => createTestPdf(pages);
const json = (c: Change | undefined, path: string) => JSON.parse(c?.files[path] ?? 'null');

describe('watch', () => {
  it('detects a new programme linked from the official page, publishes it and notifies', async () => {
    const m = await mount({ web: { [PEJ_PAGE]: html('/docs/programa-29n.pdf', '/estatutos.html'), [PDF_PEJ]: await pdf() } });
    const r = await m.run();

    expect(r.results).toEqual([expect.objectContaining({ party: 'pej', result: 'published', url: PDF_PEJ })]);
    expect(m.saved).toHaveLength(1);
    const change = m.saved[0]!;
    expect(change.deploy).toBe(true);
    const ds = Dataset.parse(json(change, 'data/dataset.json'));
    expect(ds.origin).toBe('real');
    expect(ds.parties).toEqual([
      expect.objectContaining({ id: 'pej', manifesto: expect.objectContaining({ url: PDF_PEJ, hashPdf: expect.stringMatching(/^[0-9a-f]{64}$/) }) }),
    ]);
    expect(ds.positions).toEqual([expect.objectContaining({ party: 'pej', topic: 'vivienda', state: 'proposes' })]);
    expect(json(change, 'data/reports/pej.json')).toEqual(expect.objectContaining({ party: 'pej', publishable: true }));
    // Page text for the live free question, from the same PDF.
    expect(json(change, 'public/texts/pej.json')).toEqual({ party: 'pej', hashPdf: ds.parties[0]!.manifesto.state === 'published' ? ds.parties[0]!.manifesto.hashPdf : '', pages: expect.any(Array) });
    expect(m.dataset).toEqual(ds);
    expect(m.alerts).toEqual([expect.objectContaining({ type: 'published', title: expect.stringContaining('PEJ') })]);
  });

  it('does nothing when the PDF has not changed (same hash)', async () => {
    const m = await mount({ web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() } });
    await m.run();
    const calls = m.ai.calls.length;
    const r = await m.run();

    expect(r.results).toEqual([expect.objectContaining({ party: 'pej', result: 'unchanged' })]);
    expect(m.ai.calls).toHaveLength(calls);
    expect(m.saved).toHaveLength(1);
    expect(m.alerts).toHaveLength(1);
  });

  it('reprocesses a programme whose PDF changed', async () => {
    const m = await mount({ web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() } });
    await m.run();
    const hashBefore = m.state.pej?.hash;
    m.web.pages[PDF_PEJ] = await createTestPdf([...pages, ['Anexo: fe de erratas']]);
    const r = await m.run();

    expect(r.results[0]?.result).toBe('published');
    expect(m.state.pej?.hash).not.toBe(hashBefore);
    expect(m.saved).toHaveLength(2);
  });

  it('accepts a source that is the PDF itself', async () => {
    const m = await mount({ web: { [PDF_PEJ]: await pdf() }, sources: [{ party: 'pej', url: PDF_PEJ }] });
    const r = await m.run();
    expect(r.results[0]?.result).toBe('published');
  });

  it('finds the programme on an aggregator, ignoring links outside the party’s official domains', async () => {
    const m = await mount({
      web: {
        [AGGREGATOR]: html('https://agregador.example/copias/pej.pdf', 'https://otro-partido.es/programa.pdf', PDF_PEJ),
        [PDF_PEJ]: await pdf(),
      },
      sources: [{ party: 'pej', url: AGGREGATOR }],
    });
    const r = await m.run();
    expect(r.results[0]).toEqual(expect.objectContaining({ result: 'published', url: PDF_PEJ }));
    expect(m.web.requested).not.toContain('https://agregador.example/copias/pej.pdf');
    expect(m.web.requested).not.toContain('https://otro-partido.es/programa.pdf');
  });

  it('uses the source’s pattern to pick the programme among several PDFs', async () => {
    const m = await mount({
      web: { [PEJ_PAGE]: html('https://ejemplo.org/docs/estatutos.pdf', PDF_PEJ), [PDF_PEJ]: await pdf() },
      sources: [{ party: 'pej', url: PEJ_PAGE, pattern: 'programa' }],
    });
    const r = await m.run();
    expect(r.results[0]?.url).toBe(PDF_PEJ);
    expect(m.web.requested).not.toContain('https://ejemplo.org/docs/estatutos.pdf');
  });

  it('reports a party with no programme found yet without notifying', async () => {
    const m = await mount({ web: { [PEJ_PAGE]: html('/noticias.html') } });
    const r = await m.run();
    expect(r.results).toEqual([expect.objectContaining({ party: 'pej', result: 'noManifesto' })]);
    expect(m.alerts).toEqual([]);
    expect(m.saved).toEqual([]);
  });

  describe('a blocked programme', () => {
    it('publishes nothing of that party, keeps the previous state and notifies the reason', async () => {
      const m = await mount({ web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() }, answers: inventedAnswers() });
      const before = m.dataset;
      const r = await m.run();

      expect(r.results[0]?.result).toBe('blocked');
      expect(m.dataset).toEqual(before);
      expect(m.saved).toHaveLength(1);
      expect(m.saved[0]?.deploy).toBe(false);
      expect(Object.keys(m.saved[0]!.files)).not.toContain('data/dataset.json');
      expect(Object.keys(m.saved[0]!.files)).not.toContain('data/reports/pej.json');
      expect(Object.keys(m.saved[0]!.files)).not.toContain('public/texts/pej.json');
      expect(json(m.saved[0], 'data/reports/blocked/pej.json')).toEqual(expect.objectContaining({ publishable: false }));
      expect(m.alerts).toEqual([expect.objectContaining({ type: 'failure', message: expect.stringContaining('descart') })]);
    });

    it('keeps an already published version of the party intact', async () => {
      let invents = false;
      const goodAnswers = answers();
      const badAnswers = inventedAnswers();
      const m = await mount({
        web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() },
        answers: { ...goodAnswers, 'extract-position': (e, i) => (invents ? badAnswers : goodAnswers)['extract-position'](e, i) },
      });
      await m.run();
      const published = m.dataset;
      // A new PDF whose extraction now fails verification.
      m.web.pages[PDF_PEJ] = await createTestPdf([...pages, ['Versión 2']]);
      invents = true;
      const r = await m.run();

      expect(r.results[0]?.result).toBe('blocked');
      expect(m.dataset).toEqual(published);
    });

    it('is not reprocessed (nor notified again) until its PDF changes', async () => {
      const m = await mount({ web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() }, answers: inventedAnswers() });
      await m.run();
      const r = await m.run();
      expect(r.results[0]?.result).toBe('unchanged');
      expect(m.alerts).toHaveLength(1);
    });
  });

  it('notifies a failure with its reason and retries on the next run when the pipeline crashes', async () => {
    let down = true;
    const base = answers();
    const m = await mount({
      web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() },
      answers: {
        ...base,
        'extract-position': (e, i) => {
          if (down) throw new Error('API de Anthropic: 529 overloaded');
          return base['extract-position'](e, i);
        },
      },
    });
    const r = await m.run();
    expect(r.results[0]?.result).toBe('error');
    expect(m.alerts).toEqual([expect.objectContaining({ type: 'failure', message: expect.stringContaining('529 overloaded') })]);
    expect(m.saved).toEqual([]);
    expect(m.state).toEqual({});

    down = false;
    expect((await m.run()).results[0]?.result).toBe('published');
  });

  it('notifies a failed deploy and leaves the previous dataset', async () => {
    const m = await mount({ web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() }, saveFails: true });
    const before = m.dataset;
    const r = await m.run();
    expect(r.results[0]?.result).toBe('error');
    expect(m.dataset).toEqual(before);
    expect(m.state).toEqual({});
    expect(m.alerts).toEqual([expect.objectContaining({ type: 'failure', message: expect.stringContaining('wrangler deploy: 500') })]);
  });

  it('still publishes when the phone notification cannot be delivered', async () => {
    const m = await mount({ web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() }, alertFails: true });
    const r = await m.run();
    expect(r.results[0]?.result).toBe('published');
    expect(r.alertErrors).toEqual([expect.stringContaining('GitHub caído')]);
  });

  it('keeps watching the other parties when one source is unreachable', async () => {
    const m = await mount({
      web: { [PDF_PEJ]: await pdf() },
      sources: [
        { party: 'pej', url: 'https://ejemplo.org/caida' },
        { party: 'pej', url: PDF_PEJ },
      ],
    });
    const r = await m.run();
    expect(r.results).toEqual([expect.objectContaining({ party: 'pej', result: 'published' })]);
    expect(r.sourceErrors).toEqual([expect.objectContaining({ url: 'https://ejemplo.org/caida', error: expect.stringContaining('404') })]);
  });

  describe('manual relaunch', () => {
    it('reprocesses one party on demand even if its PDF has not changed, with the same result', async () => {
      const m = await mount({ web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() } });
      await m.run();
      const first = m.dataset;
      const r = await m.run({ party: 'pej', force: true });

      expect(r.results[0]?.result).toBe('published');
      expect(m.saved).toHaveLength(2);
      // Cached AI answers ⇒ same positions and notes.
      expect(m.dataset.positions).toEqual(first.positions);
    });

    it('only looks at that party’s sources', async () => {
      const m = await mount({
        web: { [PEJ_PAGE]: html(PDF_PEJ), [PDF_PEJ]: await pdf() },
        sources: [
          { party: 'pej', url: PEJ_PAGE },
          { party: 'otro', url: 'https://otro-partido.es/programa' },
        ],
      });
      await m.run({ party: 'pej' });
      expect(m.web.requested).not.toContain('https://otro-partido.es/programa');
    });

    it('rejects an unknown party', async () => {
      const m = await mount({ web: {} });
      await expect(m.run({ party: 'nadie' })).rejects.toThrow(/nadie/);
    });
  });
});

describe('createIssueAlert', () => {
  const fakeGh = (openTitles: string[] = []) => {
    const calls: string[][] = [];
    const run = (args: string[]) => {
      calls.push(args);
      if (args[0] === 'issue' && args[1] === 'list') return JSON.stringify(openTitles.map((title) => ({ title })));
      if (args[0] === 'issue' && args[1] === 'create') return 'https://github.com/jorgemasta/29n/issues/99\n';
      return '';
    };
    return { run, calls };
  };
  const created = (calls: string[][]) => calls.filter((c) => c[0] === 'issue' && c[1] === 'create');

  it('opens a labelled issue assigned to the maintainer for a failure, and leaves it open', async () => {
    const gh = fakeGh();
    const sendAlert = createIssueAlert({ run: gh.run, assignee: 'jorgemasta' });
    await sendAlert({ type: 'failure', title: '29N: programa de PEJ bloqueado', message: 'V1: cita inventada' });

    const [create] = created(gh.calls);
    expect(create).toEqual(expect.arrayContaining(['--title', '29N: programa de PEJ bloqueado', '--label', WATCHER_LABEL, '--assignee', 'jorgemasta']));
    expect(create?.[create.indexOf('--body') + 1]).toContain('V1: cita inventada');
    expect(gh.calls.some((c) => c[1] === 'close')).toBe(false);
  });

  it('closes a publication notice right away, so it notifies without staying open', async () => {
    const gh = fakeGh();
    await createIssueAlert({ run: gh.run })({ type: 'published', title: '29N: publicado el programa de PEJ', message: '3 posturas' });
    expect(gh.calls).toContainEqual(['issue', 'close', 'https://github.com/jorgemasta/29n/issues/99', '--reason', 'completed']);
  });

  it('does not repeat a failure that already has an open issue', async () => {
    const gh = fakeGh(['29N: fallo al procesar PEJ']);
    await createIssueAlert({ run: gh.run })({ type: 'failure', title: '29N: fallo al procesar PEJ', message: 'timeout' });
    expect(created(gh.calls)).toHaveLength(0);
  });

  it('fails loudly when gh fails', async () => {
    const sendAlert = createIssueAlert({
      run: () => {
        throw new Error('gh: HTTP 403');
      },
    });
    await expect(sendAlert({ type: 'published', title: 't', message: 'm' })).rejects.toThrow(/403/);
  });
});
