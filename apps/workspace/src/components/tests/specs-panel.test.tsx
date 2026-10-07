/** @jsxImportSource @opentui/solid */
import { testRender } from '@opentui/solid';
import { afterEach, describe, test } from 'bun:test';
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
});
