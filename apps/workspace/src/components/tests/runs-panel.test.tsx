/** @jsxImportSource @opentui/solid */
import { testRender } from '@opentui/solid';
import { afterEach, describe, test } from 'bun:test';
import type { Runs } from '../../services/index.js';
import { FRAME_MS, LOADER_FRAMES } from '../loader.js';
import { Panel } from '../panel.js';
import { RunsPanel, runMarker, type RunsPanelProps } from '../runs-panel.js';

type Setup = Awaited<ReturnType<typeof testRender>>;

const setups: Array<Setup> = [];

afterEach(() => {
  for (const setup of setups.splice(0)) setup.renderer.destroy();
});

const CAPACITY = 5;
/** Rig width: must fit the runs banner plus the windowed count (`A all runs`). */
const WIDTH = 64;
const HEIGHT = 16;

const row = (id: string, status: string): Runs.RunSummary => ({
  id,
  name: id,
  description: '',
  status,
  model: '',
  thinking: '',
  tools: [],
  prompt: '',
  spec: '',
  progress: '',
  created: '',
  updated: '',
});

/**
 * Render one RunsPanel state inside Panel chrome with a sentinel line below.
 * The frame is fixed by default for deterministic snapshots; `animated` drops
 * it so the panel runs its live spinner interval.
 */
const renderState = async (
  panel: Partial<RunsPanelProps>,
  options: { readonly frame?: number | undefined; readonly animated?: boolean | undefined } = {},
): Promise<Setup> => {
  const spinnerFrame = options.animated === true ? undefined : (options.frame ?? 0);
  const setup = await testRender(
    () => (
      <box width={WIDTH} height={HEIGHT} flexDirection="column">
        <Panel title="[r] Runs" selected={false}>
          <RunsPanel
            loading={false}
            installing={false}
            installed
            activeRows={[]}
            allRows={[]}
            showAll={false}
            highlight={0}
            total={0}
            query=""
            searching={false}
            capacity={CAPACITY}
            selected={false}
            frame={spinnerFrame}
            {...panel}
          />
        </Panel>
        <text>SENTINEL</text>
      </box>
    ),
    { width: WIDTH, height: HEIGHT },
  );
  await setup.renderOnce();
  setups.push(setup);
  return setup;
};

const frameRows = (setup: Setup): ReadonlyArray<string> => setup.captureCharFrame().split('\n');

const sentinelRowOf = (rows: ReadonlyArray<string>): number => {
  const index = rows.findIndex((line) => line.includes('SENTINEL'));
  check(index > -1, 'sentinel present');
  return index;
};

/** The single selected row line (the one carrying the `▸` caret). */
const highlightedLine = (rows: ReadonlyArray<string>): string | undefined =>
  rows.find((line) => line.includes('▸'));

const has = (rows: ReadonlyArray<string>, text: string): boolean =>
  rows.some((line) => line.includes(text));

/** Boolean assertion with a label (bun:test `expect` takes no message argument). */
const check = (actual: boolean, label: string): void => {
  if (!actual) throw new Error(`RunsPanel layout: ${label}`);
};

/** Sectioned rows shared by the section/toggle tests. */
const sectionProps = (
  showAll: boolean,
): Pick<
  RunsPanelProps,
  'installed' | 'activeRows' | 'allRows' | 'showAll' | 'total' | 'selected'
> => ({
  installed: true,
  activeRows: [row('live', 'running'), row('queued', 'pending')],
  allRows: [row('live', 'running'), row('queued', 'pending'), row('old', 'done')],
  showAll,
  total: 3,
  selected: true,
});

describe('RunsPanel sections', () => {
  test('renders Active always; the full list stays behind the toggle', async () => {
    const collapsed = frameRows(await renderState(sectionProps(false)));
    check(has(collapsed, 'Active'), 'active header');
    check(has(collapsed, 'live'), 'running active row');
    check(has(collapsed, 'queued'), 'queued active row');
    check(!has(collapsed, 'All runs'), 'all header hidden');
    check(!has(collapsed, 'old'), 'history hidden');

    const expanded = frameRows(await renderState(sectionProps(true)));
    check(has(expanded, 'Active'), 'active header retained');
    check(has(expanded, 'All runs'), 'all header shown');
    check(has(expanded, 'old'), 'history shown');
  });

  test('sentinel never moves between collapsed and expanded sections', async () => {
    const collapsed = sentinelRowOf(frameRows(await renderState(sectionProps(false))));
    const expanded = sentinelRowOf(frameRows(await renderState(sectionProps(true))));
    check(collapsed === expanded, `sentinel stable: ${collapsed} vs ${expanded}`);
  });

  test('footer surfaces the toggle keybind and a windowed count per state', async () => {
    const collapsed = frameRows(
      await renderState({
        installed: true,
        activeRows: [row('live', 'running')],
        allRows: [],
        showAll: false,
        total: 4,
        selected: true,
      }),
    );
    check(has(collapsed, 'A all runs'), 'toggle keybind');
    check(has(collapsed, '1/4'), 'active count');

    const expanded = frameRows(
      await renderState({
        installed: true,
        activeRows: [row('live', 'running')],
        allRows: [row('live', 'running'), row('old', 'done')],
        showAll: true,
        total: 4,
        selected: true,
      }),
    );
    check(has(expanded, '2/4'), 'windowed all count');
  });
});

describe('RunsPanel highlight across sections', () => {
  const base = (): Partial<RunsPanelProps> => ({
    installed: true,
    activeRows: [row('live', 'running')],
    allRows: [row('live', 'running'), row('mid', 'done'), row('old', 'done')],
    showAll: true,
    total: 3,
    selected: true,
  });

  test('walks Active rows then the full list without selecting headers', async () => {
    const active = frameRows(await renderState({ ...base(), highlight: 0 }));
    check(highlightedLine(active)?.includes('live') ?? false, 'active row highlighted');
    check(has(active, 'Active'), 'active header present');

    const firstAll = frameRows(await renderState({ ...base(), highlight: 1 }));
    check(highlightedLine(firstAll)?.includes('live') ?? false, 'first all row highlighted');

    const lastAll = frameRows(await renderState({ ...base(), highlight: 3 }));
    check(highlightedLine(lastAll)?.includes('old') ?? false, 'last all row highlighted');
  });
});

describe('RunsPanel running spinner', () => {
  test('running rows take the injected braille frame; static markers survive', async () => {
    const rows = frameRows(
      await renderState(
        {
          installed: true,
          activeRows: [row('live', 'running'), row('queued', 'pending')],
          allRows: [],
          showAll: false,
          total: 2,
          selected: false,
        },
        { frame: 3 },
      ),
    );
    check(has(rows, LOADER_FRAMES[3] ?? ''), `frame 3 visible: ${LOADER_FRAMES[3]}`);
    check(
      rows.some((line) => line.includes('live') && line.includes(LOADER_FRAMES[3] ?? '')),
      'running row frame',
    );
    check(!has(rows, '●'), 'static running marker replaced');
    check(
      rows.some((line) => line.includes('queued') && line.includes('○')),
      'pending static marker',
    );
  });

  test('running rows advance their braille frame on the spinner interval', async () => {
    const setup = await renderState(
      {
        installed: true,
        activeRows: [row('live', 'running')],
        allRows: [],
        showAll: false,
        total: 1,
        selected: false,
      },
      { animated: true },
    );
    const first = frameRows(setup);
    check(
      first.some((line) => line.includes('live') && line.includes(LOADER_FRAMES[0] ?? '')),
      'frame 0 first',
    );
    // The panel ticks on a raw interval, so observing a live frame needs real
    // elapsed time. Three ticks leave margin against timer jitter.
    // oxlint-disable-next-line montflow/no-timers -- the interval under test is raw by design.
    await new Promise((resolve) => setTimeout(resolve, FRAME_MS * 3));
    await setup.renderOnce();
    const later = frameRows(setup);
    check(
      later.some((line) => line.includes('live') && !line.includes(LOADER_FRAMES[0] ?? '')),
      'running row advanced past frame 0',
    );
  });

  test('frame zero is the first braille glyph and the static marker stays default', async () => {
    const rows = frameRows(
      await renderState({
        installed: true,
        activeRows: [row('live', 'running')],
        allRows: [],
        showAll: false,
        total: 1,
        selected: false,
      }),
    );
    check(
      rows.some((line) => line.includes('live') && line.includes('⠋')),
      'frame 0 visible',
    );
    check(runMarker('running') === '●', 'runMarker static default');
    check(runMarker('running', 0) === '⠋', 'runMarker frame 0');
    check(runMarker('awaiting-input', 3) === '◐', 'non-running marker ignores frame');
  });
});

describe('RunsPanel notes and chrome', () => {
  test('install and empty notes keep their copy with a pinned grid', async () => {
    const baseline = sentinelRowOf(frameRows(await renderState({})));
    const missing = frameRows(await renderState({ installed: false, selected: true }));
    check(has(missing, 'Runs extension not installed.'), 'install note');
    check(has(missing, '⏎ install'), 'install hint');

    const empty = frameRows(await renderState({ installed: true, total: 0, selected: true }));
    check(has(empty, 'No runs found.'), 'empty note');
    check(has(empty, 'c create'), 'create hint');

    const noMatch = frameRows(
      await renderState({ installed: true, total: 0, query: 'zz', selected: true }),
    );
    check(has(noMatch, 'No runs match.'), 'no-match note');

    check(sentinelRowOf(missing) === baseline, 'missing sentinel stable');
    check(sentinelRowOf(empty) === baseline, 'empty sentinel stable');
    check(sentinelRowOf(noMatch) === baseline, 'no-match sentinel stable');
  });
});
