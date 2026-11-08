// End-to-end smoke test (ticket #12): portada → provincia → 1 tema → revelación, plus basic
// accessibility checks (axe contrast and serious violations, focus on the heading, touch targets,
// 'Aa', reflow at 320 px, reduced motion). Drives a real Chrome through agent-browser against the
// static build in dist/. Run with `npm run e2e` (builds first). Not part of `npm test`.
//
// Setup once: `npx agent-browser install`. On Linux without root, Chrome's shared libraries can be
// unpacked to ~/.agent-browser/libs/root (see docs/e2e.md); this script adds that dir to
// LD_LIBRARY_PATH when it exists.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const DIST = resolve('dist');
const SESION = `humo-${process.pid}`;
const BIN = resolve('node_modules/.bin/agent-browser');
const LIBS = join(homedir(), '.agent-browser/libs/root/usr/lib64');
const env = { ...process.env };
if (existsSync(LIBS)) env.LD_LIBRARY_PATH = [LIBS, env.LD_LIBRARY_PATH].filter(Boolean).join(':');

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('Falta dist/. Ejecuta `npm run build` (o `npm run e2e`).');
  process.exit(1);
}

// Minimal static server for dist/ (directories → index.html), in a child process: the agent-browser
// calls below are synchronous and would otherwise block it.
const SERVIDOR = `
const { createServer } = require('node:http');
const { existsSync, readFileSync, statSync } = require('node:fs');
const { extname, join } = require('node:path');
const DIST = process.argv[1];
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.pdf': 'application/pdf', '.txt': 'text/plain' };
const s = createServer((req, res) => {
  let ruta = join(DIST, decodeURIComponent(new URL(req.url || '/', 'http://x').pathname));
  if (!ruta.startsWith(DIST)) return res.writeHead(403).end();
  if (existsSync(ruta) && statSync(ruta).isDirectory()) ruta = join(ruta, 'index.html');
  if (!existsSync(ruta)) return res.writeHead(404).end('404');
  res.writeHead(200, { 'content-type': TIPOS[extname(ruta)] || 'application/octet-stream' }).end(readFileSync(ruta));
});
s.listen(0, '127.0.0.1', () => console.log(s.address().port));
`;
const servidor = spawn(process.execPath, ['-e', SERVIDOR, DIST], { stdio: ['ignore', 'pipe', 'inherit'] });
const puerto = await new Promise<number>((ok, ko) => {
  servidor.stdout.once('data', (d) => ok(Number(String(d).trim())));
  servidor.once('exit', () => ko(new Error('El servidor estático no arrancó')));
});
const BASE = `http://127.0.0.1:${puerto}/`;

function ab<T = unknown>(...args: string[]): T {
  let salida: string;
  try {
    salida = execFileSync(BIN, ['--session', SESION, '--json', ...args], { env, encoding: 'utf8', timeout: 120_000 });
  } catch (e) {
    const { stdout, stderr } = e as { stdout?: string; stderr?: string };
    throw new Error(`agent-browser ${args.join(' ')}: ${(stdout || stderr || String(e)).trim().slice(0, 500)}`);
  }
  const r = JSON.parse(salida.trim().split('\n').at(-1)!) as { success: boolean; data: any; error: string | null };
  if (!r.success) throw new Error(`agent-browser ${args.join(' ')}: ${r.error}`);
  return r.data as T;
}
/** Runs an expression in the page and returns its (JSON) value. */
const js = <T = unknown>(expr: string): T => ab<{ result: T }>('eval', expr).result;
const esperar = (ms: number) => ab('wait', String(ms));
function esperarA(expr: string, que: string, ms = 5000): void {
  for (let t = 0; t < ms; t += 100) {
    if (js<boolean>(`!!(${expr})`)) return;
    esperar(100);
  }
  throw new Error(`Tiempo agotado esperando: ${que}`);
}
const ruta = () => js<string>('location.hash');
const textoFoco = () => js<string>('document.activeElement?.tagName + ":" + (document.activeElement?.textContent ?? "").trim()');

let pasos = 0;
function paso(nombre: string, f: () => void) {
  f();
  pasos++;
  console.log(`  ✓ ${nombre}`);
}

/** axe (bundled with agent-browser): no contrast failures and no serious/critical violations. */
function sinViolaciones(donde: string) {
  // Mid-animation text is semi-transparent and axe skips it: settle everything first.
  js(`document.getAnimations().forEach((a) => { try { a.finish(); } catch { a.cancel(); } }); true`);
  const r = ab<{ violations: { id: string; impact: string; nodes: { target: string[]; failureSummary?: string }[] }[] }>('a11y');
  const graves = r.violations.filter((v) => v.id === 'color-contrast' || v.impact === 'serious' || v.impact === 'critical');
  assert.deepEqual(
    graves.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} ${n.failureSummary ?? ''}`).join(' | ')}`),
    [],
    `axe en ${donde}`,
  );
}

/** Buttons, tabs, rows and other controls (inline links inside text are exempt) are ≥ 48 px tall. */
function zonasTactiles(donde: string) {
  const pequenas = js<string[]>(`[...document.querySelectorAll('main button, main summary, main .chip-provincia, main .fila-tema, main .boton-enlace, .pestanas a, #aa')]
    .filter((e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed')
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height < 47.5; })
    .map((e) => e.outerHTML.slice(0, 80) + ' ' + Math.round(e.getBoundingClientRect().height) + 'px')`);
  assert.deepEqual(pequenas, [], `zonas táctiles < 48px en ${donde}`);
}

/** Nothing is cut: no horizontal scroll. */
function sinDesbordar(donde: string) {
  const ancho = js<{ doc: number; vista: number }>('({ doc: document.documentElement.scrollWidth, vista: innerWidth })');
  const culpables = ancho.doc > ancho.vista
    ? js<string[]>(`[...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
        .map((e) => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right)).slice(0, 5)`)
    : [];
  assert.ok(ancho.doc <= ancho.vista, `desborda en ${donde}: ${ancho.doc} > ${ancho.vista} (${culpables.join(', ')})`);
}

try {
  console.log(`Prueba de humo en ${BASE}`);
  ab('set', 'viewport', '390', '844');
  ab('open', BASE);
  js('localStorage.clear()');
  ab('open', BASE);

  paso('portada de primera visita', () => {
    esperarA(`document.querySelector('h1')?.textContent.includes('sin saber de quién es')`, 'titular de portada');
    assert.equal(ruta(), '#portada');
    assert.match(textoFoco(), /^H1:Lee lo que proponen sin saber de quién es\./);
    assert.ok(js<boolean>(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Empezar por vivienda')`));
    assert.ok(js<boolean>(`document.body.textContent.includes('No pedimos nombre, teléfono ni dinero. Nunca.')`));
    // No tab bar during onboarding.
    assert.equal(js<boolean>(`document.querySelector('.pestanas').hidden`), true);
    sinViolaciones('portada');
    ab('set', 'media', 'dark');
    sinViolaciones('portada (oscuro)');
    ab('set', 'media', 'light');
    zonasTactiles('portada');
  });

  paso('portada con ?r=reto: la línea del reto va encima del titular', () => {
    ab('open', BASE + '?r=reto');
    esperarA(`document.querySelector('.portada h1')`, 'portada con reto');
    assert.equal(js<string>(`document.querySelector('.portada h1').previousElementSibling?.className`), 'aviso-reto');
    ab('open', BASE);
    esperarA(`document.querySelector('.portada h1')`, 'portada');
  });

  paso('animación de portada: giro, y estática con reduced motion', () => {
    assert.notEqual(js<string>(`getComputedStyle(document.querySelector('.cartas .gira')).animationName`), 'none');
    ab('set', 'media', 'light', 'reduced-motion');
    assert.equal(js<string>(`getComputedStyle(document.querySelector('.cartas .gira')).animationName`), 'none');
    ab('set', 'media', 'light');
  });

  paso("botón 'Aa': letra grande guardada, sin cortes a 320 px", () => {
    assert.equal(js<string>(`getComputedStyle(document.documentElement).fontSize`), '18px');
    ab('click', '#aa');
    assert.equal(js<string>(`getComputedStyle(document.documentElement).fontSize`), '22px');
    assert.equal(js<string>(`document.querySelector('#aa').getAttribute('aria-pressed')`), 'true');
    ab('reload');
    esperarA(`document.querySelector('h1')`, 'recarga');
    assert.equal(js<string>(`getComputedStyle(document.documentElement).fontSize`), '22px');
    // 200 % zoom on a 640 px phone ≈ 320 CSS px; with the big font too.
    ab('set', 'viewport', '320', '640');
    sinDesbordar('portada, letra grande, 320 px');
    ab('click', '#aa');
    assert.equal(js<string>(`getComputedStyle(document.documentElement).fontSize`), '18px');
    ab('set', 'viewport', '390', '844');
  });

  paso('provincia: foco en el titular, buscador por municipio', () => {
    ab('find', 'role', 'button', 'click', '--name', 'Empezar por vivienda');
    esperarA(`location.hash === '#provincia'`, '#provincia');
    assert.match(textoFoco(), /^H1:¿Dónde votas\?/);
    sinViolaciones('provincia');
    zonasTactiles('provincia');
    ab('fill', '#buscar-lugar', 'Telde');
    esperarA(`[...document.querySelectorAll('#resultados-lugar button')].some((b) => b.textContent.includes('Telde → Las Palmas'))`, 'Telde → Las Palmas');
    js(`[...document.querySelectorAll('#resultados-lugar button')].find((b) => b.textContent.includes('Telde → Las Palmas')).click()`);
    esperarA(`location.hash.startsWith('#tema/')`, 'primer tema');
  });

  paso('tema 1: ayuda la primera vez, aviso de provincia ~2 s, barra inferior', () => {
    esperarA(`document.querySelector('dialog.ayuda')?.open`, 'capa de ayuda');
    assert.match(js<string>(`document.querySelector('dialog.ayuda').textContent`), /Lee y toca la que más te convenza/);
    assert.ok(js<boolean>(`document.querySelector('.aviso-zona')?.textContent.includes('Las Palmas')`), 'aviso de provincia');
    ab('find', 'role', 'button', 'click', '--name', 'Entendido');
    assert.equal(js<boolean>(`document.querySelector('dialog.ayuda')?.open ?? false`), false);
    assert.match(textoFoco(), /^H1:/);
    try {
      esperarA(`!document.querySelector('.aviso-zona')`, 'que el aviso de provincia desaparezca', 4000);
    } catch (e) {
      console.error(js(`({ hover: document.querySelector('.aviso-zona')?.matches(':hover'), foco: document.querySelector('.aviso-zona')?.matches(':focus-within'), dialogos: document.querySelectorAll('dialog').length, abierto: !!document.querySelector('dialog[open]'), avisos: document.querySelectorAll('.aviso-zona').length })`));
      throw e;
    }
    const pestanas = js<string[]>(`[...document.querySelectorAll('.pestanas a')].map((a) => a.textContent.trim())`);
    assert.deepEqual(pestanas.map((p) => p.replace(/^\S+\s*/u, '')), ['Temas', 'Preguntar', 'Mi resultado']);
    assert.equal(js<boolean>(`document.querySelector('.pestanas').hidden`), false);
    sinViolaciones('tema');
    zonasTactiles('tema');
    sinDesbordar('tema');
    // Help is shown only once.
    ab('reload');
    esperarA(`document.querySelector('.tarjeta')`, 'tarjetas tras recargar');
    assert.equal(js<boolean>(`!!document.querySelector('dialog.ayuda')`), false);
  });

  paso("'Escuchar todas' lee en orden y resalta la tarjeta que suena", () => {
    // Fake voice: records what is said; each utterance ends when we tell it to.
    js(`(() => {
      const f = { dichas: [], cola: [], speaking: false,
        speak(u) { f.cola.push(u); if (f.cola.length === 1) f.siguiente(); },
        siguiente() { const u = f.cola[0]; if (!u) return; f.dichas.push(u.text); u.onstart?.(); },
        terminar() { const u = f.cola.shift(); u?.onend?.(); f.siguiente(); },
        cancel() { const c = f.cola; f.cola = []; c.forEach((u) => u.onend?.()); }, getVoices: () => [] };
      Object.defineProperty(window, 'speechSynthesis', { value: f, configurable: true });
      window.SpeechSynthesisUtterance ??= function (t) { this.text = t; };
      return true; })()`);
    ab('find', 'role', 'button', 'click', '--name', 'Escuchar todas');
    const primera = js<string>(`document.querySelector('.tarjeta.sonando')?.dataset.valor`);
    assert.equal(primera, js<string>(`document.querySelector('.tarjeta').dataset.valor`));
    assert.match(js<string>(`speechSynthesis.dichas[0]`), new RegExp(`^Propuesta ${primera}\\.`));
    js('speechSynthesis.terminar()');
    assert.equal(js<string>(`document.querySelector('.tarjeta.sonando')?.dataset.valor`), js<string>(`document.querySelectorAll('.tarjeta')[1].dataset.valor`));
    ab('find', 'role', 'button', 'click', '--name', 'Parar');
    assert.equal(js<number>(`document.querySelectorAll('.tarjeta.sonando').length`), 0);
  });

  paso('elegir y revelar (fundido con reduced motion), foco en el titular', () => {
    js(`document.querySelector('.tarjeta[data-valor]').scrollIntoView({ block: 'center' }); true`);
    ab('find', 'first', '.tarjeta[data-valor]', 'click');
    esperarA(`document.querySelector('.barra-fija')`, 'barra de confirmación');
    zonasTactiles('confirmar');
    ab('set', 'media', 'light', 'reduced-motion');
    ab('find', 'role', 'button', 'click', '--name', 'Descubrir sin apostar');
    esperarA(`document.querySelector('.revelacion')`, 'revelación');
    assert.match(textoFoco(), /^H1:La [A-Z] era de /);
    assert.equal(js<string>(`getComputedStyle(document.querySelector('.revelacion .revelada')).animationName`), 'fundido');
    ab('set', 'media', 'light');
    sinViolaciones('revelación');
    zonasTactiles('revelación');
    sinDesbordar('revelación');
  });

  paso('revelación en modo oscuro: contraste AA', () => {
    ab('set', 'media', 'dark');
    sinViolaciones('revelación (oscuro)');
    ab('set', 'media', 'light');
  });

  paso("pestaña 'Temas' lleva a la lista con foco en el titular", () => {
    ab('click', '.pestanas a[href="#temas"]');
    esperarA(`location.hash === '#temas'`, '#temas');
    assert.match(textoFoco(), /^H1:Temas/);
    assert.equal(js<string>(`document.querySelector('.pestanas a[href="#temas"]').getAttribute('aria-current')`), 'page');
    sinViolaciones('lista de temas');
    zonasTactiles('lista de temas');
  });

  paso("páginas de información: contraste y 'Aa'", () => {
    for (const pagina of ['metodologia/', 'partidos/', 'rubrica/']) {
      ab('open', BASE + pagina);
      esperarA(`document.querySelector('h1')`, pagina);
      sinViolaciones(pagina);
    }
    ab('open', BASE + 'metodologia/');
    ab('click', '#aa');
    assert.equal(js<string>(`getComputedStyle(document.documentElement).fontSize`), '22px');
    ab('click', '#aa');
  });

  console.log(`Prueba de humo: ${pasos} pasos correctos.`);
} catch (e) {
  console.error(`✗ Falla tras ${pasos} pasos:`, e instanceof Error ? e.message : e);
  try {
    ab('screenshot', resolve('dist-e2e-fallo.png'));
    console.error('Captura: dist-e2e-fallo.png');
  } catch {}
  process.exitCode = 1;
} finally {
  try {
    ab('close');
  } catch {}
  servidor.kill();
}
