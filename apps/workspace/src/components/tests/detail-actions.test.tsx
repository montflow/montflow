/** @jsxImportSource @opentui/solid */
import { testRender } from '@opentui/solid';
import { afterEach, describe, test } from 'bun:test';
import type { JSX } from 'solid-js';
import { DetailActions } from '../detail-actions.js';

type Setup = Awaited<ReturnType<typeof testRender>>;

const setups: Array<Setup> = [];

afterEach(() => {
  for (const setup of setups.splice(0)) setup.renderer.destroy();
});

const WIDTH = 60;
const HEIGHT = 18;

/** Render the actions menu over an empty frame. */
const renderActions = async (menu: () => JSX.Element): Promise<Setup> => {
  const setup = await testRender(
    () => (
      <box width={WIDTH} height={HEIGHT} flexDirection="column">
        {menu()}
      </box>
    ),
    { width: WIDTH, height: HEIGHT },
  );
  await setup.renderOnce();
  setups.push(setup);
  return setup;
};

const frame = (setup: Setup): string => setup.captureCharFrame();

/** Boolean assertion with a label (bun:test `expect` takes no message argument). */
const check = (actual: boolean, label: string): void => {
  if (!actual) throw new Error(`DetailActions: ${label}`);
};

describe('DetailActions', () => {
  test('renders labels with hints and highlight', async () => {
    const text = frame(
      await renderActions(() => (
        <DetailActions
          actions={[
            { id: 'toggle-view', label: 'Show full view', hint: 'v' },
            { id: 'modify', label: 'Modify', hint: 'm' },
            { id: 'delete', label: 'Delete', hint: 'd' },
            { id: 'back', label: 'Back', hint: 'esc' },
          ]}
          highlight={1}
        />
      )),
    );
    check(text.includes('Show full view'), 'toggle label');
    check(text.includes('▸ Modify'), 'highlight');
    check(text.includes('esc'), 'back hint');
  });
});
