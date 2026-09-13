/** @jsxImportSource @opentui/solid */
import { testRender } from '@opentui/solid';
import { afterEach, describe, test } from 'bun:test';
import { Modal } from '../modal.js';

type Setup = Awaited<ReturnType<typeof testRender>>;

const setups: Array<Setup> = [];

afterEach(() => {
  for (const setup of setups.splice(0)) setup.renderer.destroy();
});

const WIDTH = 60;
const HEIGHT = 16;

/** Boolean assertion with a label (bun:test `expect` takes no message argument). */
const check = (actual: boolean, label: string): void => {
  if (!actual) throw new Error(`Modal: ${label}`);
};

describe('Modal', () => {
  test('shell frames the caller content', async () => {
    const setup = await testRender(
      () => (
        <box width={WIDTH} height={HEIGHT} flexDirection="column">
          <Modal minWidth={40}>
            <text>Hello modal</text>
          </Modal>
        </box>
      ),
      { width: WIDTH, height: HEIGHT },
    );
    await setup.renderOnce();
    setups.push(setup);
    check(setup.captureCharFrame().includes('Hello modal'), 'content visible');
  });
});
