import { formatKeybinds, type Keybind } from './keybinds.js';
import { palette } from './palette.js';

export interface KeybindBannerProps {
  readonly items: ReadonlyArray<Keybind>;
}

/**
 * One-line keybind footer: structured entries rendered in the panel dim
 * style. Chromeless row — the caller owns spacing and pinning.
 * @param props - banner entries in display order
 * @returns banner element
 */
export const KeybindBanner = (props: KeybindBannerProps) => (
  <text style={{ fg: palette.dim }}>{formatKeybinds(props.items)}</text>
);
