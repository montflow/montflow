import { Text } from '@earendil-works/pi-tui';
import { Color, Format } from '@montflow/format';
import * as Widget from '../widget/index.js';

/**
 * Bold title line with a foreground color: compiles the text through `Format`
 * (bold + color), wraps it in a padded `Text` block, and lifts it into a
 * {@link Widget.Widget} handle — compose with `Widget.add` and finish with
 * `Widget.compile` at the `ui.custom` boundary.
 * @param text - title text to format
 * @param color - foreground color, defaults to cyan
 * @returns the formatted title as a composable widget handle
 */
export const make = (text: string, color: Color.Color = Color.cyan()): Widget.Widget =>
  Widget.make(
    new Text(Format.make(text).pipe(Format.bold, Format.color(color), Format.compile), 1, 0),
  );
