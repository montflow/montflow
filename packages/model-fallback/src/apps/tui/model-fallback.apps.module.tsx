/** @jsxImportSource @opentui/solid */
import type { TuiPorts } from '@montflow/opencode';
import { Effect } from 'effect';
import { FallbackFile, FallbackTrigger, ModelCatalog, ModelChain } from '../../modules/index.js';

/** Longest chain the picker builds in one pass. */
const MAX_CHAIN = 4;

/** Run a host-side effect from the dialog flow. */
const run = <A, E>(effect: Effect.Effect<A, E>): Promise<A> => effect.pipe(Effect.runPromise);

/** Summary shown in the host dialog. */
interface Outcome {
  readonly title: string;
  readonly lines: ReadonlyArray<string>;
}

const contextLabel = (tokens: number): string =>
  tokens >= 1000 ? `${Math.round(tokens / 1000)}k ctx` : `${tokens} ctx`;

const costLabel = (usd: number): string => `$${usd.toFixed(2)}/M out`;

const chainLines = (chain: ReadonlyArray<ModelChain.Ref>): ReadonlyArray<string> =>
  chain.map((ref, index) => `${index + 1}. ${ModelChain.label(ref)}`);

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
  const chain = ModelChain.parse(picked);
  const written = await run(
    FallbackFile.write(ports.cwd, { chain, triggers: FallbackTrigger.defaults }),
  );
  present(ports, {
    title: `${written.changed ? 'Updated' : 'Unchanged'} ${written.path}`,
    lines: [...chainLines(chain), `triggers: ${FallbackTrigger.defaults.join(', ')}`],
  });
};

const show = async (ports: TuiPorts): Promise<void> => {
  const current = await run(FallbackFile.read(ports.cwd));
  present(ports, {
    title: current.path,
    lines:
      current.config.chain.length === 0
        ? ['No fallback chain configured.', 'Run /mf-fallback and pick a chain.']
        : [...chainLines(current.config.chain), `triggers: ${current.config.triggers.join(', ')}`],
  });
};

const remove = async (ports: TuiPorts): Promise<void> => {
  const confirmed = await run(
    ports.interaction.confirm({
      title: 'Remove the model fallback chain?',
      message: 'Only the model-fallback entry is removed from opencode.jsonc.',
    }),
  );
  if (confirmed !== true) return;
  const removed = await run(FallbackFile.remove(ports.cwd));
  present(ports, {
    title: removed.changed
      ? `Removed from ${removed.path}`
      : `Nothing to remove in ${removed.path}`,
    lines: [],
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
