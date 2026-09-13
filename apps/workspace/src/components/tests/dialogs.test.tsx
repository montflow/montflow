/** @jsxImportSource @opentui/solid */
import type { TextareaRenderable } from '@opentui/core';
import { testRender } from '@opentui/solid';
import { afterEach, describe, test } from 'bun:test';
import type { JSX } from 'solid-js';
import { FilterDialog, InputDialog, MenuDialog, windowMenuOptions } from '../dialogs.js';

type Setup = Awaited<ReturnType<typeof testRender>>;

const setups: Array<Setup> = [];

afterEach(() => {
  for (const setup of setups.splice(0)) setup.renderer.destroy();
});

const WIDTH = 60;
const HEIGHT = 18;

/** Render one dialog over an empty frame. The thunk defers JSX creation until inside the test renderer context. */
const renderDialog = async (dialog: () => JSX.Element): Promise<Setup> => {
  const setup = await testRender(
    () => (
      <box width={WIDTH} height={HEIGHT} flexDirection="column">
        {dialog()}
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
  if (!actual) throw new Error(`Dialogs: ${label}`);
};

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

describe('MenuDialog', () => {
  test('renders title, subtitle, and options with highlight', async () => {
    const text = frame(
      await renderDialog(() => (
        <MenuDialog title="Pick one" subtitle="choose wisely" options={['a', 'b']} highlight={1} />
      )),
    );
    check(text.includes('Pick one'), 'title');
    check(text.includes('choose wisely'), 'subtitle');
    check(text.includes('▸ b'), 'highlight');
  });

  test('renders without subtitle (no orphan-text crash)', async () => {
    const text = frame(
      await renderDialog(() => <MenuDialog title="Pick one" options={['a']} highlight={0} />),
    );
    check(text.includes('Pick one'), 'title');
    check(text.includes('▸ a'), 'option');
  });
});

describe('InputDialog', () => {
  test('renders title and seeded value', async () => {
    const setup = await renderDialog(() => (
      <InputDialog title="Name?" placeholder="type…" value="ab" />
    ));
    // Editor focus settles on a microtask — flush it like the live loop
    // does before capturing.
    await setup.renderer.idle();
    const text = frame(setup);
    check(text.includes('Name?'), 'title');
    check(text.includes('ab'), 'value');
  });

  test('renders the placeholder when empty', async () => {
    const setup = await renderDialog(() => (
      <InputDialog title="Name?" placeholder="type…" value="" />
    ));
    await setup.renderer.idle();
    const text = frame(setup);
    check(text.includes('type…'), 'placeholder');
  });

  test('keeps the cursor tail visible on overflow input', async () => {
    const setup = await renderDialog(() => (
      <InputDialog title="Name?" placeholder="type…" value={`dictated ${'word '.repeat(50)}end`} />
    ));
    await setup.renderer.idle();
    const text = frame(setup);
    check(text.includes('end'), 'cursor tail visible');
  });

  test('arrow keys move the cursor through overflowed text', async () => {
    let node: TextareaRenderable | undefined;
    const setup = await renderDialog(() => (
      <InputDialog
        title="Name?"
        placeholder="type…"
        value={`dictated ${'word '.repeat(60).trim()} end`}
        editorRef={(next: TextareaRenderable | undefined) => {
          node = next;
        }}
      />
    ));
    await setup.renderer.idle();
    check(node !== undefined, 'editor attached');
    const tail = node?.cursorOffset ?? 0;
    check(tail > 0, 'cursor parked at the tail');
    // Left walks the cursor back; up walks it a visual row back — the
    // viewport follows, so the overflowed head becomes visible.
    node?.handleKeyPress(arrowKey('left'));
    await setup.renderer.idle();
    check((node?.cursorOffset ?? 0) === tail - 1, 'left moves the cursor');
    // Walk up past the viewport — the view follows the cursor, so the
    // overflowed head scrolls into sight without manual scroll-jogging.
    for (let step = 0; step < 12; step += 1) {
      node?.handleKeyPress(arrowKey('up'));
    }
    await setup.renderer.idle();
    check((node?.cursorOffset ?? 0) < tail - 1, 'up moves the cursor');
    const text = frame(setup);
    check(text.includes('dictated word'), 'cursor-follow reveals the head');
  });

  test('enter submits the editor text', async () => {
    let submitted: string | undefined;
    const setup = await renderDialog(() => (
      <InputDialog
        title="Name?"
        placeholder="type…"
        value="hello"
        onSubmit={(next) => {
          submitted = next;
        }}
      />
    ));
    await setup.renderer.idle();
    setup.mockInput.pressEnter();
    await setup.renderer.idle();
    check(submitted === 'hello', 'submitted text');
  });
});

describe('windowMenuOptions', () => {
  test('windows long lists around the highlight', () => {
    const options = Array.from({ length: 20 }, (_, index) => `option-${index + 1}`);
    const view = windowMenuOptions(options, 19);
    check(view.rows.length === 8, 'row budget');
    check(view.rows[view.highlight] === 'option-20', 'highlighted row visible');
  });

  test('keeps short lists whole', () => {
    const view = windowMenuOptions(['a', 'b'], 0);
    check(view.rows.length === 2, 'all rows');
    check(view.highlight === 0, 'highlight');
  });
});

describe('FilterDialog', () => {
  test('renders query, rows, and count', async () => {
    const text = frame(
      await renderDialog(() => (
        <FilterDialog title="Models" query="al" rows={['alpha']} highlight={0} total={3} />
      )),
    );
    check(text.includes('Models'), 'title');
    check(text.includes('/al'), 'query');
    check(text.includes('▸ alpha'), 'row');
    check(text.includes('1/3'), 'count');
  });

  test('renders a no-match line when empty', async () => {
    const text = frame(
      await renderDialog(() => (
        <FilterDialog title="Models" query="zz" rows={[]} highlight={0} total={3} />
      )),
    );
    check(text.includes('no match'), 'empty line');
    check(text.includes('0/3'), 'count');
  });

  test('shows the pinned-row hint only for the model picker', async () => {
    const plain = frame(
      await renderDialog(() => (
        <FilterDialog title="Models" query="" rows={['a']} highlight={0} total={1} />
      )),
    );
    check(!plain.includes('tab current'), 'no hint without a pinned row');
    const pinned = frame(
      await renderDialog(() => (
        <FilterDialog
          title="Models"
          query=""
          rows={['muse-spark (current)']}
          highlight={0}
          total={2}
          showCurrentHint
        />
      )),
    );
    check(pinned.includes('muse-spark (current)'), 'current row marked');
    check(pinned.includes('tab current'), 'jump hint visible');
  });
});
