import { Schema } from 'effect';

/**
 * Workspace info: the current working directory plus its git state.
 * The git-info service reads git; this module stays pure.
 */
export class Info extends Schema.Class<Info>('WorkspaceInfo')({
  name: Schema.String,
  root: Schema.String,
  branch: Schema.String,
  clean: Schema.Boolean,
}) {}

/** Decode untrusted input into an `Info`. */
export const decodeUnknown = Schema.decodeUnknownEffect(Info);

/**
 * Build workspace info from plain parts.
 * @param input - name, root, branch, and cleanliness
 * @returns the info
 */
export const make = (input: {
  readonly name: string;
  readonly root: string;
  readonly branch: string;
  readonly clean: boolean;
}): Info => Info.make(input);

/**
 * Last path segment: `/home/daniel/dev/montflow/main` reads `main`.
 * @param root - absolute directory path
 * @returns display name
 */
export const basename = (root: string): string => {
  const trimmed = root.endsWith('/') && root.length > 1 ? root.slice(0, -1) : root;
  const index = trimmed.lastIndexOf('/');
  return index === -1 ? trimmed : trimmed.slice(index + 1);
};

/**
 * One-line summary, e.g. `main @ main ✓` or `main @ dev ✗`.
 * @param info - workspace info
 * @returns summary line
 */
export const summarize = (info: Info): string =>
  `${info.name} @ ${info.branch} ${info.clean ? '✓' : '✗'}`;

/**
 * Dashboard title line for the info.
 * @param info - workspace info
 * @returns title line
 */
export const title = (info: Info): string => `Workspace — ${summarize(info)}`;
