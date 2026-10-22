/** @jsxImportSource @opentui/solid */
import {
  makeTuiPorts,
  type KeymapCommand,
  type KeymapLayer,
  type TuiPortsContext,
} from '@montflow/opencode/tui';
import { testRender } from '@opentui/solid';
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pageRenderer } from '../../grid-page.js';
import { WorkspaceCommand } from '../../contributions.js';
import { Dashboard } from '../../modules/index.js';
import { Query } from '../../services/index.js';

type Setup = Awaited<ReturnType<typeof testRender>>;

const setups: Array<Setup> = [];
const roots: Array<string> = [];

afterEach(async () => {
  for (const setup of setups.splice(0)) setup.renderer.destroy();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** A host TUI context with every seam the page reads, recording keymap layers. */
const makeContext = (directory: string, picked?: string) => {
  const layers: Array<KeymapLayer> = [];
  const navigations: Array<string> = [];
  const context: TuiPortsContext = {
    location: { directory },
    data: {
      session: {
        list: () => [{ id: 'ses_1', title: 'First' }],
        get: () => undefined,
        status: () => 'idle',
      },
      location: {
        vcs: { info: () => undefined },
        model: { list: () => [] },
      },
    },
    ui: {
      dialog: {
        // SAFETY: the page only selects string option values, and the fixture
        // pins the picked string — Value is string for every call it makes.
        select: <Value,>() => Promise.resolve(picked as Value | undefined),
        confirm: async () => false,
        prompt: async () => undefined,
        alert: async () => {},
        show: () => {},
        set: () => {},
        clear: () => {},
      },
      toast: { show: () => {} },
      router: {
        register: () => () => {},
        navigate: (destination) => navigations.push(destination.type),
        current: () => ({ type: 'home' }),
      },
      slot: () => () => {},
      panel: { open: () => false, close: () => {}, current: () => undefined },
      model: { current: () => undefined },
    },
    attention: {
      notify: async () => ({ ok: true, notification: true, sound: true }),
    },
    keymap: {
      layer: (input) => {
        layers.push(input());
      },
    },
    storage: {
      store: <Value extends object>(_key: string, options: { readonly initial: Value }) =>
        [options.initial, async () => {}] as const,
      memory: <Value extends object>(_key: string, options: { readonly initial: Value }) =>
        [options.initial, () => {}] as const,
    },
  };
  return { context, layers, navigations };
};

const WIDTH = 100;
const HEIGHT = 32;

/** Write a minimal skill store so the skills panel has rows to filter. */
const seedSkills = async (root: string, names: ReadonlyArray<string>): Promise<void> => {
  await Promise.all(
    names.map(async (name) => {
      const dir = path.join(root, '.agents', 'skills', name);
      await mkdir(dir, { recursive: true });
      await writeFile(
        path.join(dir, 'SKILL.md'),
        `---\nname: ${name}\ndescription: ${name} fixture\n---\n`,
        'utf8',
      );
    }),
  );
};

/** Render a page until its frame satisfies the predicate (queries are async). */
const settledFrame = async (
  setup: Setup,
  predicate: (frame: string) => boolean,
): Promise<string> => {
  // oxlint-disable no-await-in-loop -- sequential polling is the point: each
  // iteration renders the frame the previous await produced.
  for (let attempt = 0; attempt < 200; attempt++) {
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    if (predicate(frame)) return frame;
    // oxlint-disable-next-line montflow/no-timers -- the store read under test is async by design.
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('workspace page did not settle');
};

/** One page command from the recorded keymap layers. */
const commandOf = (layers: ReadonlyArray<KeymapLayer>, id: string): KeymapCommand => {
  const command = layers
    .flatMap((layer) => layer.commands ?? [])
    .find((candidate) => candidate.id === id);
  if (command === undefined) throw new Error(`missing command ${id}`);
  return command;
};

const renderPage = async (
  layout: Dashboard.Layout,
  options: { readonly picked?: string; readonly panel?: string; readonly skills?: boolean } = {},
) => {
  const root = await mkdtemp(path.join(tmpdir(), 'montflow-workspace-'));
  roots.push(root);
  if (options.skills === true) await seedSkills(root, ['alpha', 'beta']);
  const { context, layers, navigations } = makeContext(root, options.picked);
  const ports = makeTuiPorts(context);
  const focus = ports.storage.store('workspace', {
    initial: { panel: options.panel ?? Dashboard.firstPanel(layout) },
  });
  const setup = await testRender(
    pageRenderer({ layout, root, ports, focus, client: Query.makeQueryClient() }),
    {
      width: WIDTH,
      height: HEIGHT,
    },
  );
  await setup.renderOnce();
  setups.push(setup);
  return { setup, layers, navigations, ports };
};

describe('workspace grid page', () => {
  test('renders the configured grid and the native-session placeholder', async () => {
    const { setup } = await renderPage(Dashboard.DEFAULT_LAYOUT);
    const frame = setup.captureCharFrame();
    expect(frame).toContain('[i] Info');
    expect(frame).toContain('[s] Skills');
    expect(frame).toContain('[p] Prompts');
    expect(frame).toContain('[e] Specs');
    expect(frame).toContain('[f] Profiles');
    expect(frame).toContain('Sessions render on the native list.');
    expect(frame).toContain('workspace');
  });

  test('registers the panel keybinds and the page commands on its keymap layer', async () => {
    const { layers } = await renderPage(Dashboard.DEFAULT_LAYOUT);
    const ids = layers.flatMap((layer) => layer.commands?.map((command) => command.id) ?? []);
    expect(ids).toContain('workspace.panel.skills');
    expect(ids).toContain('workspace.panel.specs');
    expect(ids).toContain('workspace.search');
    expect(ids).toContain('workspace.row.open');
    expect(ids).toContain('workspace.refresh');
  });

  test('the page layer adds no duplicate command ids or bindings to the slot', async () => {
    const { layers, ports } = await renderPage(Dashboard.DEFAULT_LAYOUT);
    const slot = await testRender(() => <WorkspaceCommand ports={ports} />, {
      width: WIDTH,
      height: HEIGHT,
    });
    setups.push(slot);
    await slot.renderOnce();

    const commands = layers.flatMap((layer) => layer.commands ?? []);
    const ids = commands.map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
    // The always-mounted slot owns `/workspace` and ctrl+w; the page-local
    // copy opens a row instead of re-registering navigation.
    expect(ids.filter((id) => id === 'workspace.open')).toHaveLength(1);
    expect(ids.filter((id) => id === 'workspace.row.open')).toHaveLength(1);
    const bindings = commands.flatMap((command) =>
      command.bind === undefined || command.bind === false ? [] : [command.bind],
    );
    expect(bindings.filter((bind) => bind === 'ctrl+w')).toHaveLength(1);
    expect(bindings.filter((bind) => bind === 'return')).toHaveLength(1);
  });

  test('escape clears the focused panel filter before leaving the page', async () => {
    const { setup, layers, navigations } = await renderPage(Dashboard.DEFAULT_LAYOUT, {
      panel: 'skills',
      skills: true,
      picked: 'alpha',
    });
    await settledFrame(setup, (frame) => frame.includes('alpha') && frame.includes('beta'));

    const searched = commandOf(layers, 'workspace.search');
    await searched.run();
    const filtered = await settledFrame(setup, (frame) => frame.includes('/alpha'));
    expect(filtered).not.toContain('beta');
    expect(filtered).toContain('esc clear');

    const back = commandOf(layers, 'workspace.back');
    await back.run();
    const restored = await settledFrame(setup, (frame) => !frame.includes('/alpha'));
    expect(restored).toContain('beta');
    expect(restored).not.toContain('esc clear');
    // With the filter gone, the same key now advertises where it goes.
    expect(restored).toContain('esc home');
    // Clearing a filter is not a navigation: esc still never left the page.
    expect(navigations).toStrictEqual([]);
  });

  test('escape on the info panel leaves instead of clearing a hidden list filter', async () => {
    const { setup, layers, navigations } = await renderPage(Dashboard.DEFAULT_LAYOUT, {
      panel: 'skills',
      skills: true,
      picked: 'alpha',
    });
    await settledFrame(setup, (frame) => frame.includes('alpha') && frame.includes('beta'));

    await commandOf(layers, 'workspace.search').run();
    await settledFrame(setup, (frame) => frame.includes('/alpha'));

    await commandOf(layers, 'workspace.panel.info').run();
    const info = await settledFrame(setup, (frame) => frame.includes('esc home'));
    // The info panel owns no query: the hidden skills filter survives, and
    // the hint describes the key that actually runs.
    expect(info).toContain('/alpha');
    expect(info).not.toContain('esc clear');

    await commandOf(layers, 'workspace.back').run();
    expect(navigations).toStrictEqual(['home']);
  });

  test('escape on a filtered skills panel clears first, then leaves', async () => {
    const { setup, layers, navigations } = await renderPage(Dashboard.DEFAULT_LAYOUT, {
      panel: 'skills',
      skills: true,
      picked: 'alpha',
    });
    await settledFrame(setup, (frame) => frame.includes('alpha') && frame.includes('beta'));

    await commandOf(layers, 'workspace.search').run();
    const filtered = await settledFrame(setup, (frame) => frame.includes('/alpha'));
    expect(filtered).toContain('esc clear');

    const back = commandOf(layers, 'workspace.back');
    await back.run();
    const cleared = await settledFrame(setup, (frame) => frame.includes('esc home'));
    expect(cleared).not.toContain('/alpha');
    expect(navigations).toStrictEqual([]);

    await back.run();
    expect(navigations).toStrictEqual(['home']);
  });

  test('moving on the info panel leaves the hidden list highlights alone', async () => {
    const { setup, layers } = await renderPage(Dashboard.DEFAULT_LAYOUT, {
      panel: 'skills',
      skills: true,
    });
    await settledFrame(setup, (frame) => frame.includes('alpha') && frame.includes('beta'));

    const down = commandOf(layers, 'workspace.move-down');
    await down.run();
    const moved = await settledFrame(setup, (frame) => frame.includes('▸ beta'));
    expect(moved).not.toContain('▸ alpha');

    await commandOf(layers, 'workspace.panel.info').run();
    await down.run();
    await down.run();

    await commandOf(layers, 'workspace.panel.skills').run();
    const back = await settledFrame(setup, (frame) => frame.includes('▸ beta'));
    expect(back).not.toContain('▸ alpha');
  });

  test('a layout without the sessions cell renders only its own panels', async () => {
    const layout = Dashboard.DEFAULT_LAYOUT;
    const columns = layout.columns.map((column) => {
      const cells = column.cells.filter((cell) => cell.panel !== 'sessions');
      return column.width === undefined
        ? Dashboard.Column.make({ cells })
        : Dashboard.Column.make({ width: column.width, cells });
    });
    const filtered: Dashboard.Layout = Dashboard.Layout.make({ version: 2, columns });
    const { setup } = await renderPage(filtered);
    const frame = setup.captureCharFrame();
    expect(frame).not.toContain('Sessions render on the native list.');
    expect(frame).toContain('[i] Info');
  });
});
