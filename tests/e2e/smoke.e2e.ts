// End-to-end smoke test (tickets #12, #16): home → province → 5 topics → result → share →
// ask → your data → privacy page and footers, on a phone and a desktop viewport, plus basic
// accessibility checks (axe contrast and serious violations, focus on the heading, touch targets,
// 'Aa', reflow at 320 px, reduced motion). Drives a real Chrome through agent-browser against the
// static build in dist/. Run with `npm run e2e` (builds first). Not part of `npm test`.
//
// Setup once: `npx agent-browser install`. On Linux without root, Chrome's shared libraries can be
// unpacked to ~/.agent-browser/libs/root (see docs/e2e.md); this script adds that dir to
// LD_LIBRARY_PATH when it exists.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const DIST = resolve('dist');
const SESSION = `smoke-${process.pid}`;
const BIN = resolve('node_modules/.bin/agent-browser');
const LIBS = join(homedir(), '.agent-browser/libs/root/usr/lib64');
const env = { ...process.env };
if (existsSync(LIBS)) env.LD_LIBRARY_PATH = [LIBS, env.LD_LIBRARY_PATH].filter(Boolean).join(':');

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/ is missing. Run `npm run build` (or `npm run e2e`).');
  process.exit(1);
}

// Minimal static server for dist/ (directories → index.html), in a child process: the agent-browser
// calls below are synchronous and would otherwise block it.
const SERVER = `
const { createServer } = require('node:http');
const { existsSync, readFileSync, statSync } = require('node:fs');
const { extname, join } = require('node:path');
const DIST = process.argv[1];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.pdf': 'application/pdf', '.txt': 'text/plain' };
const s = createServer((req, res) => {
  let file = join(DIST, decodeURIComponent(new URL(req.url || '/', 'http://x').pathname));
  if (!file.startsWith(DIST)) return res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) return res.writeHead(404).end('404');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
});
s.listen(0, '127.0.0.1', () => console.log(s.address().port));
`;
const server = spawn(process.execPath, ['-e', SERVER, DIST], { stdio: ['ignore', 'pipe', 'inherit'] });
const port = await new Promise<number>((ok, ko) => {
  server.stdout.once('data', (d) => ok(Number(String(d).trim())));
  server.once('exit', () => ko(new Error('The static server did not start')));
});
const BASE = `http://127.0.0.1:${port}/`;

function ab<T = unknown>(...args: string[]): T {
  let output: string;
  try {
    output = execFileSync(BIN, ['--session', SESSION, '--json', ...args], { env, encoding: 'utf8', timeout: 120_000 });
  } catch (e) {
    const { stdout, stderr } = e as { stdout?: string; stderr?: string };
    throw new Error(`agent-browser ${args.join(' ')}: ${(stdout || stderr || String(e)).trim().slice(0, 500)}`);
  }
  const r = JSON.parse(output.trim().split('\n').at(-1)!) as { success: boolean; data: any; error: string | null };
  if (!r.success) throw new Error(`agent-browser ${args.join(' ')}: ${r.error}`);
  return r.data as T;
}
/** Runs an expression in the page and returns its (JSON) value. */
const js = <T = unknown>(expr: string): T => ab<{ result: T }>('eval', expr).result;
const wait = (ms: number) => ab('wait', String(ms));
function waitFor(expr: string, what: string, ms = 5000): void {
  for (let t = 0; t < ms; t += 100) {
    if (js<boolean>(`!!(${expr})`)) return;
    wait(100);
  }
  throw new Error(`Timed out waiting for: ${what}`);
}
const path = () => js<string>('location.hash');
const focusText = () => js<string>('document.activeElement?.tagName + ":" + (document.activeElement?.textContent ?? "").trim()');

let steps = 0;
let prefix = '';
function step(name: string, f: () => void) {
  f();
  steps++;
  console.log(`  ✓ ${prefix}${name}`);
}

/** Phone and desktop: the full journey runs at both sizes. */
const VIEWS = [
  { name: 'phone', width: '390', height: '844' },
  { name: 'desktop', width: '1280', height: '800' },
];

/** axe (bundled with agent-browser): no contrast failures and no serious/critical violations. */
function noViolations(where: string) {
  // Mid-animation text is semi-transparent and axe skips it: settle everything first.
  js(`document.getAnimations().forEach((a) => { try { a.finish(); } catch { a.cancel(); } }); true`);
  const r = ab<{ violations: { id: string; impact: string; nodes: { target: string[]; failureSummary?: string }[] }[] }>('a11y');
  const serious = r.violations.filter((v) => v.id === 'color-contrast' || v.impact === 'serious' || v.impact === 'critical');
  assert.deepEqual(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} ${n.failureSummary ?? ''}`).join(' | ')}`),
    [],
    `axe on ${where}`,
  );
}

/** Buttons, tabs, rows and other controls (inline links inside text are exempt) are ≥ 48 px tall. */
function touchTargets(where: string) {
  const small = js<string[]>(`[...document.querySelectorAll('main button, main summary, main .province-chip, main .topic-row, main .link-button, .tabs a, #aa')]
    .filter((e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed')
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height < 47.5; })
    .map((e) => e.outerHTML.slice(0, 80) + ' ' + Math.round(e.getBoundingClientRect().height) + 'px')`);
  assert.deepEqual(small, [], `touch targets < 48px on ${where}`);
}

/** Nothing is cut: no horizontal scroll. */
function noOverflow(where: string) {
  const width = js<{ doc: number; view: number }>('({ doc: document.documentElement.scrollWidth, view: innerWidth })');
  const offenders = width.doc > width.view
    ? js<string[]>(`[...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
        .map((e) => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right)).slice(0, 5)`)
    : [];
  assert.ok(width.doc <= width.view, `overflows on ${where}: ${width.doc} > ${width.view} (${offenders.join(', ')})`);
}

/** The whole journey, from a first visit, at one viewport size. */
function journey(v: { name: string; width: string; height: string }) {
  prefix = `[${v.name}] `;
  ab('set', 'viewport', v.width, v.height);
  ab('open', BASE);
  js('localStorage.clear()');
  ab('open', BASE);

  step('first-visit home', () => {
    waitFor(`document.querySelector('h1')?.textContent.includes('sin saber de quién es')`, 'home headline');
    assert.equal(path(), '#portada');
    assert.match(focusText(), /^H1:Lee lo que proponen sin saber de quién es\./);
    assert.ok(js<boolean>(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Empezar por vivienda')`));
    assert.ok(js<boolean>(`document.body.textContent.includes('No pedimos nombre, teléfono ni dinero. Nunca.')`));
    // No tab bar during onboarding.
    assert.equal(js<boolean>(`document.querySelector('.tabs').hidden`), true);
    noViolations('home');
    ab('set', 'media', 'dark');
    noViolations('home (dark)');
    ab('set', 'media', 'light');
    touchTargets('home');
  });

  step('home with ?r=reto: the challenge line sits above the headline', () => {
    ab('open', BASE + '?r=reto');
    waitFor(`document.querySelector('.home h1')`, 'home with challenge');
    assert.equal(js<string>(`document.querySelector('.home h1').previousElementSibling?.className`), 'challenge-notice');
    ab('open', BASE);
    waitFor(`document.querySelector('.home h1')`, 'home');
  });

  step('home animation: flips, and static with reduced motion', () => {
    assert.notEqual(js<string>(`getComputedStyle(document.querySelector('.mock-cards .flip')).animationName`), 'none');
    ab('set', 'media', 'light', 'reduced-motion');
    assert.equal(js<string>(`getComputedStyle(document.querySelector('.mock-cards .flip')).animationName`), 'none');
    ab('set', 'media', 'light');
  });

  step("'Aa' button: large text is saved, nothing cut at 320 px", () => {
    assert.equal(js<string>(`getComputedStyle(document.documentElement).fontSize`), '18px');
    ab('click', '#aa');
    assert.equal(js<string>(`getComputedStyle(document.documentElement).fontSize`), '22px');
    assert.equal(js<string>(`document.querySelector('#aa').getAttribute('aria-pressed')`), 'true');
    ab('reload');
    waitFor(`document.querySelector('h1')`, 'reload');
    assert.equal(js<string>(`getComputedStyle(document.documentElement).fontSize`), '22px');
    // 200 % zoom on a 640 px phone ≈ 320 CSS px; with the big font too.
    ab('set', 'viewport', '320', '640');
    noOverflow('home, large text, 320 px');
    ab('click', '#aa');
    assert.equal(js<string>(`getComputedStyle(document.documentElement).fontSize`), '18px');
    ab('set', 'viewport', v.width, v.height);
  });

  step('province: focus on the headline, search by municipality', () => {
    ab('find', 'role', 'button', 'click', '--name', 'Empezar por vivienda');
    waitFor(`location.hash === '#provincia'`, '#provincia');
    assert.match(focusText(), /^H1:¿Dónde votas\?/);
    noViolations('province');
    touchTargets('province');
    ab('fill', '#place-search', 'Telde');
    waitFor(`[...document.querySelectorAll('#place-results button')].some((b) => b.textContent.includes('Telde → Las Palmas'))`, 'Telde → Las Palmas');
    js(`[...document.querySelectorAll('#place-results button')].find((b) => b.textContent.includes('Telde → Las Palmas')).click()`);
    waitFor(`location.hash.startsWith('#tema/')`, 'first topic');
  });

  step('topic 1: help the first time, province notice ~2 s, bottom bar', () => {
    waitFor(`document.querySelector('dialog.help')?.open`, 'help layer');
    assert.match(js<string>(`document.querySelector('dialog.help').textContent`), /Lee y toca la que más te convenza/);
    assert.ok(js<boolean>(`document.querySelector('.zone-notice')?.textContent.includes('Las Palmas')`), 'province notice');
    ab('find', 'role', 'button', 'click', '--name', 'Entendido');
    assert.equal(js<boolean>(`document.querySelector('dialog.help')?.open ?? false`), false);
    assert.match(focusText(), /^H1:/);
    try {
      waitFor(`!document.querySelector('.zone-notice')`, 'the province notice to go away', 4000);
    } catch (e) {
      console.error(js(`({ hover: document.querySelector('.zone-notice')?.matches(':hover'), focus: document.querySelector('.zone-notice')?.matches(':focus-within'), dialogs: document.querySelectorAll('dialog').length, open: !!document.querySelector('dialog[open]'), notices: document.querySelectorAll('.zone-notice').length })`));
      throw e;
    }
    const tabs = js<string[]>(`[...document.querySelectorAll('.tabs a')].map((a) => a.textContent.trim())`);
    assert.deepEqual(tabs.map((p) => p.replace(/^\S+\s*/u, '')), ['Temas', 'Preguntar', 'Mi resultado']);
    assert.equal(js<boolean>(`document.querySelector('.tabs').hidden`), false);
    noViolations('topic');
    touchTargets('topic');
    noOverflow('topic');
    // Help is shown only once.
    ab('reload');
    waitFor(`document.querySelector('.card')`, 'cards after reloading');
    assert.equal(js<boolean>(`!!document.querySelector('dialog.help')`), false);
  });

  step("'Escuchar todas' reads in order and highlights the card being read", () => {
    // Fake voice: records what is said; each utterance ends when we tell it to.
    js(`(() => {
      const f = { spoken: [], queue: [], speaking: false,
        speak(u) { f.queue.push(u); if (f.queue.length === 1) f.next(); },
        next() { const u = f.queue[0]; if (!u) return; f.spoken.push(u.text); u.onstart?.(); },
        finish() { const u = f.queue.shift(); u?.onend?.(); f.next(); },
        cancel() { const c = f.queue; f.queue = []; c.forEach((u) => u.onend?.()); }, getVoices: () => [] };
      Object.defineProperty(window, 'speechSynthesis', { value: f, configurable: true });
      window.SpeechSynthesisUtterance ??= function (t) { this.text = t; };
      return true; })()`);
    ab('find', 'role', 'button', 'click', '--name', 'Escuchar todas');
    const first = js<string>(`document.querySelector('.card.playing')?.dataset.value`);
    assert.equal(first, js<string>(`document.querySelector('.card').dataset.value`));
    assert.match(js<string>(`speechSynthesis.spoken[0]`), new RegExp(`^Propuesta ${first}\\.`));
    js('speechSynthesis.finish()');
    assert.equal(js<string>(`document.querySelector('.card.playing')?.dataset.value`), js<string>(`document.querySelectorAll('.card')[1].dataset.value`));
    ab('find', 'role', 'button', 'click', '--name', 'Parar');
    assert.equal(js<number>(`document.querySelectorAll('.card.playing').length`), 0);
  });

  step('choose and reveal (fade with reduced motion), focus on the headline', () => {
    js(`document.querySelector('.card[data-value]').scrollIntoView({ block: 'center' }); true`);
    ab('find', 'first', '.card[data-value]', 'click');
    waitFor(`document.querySelector('.sticky-bar')`, 'confirm bar');
    touchTargets('confirm');
    ab('set', 'media', 'light', 'reduced-motion');
    ab('find', 'role', 'button', 'click', '--name', 'Descubrir sin apostar');
    waitFor(`document.querySelector('.reveal')`, 'reveal');
    assert.match(focusText(), /^H1:La [A-Z] era de /);
    assert.equal(js<string>(`getComputedStyle(document.querySelector('.reveal .revealed')).animationName`), 'fade-in');
    ab('set', 'media', 'light');
    noViolations('reveal');
    touchTargets('reveal');
    noOverflow('reveal');
  });

  step('reveal in dark mode: AA contrast', () => {
    ab('set', 'media', 'dark');
    noViolations('reveal (dark)');
    ab('set', 'media', 'light');
  });

  step("the 'Temas' tab opens the list with focus on the headline", () => {
    ab('click', '.tabs a[href="#temas"]');
    waitFor(`location.hash === '#temas'`, '#temas');
    assert.match(focusText(), /^H1:Temas/);
    assert.equal(js<string>(`document.querySelector('.tabs a[href="#temas"]').getAttribute('aria-current')`), 'page');
    noViolations('topic list');
    touchTargets('topic list');
  });

  step('five topics: linked AI label while blind and at the reveal', () => {
    for (let n = 0; n < 4; n++) {
      ab('click', '.tabs a[href="#temas"]');
      waitFor(`document.querySelector('a.topic-row.notStarted')`, 'a topic not started');
      js(`document.querySelector('a.topic-row.notStarted').click(); true`);
      waitFor(`document.querySelector('.card[data-value]')`, 'cards');
      assert.equal(js<string>(`document.querySelector('.ai-note a.ai-label')?.getAttribute('href')`), '/privacidad/#ia', 'AI label while blind');
      js(`document.querySelector('.card[data-value]').click(); true`);
      waitFor(`document.querySelector('.sticky-bar button.primary')`, 'confirm bar');
      js(`document.querySelector('.sticky-bar button.primary').click(); true`);
      waitFor(`document.querySelector('.reveal')`, 'reveal');
      const labels = js<string[]>(`[...document.querySelectorAll('.reveal a.ai-label')].map((a) => a.getAttribute('href'))`);
      assert.ok(labels.includes('/privacidad/#ia'), `AI label at the reveal: ${labels}`);
    }
    noOverflow('fifth reveal');
  });

  step('Mi resultado (computed on the phone) and Compartir', () => {
    ab('click', '.tabs a[href="#resultado"]');
    waitFor(`location.hash === '#resultado' && document.querySelector('.ranking .ranking-row')`, 'ranking');
    assert.match(focusText(), /^H1:Mi resultado/);
    noViolations('result');
    touchTargets('result');
    noOverflow('result');
    js(`location.hash = '#compartir'; true`);
    waitFor(`document.querySelector('h1')?.textContent === 'Compartir'`, 'share');
    noViolations('share');
    touchTargets('share');
    noOverflow('share');
  });

  step('Preguntar: AI label and the answer to a suggested question', () => {
    ab('click', '.tabs a[href="#preguntar"]');
    waitFor(`document.querySelector('a.question-row')`, 'suggested questions');
    assert.equal(js<string>(`document.querySelector('.ask a.ai-label')?.getAttribute('href')`), '/privacidad/#ia');
    noViolations('ask');
    touchTargets('ask');
    js(`document.querySelector('a.question-row').click(); true`);
    waitFor(`location.hash.startsWith('#preguntar/') && document.querySelector('h1')`, 'answer');
    noViolations('answer');
    noOverflow('answer');
  });

  step('Tus datos, and nothing has left the browser', () => {
    js(`location.hash = '#datos'; true`);
    waitFor(`document.querySelector('h1')?.textContent === 'Tus datos'`, 'your data');
    noViolations('your data');
    touchTargets('your data');
    const outside = js<string[]>(`performance.getEntriesByType('resource').map((e) => e.name).filter((u) => new URL(u).origin !== location.origin)`);
    assert.deepEqual(outside, [], 'requests to other domains');
  });

  step('privacy page, and the footer with licences on every page', () => {
    for (const page of ['', 'privacidad/', 'metodologia/', 'partidos/', 'rubrica/']) {
      ab('open', BASE + page);
      waitFor(`document.querySelector('footer.footer')`, `footer of /${page}`);
      const footer = js<{ text: string; links: string[] }>(`({ text: document.querySelector('footer.footer').textContent,
        links: [...document.querySelectorAll('footer.footer a')].map((a) => a.getAttribute('href')) })`);
      assert.match(footer.text, /licencia MIT/, `MIT on /${page}`);
      assert.match(footer.text, /CC BY 4\.0/, `CC BY on /${page}`);
      assert.match(footer.text, /Jorge Masta, sin afiliación/, `authorship on /${page}`);
      assert.ok(footer.links.includes('/privacidad/'), `privacy link on /${page}`);
    }
    ab('open', BASE + 'privacidad/');
    waitFor(`document.querySelector('h1')`, 'privacy');
    const text = js<string>('document.querySelector("main").textContent');
    for (const t of ['nunca salen del navegador', 'Umami', 'Anthropic', '30 días', 'retención cero', 'art. 69 de la LOREG'])
      assert.ok(text.includes(t), `the privacy page mentions «${t}»`);
    assert.ok(js<boolean>(`!!document.getElementById('ia')`), '#ia anchor');
    noViolations('privacy');
    noOverflow('privacy');
  });

  step("information pages: contrast and 'Aa'", () => {
    for (const page of ['metodologia/', 'partidos/', 'rubrica/', 'privacidad/']) {
      ab('open', BASE + page);
      waitFor(`document.querySelector('h1')`, page);
      noViolations(page);
    }
    ab('open', BASE + 'metodologia/');
    ab('click', '#aa');
    assert.equal(js<string>(`getComputedStyle(document.documentElement).fontSize`), '22px');
    ab('click', '#aa');
  });
}

try {
  console.log(`Smoke test on ${BASE}`);

  step('the production build refuses to publish test data', () => {
    const output = mkdtempSync(join(tmpdir(), '29n-prod-'));
    let failure = '';
    try {
      execFileSync(resolve('node_modules/.bin/astro'), ['build', '--outDir', output], {
        env: { ...process.env, PRODUCTION: '1' }, encoding: 'utf8', stdio: 'pipe', timeout: 300_000,
      });
    } catch (e) {
      const { stdout, stderr } = e as { stdout?: string; stderr?: string };
      failure = `${stdout ?? ''}${stderr ?? ''}`;
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
    assert.match(failure, /Build de producción bloqueado/, 'PRODUCTION=1 with the simulated dataset must fail');
    assert.match(failure, /simulated/);
  });

  step('preview: not indexable (robots.txt and meta robots)', () => {
    assert.match(readFileSync(join(DIST, 'robots.txt'), 'utf8'), /Disallow: \//);
    for (const f of ['index.html', 'privacidad/index.html', 'metodologia/index.html'])
      assert.match(readFileSync(join(DIST, f), 'utf8'), /<meta name="robots" content="noindex, nofollow"/, f);
  });

  for (const v of VIEWS) journey(v);
  console.log(`Smoke test: ${steps} steps passed.`);
} catch (e) {
  console.error(`✗ Failed after ${steps} steps:`, e instanceof Error ? e.message : e);
  try {
    ab('screenshot', resolve('dist-e2e-failure.png'));
    console.error('Screenshot: dist-e2e-failure.png');
  } catch {}
  process.exitCode = 1;
} finally {
  try {
    ab('close');
  } catch {}
  server.kill();
}
