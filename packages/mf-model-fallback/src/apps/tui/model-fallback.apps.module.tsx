/** @jsxImportSource @opentui/solid */
import type { TuiPorts } from '@montflow/opencode';
import { Effect } from 'effect';
import { ModelCatalog } from '../../modules/index.js';
import * as Engines from '../cli/engines.apps.module.js';

/** Longest chain the picker builds in one pass. */
const MAX_CHAIN = 4;

/** Summary shown in the host dialog. */
interface Outcome {
  readonly title: string;
  readonly lines: ReadonlyArray<string>;
}

/** Run a host-side effect from the dialog flow. */
const run = <A, E>(effect: Effect.Effect<A, E>): Promise<A> => effect.pipe(Effect.runPromise);

const contextLabel = (tokens: number): string =>
  tokens >= 1000 ? `${Math.round(tokens / 1000)}k ctx` : `${tokens} ctx`;

const costLabel = (usd: number): string => `$${usd.toFixed(2)}/M out`;

const Modal = (props: { readonly outcome: Outcome }) => (
  <box flexDirection="column">
    <text>
      <span style={{ fg: '#ffffff' }}>{props.outcome.title}</span>
    </text>
    {props.outcome.lines.map((line) => (
      <text>{line}</text>
    ))}
    <text>
      <span style={{ fg: '#767676' }}>esc closes</span>
    </text>
  </box>
);

const present = (ports: TuiPorts, outcome: Outcome): void => {
  ports.view.show(() => <Modal outcome={outcome} />, { size: 'large', centered: true });
};

const reasonOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const pick = async (ports: TuiPorts): Promise<void> => {
  const preferences = await run(ModelCatalog.preferences());
  const candidates = await run(ModelCatalog.load({ directory: ports.cwd }));
  const ranked = ModelCatalog.rank(candidates, preferences);
  const picked: Array<string> = [];

  for (let step = 0; step < MAX_CHAIN; step += 1) {
    const title = step === 0 ? 'Primary model' : `Fallback ${step}`;
    const options = ranked
      .filter((candidate) => !picked.includes(candidate.label))
      .map((candidate) => ({
        title: `${candidate.label} — ${candidate.name}${candidate.status === 'deprecated' ? ' (deprecated)' : ''}`,
        value: candidate.label,
        description: `${contextLabel(candidate.context)} · ${costLabel(candidate.outputCost)}`,
      }));
    // eslint-disable-next-line no-await-in-loop -- each pick depends on the previous selection.
    const choice = await run(
      ports.interaction.select({
        title,
        options: [...options, { title: step === 0 ? 'Cancel' : 'Done', value: '' }],
      }),
    );
    if (choice === undefined || choice === '') break;
    picked.push(choice);
  }

  if (picked.length === 0) return;
  const written = await run(
    Engines.set({ cwd: ports.cwd }, { chain: picked, triggers: undefined, allowUnknown: false }),
  );
  present(ports, {
    title: `${written.changed ? 'Updated' : 'Unchanged'} ${written.path}`,
    lines: [
      ...written.chain.map((ref, index) => `${index + 1}. ${ref.providerID}/${ref.id}`),
      `triggers: ${written.triggers.join(', ')}`,
    ],
  });
};

const show = async (ports: TuiPorts): Promise<void> => {
  const result = await run(Engines.status({ cwd: ports.cwd }));
  const lines =
    result.chain.length === 0
      ? ['Not configured yet.', 'Pick a chain to start.']
      : [
          ...result.chain.map((ref, index) => `${index + 1}. ${ref.providerID}/${ref.id}`),
          `triggers: ${result.triggers.join(', ')}`,
          `source: ${result.source}`,
        ];
  present(ports, {
    title: result.ok ? result.path : `${result.path} (invalid)`,
    lines: [...lines, ...result.issues.map((issue) => `✗ ${issue.field}: ${issue.message}`)],
  });
};

const remove = async (ports: TuiPorts): Promise<void> => {
  const confirmed = await run(
    ports.interaction.confirm({
      title: 'Remove the model fallback chain?',
      message: 'The store file is deleted and legacy opencode.jsonc options are cleared.',
    }),
  );
  if (confirmed !== true) return;
  const removed = await run(Engines.remove({ cwd: ports.cwd }));
  present(ports, {
    title: removed.changed ? `Removed ${removed.path}` : `Nothing to remove in ${removed.path}`,
    lines: removed.cleared ? ['Cleared legacy opencode.jsonc options.'] : [],
  });
};

const open = async (ports: TuiPorts): Promise<void> => {
  try {
    const action = await run(
      ports.interaction.select({
        title: 'Model fallback',
        options: [
          { title: 'Show the current chain', value: 'show' },
          { title: 'Pick a new chain', value: 'pick' },
          { title: 'Remove the chain', value: 'remove' },
        ],
      }),
    );
    if (action === 'show') return await show(ports);
    if (action === 'pick') return await pick(ports);
    if (action === 'remove') return await remove(ports);
  } catch (cause) {
    await run(
      ports.interaction.alert({ title: 'Model fallback failed', message: reasonOf(cause) }),
    );
  }
};

/**
 * Always-mounted `/mf-fallback` contribution. It renders nothing; the host
 * owns the dialog chrome and the keymap lifetime is tied to this component.
 */
export const Command = (props: { readonly ports: TuiPorts }) => {
  props.ports.grid.keymapLayer(() => ({
    mode: 'global',
    commands: [
      {
        id: 'model-fallback.open',
        title: 'Configure model fallbacks',
        description: 'Show, set, or remove the model fallback chain for this workspace',
        group: 'Model fallback',
        slash: { name: 'mf-fallback' },
        run: () => open(props.ports),
      },
    ],
  }));
  return null;
};
