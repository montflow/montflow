/** @jsxImportSource @opentui/solid */
import { makeTuiPorts, type KeymapLayer, type TuiPortsContext } from '@montflow/opencode/tui';
import { testRender } from '@opentui/solid';
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pageRenderer } from '../../grid-page.js';
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
const makeContext = (directory: string) => {
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
        select: async () => undefined,
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

const renderPage = async (layout: Dashboard.Layout) => {
  const root = await mkdtemp(path.join(tmpdir(), 'montflow-workspace-'));
  roots.push(root);
  const { context, layers } = makeContext(root);
  const ports = makeTuiPorts(context);
  const focus = ports.storage.store('workspace', {
    initial: { panel: Dashboard.firstPanel(layout) },
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
  return { setup, layers };
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
    expect(ids).toContain('workspace.open');
    expect(ids).toContain('workspace.refresh');
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
