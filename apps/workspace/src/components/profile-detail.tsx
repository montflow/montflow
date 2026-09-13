import { For, Show } from 'solid-js';
import type { Profiles } from '../services/index.js';
import { Keybinds, formatKeybinds } from './keybinds.js';
import { palette } from './palette.js';

/** Detail body mode: truncated preview or scrollable full view. */
export type ProfileDetailMode = 'preview' | 'view';

export interface ProfileDetailProps {
  readonly profile: Profiles.ProfileSummary;
  readonly mode: ProfileDetailMode;
  readonly scrollOffset: number;
  readonly maxBodyLines: number;
}

/**
 * Profile detail content: description, meta rows (model, skills), then
 * the instructions plus review checklist — truncated to fit in
 * `preview`, windowed by `scrollOffset` in `view`. Chromeless — the
 * caller owns border and title. The footer names the next action
 * (`v` toggles modes, `j`/`k` scroll the full view). Mirrors
 * `SkillDetail` line for line.
 * @param props - profile, view mode, scroll window, and the body line budget
 * @returns detail content element
 */
export const ProfileDetail = (props: ProfileDetailProps) => {
  const lines = (): ReadonlyArray<string> => {
    const body: Array<string> = [];
    if (props.profile.instructions.trim() !== '')
      body.push(...props.profile.instructions.split('\n'));
    if (props.profile.checklist.length > 0) {
      if (body.length > 0) body.push('');
      body.push('Review checklist:');
      for (const item of props.profile.checklist) body.push(`- [ ] ${item}`);
    }
    return body;
  };
  const budget = () => Math.max(props.maxBodyLines, 1);
  const offset = () =>
    props.mode === 'view'
      ? Math.min(Math.max(props.scrollOffset, 0), Math.max(lines().length - budget(), 0))
      : 0;
  const shown = () => lines().slice(offset(), offset() + budget());
  const hidden = () => lines().length - shown().length - offset();

  return (
    <box flexDirection="column" flexGrow={1} minHeight={0} gap={1}>
      <text style={{ fg: palette.text }}>{props.profile.description}</text>
      <box flexDirection="column">
        <text>
          <span style={{ fg: palette.dim }}>id </span>
          {props.profile.id}
        </text>
        <text>
          <span style={{ fg: palette.dim }}>model </span>
          {props.profile.model !== '' ? props.profile.model : '—'}
        </text>
        <text>
          <span style={{ fg: palette.dim }}>skills </span>
          {props.profile.skills.length > 0 ? props.profile.skills.join(', ') : '—'}
        </text>
      </box>
      <box flexDirection="column" flexGrow={1} minHeight={0}>
        <For each={shown()}>{(line) => <text>{line === '' ? ' ' : line}</text>}</For>
        <Show
          when={props.mode === 'preview'}
          fallback={
            <text style={{ fg: palette.dim }}>
              lines {lines().length === 0 ? 0 : offset() + 1}–{offset() + shown().length}/
              {lines().length} · {formatKeybinds([Keybinds.scroll(), Keybinds.showPreview()])}
            </text>
          }
        >
          {hidden() > 0 ? (
            <text style={{ fg: palette.dim }}>
              … {hidden()} more lines · {formatKeybinds([Keybinds.showFull()])}
            </text>
          ) : undefined}
        </Show>
      </box>
    </box>
  );
};
