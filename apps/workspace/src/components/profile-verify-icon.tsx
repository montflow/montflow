/** @jsxImportSource @opentui/solid */
import { createQuery } from '@tanstack/solid-query';
import { createSignal, onCleanup } from 'solid-js';
import { Query } from '../services/index.js';
import type { ProfileVerify } from '../services/profiles/index.js';
import { FRAME_MS, LOADER_FRAMES } from './loader.js';
import { palette } from './palette.js';

export interface ProfileVerifyIconProps {
  readonly root: string;
  readonly id: string;
  /** Fixed spinner frame index. Set in tests for a deterministic snapshot. */
  readonly frame?: number | undefined;
}

/**
 * Verification glyph for one query state: the braille spinner while
 * pending, `✓` when valid, `✗ n` with the issue count when invalid, and
 * `✗ ?` when the check itself could not run (unknown or unreadable id).
 * @param pending - query still loading
 * @param result - resolved verify result, if any
 * @param frame - spinner frame index
 * @returns one-cell verification glyph
 */
export const verifyGlyph = (
  pending: boolean,
  result: ProfileVerify | undefined,
  frame: number,
): string => {
  if (pending) return LOADER_FRAMES[frame % LOADER_FRAMES.length] ?? '⠋';
  if (result === undefined) return '✗ ?';
  return result.valid ? '✓' : `✗ ${result.issues.length}`;
};

/**
 * Palette colour for one verification state: accent while loading, good
 * when valid, bad otherwise.
 * @param pending - query still loading
 * @param result - resolved verify result, if any
 * @returns palette colour
 */
export const verifyColor = (pending: boolean, result: ProfileVerify | undefined): string => {
  if (pending) return palette.accent;
  return result?.valid === true ? palette.good : palette.bad;
};

/**
 * Per-row profile-verification glyph: pending shows the animated braille
 * spinner (same frames and cadence as the runs-panel markers), resolved
 * shows `✓` when valid or `✗ n` with the issue count when invalid. Owns
 * the `createQuery` keyed by `['profile-verify', id]` — the client is
 * cache-first, so revisiting a profile reuses its cached result. The
 * interval is raw: Effect Clock fibers never resolve inside the OpenTUI
 * render loop, mirroring `RunsPanel` and `Loader`.
 * @param props - workspace root, profile slug, optional fixed frame
 * @returns verification glyph element
 */
export const ProfileVerifyIcon = (props: ProfileVerifyIconProps) => {
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
  const verify = createQuery(() => ({
    queryKey: Query.profileVerifyKey(props.id),
    queryFn: () => Query.fetchProfileVerify(props.root, props.id),
  }));
  return (
    <text style={{ fg: verifyColor(verify.isPending, verify.data) }}>
      {verifyGlyph(verify.isPending, verify.data, frame())}
    </text>
  );
};
