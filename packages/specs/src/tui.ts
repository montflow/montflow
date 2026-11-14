// oxlint-disable-next-line montflow/no-node-platform-imports -- this TUI entry is the composition root for its plugin store.
import { access, readdir } from 'node:fs/promises';
// oxlint-disable-next-line montflow/no-node-platform-imports -- the TUI entry resolves its store path during host setup.
import path from 'node:path';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import type { TuiPlugin } from '@montflow/opencode';
import { registerPicker } from '@montflow/opencode/tui';
import { Effect, Layer } from 'effect';
import { type PhaseView, status, storeDirOf } from './apps/cli/index.js';
import { SpecStore } from './services/index.js';
import { ID, COMMAND_NAME } from './server.js';

/** Specs directory segments. */
const SPECS_DIR = ['.agents', '@montflow', 'specs'] as const;

/** Platform services the status engine's file-backed store needs. */
const Platform = Layer.merge(NodeFileSystem.layer, NodePath.layer);

/** The live store, with its platform dependencies hidden. */
const Live = Layer.merge(Layer.provide(SpecStore.Default, Platform), NodeFileSystem.layer);

/** One pickable spec and the derived state the picker previews. */
export interface SpecEntry {
  readonly name: string;
  /** Derived lifecycle state, or `unreadable` when SPEC.md does not parse. */
  readonly state: string;
  /** Active phase: the first unlocked phase with unfinished work. */
  readonly phase: string | undefined;
  /** Derived locks; never a stored list. */
  readonly locked: ReadonlyArray<string>;
  /** Per-phase `PHASE.md` review/gate records, when the store is v2. */
  readonly reviews: ReadonlyArray<PhaseView>;
}

/** The state preview for one picker row. */
export const describeSpec = (entry: SpecEntry): string => {
  const parts: Array<string> = [entry.state];
  parts.push(entry.phase === undefined ? 'phase none' : `phase ${entry.phase}`);
  parts.push(entry.locked.length === 0 ? 'locked none' : `locked ${entry.locked.join(',')}`);
  if (entry.reviews.length > 0) {
    parts.push(
      `review ${entry.reviews.map((phase) => `${phase.phase}:${phase.review}`).join(',')}`,
    );
  }
  return parts.join(' \u00b7 ');
};

/** Read one spec through the same engine the binary uses. */
const readSpec = async (directory: string, name: string): Promise<SpecEntry> => {
  const report = await status(storeDirOf(directory), name).pipe(
    Effect.provide(Live),
    Effect.catchCause(() => Effect.succeed(undefined)),
    Effect.runPromise,
  );
  if (report === undefined)
    return { name, state: 'unreadable', phase: undefined, locked: [], reviews: [] };
  return {
    name,
    state: report.state?.state ?? 'unreadable',
    phase: report.state?.phases.find((phase) => !phase.locked && phase.complete < phase.total)
      ?.phase,
    locked: (report.state?.phases ?? [])
      .filter((phase) => phase.locked)
      .map((phase) => phase.phase),
    reviews: (report.phases ?? []).filter((phase) => phase.review !== undefined),
  };
};

/**
 * List the spec directories under `<workspace>/.agents/@montflow/specs`.
 * A spec is exactly a directory holding `SPEC.md`; phase and task directories
 * never qualify, so the picker can never offer one as a spec. The selected
 * entry forwards its `name` unchanged.
 * @param directory - workspace root
 * @returns spec entries, sorted by name
 */
export const loadSpecs = async (directory: string): Promise<ReadonlyArray<SpecEntry>> => {
  const root = path.join(directory, ...SPECS_DIR);
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const names = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const marker = path.join(root, entry.name, 'SPEC.md');
        const present = await access(marker).then(
          () => true,
          () => false,
        );
        return present ? entry.name : undefined;
      }),
  );
  const specs = await Promise.all(
    names
      .filter((name): name is string => name !== undefined)
      .toSorted()
      .map((name) => readSpec(directory, name)),
  );
  return specs;
};

export default {
  id: ID,
  setup: (context: any) => {
    registerPicker(context, {
      commandName: COMMAND_NAME,
      title: 'Specs',
      description: 'Pick a spec',
      group: 'Specs',
      loadItems: loadSpecs,
      formatItem: (spec: SpecEntry) => ({
        title: spec.name,
        value: spec,
        description: describeSpec(spec),
      }),
      getInsertText: (spec: SpecEntry) => spec.name,
      forwardNonListToServer: true,
      prepareForward: async (args, pickerContext) => {
        if (!/^execute(?:\s|$)/u.test(args) || /(?:^|\s)--mode(?:\s|=|$)/u.test(args)) {
          return args;
        }
        const mode = await pickerContext.ui.dialog.select({
          title: 'Execution mode',
          placeholder: 'How should the orchestrator act?',
          options: [
            {
              title: 'Guided',
              value: 'guided',
              description: 'Ask whenever a decision benefits from the human.',
            },
            {
              title: 'Autonomous',
              value: 'autonomous',
              description: 'Ask only for destructive, dangerous, or undecidable calls.',
            },
          ],
        });
        return mode === undefined ? undefined : `${args} --mode ${mode}`;
      },
    });
    return () => {};
  },
} satisfies TuiPlugin;
