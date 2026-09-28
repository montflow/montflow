import { For, Show } from 'solid-js';
import type { Profiles } from '../services/index.js';
import { KeybindBanner } from './keybind-banner.js';
import { Keybinds } from './keybinds.js';
import { Loader, type LoaderVariant } from './loader.js';
import { palette } from './palette.js';
import { ProfileVerifyIcon } from './profile-verify-icon.js';

export interface ProfilesPanelProps {
  /** Workspace root: the verify icon's query needs it. */
  readonly root: string;
  readonly loading: boolean;
  readonly installing: boolean;
  readonly loadingVariant?: LoaderVariant | undefined;
  readonly installed: boolean;
  readonly rows: ReadonlyArray<Profiles.ProfileSummary>;
  readonly highlight: number;
  readonly total: number;
  readonly query: string;
  readonly searching: boolean;
  readonly capacity: number;
  readonly selected: boolean;
  /** Fixed verify-spinner frame index. Set in tests for a deterministic snapshot. */
  readonly frame?: number | undefined;
}

/**
 * Profiles content that FILLS the panel: the loader, missing-store
 * note, empty note, and filterable list all share the same flex chrome,
 * so loading, filtering, install state, and search toggling never shift
 * the grid. Mirrors `SkillsPanel` row for row — the search line stays
 * reserved (blank when idle); the list region grows to absorb slack
 * above a one-line footer pinned to the panel bottom. The footer shows
 * contextual keybinds plus the row count only while selected —
 * unselected panels render the same line blank, so selecting never
 * moves anything. The list arrives pre-windowed (capped at `capacity`
 * rows) — this panel only renders. `capacity` documents the caller's
 * windowing contract; height comes from the grid, never from row
 * counts. `loadingVariant` narrates the boot stage (`extension` for the
 * runtime import, `profiles` for the list read) while `loading` is true.
 * @param props - workspace root, load state, visible rows, highlight, query, capacity, selection, frame
 * @returns profiles content element
 */
export const ProfilesPanel = (props: ProfilesPanelProps) => {
  return (
    <Show
      when={!props.loading && !props.installing}
      fallback={
        <Loader variant={props.installing ? 'installing' : (props.loadingVariant ?? 'profiles')} />
      }
    >
      <box flexDirection="column" flexGrow={1} minHeight={0}>
        <box flexShrink={0}>
          <Show
            when={props.installed && (props.searching || props.query !== '')}
            fallback={<text> </text>}
          >
            <text style={{ fg: palette.accent }}>/{props.query}</text>
          </Show>
        </box>
        <box flexDirection="column" flexGrow={1} minHeight={0}>
          <Show
            when={props.installed}
            fallback={
              <box
                flexGrow={1}
                flexDirection="column"
                alignItems="center"
                justifyContent="center"
                gap={1}
              >
                <text style={{ fg: palette.dim }}>Profiles store not installed.</text>
                <Show when={props.selected} fallback={<text> </text>}>
                  <text style={{ fg: palette.accent }}>press ⏎ to install</text>
                </Show>
              </box>
            }
          >
            <Show
              when={props.total > 0}
              fallback={
                <box
                  flexGrow={1}
                  flexDirection="column"
                  alignItems="center"
                  justifyContent="center"
                  gap={1}
                >
                  <text style={{ fg: palette.dim }}>
                    {props.query.trim() === '' ? 'No profiles found.' : 'No profiles match.'}
                  </text>
                  <Show when={props.selected} fallback={<text> </text>}>
                    <text style={{ fg: palette.accent }}>press c to create</text>
                  </Show>
                </box>
              }
            >
              <For each={props.rows}>
                {(row, index) => (
                  <box
                    flexDirection="row"
                    justifyContent="space-between"
                    backgroundColor={index() === props.highlight ? palette.highlight : palette.bg}
                  >
                    <text style={{ fg: palette.text }}>
                      {index() === props.highlight ? `▸ ${row.name}` : `  ${row.name}`}
                    </text>
                    <ProfileVerifyIcon root={props.root} id={row.id} frame={props.frame} />
                  </box>
                )}
              </For>
            </Show>
          </Show>
        </box>
        <Show when={props.selected} fallback={<text> </text>}>
          <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
            <KeybindBanner items={Keybinds.listBanner(props.installed, props.total)} />
            <text style={{ fg: palette.dim }}>
              {props.installed ? `${props.rows.length}/${props.total}` : ' '}
            </text>
          </box>
        </Show>
      </box>
    </Show>
  );
};
