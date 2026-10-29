import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { start } from '../src/modules/viewer/index.js';

const N = 20_000;
const directory = mkdtempSync(join(tmpdir(), 'telemetry-canvas-viewer-'));
const lines = [JSON.stringify({ v: 1, ts: 1, type: 'session.created', sessionID: 'ses_bench', agent: 'build', model: { providerID: 'anthropic', id: 'claude-sonnet-4' }, payload: { sessionID: 'ses_bench', slug: 'bench' } })];
for (let i = 0; i < N - 1; i += 1) {
  lines.push(JSON.stringify({ v: 1, ts: 2 + i, type: i % 7 === 0 ? 'session.tool.success' : 'session.step.ended', sessionID: 'ses_bench', agent: 'build', model: { providerID: 'anthropic', id: 'claude-sonnet-4' }, payload: { sessionID: 'ses_bench', cost: 0.0012, tokens: { input: 120, output: 30 } } }));
}
writeFileSync(join(directory, '2026-10-28.ndjson'), `${lines.join('\n')}\n`);
const viewer = await start({ directory, sessionID: 'ses_bench', idleMs: 600_000 });
console.log('viewer', viewer.url);

const chrome = Bun.spawn({
  cmd: [
    process.env.CHROME ?? (() => { throw new Error('set CHROME to a Chromium binary'); })(),
    '--headless=new',
    '--window-size=1400,900',
    '--no-sandbox',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage',
    '--remote-debugging-port=9228',
    '--user-data-dir=/tmp/telemetry-canvas-viewer-chrome',
    'about:blank',
  ],
  stdout: 'ignore',
  stderr: 'ignore',
});
for (let i = 0; i < 100; i += 1) {
  try {
    await fetch('http://127.0.0.1:9228/json/version');
    break;
  } catch {
    await Bun.sleep(100);
  }
}
const created = await (
  await fetch('http://127.0.0.1:9228/json/new?about:blank', { method: 'PUT' })
).json();
const socket = new WebSocket(created.webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  if (message.id === undefined) return;
  const resolve = pending.get(message.id);
  if (resolve !== undefined) {
    pending.delete(message.id);
    resolve(message.result);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const next = (id += 1);
    pending.set(next, resolve);
    socket.send(JSON.stringify({ id: next, method, params }));
  });
const evaluate = async (expression, awaitPromise = false) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  return result.result?.value;
};
await send('Runtime.enable');
await send('Page.enable');
await send('Performance.enable', {});
await send('Page.addScriptToEvaluateOnNewDocument', {
  source:
    'window.__t0 = performance.now(); window.__errs = []; window.addEventListener("error", (e) => window.__errs.push(String(e.message)));',
});
await send('Page.navigate', { url: `${viewer.url}?session=ses_bench` });

let ready = null;
for (let i = 0; i < 400; i += 1) {
  ready = await evaluate(`(() => {
    const canvas = document.querySelector('#trace canvas');
    const totals = document.getElementById('totals')?.textContent || '';
    const runs = Number(document.getElementById('trace')?.dataset.runs || 0);
    if (!canvas || !totals.includes('20000 spans') || runs === 0) return null;
    return { firstPaintMs: performance.now() - (window.__t0 || 0), canvas: { width: canvas.width, height: canvas.height }, totals, runs };
  })()`);
  if (ready) break;
  await Bun.sleep(50);
}
const errors = await evaluate('window.__errs ?? []');

const pan = await evaluate(`(async () => {
  const trace = document.getElementById('trace');
  const rect = trace.getBoundingClientRect();
  const intervals = [];
  let last = performance.now();
  for (let step = 0; step < 120; step += 1) {
    trace.dispatchEvent(new WheelEvent('wheel', {
      deltaY: step % 2 === 0 ? -12 : 12,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      bubbles: true,
      cancelable: true,
    }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const now = performance.now();
    intervals.push(now - last);
    last = now;
  }
  const sorted = intervals.slice(1).toSorted((a, b) => a - b);
  return {
    avg: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    p95: sorted[Math.floor(sorted.length * 0.95)],
    max: sorted.at(-1),
    over20: intervals.filter((value) => value > 20).length,
  };
})()`, true);

const followAfterPan = await evaluate(`document.getElementById('follow').textContent`);
await evaluate(`document.getElementById('follow').click()`);
const followAfterResume = await evaluate(`document.getElementById('follow').textContent`);
await evaluate(`document.getElementById('trace').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`);
const detailVisible = await evaluate(`!document.getElementById('detail').hidden`);

const before = await evaluate(`Number(document.getElementById('totals')?.textContent?.split(' ')[0] || 0)`);
const appendAt = performance.now();
appendFileSync(
  join(directory, '2026-10-28.ndjson'),
  `${JSON.stringify({ v: 1, ts: 9_999_999, type: 'session.idle', sessionID: 'ses_bench', payload: {} })}\n`,
);
let liveMs = null;
let after = before;
for (let i = 0; i < 40; i += 1) {
  after = await evaluate(`Number(document.getElementById('totals')?.textContent?.split(' ')[0] || 0)`);
  if (after > before) {
    liveMs = performance.now() - appendAt;
    break;
  }
  await Bun.sleep(50);
}
const metrics = await send('Performance.getMetrics');
const heap = metrics.metrics?.find((metric) => metric.name === 'JSHeapUsedSize')?.value;
const result = {
  ready,
  errors,
  followAfterPan,
  followAfterResume,
  detailVisible,
  pan,
  append: { before, after, liveMs: liveMs === null ? null : Math.round(liveMs) },
  heapMb: Math.round((heap / 1048576) * 10) / 10,
};
const failures: string[] = [];
if (ready === null) failures.push('page did not reach 20k spans');
if ((ready?.firstPaintMs ?? Infinity) > 1000) failures.push('first paint over 1000ms');
if ((pan?.p95 ?? Infinity) > 20) failures.push('pan p95 over 20ms');
if ((pan?.max ?? Infinity) > 50) failures.push('pan max over 50ms');
if (liveMs === null || liveMs > 1000) failures.push('live append over 1000ms');
if (result.heapMb > 50) failures.push('heap over 50MB');
if (followAfterResume !== 'following' || !detailVisible) failures.push('follow-tail/inspector state failed');
if ((errors as unknown[]).length > 0) failures.push('page errors');
console.log(JSON.stringify({ ...result, failures }));
if (failures.length > 0) process.exitCode = 1;

socket.close();
chrome.kill();
await viewer.stop();
