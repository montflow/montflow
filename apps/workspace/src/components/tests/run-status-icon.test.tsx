/** @jsxImportSource @opentui/solid */
import { testRender } from '@opentui/solid';
import { afterEach, describe, expect, test } from 'bun:test';
import { FRAME_MS, LOADER_FRAMES } from '../loader.js';
import { palette } from '../palette.js';
import { RunStatusIcon, runStatusColor } from '../run-status-icon.js';

type Setup = Awaited<ReturnType<typeof testRender>>;

const setups: Array<Setup> = [];

afterEach(() => {
  for (const setup of setups.splice(0)) setup.renderer.destroy();
});

const WIDTH = 60;
const HEIGHT = 3;

/** Render one status badge at a fixed frame, or animate when omitted. */
const renderBadge = async (
  status: string,
  options?: { readonly note?: string; readonly frame?: number },
): Promise<Setup> => {
  const setup = await testRender(
    () => (
      <box width={WIDTH} height={HEIGHT} flexDirection="column">
        <RunStatusIcon
          status={status}
          {...(options?.note === undefined ? {} : { note: options.note })}
          {...(options?.frame === undefined ? {} : { frame: options.frame })}
        />
      </box>
    ),
    { width: WIDTH, height: HEIGHT },
  );
  await setup.renderOnce();
  setups.push(setup);
  return setup;
};

const frameText = (setup: Setup): string => setup.captureCharFrame();

describe('runStatusColor', () => {
  test('maps every status onto a semantic colour', () => {
    expect(runStatusColor('running')).toBe(palette.accent);
    expect(runStatusColor('awaiting-input')).toBe(palette.warn);
    expect(runStatusColor('done')).toBe(palette.good);
    expect(runStatusColor('failed')).toBe(palette.bad);
    expect(runStatusColor('cancelled')).toBe(palette.dim);
    expect(runStatusColor('weird')).toBe(palette.dim);
  });
});

describe('RunStatusIcon', () => {
  test('a running run shows the injected spinner frame beside the status', async () => {
    const frame = frameText(await renderBadge('running', { note: 'live', frame: 3 }));
    expect(frame).toContain(LOADER_FRAMES[3] ?? '');
    expect(frame).toContain('running');
    expect(frame).toContain('live');
  });

  test('a parked run shows its marker and the waiting note', async () => {
    const frame = frameText(
      await renderBadge('awaiting-input', { note: 'waiting for your answer', frame: 0 }),
    );
    expect(frame).toContain('◐');
    expect(frame).toContain('awaiting-input');
    expect(frame).toContain('waiting for your answer');
  });

  test('a settled run shows its marker with no note', async () => {
    const frame = frameText(await renderBadge('done', { frame: 0 }));
    expect(frame).toContain('✓');
    expect(frame).toContain('done');
    expect(frame).not.toContain('·');
  });

  test('an omitted frame advances the spinner on the raw interval', async () => {
    const setup = await renderBadge('running');
    expect(frameText(setup)).toContain(LOADER_FRAMES[0] ?? '');
    // The badge ticks on a raw interval, so observing a live frame needs real
    // elapsed time. Three ticks leave margin against timer jitter.
    // oxlint-disable-next-line montflow/no-timers -- the interval under test is raw by design.
    await new Promise((resolve) => setTimeout(resolve, FRAME_MS * 3));
    await setup.renderOnce();
    expect(frameText(setup)).not.toContain(LOADER_FRAMES[0] ?? '');
  });
});
