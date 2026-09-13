/** @jsxImportSource @opentui/solid */
import { testRender } from '@opentui/solid';
import { afterEach, describe, test } from 'bun:test';
import type { Prompts } from '../../services/index.js';
import { Panel } from '../panel.js';
import { PromptsPanel, type PromptsPanelProps } from '../prompts-panel.js';

type Setup = Awaited<ReturnType<typeof testRender>>;

const setups: Array<Setup> = [];

afterEach(() => {
  for (const setup of setups.splice(0)) setup.renderer.destroy();
});

const CAPACITY = 5;
/** Rig width: must fit the full banner plus count (`…x remove · j/k move` plus `5/5`). */
const WIDTH = 60;
const HEIGHT = 16;

const row = (id: string): Prompts.PromptSummary => ({
  id,
  name: id,
  description: '',
  template: '',
  variables: [],
  skills: [],
  model: '',
});

/** Render one PromptsPanel state inside Panel chrome with a sentinel line below. */
const renderState = async (panel: Partial<PromptsPanelProps>): Promise<Setup> => {
  const setup = await testRender(
    () => (
      <box width={WIDTH} height={HEIGHT} flexDirection="column">
        <Panel title="[p] Prompts" selected={false}>
          <PromptsPanel
            loading={false}
            installing={false}
            installed
            rows={[]}
            highlight={0}
            total={0}
            query=""
            searching={false}
            capacity={CAPACITY}
            selected={false}
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

const sentinelRow = (setup: Setup): number => sentinelRowOf(frameRows(setup));

const sentinelRowOf = (rows: ReadonlyArray<string>): number => {
  const index = rows.findIndex((line) => line.includes('SENTINEL'));
  check(index > -1, 'sentinel present');
  return index;
};

/** Interior blank: ignore the Panel border/padding chrome (`│`, `─`, corners). */
const isBlank = (line: string | undefined): boolean =>
  (line ?? 'x').replace(/[│╭╮╰╯─]/g, '').trim() === '';

/** Boolean assertion with a label (bun:test `expect` takes no message argument). */
const check = (actual: boolean, label: string): void => {
  if (!actual) throw new Error(`PromptsPanel layout: ${label}`);
};

/** Every panel state under test: loading, install, empty, partial, full, searching. */
const states = () =>
  new Map([
    ['loading', { loading: true }],
    ['loadingExtension', { loading: true, loadingVariant: 'extension' as const }],
    ['loadingPrompts', { loading: true, loadingVariant: 'prompts' as const }],
    ['installing', { installing: true }],
    ['missingUnselected', { installed: false }],
    ['missingSelected', { installed: false, selected: true }],
    ['emptyUnselected', { installed: true, total: 0 }],
    ['emptySelected', { installed: true, total: 0, selected: true }],
    ['partial', { installed: true, rows: [row('alpha'), row('beta')], total: 2 }],
    [
      'full',
      {
        installed: true,
        rows: [row('alpha'), row('beta'), row('gamma'), row('delta'), row('epsilon')],
        highlight: 2,
        total: 5,
        selected: true,
      },
    ],
    [
      'searching',
      {
        installed: true,
        searching: true,
        query: 'al',
        rows: [row('alpha')],
        total: 5,
        selected: true,
      },
    ],
  ]);

/**
 * Render several states, one independent renderer each. Concurrent:
 * renderers share nothing, and every setup registers for afterEach
 * cleanup — assertion loops below stay synchronous.
 * @param names - state names from `states()`
 * @returns frame rows per state name
 */
const renderAll = async (
  names: ReadonlyArray<string>,
): Promise<Map<string, ReadonlyArray<string>>> => {
  const rendered = await Promise.all(
    names.map(
      async (name) => [name, frameRows(await renderState(states().get(name) ?? {}))] as const,
    ),
  );
  return new Map(rendered);
};

describe('PromptsPanel layout', () => {
  test('sentinel below the panel never moves between states (no layout shift)', async () => {
    const frames = await renderAll([...states().keys()]);
    const positions = new Map<string, number>();
    for (const [name, rows] of frames) positions.set(name, sentinelRowOf(rows));
    const spots = [...positions.values()];
    check(
      spots.every((at) => at === spots[0]),
      `sentinel stable: ${JSON.stringify([...positions])}`,
    );
  });

  test('panel chrome stays pinned: top border first row, bottom border above sentinel', async () => {
    const frames = await renderAll([...states().keys()]);
    for (const [name, rows] of frames) {
      const sentinel = sentinelRowOf(rows);
      check(rows[0]?.includes('╭') ?? false, `${name}: top border`);
      check(rows[sentinel - 1]?.includes('╯') ?? false, `${name}: bottom border`);
    }
  });

  test('banner stays pinned one row inside the bottom border in selected states', async () => {
    const banners = new Map([
      ['missingSelected', '⏎ install'],
      ['emptySelected', 'c create'],
      ['full', '/ search'],
      ['searching', '/ search'],
    ]);
    const frames = await renderAll([...banners.keys()]);
    for (const [name, banner] of banners) {
      const rows = frames.get(name) ?? [];
      const sentinel = sentinelRowOf(rows);
      // Banner sits on the last content row: bottom border, bottom
      // padding, then banner (sentinel-3).
      check(rows[sentinel - 3]?.includes(banner) ?? false, `${name}: banner`);
    }
  });

  test('unselected panels render the footer blank (same line, no banner)', async () => {
    const frames = await renderAll(['missingUnselected', 'emptyUnselected', 'partial']);
    for (const [name, rows] of frames) {
      const sentinel = sentinelRowOf(rows);
      check(isBlank(rows[sentinel - 3]), `${name}: footer blank`);
    }
  });

  test('transient states keep the sentinel fixed and show their message', async () => {
    const messages = new Map([
      ['loading', 'Loading Prompts…'],
      ['loadingExtension', 'Loading Extension…'],
      ['loadingPrompts', 'Loading Prompts…'],
      ['installing', 'Installing skills…'],
    ]);
    const baseline = sentinelRow(await renderState({}));
    const frames = await renderAll([...messages.keys()]);
    for (const [name, message] of messages) {
      const rows = frames.get(name) ?? [];
      const sentinel = sentinelRowOf(rows);
      check(sentinel === baseline, `${name}: sentinel`);
      check(
        rows.some((line) => line.includes(message)),
        `${name}: message`,
      );
    }
  });

  test('full list starts at the top of the list region with the banner pinned below', async () => {
    const names = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
    const rows = frameRows(
      await renderState({
        installed: true,
        rows: names.map(row),
        highlight: 2,
        total: 5,
        selected: true,
      }),
    );
    const sentinel = rows.findIndex((line) => line.includes('SENTINEL'));
    // Top padding at sentinel-14, search line at sentinel-13, list region
    // sentinel-12..sentinel-4, banner pinned at sentinel-3.
    names.forEach((name, index) => {
      check(rows[sentinel - 12 + index]?.includes(name) ?? false, `row ${name}`);
    });
    check(rows[sentinel - 3]?.includes('/ search') ?? false, 'banner');
    check(rows[sentinel - 3]?.includes('x remove') ?? false, 'remove keybind');
    check(rows[sentinel - 3]?.includes('5/5') ?? false, 'count');
  });

  test('partial list keeps rows top-packed with a blank footer when unselected', async () => {
    const rows = frameRows(
      await renderState({ installed: true, rows: [row('alpha'), row('beta')], total: 2 }),
    );
    const sentinel = rows.findIndex((line) => line.includes('SENTINEL'));
    check(rows[sentinel - 12]?.includes('alpha') ?? false, 'first row');
    check(rows[sentinel - 11]?.includes('beta') ?? false, 'second row');
    check(isBlank(rows[sentinel - 10]), 'slack row blank');
    check(isBlank(rows[sentinel - 3]), 'footer blank when unselected');
  });

  test('search line is reserved in every state (blank when idle)', async () => {
    const idle = frameRows(await renderState({ installed: true, rows: [row('alpha')], total: 1 }));
    const idleSentinel = idle.findIndex((line) => line.includes('SENTINEL'));
    check(isBlank(idle[idleSentinel - 13]), 'idle search blank');
    const searching = frameRows(await renderState(states().get('searching') ?? {}));
    const searchingSentinel = searching.findIndex((line) => line.includes('SENTINEL'));
    check(searching[searchingSentinel - 13]?.includes('/al') ?? false, 'query visible');
  });
});
