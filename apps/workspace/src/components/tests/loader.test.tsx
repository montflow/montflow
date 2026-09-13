/** @jsxImportSource @opentui/solid */
import { testRender } from '@opentui/solid';
import { afterEach, describe, test } from 'bun:test';
import { Loader, type LoaderVariant } from '../loader.js';
import { Panel } from '../panel.js';

type Setup = Awaited<ReturnType<typeof testRender>>;

const setups: Array<Setup> = [];

afterEach(() => {
  for (const setup of setups.splice(0)) setup.renderer.destroy();
});

const WIDTH = 50;
const HEIGHT = 16;

/** Render one Loader variant inside Panel chrome with a sentinel line below. */
const renderVariant = async (variant: LoaderVariant): Promise<Setup> => {
  const setup = await testRender(
    () => (
      <box width={WIDTH} height={HEIGHT} flexDirection="column">
        <Panel title="[s] Skills" selected={false}>
          <Loader variant={variant} frame={0} />
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

/** Boolean assertion with a label (bun:test `expect` takes no message argument). */
const check = (actual: boolean, label: string): void => {
  if (!actual) throw new Error(`Loader layout: ${label}`);
};

describe('Loader', () => {
  test('each variant shows its stage copy beside the fixed frame', async () => {
    const messages: ReadonlyArray<readonly [LoaderVariant, string]> = [
      ['extension', 'Loading Extension…'],
      ['skills', 'Loading Skills…'],
      ['profiles', 'Loading Profiles…'],
      ['installing', 'Installing skills…'],
    ];
    const frames = await Promise.all(
      messages.map(async ([variant]) =>
        (await renderVariant(variant)).captureCharFrame().split('\n'),
      ),
    );
    messages.forEach(([, message], index) => {
      const rows = frames[index] ?? [];
      check(
        rows.some((line) => line.includes('⠋') && line.includes(message)),
        `spinner plus copy: ${message}`,
      );
    });
  });

  test('sentinel below the panel never moves between variants (no layout shift)', async () => {
    const variants = ['extension', 'skills', 'profiles', 'prompts', 'installing'] as const;
    const frames = await Promise.all(
      variants.map(async (variant) =>
        (await renderVariant(variant)).captureCharFrame().split('\n'),
      ),
    );
    const positions = frames.map((rows) => rows.findIndex((line) => line.includes('SENTINEL')));
    check(
      positions.every((at) => at === positions[0]),
      `sentinel stable: ${positions}`,
    );
  });

  test('message override replaces the stage copy', async () => {
    const setup = await testRender(
      () => (
        <box width={WIDTH} height={HEIGHT} flexDirection="column">
          <Panel title="[s] Skills" selected={false}>
            <Loader variant="skills" message="Retrying…" frame={0} />
          </Panel>
        </box>
      ),
      { width: WIDTH, height: HEIGHT },
    );
    await setup.renderOnce();
    setups.push(setup);
    const rows = setup.captureCharFrame().split('\n');
    check(
      rows.some((line) => line.includes('Retrying…')),
      'override visible',
    );
  });
});
