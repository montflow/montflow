/** @jsxImportSource @opentui/solid */
import { testRender } from '@opentui/solid';
import { afterEach, describe, expect, test } from 'bun:test';
import type { JSX } from 'solid-js';
import type { Runs } from '../../services/index.js';
import { Panel } from '../panel.js';
import { RUN_PREVIEW_LINES, RunDetail } from '../run-detail.js';
import { RUN_SIDEBAR_WIDTH } from '../run-detail-lines.js';
import { RunMeta } from '../run-meta.js';

type Setup = Awaited<ReturnType<typeof testRender>>;

const setups: Array<Setup> = [];

afterEach(() => {
  for (const setup of setups.splice(0)) setup.renderer.destroy();
});

const WIDTH = 46;
const HEIGHT = 24;
/** Wall-clock the markdown worker needs before the transcript lands. */
const PARSE_SETTLE_MS = 800;

const summary = (overrides?: Partial<Runs.RunSummary>): Runs.RunSummary => ({
  id: 'run-1',
  name: 'Run One',
  description: 'do it',
  status: 'running',
  model: 'anthropic/claude',
  thinking: '',
  tools: [],
  prompt: 'do it',
  spec: '',
  progress: '',
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

/** A run with `count` transcript events, each a plain assistant line. */
const detail = (overrides?: Partial<Runs.RunSummary>, count = 40): Runs.RunDetail => ({
  summary: summary(overrides),
  events: Array.from({ length: count }, (_, index) => ({
    seq: index + 1,
    role: 'assistant',
    text: `line ${index + 1}`,
  })),
  receipt: undefined,
});

const render = async (element: () => JSX.Element): Promise<Setup> => {
  const setup = await testRender(element, { width: WIDTH, height: HEIGHT });
  await setup.renderOnce();
  // Markdown parses off a worker and lands a frame or two later, so the
  // transcript needs real elapsed time before the capture means anything.
  // oxlint-disable-next-line montflow/no-timers -- the markdown parse under test is async by design.
  await new Promise((resolve) => setTimeout(resolve, PARSE_SETTLE_MS));
  await setup.renderOnce();
  setups.push(setup);
  return setup;
};

const frameText = (setup: Setup): string => setup.captureCharFrame();

/** Character rows of the captured frame, trailing blanks trimmed. */
const frameRows = (setup: Setup): ReadonlyArray<string> =>
  frameText(setup)
    .split('\n')
    .map((row) => row.trimEnd());

/** Render the transcript pane the way the app does, inside Panel chrome. */
const renderTranscript = (
  run: Runs.RunDetail,
  mode: 'preview' | 'view',
  scrollOffset = 0,
  bodyRows = HEIGHT - 8,
): Promise<Setup> =>
  render(() => (
    <box width={WIDTH} height={HEIGHT} flexDirection="column">
      <Panel title={`Transcript · ${mode}`} selected={false}>
        <RunDetail detail={run} mode={mode} scrollOffset={scrollOffset} maxBodyLines={bodyRows} />
      </Panel>
    </box>
  ));

/** Render the sidebar the way the app does, inside Panel chrome. */
const renderSidebar = (run: Runs.RunDetail): Promise<Setup> =>
  render(() => (
    <box width={RUN_SIDEBAR_WIDTH} height={HEIGHT} flexDirection="column">
      <Panel title="Run — Run One" selected={false}>
        <RunMeta detail={run} />
      </Panel>
    </box>
  ));

/** Frame column where one sidebar row's value starts, or -1 when absent. */
const valueColumn = (frame: string, value: string): number =>
  frame
    .split('\n')
    .find((row) => row.includes(value))
    ?.indexOf(value) ?? -1;

describe('RunMeta', () => {
  test('leads with the status badge and lists the metadata rows', async () => {
    const frame = frameText(
      await renderSidebar(detail({ thinking: 'high', tools: ['read', 'edit'] })),
    );
    expect(frame).toContain('running');
    expect(frame).toContain('live');
    expect(frame).toContain('model');
    expect(frame).toContain('anthropic/claude');
    expect(frame).toContain('thinking');
    expect(frame).toContain('high');
    expect(frame).toContain('read, edit');
    expect(frame).toContain('id');
    expect(frame).toContain('run-1');
  });

  test('aligns every value on one column so labels read at a glance', async () => {
    const frame = frameText(
      await renderSidebar(detail({ thinking: 'high', tools: ['read', 'edit'] })),
    );
    const columns = ['anthropic/claude', 'high', 'read, edit', '2026-01-01 00:00', 'run-1'].map(
      (value) => valueColumn(frame, value),
    );
    expect(columns.every((column) => column === columns[0])).toBe(true);
    expect(columns[0]).toBeGreaterThan(0);
  });

  test('shows the agent progress line and the settlement receipt when present', async () => {
    const settled = detail({ status: 'done', progress: 'refactoring the parser' });
    const frame = frameText(
      await renderSidebar({
        ...settled,
        receipt: { outcome: 'done', summary: 'completed in 12s' },
      }),
    );
    expect(frame).toContain('refactoring the parser');
    expect(frame).toContain('completed in 12s');
    expect(frame).not.toContain('live');
    // One status, one place: the badge. The receipt adds prose, never
    // its outcome word again.
    expect(frame.split('done').length - 1).toBe(1);
  });
});

describe('RunDetail preview', () => {
  test('renders the transcript unframed inside its own panel', async () => {
    const frame = frameText(await renderTranscript(detail(), 'preview'));
    // The panel is the container: no nested sections, and no clipped
    // section border painting over the panel's own border.
    expect(frame).not.toContain('╭─preview');
    expect(frame).not.toContain('╭─Prompt');
    const rows = frameRows(await renderTranscript(detail(), 'preview'));
    expect(rows.at(-2)).toMatch(/^└─+┘$/);
  });

  test('caps the transcript at the preview window instead of the panel', async () => {
    const setup = await renderTranscript(detail(), 'preview');
    const rows = frameRows(setup);
    const footer = rows.findIndex((row) => row.includes('lines 1–'));
    expect(footer).toBeGreaterThan(-1);
    // The footer hugs the preview: the pane below it is empty, so the
    // transcript never grows into a wall of text on a tall panel.
    expect(rows.slice(footer + 1, rows.length - 1).join('\n')).not.toContain('line');
    expect(frameText(setup)).toContain('line 1');
    expect(frameText(setup)).not.toContain(`line ${RUN_PREVIEW_LINES + 2}`);
  });

  test('preview pages with the scroll offset and reports its window', async () => {
    const frame = frameText(await renderTranscript(detail(), 'preview', 8));
    // Events render as markdown blocks, so the window shows later events.
    expect(frame).not.toContain('line 1\n');
    expect(frame).toMatch(/lines 9–/);
    expect(frame).toContain('j/k scroll');
    expect(frame).toContain('v view');
  });

  test('full view spends the whole budget', async () => {
    const frame = frameText(await renderTranscript(detail(), 'view'));
    // Every event is its own markdown block, so a 16-line budget is eight
    // transcript lines: the whole budget is spent.
    expect(frame).toContain('lines 1–16/79');
    expect(frame).toContain('line 8');
    expect(frame).not.toContain('line 9');
  });

  test('the parked question callout names the answer key', async () => {
    const parked = detail({ status: 'awaiting-input' });
    const frame = frameText(
      await renderTranscript(
        {
          ...parked,
          events: [...parked.events, { seq: 99, role: 'system', text: 'Which branch?' }],
        },
        'preview',
      ),
    );
    expect(frame).toContain('question');
    expect(frame).toContain('Which branch?');
    expect(frame).toContain('answer');
  });
});
