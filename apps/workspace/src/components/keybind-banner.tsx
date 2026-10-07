import { formatKeybinds, type Keybind } from './keybinds.js';
import { palette } from './palette.js';

export interface KeybindBannerProps {
  readonly items: ReadonlyArray<Keybind>;
}

/**
 * One-line keybind footer: structured entries rendered in the panel dim
 * style. Chromeless row — the caller owns spacing and pinning. The text
 * never wraps (`wrapMode="none"`): the caller reserves exactly one line
 * for it, so an over-long banner must clip against its row instead of
 * spilling the panel content onto the border.
 * @param props - banner entries in display order
 * @returns banner element
 */
export const KeybindBanner = (props: KeybindBannerProps) => (
  <text style={{ fg: palette.dim }} wrapMode="none">
    {formatKeybinds(props.items)}
  </text>
);
