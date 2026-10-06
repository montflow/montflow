/** @jsxImportSource @opentui/solid */
import { testRender } from '@opentui/solid';
import { afterEach, describe, test } from 'bun:test';
import type { JSX } from 'solid-js';
import type { Profiles } from '../../services/index.js';
import { Panel } from '../panel.js';
import { ProfileDetail } from '../profile-detail.js';
import { StatusBar } from '../status-bar.js';

type Setup = Awaited<ReturnType<typeof testRender>>;

const setups: Array<Setup> = [];

afterEach(() => {
  for (const setup of setups.splice(0)) setup.renderer.destroy();
});

const WIDTH = 100;
const HEIGHT = 40;
const HINT = '↑↓ navigate · v full view · esc back';
/** Wall-clock the markdown worker needs before the body lands. */
const PARSE_SETTLE_MS = 800;

/** Profile with wrapping prose: markdown renders taller than its source
 * lines, which is what used to spill the body over the panel footer. */
const profile: Profiles.ProfileSummary = {
  id: 'effect-reviewer',
  name: 'Effect Reviewer',
  description: 'Adversarial Effect v4 reviewer profile',
  model: 'anthropic/claude-sonnet-4',
  skills: ['effect-v4', 'effect-testing'],
  instructions: Array.from(
    { length: 12 },
    (_, i) =>
      `## Phase ${i + 1}\n\n- inspect the module for **Result** discipline across every exported function and make sure no helper swallows a failure by throwing instead of returning a typed error channel\n- check the service layer boundaries\n- verify tests exist\n`,
  ).join('\n'),
  checklist: ['gates pass'],
};

/** Boolean assertion with a label (bun:test `expect` takes no message argument). */
const check = (actual: boolean, label: string): void => {
  if (!actual) throw new Error(`Detail overflow: ${label}`);
};

/** The app's detail shape: action panel beside the body panel, status bar below. */
const renderDetail = async (body: () => JSX.Element): Promise<Setup> => {
  const setup = await testRender(
    () => (
      <box flexGrow={1} flexDirection="column" paddingTop={1}>
        <box flexDirection="row" flexGrow={1} minHeight={0} gap={1} paddingX={1}>
          <box flexDirection="column" width={30} flexShrink={0} minHeight={0}>
            <Panel title="— Actions" selected={false}>
              <text>toggle view</text>
            </Panel>
          </box>
          <box flexDirection="column" flexGrow={1} flexBasis={0} minHeight={0}>
            <Panel title="Profile — view" selected={false}>
              {body()}
            </Panel>
          </box>
        </box>
        <StatusBar hint={HINT} trailing={`${WIDTH}x${HEIGHT}`} />
      </box>
    ),
    { width: WIDTH, height: HEIGHT },
  );
  await setup.renderOnce();
  // Markdown parses off a worker and lands a frame or two later, so the body
  // needs real elapsed time before the capture means anything.
  // oxlint-disable-next-line montflow/no-timers -- the markdown parse under test is async by design.
  await new Promise((resolve) => setTimeout(resolve, PARSE_SETTLE_MS));
  await setup.renderOnce();
  setups.push(setup);
  return setup;
};

/** Rows the detail owns above its body: the body spilling upwards ate these. */
const CHROME_ROWS = [
  'Adversarial Effect v4 reviewer profile',
  'id effect-reviewer',
  'model anthropic',
  'skills effect-v4',
];

const rows = (setup: Setup): ReadonlyArray<string> => setup.captureCharFrame().split('\n');

describe('markdown detail body stays inside the panel', () => {
  test('full view keeps the body off the footer and the keybinds', async () => {
    const setup = await renderDetail(() => (
      <ProfileDetail profile={profile} mode="view" scrollOffset={0} maxBodyLines={HEIGHT - 13} />
    ));
    const frame = rows(setup);
    const footer = frame.findIndex((row) => row.includes('j/k scroll'));
    const status = frame.findIndex((row) => row.includes(HINT));

    check(footer > 0, 'footer row missing');
    check(status === HEIGHT - 1, `status bar row moved (${status})`);
    check(frame[status]?.includes(`${WIDTH}x${HEIGHT}`) === true, 'status bar overwritten');
    // Guard the guards: a body that never rendered would pass every check below.
    check(
      frame.some((row) => row.includes('Phase 1')),
      'markdown body did not render',
    );
    // The spill interleaved both strings on one row: `linesc1–27/76e·vj/k scrollb…`.
    check(
      (frame[footer]?.match(/j\/k scroll/g) ?? []).length === 1,
      'footer text interleaved with body text',
    );
    check(!frame[footer]?.includes('discipline'), 'body text painted over the footer');
    check(frame[footer - 1] !== undefined, 'body has no row above the footer');
    for (const chrome of CHROME_ROWS)
      check(
        frame.some((row) => row.includes(chrome)),
        `detail row '${chrome}' painted over`,
      );
  });

  test('preview keeps the body off the footer and the keybinds', async () => {
    const setup = await renderDetail(() => (
      <ProfileDetail profile={profile} mode="preview" scrollOffset={0} maxBodyLines={HEIGHT - 13} />
    ));
    const frame = rows(setup);
    const footer = frame.findIndex((row) => row.includes('more lines'));
    const status = frame.findIndex((row) => row.includes(HINT));

    check(footer > 0, 'footer row missing');
    check(status === HEIGHT - 1, `status bar row moved (${status})`);
    check(
      frame.some((row) => row.includes('Phase 1')),
      'markdown body did not render',
    );
    check(!frame[footer]?.includes('discipline'), 'body text painted over the footer');
    for (const chrome of CHROME_ROWS)
      check(
        frame.some((row) => row.includes(chrome)),
        `detail row '${chrome}' painted over`,
      );
  });
});
