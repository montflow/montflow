/** @jsxImportSource @opentui/solid */
import { testRender } from '@opentui/solid';
import { afterEach, describe, test } from 'bun:test';
import { Dashboard } from '../../modules/index.js';
import type { Specs } from '../../services/index.js';
import { Panel } from '../panel.js';
import { SpecsPanel, type SpecsPanelProps } from '../specs-panel.js';

type Setup = Awaited<ReturnType<typeof testRender>>;

const setups: Array<Setup> = [];

afterEach(() => {
  for (const setup of setups.splice(0)) setup.renderer.destroy();
});

const CAPACITY = 5;
const WIDTH = 60;
const HEIGHT = 16;

const row = (id: string): Specs.SpecSummary => ({
  id,
  name: id,
  description: '',
  state: 'pending',
  status: 'pending',
  active: false,
  total: 1,
  complete: 0,
  issues: 0,
  valid: true,
});

/** Render one SpecsPanel state inside Panel chrome with a sentinel line below. */
const renderState = async (
  panel: Partial<SpecsPanelProps>,
  width: number = WIDTH,
): Promise<Setup> => {
  const setup = await testRender(
    () => (
      <box width={width} height={HEIGHT} flexDirection="column">
        <Panel title="[e] Specs" selected={false}>
          <SpecsPanel
            loading={false}
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
    { width, height: HEIGHT },
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

/** Interior blank: ignore the Panel border/padding chrome (`│`, `─`, corners). */
const isBlank = (line: string | undefined): boolean =>
  (line ?? 'x').replace(/[│┌┐└┘─]/g, '').trim() === '';

/** Boolean assertion with a label (bun:test `expect` takes no message argument). */
const check = (actual: boolean, label: string): void => {
  if (!actual) throw new Error(`SpecsPanel layout: ${label}`);
};

describe('SpecsPanel layout', () => {
  test('empty state keeps the chrome pinned and the footer blank', async () => {
    const rows = frameRows(await renderState({ installed: true, total: 0 }));
    const sentinel = sentinelRowOf(rows);
    check(rows[0]?.includes('┌') ?? false, 'top border');
    check(rows[sentinel - 1]?.includes('└') ?? false, 'bottom border');
    check(rows.some((line) => line.includes('No specs found.')) ?? false, 'empty note');
    check(isBlank(rows[sentinel - 2]), 'footer blank when unselected');
  });

  test('banner never wraps onto the border when the panel is too narrow for it', async () => {
    const NARROW = 44;
    const rows = frameRows(
      await renderState(
        {
          installed: true,
          rows: [row('alpha'), row('beta'), row('gamma')],
          highlight: 0,
          total: 3,
          selected: true,
        },
        NARROW,
      ),
    );
    const sentinel = sentinelRowOf(rows);
    check(rows[sentinel - 1]?.includes('└') ?? false, 'bottom border intact');
    // The banner plus its count is wider than the panel here: it must clip
    // onto its one reserved footer row, head and count together, instead of
    // wrapping a second line onto the border.
    check(rows[sentinel - 2]?.includes('/ search') ?? false, 'banner head on the footer row');
    check(rows[sentinel - 2]?.includes('3/3') ?? false, 'count on the footer row');
  });

  test('whole-row panel heights keep the footer off the border in a mixed column', async () => {
    const TOTAL = 39;
    const heights = Dashboard.cellRows([3, 2, 2], TOTAL - 2, 1);
    const setup = await testRender(
      () => (
        <box width={80} height={TOTAL} flexDirection="column" paddingTop={1}>
          <box flexDirection="row" flexGrow={1} minHeight={0} gap={1} paddingX={1}>
            <box flexDirection="column" flexGrow={5} flexBasis={0} minHeight={0} gap={1}>
              <Panel title="[r] Runs" selected={false} height={heights[0]}>
                <text>runs</text>
              </Panel>
              <Panel title="[e] Specs" selected height={heights[1]}>
                <SpecsPanel
                  loading={false}
                  installed
                  rows={[row('alpha'), row('beta'), row('gamma')]}
                  highlight={0}
                  total={3}
                  query=""
                  searching={false}
                  capacity={(heights[1] ?? 4) - 4}
                  selected
                />
              </Panel>
              <Panel title="[f] Profiles" selected={false} height={heights[2]}>
                <text>profiles</text>
              </Panel>
            </box>
          </box>
          <text> status</text>
        </box>
      ),
      { width: 80, height: TOTAL },
    );
    await setup.renderOnce();
    setups.push(setup);
    const frame = frameRows(setup);
    const borders = frame
      .map((line, index) => [line, index] as const)
      .filter(([line]) => /^\s*└─+┘\s*$/.test(line))
      .map(([, index]) => index);
    const specsBottom = borders[1];
    check(specsBottom !== undefined, 'specs bottom border found');
    const bottom = specsBottom ?? 0;
    check(!(frame[bottom]?.includes('/ search') ?? false), 'banner not on the border');
    check(frame[bottom - 1]?.includes('/ search') ?? false, 'banner one row inside');
  });
});
