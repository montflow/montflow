import type { DialogSize } from '../interaction/index.js';

/** An element handed to the host dialog; the adapter never inspects its shape. */
export type ViewOutput = object | null | undefined;

/** Presentation the host gives a plugin panel. */
export type PanelPresentation = 'panel' | 'fullscreen';

/** The panel this plugin opened, as the host reports it. */
export interface OpenPanel {
  readonly name: string;
  readonly sessionID: string;
}

/** The slice of the host TUI UI `CustomViewPort` needs. */
export interface ViewUi {
  readonly dialog: {
    show(render: () => ViewOutput, onClose?: () => void): void;
    set(options: { readonly size?: DialogSize | undefined; readonly centered?: boolean }): void;
    clear(): void;
  };
  readonly panel: {
    open(name: string, options?: { readonly presentation?: PanelPresentation }): boolean;
    close(): void;
    current(): OpenPanel | undefined;
  };
}

/** The slice of the host TUI context `CustomViewPort` needs. */
export interface ViewContext {
  readonly ui?: ViewUi | undefined;
}

/** Options for a host-rendered overlay. */
export interface CustomViewOptions {
  readonly size?: DialogSize;
  readonly centered?: boolean;
}

/**
 * Custom JSX seam for TUI plugins: the host owns the dialog chrome and the
 * input scope, the plugin only supplies the element. `panel` claims the
 * `session.panel` slot for fullscreen in-session views.
 */
export interface CustomViewPort {
  readonly show: (render: () => ViewOutput, options?: CustomViewOptions) => void;
  readonly clear: () => void;
  readonly panel: {
    readonly open: (
      name: string,
      options?: { readonly presentation?: PanelPresentation },
    ) => boolean;
    readonly close: () => void;
    readonly current: () => OpenPanel | undefined;
  };
}

const unavailable = (): Error =>
  new Error('CustomViewPort requires a TUI plugin context (ctx.ui.dialog / ctx.ui.panel)');

/** Build the custom-view seam over the host TUI UI. */
export const makeCustomViewPort = (context: ViewContext): CustomViewPort => {
  const ui = context.ui;

  return {
    show: (render, options) => {
      if (ui === undefined) throw unavailable();
      ui.dialog.show(render);
      if (options !== undefined) {
        ui.dialog.set({ size: options.size, centered: options.centered ?? false });
      }
    },
    clear: () => {
      if (ui === undefined) throw unavailable();
      ui.dialog.clear();
    },
    panel: {
      open: (name, options) => (ui === undefined ? false : ui.panel.open(name, options)),
      close: () => {
        if (ui === undefined) throw unavailable();
        ui.panel.close();
      },
      current: () => ui?.panel.current(),
    },
  };
};
