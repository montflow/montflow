import { createSignal, onCleanup } from 'solid-js';
import { palette } from './palette.js';

/**
 * Loader stage. `extension` covers the lazy runtime import;
 * `skills` covers the skill-list read that follows it; `profiles`
 * covers the profile-list read; `prompts` covers the prompt-list read;
 * `runs` covers the run-list read; `installing` covers the store
 * install. One variant per loading stage so the panel can narrate boot
 * step by step.
 */
export type LoaderVariant = 'extension' | 'skills' | 'profiles' | 'prompts' | 'runs' | 'installing';

/** One-line copy per loader stage. */
export const LOADER_MESSAGES = {
  extension: 'Loading Extension…',
  skills: 'Loading Skills…',
  profiles: 'Loading Profiles…',
  prompts: 'Loading Prompts…',
  runs: 'Loading Runs…',
  installing: 'Installing skills…',
} satisfies Record<LoaderVariant, string>;

/** Braille spinner frames, cycled on a raw interval. */
export const LOADER_FRAMES: ReadonlyArray<string> = [
  '⠋',
  '⠙',
  '⠹',
  '⠸',
  '⠼',
  '⠴',
  '⠦',
  '⠧',
  '⠇',
  '⠏',
];

/** Spinner tick: fast enough to feel alive, slow enough to stay legible. */
export const FRAME_MS = 80;

export interface LoaderProps {
  readonly variant: LoaderVariant;
  readonly message?: string | undefined;
  /** Fixed frame index. Set in tests for a deterministic snapshot. */
  readonly frame?: number | undefined;
}

/**
 * Centered loading state: animated braille spinner beside the stage
 * copy. Chromeless — the parent `Panel` owns border, title, and
 * padding — and shape-compatible with `PanelMessage` (same growing
 * column, same reserved hint line) so swapping a loader for content
 * never shifts the grid. The interval is raw: Effect Clock fibers never
 * resolve inside the OpenTUI render loop.
 * @param props - stage variant, optional message override, optional fixed frame
 * @returns loader element
 */
export const Loader = (props: LoaderProps) => {
  const [frame, setFrame] = createSignal(props.frame ?? 0);
  if (props.frame === undefined) {
    // oxlint-disable-next-line montflow/no-timers -- documented above: Effect Clock hangs here.
    const timer = setInterval(() => {
      setFrame((index) => (index + 1) % LOADER_FRAMES.length);
    }, FRAME_MS);
    onCleanup(() => {
      // oxlint-disable-next-line montflow/no-timers -- spinner teardown for the raw interval above.
      clearInterval(timer);
    });
  }
  return (
    <box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center" gap={1}>
      <text style={{ fg: palette.accent }}>
        {`${LOADER_FRAMES[frame() % LOADER_FRAMES.length]} ${props.message ?? LOADER_MESSAGES[props.variant]}`}
      </text>
      <text> </text>
    </box>
  );
};
