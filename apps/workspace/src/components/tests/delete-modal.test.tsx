/** @jsxImportSource @opentui/solid */
import { testRender } from '@opentui/solid';
import { afterEach, describe, test } from 'bun:test';
import { DeleteModal, type DeleteModalProps } from '../delete-modal.js';

type Setup = Awaited<ReturnType<typeof testRender>>;

const setups: Array<Setup> = [];

afterEach(() => {
  for (const setup of setups.splice(0)) setup.renderer.destroy();
});

const WIDTH = 60;
const HEIGHT = 16;

/** Render one DeleteModal state over an empty frame. */
const renderState = async (props: Partial<DeleteModalProps>): Promise<Setup> => {
  const setup = await testRender(
    () => (
      <box width={WIDTH} height={HEIGHT} flexDirection="column">
        <DeleteModal
          title="Remove skill 'alpha'?"
          message="This removes its SKILL.md and cannot be undone."
          remaining={0}
          deleting={false}
          focus="back"
          {...props}
        />
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
  if (!actual) throw new Error(`DeleteModal: ${label}`);
};

describe('DeleteModal', () => {
  test('locked modal shows the timer only on the Delete button', async () => {
    const text = frame(await renderState({ remaining: 3, deleting: false, focus: 'back' }));
    check(text.includes("Remove skill 'alpha'?"), 'title');
    check(text.includes('SKILL.md'), 'message');
    check(text.includes('Back'), 'back button');
    check(text.includes('Delete (3s)'), 'timer on delete');
    check(!text.includes('Confirm available'), 'no countdown line');
    check(!text.includes('confirm in'), 'no countdown hint');
    check(!text.includes('Removing…'), 'no working line');
  });

  test('unlocked modal shows a plain Delete plus the confirm hint', async () => {
    const text = frame(await renderState({ remaining: 0, deleting: false, focus: 'delete' }));
    check(text.includes('Back'), 'back button');
    check(text.includes('Delete'), 'delete button');
    check(!text.includes('Delete ('), 'no countdown suffix');
    check(text.includes('y confirm'), 'confirm hint');
  });

  test('deleting modal keeps both buttons and shows the working line', async () => {
    const text = frame(await renderState({ remaining: 0, deleting: true, focus: 'back' }));
    check(text.includes('Removing…'), 'working line');
    check(text.includes('Back'), 'back button still visible');
    check(text.includes('Delete'), 'delete button still visible');
  });
});
