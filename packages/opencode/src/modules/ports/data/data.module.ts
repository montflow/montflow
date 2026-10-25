/**
 * The session fields the port projects. Every host `SessionInfo` satisfies
 * this shape, so the slice stays free of the host client schema.
 */
export interface SessionSnapshot {
  readonly id: string;
  readonly title?: string;
  readonly parentID?: string;
}

/**
 * Version-control state the host already resolved for the location. Mirrors
 * the host `VcsInfo`: `branch` is the host's branch record, not a bare name.
 */
export interface VcsSnapshot {
  readonly provider?: string;
  readonly branch: {
    readonly current?: string;
    readonly default?: string;
  };
}

/** The slice of the host TUI context `DataPort` needs. */
export interface DataContext {
  readonly data?:
    | {
        readonly session: {
          list(): ReadonlyArray<SessionSnapshot>;
          get(sessionID: string): SessionSnapshot | undefined;
          status(sessionID: string): 'idle' | 'running';
        };
        readonly location: {
          readonly vcs: {
            info(): VcsSnapshot | undefined;
          };
        };
      }
    | undefined;
}

/**
 * Client-local read facade over the host TUI data layer. Reads are plain
 * values, not Effects, because the host layer is a live store: calling a
 * read inside a Solid computation is what subscribes the view. Wrapping in
 * `Effect.sync` would silently drop that tracking.
 */
export interface DataPort {
  readonly sessions: () => ReadonlyArray<SessionSnapshot>;
  readonly session: (sessionID: string) => SessionSnapshot | undefined;
  readonly status: (sessionID: string) => 'idle' | 'running' | 'unknown';
  readonly vcs: () => VcsSnapshot | undefined;
}

/** Build the read facade over the host TUI data layer. */
export const makeDataPort = (context: DataContext): DataPort => {
  const data = context.data;

  return {
    sessions: () => data?.session.list() ?? [],
    session: (sessionID) => data?.session.get(sessionID),
    status: (sessionID) => (data === undefined ? 'unknown' : data.session.status(sessionID)),
    vcs: () => data?.location.vcs.info(),
  };
};
