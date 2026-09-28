/** @jsxImportSource @opentui/solid */
import { testRender } from '@opentui/solid';
import { QueryClientProvider } from '@tanstack/solid-query';
import type { QueryClient } from '@tanstack/solid-query';
import { afterEach, describe, test } from 'bun:test';
import { Query } from '../../services/index.js';
import { FRAME_MS, LOADER_FRAMES } from '../loader.js';
import { ProfileVerifyIcon } from '../profile-verify-icon.js';

type Setup = Awaited<ReturnType<typeof testRender>>;

const setups: Array<Setup> = [];

afterEach(() => {
  for (const setup of setups.splice(0)) setup.renderer.destroy();
});

const WIDTH = 20;
const HEIGHT = 3;

/** Render one icon state inside the same query client the app uses. */
const renderIcon = async (client: QueryClient, id: string, frame?: number): Promise<Setup> => {
  const setup = await testRender(
    () => (
      <QueryClientProvider client={client}>
        <box width={WIDTH} height={HEIGHT} flexDirection="column">
          <ProfileVerifyIcon root="/tmp/workspace-profile-verify" id={id} frame={frame} />
        </box>
      </QueryClientProvider>
    ),
    { width: WIDTH, height: HEIGHT },
  );
  await setup.renderOnce();
  setups.push(setup);
  return setup;
};

const frameText = (setup: Setup): string => setup.captureCharFrame();

/** Boolean assertion with a label (bun:test `expect` takes no message argument). */
const check = (actual: boolean, label: string): void => {
  if (!actual) throw new Error(`ProfileVerifyIcon: ${label}`);
};

describe('ProfileVerifyIcon', () => {
  test('pending shows the injected braille frame', async () => {
    const client = Query.makeQueryClient();
    void client.prefetchQuery({
      queryKey: Query.profileVerifyKey('pending'),
      queryFn: () => new Promise(() => undefined),
      staleTime: Number.POSITIVE_INFINITY,
    });
    check(
      frameText(await renderIcon(client, 'pending', 3)).includes(LOADER_FRAMES[3] ?? ''),
      'frame 3',
    );
  });

  test('valid result shows the success glyph', async () => {
    const client = Query.makeQueryClient();
    client.setQueryData(Query.profileVerifyKey('good'), { valid: true, issues: [] });
    const frame = frameText(await renderIcon(client, 'good', 0));
    check(frame.includes('✓'), 'success glyph');
    check(!frame.includes('✗'), 'no error glyph');
  });

  test('invalid result shows the error glyph with the issue count', async () => {
    const client = Query.makeQueryClient();
    client.setQueryData(Query.profileVerifyKey('bad'), {
      valid: false,
      issues: [
        { field: 'name', message: 'bad slug' },
        { field: 'body', message: 'missing checklist' },
      ],
    });
    const frame = frameText(await renderIcon(client, 'bad', 0));
    check(frame.includes('✗ 2'), 'issue count');
    check(!frame.includes('✓'), 'no success glyph');
  });

  test('an omitted frame advances the spinner on the raw interval', async () => {
    const client = Query.makeQueryClient();
    void client.prefetchQuery({
      queryKey: Query.profileVerifyKey('animated'),
      queryFn: () => new Promise(() => undefined),
      staleTime: Number.POSITIVE_INFINITY,
    });
    const setup = await renderIcon(client, 'animated');
    check(frameText(setup).includes(LOADER_FRAMES[0] ?? ''), 'frame 0 first');
    // The icon ticks on a raw interval, so observing a live frame needs real
    // elapsed time. Three ticks leave margin against timer jitter.
    // oxlint-disable-next-line montflow/no-timers -- the interval under test is raw by design.
    await new Promise((resolve) => setTimeout(resolve, FRAME_MS * 3));
    await setup.renderOnce();
    check(!frameText(setup).includes(LOADER_FRAMES[0] ?? ''), 'advanced past frame 0');
  });
});
