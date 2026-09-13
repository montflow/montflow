import { TextAttributes } from '@opentui/core';
import { For, Show } from 'solid-js';
import { palette } from './palette.js';

/**
 * Toast variant, mirroring opencode's `ToastOptions["variant"]`
 * (`packages/tui/src/ui/toast.tsx`): info for notices, success for
 * completed writes, warning for stubs/missing pieces, error for defects.
 */
export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

/** Input for one toast: message plus opencode-style options. */
export interface ToastInput {
  readonly message: string;
  readonly title?: string;
  readonly variant?: ToastVariant;
  readonly duration?: number;
}

/** One visible toast: id for expiry plus resolved display fields. */
export interface Toast {
  readonly id: number;
  readonly message: string;
  readonly title: string | undefined;
  readonly variant: ToastVariant;
  readonly duration: number;
}

export interface ToastStackProps {
  readonly toasts: ReadonlyArray<Toast>;
}

/** Variant accent color: info/success/error reuse the palette, warning is Tokyo-Night yellow. */
const variantColor = (variant: ToastVariant): string => {
  switch (variant) {
    case 'success':
      return palette.good;
    case 'warning':
      return '#e0af68';
    case 'error':
      return palette.bad;
    default:
      return palette.accent;
  }
};

/**
 * Bottom-anchored toast stack: every Effect defect, load failure, or
 * flow notice in the app lands here instead of panicking the TUI or
 * failing silent. Empty renders nothing — the caller always mounts it.
 * Opencode parity: optional bold title plus a variant-colored accent,
 * max three stacked (the caller caps), each expiring on its own timer.
 * @param props - current toasts, oldest first
 * @returns stacked toast lines element
 */
export const ToastStack = (props: ToastStackProps) => (
  <box
    position="absolute"
    left={0}
    right={0}
    bottom={1}
    flexDirection="column"
    justifyContent="center"
    alignItems="center"
  >
    <For each={props.toasts}>
      {(toast) => (
        <box backgroundColor={palette.highlight} paddingLeft={1} paddingRight={1}>
          <Show when={toast.title} fallback={undefined}>
            <text
              attributes={TextAttributes.BOLD}
              fg={variantColor(toast.variant)}
            >{`${toast.title}: `}</text>
          </Show>
          <text fg={variantColor(toast.variant)}>{toast.message}</text>
        </box>
      )}
    </For>
  </box>
);
