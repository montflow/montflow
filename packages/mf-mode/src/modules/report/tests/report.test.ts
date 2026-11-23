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

/** A lead step routed to a skill, a worker running its own playbook, and a PR the worker opened. */
const STORY = [
  '{"v":1,"ts":"2026-01-01T10:00:00Z","actor":"lead","kind":"run.start","summary":"Add the widget","attrs":{"playbook":"feature"}}',
  '{"v":1,"ts":"2026-01-01T10:01:00Z","actor":"lead","kind":"phase.start","summary":"Investigate the widget","span":"investigate"}',
  '{"v":1,"ts":"2026-01-01T10:02:00Z","actor":"lead","kind":"phase.end","summary":"Investigate the widget","span":"investigate","status":"ok"}',
  '{"v":1,"ts":"2026-01-01T10:03:00Z","actor":"lead","kind":"phase.start","summary":"Pick a design","span":"design","attrs":{"skill":"mf-mode-arena"}}',
  '{"v":1,"ts":"2026-01-01T10:03:00Z","actor":"lead","kind":"worker.start","summary":"Build the widget","span":"w1","refs":["branch:feat/widget"],"attrs":{"playbook":"prototype"}}',
  '{"v":1,"ts":"2026-01-01T10:09:00Z","actor":"lead","kind":"worker.end","summary":"PR open","span":"w1","status":"ok","refs":["pr:#42"]}',
  '{"v":1,"ts":"2026-01-01T10:10:00Z","actor":"lead","kind":"phase.end","summary":"Pick a design","span":"design","status":"ok"}',
].join('\n');

/** Absurdly long labels in every spot a diagram draws text. */
const LONG = {
  step: ('Investigate WHY ' + 'every module and every call path '.repeat(7)).slice(0, 200),
  branch: ('feat/' + 'WWW-mmm-a-branch-name-that-keeps-going-'.repeat(4)).slice(0, 120),
  url:
    'https://github.com/montflow/montflow/blob/main/' +
    'deeply/nested/'.repeat(6) +
    'report.module.ts',
  lane: 'w-' + 'MMMMWWWW'.repeat(8),
  link: 'stacked on top of a long account of how these two outputs relate WWWW MMMM and why',
};

const STRESS = [
  '{"v":1,"ts":"2026-01-01T10:00:00Z","actor":"lead","kind":"run.start","summary":"Stress","attrs":{"playbook":"feature"}}',
  '{"v":1,"ts":"2026-01-01T10:00:00Z","actor":"lead","kind":"phase.start","summary":"' +
    LONG.step +
    '","span":"p1"}',
  '{"v":1,"ts":"2026-01-01T10:01:00Z","actor":"lead","kind":"worker.start","summary":"Task","span":"' +
    LONG.lane +
    '"}',
  '{"v":1,"ts":"2026-01-01T10:09:00Z","actor":"lead","kind":"worker.end","summary":"done","span":"' +
    LONG.lane +
    '","status":"ok","refs":["branch:' +
    LONG.branch +
    '","url:' +
    LONG.url +
    '","pr:#7"]}',
  '{"v":1,"ts":"2026-01-01T10:09:00Z","actor":"lead","kind":"link","summary":"' +
    LONG.link +
    '","refs":["pr:#7","branch:' +
    LONG.branch +
    '"]}',
  '{"v":1,"ts":"2026-01-01T10:10:00Z","actor":"lead","kind":"phase.end","summary":"x","span":"p1","status":"ok"}',
].join('\n');

const pathsSvg = (trace: string): string => {
  const html = renderReport(buildModel(parseTrace(trace)), 'trace.jsonl');
  return html.slice(html.indexOf('<h2>Paths</h2>'), html.indexOf('<div data-detail>'));
};

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

  Vitest.it(
    'draws the Paths diagram as the run story: playbook, steps in order, workers, PRs',
    () => {
      const svg = pathsSvg(STORY);
      const order = ['playbook feature', '1. Investigate the widget', '2. Pick a design', 'w1'];
      const at = order.map((text) => svg.indexOf('>' + text));
      Vitest.expect(at.every((index) => index >= 0)).toBe(true);
      Vitest.expect(at).toEqual(at.toSorted((a, b) => a - b));
      Vitest.expect(svg).toContain('>arena · 7m 00s · passed</text>');
      Vitest.expect(svg).toContain('>w1 · prototype</text>');
      Vitest.expect(svg).toContain('>PR #42</text>');
      Vitest.expect(svg).toContain('>feat/widget</text>');
    },
  );

  Vitest.it('clips long labels to their boxes and keeps the full text in the tooltip', () => {
    const html = renderReport(buildModel(parseTrace(STRESS)), 'trace.jsonl');
    const svgs = html.match(/<svg[\s\S]*?<\/svg>/g) ?? [];
    Vitest.expect(svgs).toHaveLength(2);
    const texts = svgs.flatMap((svg) =>
      [...svg.matchAll(/<text[^>]*>(?:<title>[^<]*<\/title>)?([^<]*)<\/text>/g)].map(
        (match) => match[1] ?? '',
      ),
    );
    const starts = ['1. Investigate', 'Investigate WHY', 'feat/WWW', 'w-MMMM', 'stacked on'];
    const long = texts.filter((text) => starts.some((start) => text.startsWith(start)));
    Vitest.expect(long.length).toBeGreaterThanOrEqual(6);
    for (const text of long) Vitest.expect(text.endsWith('\u{2026}')).toBe(true);
    for (const full of [LONG.step, LONG.branch, LONG.lane, LONG.link]) {
      Vitest.expect(texts.some((text) => text.includes(full))).toBe(false);
      Vitest.expect(html).toContain(full);
    }
    Vitest.expect(texts.find((text) => text.startsWith('w-MMMM'))?.length).toBeLessThan(16);
    Vitest.expect(texts).toContain('github.com/\u{2026}/report.module.ts');

    const [timelineSvg = '', pathSvg = ''] = svgs;
    const inLabels = timelineSvg.match(/class="in-label"[^>]*/g) ?? [];
    Vitest.expect(inLabels.length).toBeGreaterThan(0);
    for (const label of inLabels) Vitest.expect(label).toMatch(/clip-path="url\(#bar\d+\)"/);
    const nodes = pathSvg.match(/<g class="node /g)?.length ?? 0;
    const clipped = pathSvg.match(
      /<g clip-path="url\(#node\d+\)"><text[^>]*class="nt">[^<]*<\/text><text[^>]*class="ns">/g,
    );
    Vitest.expect(clipped?.length).toBe(nodes);
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
    Vitest.expect(new Set(ids).size).toBe(ids.length);
  });

  Vitest.it('still draws a playbook node for a trace with no phases', () => {
    const svg = pathsSvg(
      HAND.split('\n')
        .filter((line) => !line.includes('phase.'))
        .join('\n'),
    );
    Vitest.expect(svg).toContain('>no playbook recorded</text>');
    Vitest.expect(svg).toContain('>PR #10</text>');
  });
});
