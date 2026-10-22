/**
 * An element handed to the host for rendering. The adapter never inspects
 * its shape; `null`/`undefined` are the portable "renders nothing" values.
 */
export type RenderOutput = object | null | undefined;

/** Route payload a plugin page receives; flat scalars only, never host objects. */
export type PageData = Readonly<Record<string, string>>;

/**
 * A route the host knows how to render. Plugin routes carry the registered
 * page name; `id` is host-owned and only present when reading the current
 * route back, so navigation never needs it.
 */
export type Route =
  | { readonly type: 'home' }
  | { readonly type: 'session'; readonly sessionID: string }
  | {
      readonly type: 'plugin';
      readonly id?: string;
      readonly name: string;
      readonly data?: PageData;
    };

/** What a plugin may navigate to. */
export type Destination = Route;

/** One page a plugin registers with the host router. */
export interface PageDefinition {
  readonly name: string;
  readonly render: () => RenderOutput;
}

/** Absolute slot paths a page contribution may target. */
export type SlotPath =
  | 'app'
  | 'home.footer'
  | 'home.footer.status'
  | 'prompt.footer'
  | 'prompt.footer.status'
  | 'prompt.footer.file'
  | 'session.composer.top'
  | 'session.panel'
  | 'sidebar.content'
  | 'sidebar.footer';

/**
 * One slot claim. Exactly one placement key is set, matching the host's
 * mutually exclusive claim variants; `render` receives the slot's input,
 * which this seam deliberately erases — a plugin reads the input through its
 * own page state, and an erased input keeps the seam from re-declaring the
 * host's whole slot map.
 */
export type SlotClaim = {
  readonly render: () => RenderOutput;
} & (
  | {
      readonly prepend: SlotPath;
      readonly append?: never;
      readonly before?: never;
      readonly after?: never;
      readonly replace?: never;
    }
  | {
      readonly prepend?: never;
      readonly append: SlotPath;
      readonly before?: never;
      readonly after?: never;
      readonly replace?: never;
    }
  | {
      readonly prepend?: never;
      readonly append?: never;
      readonly before: SlotPath;
      readonly after?: never;
      readonly replace?: never;
    }
  | {
      readonly prepend?: never;
      readonly append?: never;
      readonly before?: never;
      readonly after: SlotPath;
      readonly replace?: never;
    }
  | {
      readonly prepend?: never;
      readonly append?: never;
      readonly before?: never;
      readonly after?: never;
      readonly replace: SlotPath;
    }
);

/** One bindable page command. Mirrors the host keymap command shape. */
export interface KeymapCommand {
  readonly id?: string;
  readonly title?: string;
  readonly description?: string;
  readonly group?: string;
  readonly enabled?: boolean | (() => boolean);
  readonly bind?: false | string;
  readonly palette?: true;
  readonly slash?: {
    readonly name: string;
    readonly aliases?: ReadonlyArray<string>;
    readonly arguments?: true;
  };
  readonly suggested?: boolean | (() => boolean);
  readonly run: (input?: string) => void | false | Promise<void>;
}

/** One keymap layer owned by the calling page component. */
export interface KeymapLayer {
  readonly mode?: string;
  readonly enabled?: boolean | (() => boolean);
  readonly priority?: number;
  readonly commands?: ReadonlyArray<KeymapCommand>;
  readonly bindings?: ReadonlyArray<string>;
}

/** The slice of the host TUI context `GridPagePort` needs. */
export interface GridPageContext {
  readonly ui?:
    | {
        readonly router: {
          register(page: PageDefinition): () => void;
          navigate(destination: Destination): void;
          current(): Route;
        };
        readonly slot?: (claim: SlotClaim) => () => void;
      }
    | undefined;
  readonly keymap?:
    | {
        layer(input: () => KeymapLayer): void;
      }
    | undefined;
}

/**
 * Plugin route-page seam: one fullscreen page per plugin, a router to reach
 * it and the native routes, a slot claim for persistent chrome, and a
 * keymap layer scoped to the page.
 */
export interface GridPagePort {
  /** Register the page; the returned cleanup unregisters it. */
  readonly registerPage: (page: PageDefinition) => () => void;
  readonly navigate: (destination: Destination) => void;
  readonly current: () => Route;
  /** Claim one slot; the returned cleanup releases it. */
  readonly slot: (claim: SlotClaim) => () => void;
  /**
   * Create a keymap layer owned by the calling component. Call it from a
   * component body, never from `setup` — the host ties layer lifetime to the
   * component that created it.
   */
  readonly keymapLayer: (input: () => KeymapLayer) => void;
}

const unavailable = (): Error =>
  new Error('GridPagePort requires a TUI plugin context (ctx.ui.router)');

/** Build the route-page seam over the host TUI router, slots, and keymap. */
export const makeGridPagePort = (context: GridPageContext): GridPagePort => ({
  registerPage: (page) => {
    const router = context.ui?.router;
    if (router === undefined) throw unavailable();
    return router.register(page);
  },
  navigate: (destination) => {
    const router = context.ui?.router;
    if (router === undefined) throw unavailable();
    router.navigate(destination);
  },
  current: () => {
    const router = context.ui?.router;
    if (router === undefined) throw unavailable();
    return router.current();
  },
  slot: (claim) => {
    const slot = context.ui?.slot;
    if (slot === undefined) throw unavailable();
    return slot(claim);
  },
  keymapLayer: (input) => {
    const keymap = context.keymap;
    if (keymap === undefined) throw unavailable();
    keymap.layer(input);
  },
});
