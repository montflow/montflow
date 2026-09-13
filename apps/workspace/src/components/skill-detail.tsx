import { For, Show } from 'solid-js';
import type { Skills } from '../services/index.js';
import { Keybinds, formatKeybinds } from './keybinds.js';
import { palette } from './palette.js';

/** Detail body mode: truncated preview or scrollable full view. */
export type SkillDetailMode = 'preview' | 'view';

export interface SkillDetailProps {
  readonly skill: Skills.SkillSummary;
  readonly mode: SkillDetailMode;
  readonly scrollOffset: number;
  readonly maxBodyLines: number;
}

/**
 * Skill detail content: description, meta rows, then the body — truncated
 * to fit in `preview`, windowed by `scrollOffset` in `view`. Chromeless —
 * the caller owns border and title. The footer names the next action
 * (`v` toggles modes, `j`/`k` scroll the full view).
 * @param props - skill, view mode, scroll window, and the body line budget
 * @returns detail content element
 */
export const SkillDetail = (props: SkillDetailProps) => {
  const lines = () => props.skill.body.split('\n');
  const budget = () => Math.max(props.maxBodyLines, 1);
  const offset = () =>
    props.mode === 'view'
      ? Math.min(Math.max(props.scrollOffset, 0), Math.max(lines().length - budget(), 0))
      : 0;
  const shown = () => lines().slice(offset(), offset() + budget());
  const hidden = () => lines().length - shown().length - offset();

  return (
    <box flexDirection="column" flexGrow={1} minHeight={0} gap={1}>
      <text style={{ fg: palette.text }}>{props.skill.description}</text>
      <box flexDirection="column">
        <text>
          <span style={{ fg: palette.dim }}>id </span>
          {props.skill.id}
        </text>
        <text>
          <span style={{ fg: palette.dim }}>groups </span>
          {props.skill.groups.length > 0 ? props.skill.groups.join(', ') : '—'}
        </text>
        <text>
          <span style={{ fg: palette.dim }}>needs </span>
          {props.skill.dependencies.length > 0 ? props.skill.dependencies.join(', ') : '—'}
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
