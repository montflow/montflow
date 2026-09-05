import { Brand, Schema } from 'effect';

export const Id = 'Color';
export type Id = typeof Id;

export type Color = string & Brand.Brand<Id>;

/** The nine named ANSI foreground colors. */
export const LABELS = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'gray',
] as const;
export type Label = (typeof LABELS)[number];

const LABEL_SET: ReadonlySet<string> = new Set(LABELS);

export const check = (str: string) => (LABEL_SET.has(str) ? true : 'Invalid Color');

export const makeUnsafe = Brand.nominal<Color>();
export const make = Brand.make<Color>(check);

/** A branded `Color` or a plain `Label` — the accepted input wherever a color is needed. */
export type Input = Color | Label;

export const Blueprint = Schema.String.pipe(Schema.fromBrand(Id, make));

/** ANSI foreground code per named color. */
export const codes = {
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
  gray: 90,
} as const satisfies Readonly<Record<Label, number>>;

/** Looks up the ANSI foreground code for a branded color. */
export const code = (color: Color): number =>
  // SAFETY: the Color brand is only constructed for the nine LABELS, so every
  // branded value is a key of codes.
  codes[color as Label];

/** Black foreground color. */
export const black = (): Color => makeUnsafe('black');

/** Red foreground color. */
export const red = (): Color => makeUnsafe('red');

/** Green foreground color. */
export const green = (): Color => makeUnsafe('green');

/** Yellow foreground color. */
export const yellow = (): Color => makeUnsafe('yellow');

/** Blue foreground color. */
export const blue = (): Color => makeUnsafe('blue');

/** Magenta foreground color. */
export const magenta = (): Color => makeUnsafe('magenta');

/** Cyan foreground color. */
export const cyan = (): Color => makeUnsafe('cyan');

/** White foreground color. */
export const white = (): Color => makeUnsafe('white');

/** Gray foreground color. */
export const gray = (): Color => makeUnsafe('gray');
