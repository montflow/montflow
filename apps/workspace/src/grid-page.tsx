/** @jsxImportSource @opentui/solid */
import type { KeymapCommand, Ports, StorageHandle } from '@montflow/opencode';
import { useTerminalDimensions } from '@opentui/solid';
import type { QueryClient } from '@tanstack/solid-query';
import { QueryClientProvider, createQuery, useQueryClient } from '@tanstack/solid-query';
import { Effect } from 'effect';
import { For, Match, Show, Switch, createMemo, createSignal, type Accessor } from 'solid-js';
import {
  DetailActions,
  type DetailAction,
  InfoPanel,
  KeybindBanner,
  Keybinds,
  Loader,
  Panel,
  PanelMessage,
  ProfileDetail,
  ProfilesPanel,
  PromptDetail,
  PromptsPanel,
  SpecDetail,
  SpecsPanel,
  SkillDetail,
  SkillsPanel,
  StatusBar,
  formatKeybinds,
  palette,
} from './components/index.js';
import { Dashboard, SkillFilter, Workspace } from './modules/index.js';
import { GitInfo, Prompts, Profiles, Query, Specs, Skills } from './services/index.js';

/** Panels the grid page renders itself; `sessions` belongs to the native list. */
/** Detail views the page can open: sorted so the map stays honest. */
type DetailKind = 'skills' | 'profiles' | 'prompts' | 'specs';

/** One open detail: which list row, how it is presented, and how far it is scrolled. */
interface DetailState {
  readonly kind: DetailKind;
  readonly id: string;
  readonly mode: 'preview' | 'view';
  readonly scroll: number;
  readonly action: number;
}

/** Persisted page state: the panel the reader left focused. */
export interface PageFocus {
  panel: string;
}

/** Props the workspace TUI entry hands to the page. */
export interface WorkspacePageProps {
  readonly layout: Dashboard.Layout;
  readonly root: string;
  readonly ports: Ports;
  readonly focus: StorageHandle<PageFocus>;
  readonly client: QueryClient;
}

/** Rows shown inside one readable cell, after its border and reserved lines. */
const CELL_RESERVED_LINES = 4;

/** Rows the detail sub-view spends on its chrome and footer, outside the body. */
const DETAIL_RESERVED_LINES = 8;

/** The fields every store row shares; the page never reads a kind-specific field. */
interface RowIdentity {
  readonly id: string;
  readonly name: string;
}

/** Window a filtered list around its highlight, given a row budget. */
const windowed = <Row,>(
  rows: () => ReadonlyArray<Row>,
  highlight: () => number,
  budget: () => number,
) => {
  const start = createMemo(() => {
    const count = budget();
    const length = rows().length;
    return Math.min(Math.max(highlight() - count + 1, 0), Math.max(length - count, 0));
  });
  return {
    rows: createMemo(() => rows().slice(start(), start() + budget())),
    highlight: createMemo(() => highlight() - start()),
    capacity: budget,
  };
};

/** Actions available on an open detail: skills, profiles, and prompts are editable. */
const actionsFor = (kind: DetailKind, mode: 'preview' | 'view'): ReadonlyArray<DetailAction> => {
  const toggle: DetailAction = {
    id: 'toggle-view',
    label: mode === 'view' ? 'Show preview' : 'Show full view',
    hint: 'v',
  };
  const back: DetailAction = { id: 'back', label: 'Back', hint: 'esc' };
  if (kind === 'specs') return [toggle, back];
  return [toggle, { id: 'delete', label: 'Delete', hint: 'd' }, back];
};

/** Query client scope: one provider per page mount. */
export const pageRenderer = (props: WorkspacePageProps) => () => (
  <QueryClientProvider client={props.client}>
    <WorkspacePage {...props} />
  </QueryClientProvider>
);

/**
 * One fullscreen plugin route page: the configurable montflow grid, backed by
 * the file stores and the host seams. It reuses the native session list,
 * detail, and dispatch — it owns no session surface of its own — and renders
 * its own detail sub-views for the four store-backed lists.
 */
const WorkspacePage = (props: WorkspacePageProps) => {
  const root = props.root;
  const layout = props.layout;
  const ports = props.ports;
  const dimensions = useTerminalDimensions();
  const queryClient = useQueryClient();
  const cells = createMemo(() => Dashboard.flatten(layout));
  const panelIds = createMemo(() => cells().map((cell) => cell.panel));
  const [selected, setSelected] = createSignal(
    panelIds().includes(props.focus.value.panel)
      ? props.focus.value.panel
      : Dashboard.firstPanel(layout),
  );
  const [detail, setDetail] = createSignal<DetailState | undefined>(undefined);
  const [specDetail, setSpecDetail] = createSignal<Specs.SpecDetail | undefined>(undefined);
  const [specLoading, setSpecLoading] = createSignal(false);
  const [info, setInfo] = createSignal<Workspace.Info>(
    Workspace.make({ name: Workspace.basename(root), root, branch: '…', clean: true }),
  );

  const [skillsPhase, setSkillsPhase] = createSignal<Skills.SkillsPhase>('extension');
  const skillsQuery = createQuery(() => ({
    queryKey: Query.skillsKey,
    queryFn: () => Query.fetchSkillsList(root, setSkillsPhase),
  }));
  const [profilesPhase, setProfilesPhase] = createSignal<Profiles.ProfilesPhase>('extension');
  const profilesQuery = createQuery(() => ({
    queryKey: Query.profilesKey,
    queryFn: () => Query.fetchProfilesList(root, setProfilesPhase),
  }));
  const [promptsPhase, setPromptsPhase] = createSignal<Prompts.PromptsPhase>('extension');
  const promptsQuery = createQuery(() => ({
    queryKey: Query.promptsKey,
    queryFn: () => Query.fetchPromptsList(root, setPromptsPhase),
  }));
  const [specsPhase, setSpecsPhase] = createSignal<Specs.SpecsPhase>('extension');
  const specsQuery = createQuery(() => ({
    queryKey: Query.specsKey,
    queryFn: () => Query.fetchSpecsList(root, setSpecsPhase),
  }));

  const skillRows = createMemo(() => skillsQuery.data?.rows ?? []);
  const profileRows = createMemo(() => profilesQuery.data?.rows ?? []);
  const promptRows = createMemo(() => promptsQuery.data?.rows ?? []);
  const specRows = createMemo(() => specsQuery.data?.rows ?? []);

  const [skillQuery, setSkillQuery] = createSignal('');
  const [profileQuery, setProfileQuery] = createSignal('');
  const [promptQuery, setPromptQuery] = createSignal('');
  const [specQuery, setSpecQuery] = createSignal('');
  const [skillHighlight, setSkillHighlight] = createSignal(0);
  const [profileHighlight, setProfileHighlight] = createSignal(0);
  const [promptHighlight, setPromptHighlight] = createSignal(0);
  const [specHighlight, setSpecHighlight] = createSignal(0);

  const filteredSkills = createMemo(() => SkillFilter.filterByQuery(skillRows(), skillQuery()));
  const filteredProfiles = createMemo(() =>
    SkillFilter.filterByQuery(profileRows(), profileQuery()),
  );
  const filteredPrompts = createMemo(() => SkillFilter.filterByQuery(promptRows(), promptQuery()));
  const filteredSpecs = createMemo(() => SkillFilter.filterByQuery(specRows(), specQuery()));

  /** Grid rows: terminal height minus the top pad and the one-row status bar. */
  const gridRows = createMemo(() => Math.max(1, dimensions().height - 2));

  /** Whole-row height per grid cell, column by column. */
  const columnCellHeights = createMemo(() =>
    layout.columns.map((column) =>
      Dashboard.cellRows(
        column.cells.map((cell) => cell.height ?? 1),
        gridRows(),
        1,
      ),
    ),
  );

  /** Rows a cell can list: its pinned height minus chrome and reserved lines. */
  const rowBudget = (panel: string): number => {
    for (const [columnIndex, column] of layout.columns.entries()) {
      const cellIndex = column.cells.findIndex((cell) => cell.panel === panel);
      if (cellIndex === -1) continue;
      const height = columnCellHeights()[columnIndex]?.[cellIndex] ?? 1;
      return Math.max(1, height - CELL_RESERVED_LINES);
    }
    return 1;
  };

  /** Window one filtered list around its highlight, given a row budget. */
  const skillWindow = windowed(filteredSkills, skillHighlight, () => rowBudget('skills'));
  const profileWindow = windowed(filteredProfiles, profileHighlight, () => rowBudget('profiles'));
  const promptWindow = windowed(filteredPrompts, promptHighlight, () => rowBudget('prompts'));
  const specWindow = windowed(filteredSpecs, specHighlight, () => rowBudget('specs'));

  /** Visible rows in the open detail's body. */
  const detailBodyLines = createMemo(() => Math.max(1, gridRows() - DETAIL_RESERVED_LINES));

  /** Toast a one-line result through the host. */
  const notify = (message: string, variant: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    void ports.interaction.notify({ title: 'workspace', message, variant }).pipe(Effect.runPromise);
  };

  /** Read workspace metadata once per mount. */
  const loadInfo = (): void => {
    void GitInfo.getInfo(root).pipe(Effect.runPromise).then(setInfo);
  };
  loadInfo();

  /** Selected panel's list state, so keys never need a panel switch. */
  const highlightOf = (panel: string): number =>
    panel === 'profiles'
      ? profileHighlight()
      : panel === 'prompts'
        ? promptHighlight()
        : panel === 'specs'
          ? specHighlight()
          : skillHighlight();

  const setHighlight = (panel: string, index: number): void => {
    if (panel === 'profiles') setProfileHighlight(index);
    else if (panel === 'prompts') setPromptHighlight(index);
    else if (panel === 'specs') setSpecHighlight(index);
    else setSkillHighlight(index);
  };

  const rowsOf = (panel: DetailKind): ReadonlyArray<RowIdentity> =>
    panel === 'profiles'
      ? filteredProfiles()
      : panel === 'prompts'
        ? filteredPrompts()
        : panel === 'specs'
          ? filteredSpecs()
          : filteredSkills();

  const queryOf = (panel: string): string =>
    panel === 'profiles'
      ? profileQuery()
      : panel === 'prompts'
        ? promptQuery()
        : panel === 'specs'
          ? specQuery()
          : skillQuery();

  const setQuery = (panel: string, value: string): void => {
    if (panel === 'profiles') setProfileQuery(value);
    else if (panel === 'prompts') setPromptQuery(value);
    else if (panel === 'specs') setSpecQuery(value);
    else setSkillQuery(value);
    setHighlight(panel, 0);
  };

  /** Persist the focused panel; the store outlives the page. */
  const selectPanel = (panel: string): void => {
    if (!panelIds().includes(panel)) return;
    setSelected(panel);
    void props.focus.update((draft) => {
      draft.panel = panel;
    });
  };

  /** Invalidate every store query so the grid re-reads from disk. */
  const refreshAll = (): void => {
    for (const key of [Query.skillsKey, Query.profilesKey, Query.promptsKey, Query.specsKey]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
    loadInfo();
    notify('Refreshed.');
  };

  /** Load a spec's phases and tasks into the detail view. */
  const loadSpec = (id: string): void => {
    setSpecLoading(true);
    void Specs.loadSpec(root, id)
      .pipe(Effect.runPromise)
      .then(
        (data) => {
          if (detail()?.id !== id) return;
          setSpecDetail(data);
          setSpecLoading(false);
        },
        (error) => {
          if (detail()?.id !== id) return;
          setSpecLoading(false);
          notify(`Spec detail failed: ${String(error)}`, 'error');
        },
      );
  };

  /** Open the highlighted row, or explain the empty store. */
  const openHighlighted = (): void => {
    const panel = selected();
    if (panel === 'info') return;
    if (!isDetailPanel(panel)) return;
    const row = rowsOf(panel)[highlightOf(panel)];
    if (row === undefined) {
      notify(emptyHint(panel), 'warning');
      return;
    }
    const next: DetailState = { kind: panel, id: row.id, mode: 'preview', scroll: 0, action: 0 };
    setDetail(next);
    setSpecDetail(undefined);
    if (panel === 'specs') loadSpec(row.id);
  };

  /** Close the detail sub-view and forget its scroll/action state. */
  const closeDetail = (): void => {
    setDetail(undefined);
    setSpecDetail(undefined);
    setSpecLoading(false);
  };

  /** Scroll the open detail in full view. */
  const scrollDetail = (delta: number): void => {
    const current = detail();
    if (current === undefined || current.mode !== 'view') return;
    setDetail({ ...current, scroll: Math.max(current.scroll + delta, 0) });
  };

  /** Host search dialog over the selected list; the pick sets the filter. */
  const search = async (): Promise<void> => {
    const panel = selected();
    if (!isDetailPanel(panel)) return;
    const names = rowsOf(panel).map((row) => row.name);
    if (names.length === 0) {
      notify(emptyHint(panel), 'warning');
      return;
    }
    const picked = await ports.interaction
      .select<string>({
        title: `Search ${Dashboard.titleFor(panel)}`,
        options: names.map((name) => ({ title: name, value: name })),
      })
      .pipe(Effect.runPromise);
    if (picked !== undefined) setQuery(panel, picked);
  };

  /** Delete the open row after a host confirmation, then refetch its list. */
  const removeOpen = async (): Promise<void> => {
    const current = detail();
    if (current === undefined || current.kind === 'specs') return;
    const row = rowsOf(current.kind).find((candidate) => candidate.id === current.id);
    if (row === undefined) return;
    const confirmed = await ports.interaction
      .confirm({
        title: `Delete ${current.kind.slice(0, -1)} '${row.name}'?`,
        message: 'The store entry is removed from disk.',
      })
      .pipe(Effect.runPromise);
    if (confirmed !== true) return;
    const removal: Effect.Effect<void, { readonly message: string }> =
      current.kind === 'skills'
        ? Skills.deleteSkill(root, row.id)
        : current.kind === 'profiles'
          ? Profiles.deleteProfile(root, row.id)
          : Prompts.deletePrompt(root, row.id);
    const failure = await removal.pipe(
      Effect.match({ onFailure: (error) => error.message, onSuccess: () => undefined }),
      Effect.runPromise,
    );
    if (failure !== undefined) {
      notify(failure, 'error');
      return;
    }
    closeDetail();
    await queryClient.invalidateQueries({
      queryKey:
        current.kind === 'skills'
          ? Query.skillsKey
          : current.kind === 'profiles'
            ? Query.profilesKey
            : Query.promptsKey,
    });
    notify(`Deleted ${current.kind.slice(0, -1)} '${row.name}'.`, 'success');
  };

  /**
   * The page's own keymap layer: panel keybinds from the layout plus the
   * list/detail keys the grid has always answered to. The host owns every
   * key outside this layer, and a dialog takes input scope while it is open.
   */
  ports.grid.keymapLayer(() => {
    const commands: Array<KeymapCommand> = [
      {
        id: 'workspace.navigate',
        title: 'Open the workspace grid',
        group: 'Workspace',
        slash: { name: 'workspace' },
        bind: 'ctrl+w',
        run: () => {
          ports.grid.navigate({ type: 'plugin', name: 'workspace' });
        },
      },
      {
        id: 'workspace.search',
        title: 'Search the focused panel',
        group: 'Workspace',
        bind: '/',
        run: () => search(),
      },
      {
        id: 'workspace.open',
        title: 'Open the highlighted row',
        group: 'Workspace',
        bind: 'return',
        run: () => openHighlighted(),
      },
      {
        id: 'workspace.move-down',
        title: 'Move down',
        group: 'Workspace',
        bind: 'down,j',
        run: () => {
          const panel = selected();
          const length = isDetailPanel(panel) ? rowsOf(panel).length : 0;
          const next = Math.min(highlightOf(panel) + 1, Math.max(length - 1, 0));
          setHighlight(panel, next);
          if (panel === 'info') scrollDetail(1);
        },
      },
      {
        id: 'workspace.move-up',
        title: 'Move up',
        group: 'Workspace',
        bind: 'up,k',
        run: () => {
          const panel = selected();
          setHighlight(panel, Math.max(highlightOf(panel) - 1, 0));
          if (panel === 'info') scrollDetail(-1);
        },
      },
      {
        id: 'workspace.back',
        title: 'Close the detail or leave the page',
        group: 'Workspace',
        bind: 'escape',
        run: () => {
          if (detail() !== undefined) closeDetail();
          else ports.grid.navigate({ type: 'home' });
        },
      },
      {
        id: 'workspace.view',
        title: 'Toggle preview and full view',
        group: 'Workspace',
        bind: 'v',
        run: () => {
          const current = detail();
          if (current === undefined) return;
          setDetail({ ...current, mode: current.mode === 'view' ? 'preview' : 'view', scroll: 0 });
        },
      },
      {
        id: 'workspace.delete',
        title: 'Delete the open row',
        group: 'Workspace',
        bind: 'd',
        run: () => removeOpen(),
      },
      {
        id: 'workspace.refresh',
        title: 'Refresh every store',
        group: 'Workspace',
        bind: 'R',
        run: () => refreshAll(),
      },
      {
        id: 'workspace.help',
        title: 'Show the workspace keymap',
        group: 'Workspace',
        bind: '?',
        run: () => {
          ports.view.show(() => <HelpOverlay />, { size: 'large' });
        },
      },
      {
        id: 'workspace.home',
        title: 'Back to the native session list',
        group: 'Workspace',
        bind: 'q',
        run: () => {
          ports.grid.navigate({ type: 'home' });
        },
      },
    ];
    for (const cell of cells()) {
      commands.push({
        id: `workspace.panel.${cell.panel}`,
        title: `Focus ${Dashboard.titleFor(cell.panel)}`,
        group: 'Workspace',
        bind: cell.keybind,
        run: () => {
          if (detail() !== undefined) closeDetail();
          selectPanel(cell.panel);
        },
      });
    }
    return { mode: 'global', commands };
  });

  const statusHint = createMemo(() => {
    const current = detail();
    if (current !== undefined) {
      return formatKeybinds([
        Keybinds.menuNavigate(),
        Keybinds.selectRow(),
        ...(current.mode === 'view' ? [Keybinds.scroll()] : []),
        ...(current.kind === 'specs' ? [] : [Keybinds.remove()]),
        Keybinds.showFull(),
        Keybinds.back(),
      ]);
    }
    if (selected() === 'info') return formatKeybinds([Keybinds.back(), Keybinds.quit()]);
    const entries = [Keybinds.search(), Keybinds.open(), Keybinds.move(), Keybinds.refresh()];
    if (queryOf(selected()) !== '') entries.push({ key: 'esc', action: 'home' });
    return formatKeybinds(entries);
  });

  const statusTrailing = createMemo(
    () => `${dimensions().width}×${dimensions().height} · ${Workspace.summarize(info())}`,
  );

  const openSkill = createMemo(() => {
    const current = detail();
    return current?.kind === 'skills'
      ? skillRows().find((row) => row.id === current.id)
      : undefined;
  });
  const openProfile = createMemo(() => {
    const current = detail();
    return current?.kind === 'profiles'
      ? profileRows().find((row) => row.id === current.id)
      : undefined;
  });
  const openPrompt = createMemo(() => {
    const current = detail();
    return current?.kind === 'prompts'
      ? promptRows().find((row) => row.id === current.id)
      : undefined;
  });

  return (
    <box flexDirection="column" flexGrow={1} minHeight={0}>
      <box flexDirection="row" flexGrow={1} minHeight={0} gap={1} paddingX={1}>
        <Show
          when={detail()}
          fallback={
            <box flexDirection="row" flexGrow={1} minHeight={0} gap={1}>
              <For each={layout.columns}>
                {(column, columnIndex) => (
                  <box
                    flexDirection="column"
                    flexGrow={column.width ?? 1}
                    flexBasis={0}
                    minHeight={0}
                    gap={1}
                  >
                    <For each={column.cells}>
                      {(cell, cellIndex) => (
                        <Panel
                          title={`[${cell.keybind}] ${Dashboard.titleFor(cell.panel)}`}
                          selected={selected() === cell.panel}
                          height={columnCellHeights()[columnIndex()]?.[cellIndex()]}
                        >
                          {cell.panel === 'info' ? (
                            <InfoPanel info={info()} />
                          ) : cell.panel === 'skills' ? (
                            <SkillsPanel
                              loading={skillsQuery.isPending}
                              installing={false}
                              loadingVariant={skillsPhase()}
                              installed={skillsQuery.data?.installed ?? false}
                              rows={skillWindow.rows()}
                              highlight={skillWindow.highlight()}
                              total={filteredSkills().length}
                              query={skillQuery()}
                              searching={false}
                              capacity={skillWindow.capacity()}
                              selected={selected() === 'skills'}
                            />
                          ) : cell.panel === 'profiles' ? (
                            <ProfilesPanel
                              root={root}
                              loading={profilesQuery.isPending}
                              installing={false}
                              loadingVariant={profilesPhase()}
                              installed={profilesQuery.data?.installed ?? false}
                              rows={profileWindow.rows()}
                              highlight={profileWindow.highlight()}
                              total={filteredProfiles().length}
                              query={profileQuery()}
                              searching={false}
                              capacity={profileWindow.capacity()}
                              selected={selected() === 'profiles'}
                            />
                          ) : cell.panel === 'prompts' ? (
                            <PromptsPanel
                              loading={promptsQuery.isPending}
                              installing={false}
                              loadingVariant={promptsPhase()}
                              installed={promptsQuery.data?.installed ?? false}
                              rows={promptWindow.rows()}
                              highlight={promptWindow.highlight()}
                              total={filteredPrompts().length}
                              query={promptQuery()}
                              searching={false}
                              capacity={promptWindow.capacity()}
                              selected={selected() === 'prompts'}
                            />
                          ) : cell.panel === 'specs' ? (
                            <SpecsPanel
                              loading={specsQuery.isPending}
                              loadingVariant={specsPhase()}
                              installed={specsQuery.data?.installed ?? false}
                              rows={specWindow.rows()}
                              highlight={specWindow.highlight()}
                              total={filteredSpecs().length}
                              query={specQuery()}
                              searching={false}
                              capacity={specWindow.capacity()}
                              selected={selected() === 'specs'}
                            />
                          ) : (
                            <PanelMessage message="Sessions render on the native list." />
                          )}
                        </Panel>
                      )}
                    </For>
                  </box>
                )}
              </For>
            </box>
          }
        >
          {(current: () => DetailState) => (
            <box flexDirection="column" flexGrow={1} minHeight={0} gap={1}>
              <box flexDirection="row" flexGrow={1} minHeight={0} gap={1}>
                <box flexDirection="column" width={30} flexShrink={0} minHeight={0}>
                  <Panel title="Actions" selected={false}>
                    <DetailActions
                      actions={actionsFor(current().kind, current().mode)}
                      highlight={current().action}
                    />
                    <box flexShrink={0}>
                      <text style={{ fg: palette.dim }}>↑↓ navigate · ⏎ select</text>
                    </box>
                  </Panel>
                </box>
                <box flexDirection="column" flexGrow={1} flexBasis={0} minHeight={0}>
                  <Panel
                    title={`${Dashboard.titleFor(current().kind)} — ${current().id} · ${current().mode}`}
                    selected={false}
                  >
                    <Switch fallback={<PanelMessage message="No row." />}>
                      <Match when={openSkill()}>
                        {(skill: Accessor<Skills.SkillSummary>) => (
                          <SkillDetail
                            skill={skill()}
                            mode={current().mode}
                            scrollOffset={current().scroll}
                            maxBodyLines={detailBodyLines()}
                          />
                        )}
                      </Match>
                      <Match when={openProfile()}>
                        {(profile: Accessor<Profiles.ProfileSummary>) => (
                          <ProfileDetail
                            profile={profile()}
                            mode={current().mode}
                            scrollOffset={current().scroll}
                            maxBodyLines={detailBodyLines()}
                          />
                        )}
                      </Match>
                      <Match when={openPrompt()}>
                        {(prompt: Accessor<Prompts.PromptSummary>) => (
                          <PromptDetail
                            prompt={prompt()}
                            mode={current().mode}
                            scrollOffset={current().scroll}
                            maxBodyLines={detailBodyLines()}
                          />
                        )}
                      </Match>
                      <Match when={specDetail()}>
                        {(spec: Accessor<Specs.SpecDetail>) => (
                          <SpecDetail
                            detail={spec()}
                            mode={current().mode}
                            scrollOffset={current().scroll}
                            maxBodyLines={detailBodyLines()}
                          />
                        )}
                      </Match>
                      <Match when={specLoading()}>
                        <Loader variant="specs" />
                      </Match>
                    </Switch>
                  </Panel>
                </box>
              </box>
              <KeybindBanner
                items={[
                  { key: 'v', action: 'view' },
                  { key: 'esc', action: 'back' },
                ]}
              />
            </box>
          )}
        </Show>
      </box>
      <StatusBar hint={statusHint()} trailing={statusTrailing()} />
    </box>
  );
};

/** Keys that address one of the store-backed lists. */
const isDetailPanel = (panel: string): panel is DetailKind =>
  panel === 'skills' || panel === 'profiles' || panel === 'prompts' || panel === 'specs';

/** Copy for an action that needs rows but has none. */
const emptyHint = (panel: DetailKind): string => {
  if (panel === 'skills') return 'No skills yet — run /mf-skills create in a session.';
  if (panel === 'profiles') return 'No profiles yet — run /mf-profiles create in a session.';
  if (panel === 'prompts') return 'No prompts yet — run /mf-prompts create in a session.';
  return 'No specs yet — author one under .agents/@montflow/specs.';
};

/**
 * Keymap cheat sheet rendered through the custom-view seam: the host owns the
 * dialog chrome, the page supplies the list of its own shortcuts.
 */
const HelpOverlay = () => (
  <box flexDirection="column" padding={1} gap={1}>
    <text style={{ fg: palette.accent }}>workspace</text>
    <text style={{ fg: palette.dim }}>
      Panel keys come from the grid layout (i / s / p / e / f by default).
    </text>
    <For
      each={[
        ['j / k', 'move the highlight'],
        ['⏎', 'open the highlighted row'],
        ['/', 'search the focused list'],
        ['v', 'toggle preview and full view'],
        ['d', 'delete the open row (skills, profiles, prompts)'],
        ['R', 'refresh every store'],
        ['esc', 'close the detail, then leave the page'],
        ['q', 'back to the native session list'],
        ['?', 'this keymap'],
      ]}
    >
      {(row) => (
        <text>
          <span style={{ fg: palette.accent }}>{row[0]}</span>
          <span style={{ fg: palette.text }}>{`  ${row[1]}`}</span>
        </text>
      )}
    </For>
    <text style={{ fg: palette.dim }}>esc closes this dialog.</text>
  </box>
);

/** Re-exported for the TUI entry: the window helpers the detail views share. */
