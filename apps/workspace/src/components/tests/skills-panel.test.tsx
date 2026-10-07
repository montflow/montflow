/** @jsxImportSource @opentui/solid */
import { testRender } from '@opentui/solid';
import { afterEach, describe, test } from 'bun:test';
import type { Skills } from '../../services/index.js';
import { Panel } from '../panel.js';
import { SkillsPanel, type SkillsPanelProps } from '../skills-panel.js';

type Setup = Awaited<ReturnType<typeof testRender>>;

const setups: Array<Setup> = [];

afterEach(() => {
  for (const setup of setups.splice(0)) setup.renderer.destroy();
});

const CAPACITY = 5;
/** Rig width: must fit the full banner plus count (`…x remove · j/k move` plus `5/5`). */
const WIDTH = 60;
const HEIGHT = 16;

const row = (id: string): Skills.SkillSummary => ({
  id,
  name: id,
  description: '',
  groups: [],
  dependencies: [],
  body: '',
});

/** Render one SkillsPanel state inside Panel chrome with a sentinel line below. */
const renderState = async (
  panel: Partial<SkillsPanelProps>,
  width: number = WIDTH,
  height: number = HEIGHT,
): Promise<Setup> => {
  const setup = await testRender(
    () => (
      <box width={width} height={height} flexDirection="column">
        <Panel title="[s] Skills" selected={false}>
          <SkillsPanel
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
    { width, height },
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
  (line ?? 'x').replace(/[│┌┐└┘─]/g, '').trim() === '';

/** Boolean assertion with a label (bun:test `expect` takes no message argument). */
const check = (actual: boolean, label: string): void => {
  if (!actual) throw new Error(`SkillsPanel layout: ${label}`);
};

/** Every panel state under test: loading, install, empty, partial, full, searching. */
const states = () =>
  new Map([
    ['loading', { loading: true }],
    ['loadingExtension', { loading: true, loadingVariant: 'extension' as const }],
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

describe('SkillsPanel layout', () => {
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
      check(rows[0]?.includes('┌') ?? false, `${name}: top border`);
      check(rows[sentinel - 1]?.includes('└') ?? false, `${name}: bottom border`);
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
      // Banner sits on the last content row: bottom border, then
      // banner (sentinel-2).
      check(rows[sentinel - 2]?.includes(banner) ?? false, `${name}: banner`);
    }
  });

  test('unselected panels render the footer blank (same line, no banner)', async () => {
    const frames = await renderAll(['missingUnselected', 'emptyUnselected', 'partial']);
    for (const [name, rows] of frames) {
      const sentinel = sentinelRowOf(rows);
      check(isBlank(rows[sentinel - 2]), `${name}: footer blank`);
    }
  });

  test('transient states keep the sentinel fixed and show their message', async () => {
    const messages = new Map([
      ['loading', 'Loading Skills…'],
      ['loadingExtension', 'Loading Extension…'],
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
    // Search line at sentinel-14, list region sentinel-13..sentinel-3,
    // banner pinned at sentinel-2.
    names.forEach((name, index) => {
      check(rows[sentinel - 13 + index]?.includes(name) ?? false, `row ${name}`);
    });
    check(rows[sentinel - 2]?.includes('/ search') ?? false, 'banner');
    check(rows[sentinel - 2]?.includes('x remove') ?? false, 'remove keybind');
    check(rows[sentinel - 2]?.includes('5/5') ?? false, 'count');
  });

  test('partial list keeps rows top-packed with a blank footer when unselected', async () => {
    const rows = frameRows(
      await renderState({ installed: true, rows: [row('alpha'), row('beta')], total: 2 }),
    );
    const sentinel = rows.findIndex((line) => line.includes('SENTINEL'));
    check(rows[sentinel - 13]?.includes('alpha') ?? false, 'first row');
    check(rows[sentinel - 12]?.includes('beta') ?? false, 'second row');
    check(isBlank(rows[sentinel - 11]), 'slack row blank');
    check(isBlank(rows[sentinel - 2]), 'footer blank when unselected');
  });

  test('search line is reserved in every state (blank when idle)', async () => {
    const idle = frameRows(await renderState({ installed: true, rows: [row('alpha')], total: 1 }));
    const idleSentinel = idle.findIndex((line) => line.includes('SENTINEL'));
    check(isBlank(idle[idleSentinel - 14]), 'idle search blank');
    const searching = frameRows(await renderState(states().get('searching') ?? {}));
    const searchingSentinel = searching.findIndex((line) => line.includes('SENTINEL'));
    check(searching[searchingSentinel - 14]?.includes('/al') ?? false, 'query visible');
    const applied = frameRows(
      await renderState({
        installed: true,
        searching: false,
        query: 'al',
        rows: [row('alpha')],
        total: 5,
        selected: true,
      }),
    );
    const appliedSentinel = applied.findIndex((line) => line.includes('SENTINEL'));
    check(applied[appliedSentinel - 14]?.includes('/al') ?? false, 'applied filter visible');
  });

  test('banner never wraps onto the border when the panel is too narrow for it', async () => {
    const NARROW = 44;
    const names = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
    const rows = frameRows(
      await renderState(
        {
          installed: true,
          rows: names.map(row),
          highlight: 0,
          total: 5,
          selected: true,
        },
        NARROW,
      ),
    );
    const sentinel = sentinelRowOf(rows);
    check(rows[sentinel - 1]?.includes('└') ?? false, 'bottom border intact');
    // The full banner is wider than the panel here: it must clip onto its
    // one reserved footer row, head and count together, instead of wrapping
    // a second line onto the border.
    check(rows[sentinel - 2]?.includes('/ search') ?? false, 'banner head on the footer row');
    check(rows[sentinel - 2]?.includes('5/5') ?? false, 'count on the footer row');
  });

  test('banner never paints over the bottom border when the panel is too short', async () => {
    // Panel height = outer height - 1 (the sentinel line). Height 2 leaves
    // no content row; height 3+ can show the footer once the search line
    // yields. In every case the border is the last row and stays clean.
    const outers = [3, 4, 5, 6];
    const frames = await Promise.all(
      outers.map((outer) =>
        renderState(
          {
            installed: true,
            rows: [row('alpha'), row('beta')],
            total: 2,
            selected: true,
          },
          WIDTH,
          outer,
        ).then(frameRows),
      ),
    );
    outers.forEach((outer, index) => {
      const rows = frames[index] ?? [];
      const sentinel = sentinelRowOf(rows);
      check(rows[sentinel - 1]?.includes('└') ?? false, `outer ${outer}: bottom border intact`);
      check(
        !(rows[sentinel - 1]?.includes('/ search') ?? false),
        `outer ${outer}: banner off the border`,
      );
      if (outer >= 4) {
        check(rows[sentinel - 2]?.includes('/ search') ?? false, `outer ${outer}: banner inside`);
      }
    });
  });
});
