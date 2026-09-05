import { Pipeable } from 'effect';
import { dual } from 'effect/Function';

import * as Color from '../../structs/color/index.js';

const wrap = (code: number, text: string): string => `\x1b[${code}m${text}\x1b[0m`;

const ESCAPE_CHARACTER = '\u001b';
const ANSI_PATTERN = new RegExp(`${ESCAPE_CHARACTER}\\[[0-9;]*m`, 'g');

const FormatBase = class {
  readonly _tag = 'Format' as const;

  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }
};

/**
 * Immutable value holding formatted text. Pipe {@link make}-created instances
 * through the transforms in this module and finish with {@link compile} to
 * render the ANSI-escaped string, e.g.
 * `Format.make("start").pipe(Format.bold, Format.color(Color.black()), Format.compile)`.
 */
export const Format = Pipeable.Mixin(FormatBase);
export type Format = InstanceType<typeof Format>;

/** Creates a `Format` from the given text. */
export const make = (value: string): Format => new Format(value);

/** Applies ANSI bold to the formatted text. */
export const bold = (self: Format): Format => new Format(wrap(1, self.value));

/** Applies the given ANSI foreground color to the formatted text. Accepts a
 * branded `Color` or a plain `Label`.
 *
 * Dual API — call it curried inside `pipe` or directly with both arguments:
 * `Format.color("red")(fmt)` / `Format.color(fmt, "red")`. */
export const color: {
  (input: Color.Input): (self: Format) => Format;
  (self: Format, input: Color.Input): Format;
} = dual(
  2,
  (self: Format, input: Color.Input): Format =>
    new Format(wrap(Color.code(Color.makeUnsafe(input)), self.value)),
);

/** Renders the formatted text as a plain string. */
export const compile = (self: Format): string => self.value;

/** Removes ANSI escape sequences from the text, e.g. for non-terminal consumers. */
export const stripAnsi = (text: string): string => text.replace(ANSI_PATTERN, '');
