import { Box, type Component } from '@earendil-works/pi-tui';
import * as Widget from '../widget/index.js';

/**
 * Minimal theme port the batch painter needs: background styling only.
 * The real Pi `Theme` is assignable — its `bg` accepts every `ThemeBg`,
 * including the default selection gray.
 */
export interface Theme {
  readonly bg: (color: 'selectedBg', text: string) => string;
}

/** Styling knobs for {@link box}; every knob is optional. */
export interface Style {
  /** Spaces left and right of the content. Defaults to 2. */
  readonly paddingX?: number;
  /** Blank lines above and below the content. Defaults to 1. */
  readonly paddingY?: number;
  /** Background painter. Defaults to the theme selection gray. */
  readonly background?: (text: string) => string;
}

/**
 * Padded container with a tinted background: wraps children in a `Box`
 * with gray-by-default styling. Override any knob via {@link Style}. Returns
 * a {@link Widget.Widget} handle — compose further with `Widget.add` and
 * finish with `Widget.compile` at the `ui.custom` boundary.
 * @param theme - Pi theme for the default background
 * @param children - one child or a row of children (handles or raw components) to wrap
 * @param style - padding and background overrides
 * @returns the styled container as a composable widget handle
 */
export const box = (
  theme: Theme,
  children: Widget.Widget | Component | ReadonlyArray<Widget.Widget | Component>,
  style?: Style,
): Widget.Widget => {
  const batch = new Box(
    style?.paddingX ?? 2,
    style?.paddingY ?? 1,
    style?.background ?? ((line) => theme.bg('selectedBg', line)),
  );
  for (const child of Array.isArray(children) ? children : [children])
    batch.addChild(Widget.isWidget(child) ? Widget.compile(child) : child);
  return Widget.make(batch);
};
