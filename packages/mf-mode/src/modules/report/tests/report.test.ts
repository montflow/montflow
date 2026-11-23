import * as Vitest from '@effect/vitest';
import { buildModel, parseTrace } from '../../trace/index.js';
import { renderReport } from '../index.js';

/** A trace written by hand: two overlapping workers, one open phase, one bad line. */
const HAND = [
  '{"v":1,"ts":"2026-01-01T10:00:00Z","actor":"lead","kind":"run.start","summary":"Ship the thing"}',
  '{"v":1,"ts":"2026-01-01T10:00:00Z","actor":"lead","kind":"phase.start","summary":"Plan","span":"plan"}',
  '{"v":1,"ts":"2026-01-01T10:00:00Z","actor":"lead","kind":"worker.start","summary":"Task A","span":"a","refs":["issue:#1"],"attrs":{"model":"opus"}}',
  '{"v":1,"ts":"2026-01-01T10:02:00Z","actor":"lead","kind":"phase.end","summary":"Plan","span":"plan","status":"ok","calls":4}',
  '{"v":1,"ts":"2026-01-01T10:03:00Z","actor":"a","kind":"friction","summary":"Flaky CLI","secs":30,"calls":2,"note":"pin it"}',
  'this line is not json',
  '{"v":1,"ts":"2026-01-01T10:05:00Z","actor":"lead","kind":"worker.start","summary":"Task B","span":"b","refs":["issue:#2"]}',
  '{"v":1,"ts":"2026-01-01T10:06:00Z","actor":"lead","kind":"phase.start","summary":"Watch","span":"watch"}',
  '{"v":1,"ts":"2026-01-01T10:08:00Z","actor":"a","kind":"check","summary":"tests","status":"fail"}',
  '{"v":1,"ts":"2026-01-01T10:09:00Z","actor":"a","kind":"check","summary":"tests again","status":"ok"}',
  '{"v":1,"ts":"2026-01-01T10:10:00Z","actor":"lead","kind":"worker.end","summary":"PR open","span":"a","status":"ok","refs":["pr:#10"],"calls":17}',
  '{"v":1,"ts":"2026-01-01T10:12:00Z","actor":"lead","kind":"friction","summary":"Prompt stalled","secs":15}',
  '{"v":1,"ts":"2026-01-01T10:20:00Z","actor":"lead","kind":"worker.end","summary":"PR open","span":"b","status":"fail","refs":["pr:#11"]}',
  '{"v":1,"ts":"2026-01-01T10:20:00Z","actor":"lead","kind":"link","summary":"stacked on","refs":["pr:#10","pr:#11"]}',
].join('\n');

Vitest.describe('report', () => {
  Vitest.it('renders a self-contained dark page with every lane and escaped text', () => {
    const trace =
      HAND +
      '\n{"v":1,"ts":"2026-01-01T10:20:00Z","actor":"lead","kind":"note","summary":"<script>alert(1)</script>"}';
    const html = renderReport(buildModel(parseTrace(trace)), 'trace.jsonl');
    Vitest.expect(html).not.toMatch(/<(link|img|iframe)\b|\ssrc=|@import|url\((?!#)|https?:\/\//i);
    Vitest.expect(html).toContain('<meta name="color-scheme" content="dark">');
    Vitest.expect(html).not.toMatch(/color-scheme:light|prefers-color-scheme|#fcfcfb/);
    Vitest.expect(html).not.toContain('<script>alert');
    Vitest.expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    for (const lane of ['lead', 'a', 'b']) Vitest.expect(html).toContain('>' + lane + '</text>');
    for (const heading of ['Timeline', 'Paths', 'Workers', 'Friction', 'Checks', 'Trace health']) {
      Vitest.expect(html).toContain('<h2>' + heading + '</h2>');
    }
  });

  Vitest.it(
    'marks everything below the paths diagram as detail, so #card shows the summary alone',
    () => {
      const html = renderReport(buildModel(parseTrace(HAND)), 'trace.jsonl');
      const detail = html.indexOf('<div data-detail>');
      Vitest.expect(detail).toBeGreaterThan(html.indexOf('<h2>Paths</h2>'));
      Vitest.expect(html.indexOf('<h2>Workers</h2>')).toBeGreaterThan(detail);
      Vitest.expect(html).toContain('.viz-root.card [data-detail]{display:none}');
    },
  );
});
