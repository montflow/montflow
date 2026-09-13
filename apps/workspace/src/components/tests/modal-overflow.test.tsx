/** @jsxImportSource @opentui/solid */
import type { ScrollBoxRenderable, TextareaRenderable } from '@opentui/core';
import { testRender } from '@opentui/solid';
import { afterEach, describe, test } from 'bun:test';
import { createSignal, type JSX } from 'solid-js';
import { FilterDialog, FlowErrorModal, FlowModal, InputDialog, MenuDialog } from '../dialogs.js';

type Setup = Awaited<ReturnType<typeof testRender>>;

const setups: Array<Setup> = [];

afterEach(() => {
  for (const setup of setups.splice(0)) setup.renderer.destroy();
});

const WIDTH = 70;
const HEIGHT = 24;

/** Render one modal over an empty frame, flushed like the live loop. The
 * thunk stays a live child (not one eager call) so signal updates flow. */
const renderModal = async (modal: () => JSX.Element): Promise<Setup> => {
  const setup = await testRender(
    () => (
      <box width={WIDTH} height={HEIGHT} flexDirection="column">
        {modal}
      </box>
    ),
    { width: WIDTH, height: HEIGHT },
  );
  await setup.renderOnce();
  await setup.renderer.idle();
  setups.push(setup);
  return setup;
};

const frame = (setup: Setup): string => setup.captureCharFrame();

/** Session record: numbered frame dump in the grid-probe style. */
const dump = (label: string, setup: Setup): void => {
  console.log(`===== ${label} =====`);
  frame(setup)
    .split('\n')
    .forEach((line, i) => console.log(`${String(i).padStart(2)}|${line}`));
};

/** Boolean assertion with a label (bun:test `expect` takes no message argument). */
const check = (actual: boolean, label: string): void => {
  if (!actual) throw new Error(`Modal overflow: ${label}`);
};

const longText = (head: string): string => `${head} ${'word '.repeat(60).trim()} end`;

/** Fake arrow key for direct editor drives (bypasses the test-harness dispatcher). */
const arrowKey = (name: 'left' | 'right' | 'up' | 'down'): never =>
  // SAFETY: `handleKeyPress` only reads `name` plus the ctrl/meta/shift/sequence fields this literal supplies.
  ({
    name,
    ctrl: false,
    meta: false,
    shift: false,
    sequence: '',
  }) as never;

/** Walk the editor cursor up one visual row. */
const cursorUp = (node: TextareaRenderable | undefined): void => {
  node?.handleKeyPress(arrowKey('up'));
};

describe('modal overflow', () => {
  test('input pins the cursor tail and cursor-follow reveals the head', async () => {
    let node: TextareaRenderable | undefined;
    const setup = await renderModal(() => (
      <InputDialog
        title="Describe it"
        placeholder="type…"
        value={longText('dictated')}
        editorRef={(next: TextareaRenderable | undefined) => {
          node = next;
        }}
      />
    ));
    dump('input tail', setup);
    check(frame(setup).includes('end'), 'cursor tail pinned');
    for (let step = 0; step < 12; step += 1) cursorUp(node);
    await setup.renderer.idle();
    dump('input scrolled', setup);
    check(frame(setup).includes('dictated word'), 'scrolled head visible');
  });

  test('input keeps typing and scrolling past dictation bursts', async () => {
    // Reactive props ride testRender's own render fn (a helper thunk
    // would evaluate them eagerly, outside tracking).
    const [value, setValue] = createSignal('');
    let node: TextareaRenderable | undefined;
    const setup = await testRender(
      () => (
        <box width={WIDTH} height={HEIGHT} flexDirection="column">
          <InputDialog
            title="Describe it"
            placeholder="type…"
            value={value()}
            editorRef={(next: TextareaRenderable | undefined) => {
              node = next;
            }}
            onChange={(next) => {
              setValue(next);
            }}
          />
        </box>
      ),
      { width: WIDTH, height: HEIGHT },
    );
    await setup.renderOnce();
    await setup.renderer.idle();
    setups.push(setup);
    // Handy-style bursts: typed through the focused editor past the old
    // 256 wall. Sequential by design — each burst must paint before the
    // next lands.
    for (let i = 0; i < 8; i++) {
      const burst = i;
      // oxlint-disable-next-line no-await-in-loop -- sequential paints, see above.
      await setup.mockInput.typeText(`word${burst} ${'x '.repeat(30)}`);
      // oxlint-disable-next-line no-await-in-loop -- sequential paints, see above.
      await setup.renderOnce();
      // oxlint-disable-next-line no-await-in-loop -- sequential paints, see above.
      await setup.renderer.idle();
    }
    dump('input bursts tail', setup);
    const tail = frame(setup);
    check(tail.includes('word7'), 'typing continues without a wall');
    check(tail.includes('chars'), 'counter shows the length');
    for (let step = 0; step < 16; step += 1) cursorUp(node);
    await setup.renderer.idle();
    dump('input bursts scrolled', setup);
    check(frame(setup).includes('word0'), 'head scrolls into view');
  });

  test('menu windows long option lists around the highlight', async () => {
    const options = Array.from({ length: 20 }, (_, index) => `option-${index + 1}`);
    const setup = await renderModal(() => (
      <MenuDialog title="Pick" options={options} highlight={19} />
    ));
    dump('menu windowed', setup);
    const text = frame(setup);
    check(text.includes('▸ option-20'), 'highlighted row visible');
    check(!text.includes('option-1 '), 'off-window rows clipped');
  });

  test('filter picker stays bounded on long queries', async () => {
    const rows = Array.from({ length: 8 }, (_, index) => `option-${index + 1}`);
    const setup = await renderModal(() => (
      <FilterDialog title="Models" query={'q'.repeat(64)} rows={rows} highlight={7} total={20} />
    ));
    dump('filter bounded', setup);
    const text = frame(setup);
    check(text.includes('▸ option-8'), 'highlighted row visible');
    check(text.includes('8/20'), 'count visible');
    check(text.includes('╰'), 'frame closes inside the viewport');
  });

  test('flow modal shows status, submitted tail, and scrolls', async () => {
    let node: ScrollBoxRenderable | undefined;
    const setup = await renderModal(() => (
      <FlowModal
        status="Generating prompt"
        submitted={{ title: 'Describe the prompt', value: longText('dictated') }}
        scrollRef={(next: ScrollBoxRenderable | undefined) => {
          node = next;
        }}
        canScroll
      />
    ));
    dump('flow working', setup);
    const tail = frame(setup);
    check(tail.includes('Generating prompt'), 'status visible');
    check(tail.includes('end▊'), 'submitted tail pinned');
    check(tail.includes('esc cancel'), 'cancel hint visible');
    check(tail.includes('↑↓ scroll'), 'scroll hint visible on overflow');
    node?.scrollBy({ x: 0, y: -4 });
    await setup.renderer.idle();
    dump('flow scrolled', setup);
    check(frame(setup).includes('dictated word'), 'submitted head visible');
  });

  test('flow modal hides the scroll hint when the input fits', async () => {
    const setup = await renderModal(() => (
      <FlowModal
        status="Generating prompt"
        submitted={{ title: 'T', value: 'hi' }}
        canScroll={false}
      />
    ));
    dump('flow short', setup);
    const text = frame(setup);
    check(text.includes('esc cancel'), 'cancel hint visible');
    check(!text.includes('↑↓ scroll'), 'no scroll hint without overflow');
  });

  test('flow error modal shows the error and scrolls', async () => {
    let node: ScrollBoxRenderable | undefined;
    const error = `Agent failed: ${'something went wrong in the headless run. '.repeat(12)}tail`;
    const setup = await renderModal(() => (
      <FlowErrorModal
        title="Creating prompt failed"
        error={error}
        focus="retry"
        scrollRef={(next: ScrollBoxRenderable | undefined) => {
          node = next;
        }}
        canScroll
      />
    ));
    dump('flow error', setup);
    const tail = frame(setup);
    check(tail.includes('Creating prompt failed'), 'title visible');
    check(tail.includes('▸ Retry'), 'retry focused');
    node?.scrollBy({ x: 0, y: -8 });
    await setup.renderer.idle();
    dump('flow error scrolled', setup);
    check(frame(setup).includes('Agent failed'), 'error head visible');
  });
});
