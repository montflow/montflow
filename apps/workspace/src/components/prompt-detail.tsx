import { For, Show } from 'solid-js';
import type { Prompts } from '../services/index.js';
import { Keybinds, formatKeybinds } from './keybinds.js';
import { palette } from './palette.js';

/** Detail body mode: truncated preview or scrollable full view. */
export type PromptDetailMode = 'preview' | 'view';

export interface PromptDetailProps {
  readonly prompt: Prompts.PromptSummary;
  readonly mode: PromptDetailMode;
  readonly scrollOffset: number;
  readonly maxBodyLines: number;
}

/**
 * Prompt detail content: description, meta rows (model, skills,
 * variables), then the template — truncated to fit in `preview`,
 * windowed by `scrollOffset` in `view`. Chromeless — the caller owns
 * border and title. The footer names the next action (`v` toggles
 * modes, `j`/`k` scroll the full view). Mirrors `SkillDetail` line
 * for line.
 * @param props - prompt, view mode, scroll window, and the body line budget
 * @returns detail content element
 */
export const PromptDetail = (props: PromptDetailProps) => {
  const lines = () => props.prompt.template.split('\n');
  const budget = () => Math.max(props.maxBodyLines, 1);
  const offset = () =>
    props.mode === 'view'
      ? Math.min(Math.max(props.scrollOffset, 0), Math.max(lines().length - budget(), 0))
      : 0;
  const shown = () => lines().slice(offset(), offset() + budget());
  const hidden = () => lines().length - shown().length - offset();

  return (
    <box flexDirection="column" flexGrow={1} minHeight={0} gap={1}>
      <text style={{ fg: palette.text }}>{props.prompt.description}</text>
      <box flexDirection="column">
        <text>
          <span style={{ fg: palette.dim }}>id </span>
          {props.prompt.id}
        </text>
        <text>
          <span style={{ fg: palette.dim }}>model </span>
          {props.prompt.model !== '' ? props.prompt.model : '—'}
        </text>
        <text>
          <span style={{ fg: palette.dim }}>skills </span>
          {props.prompt.skills.length > 0 ? props.prompt.skills.join(', ') : '—'}
        </text>
        <text>
          <span style={{ fg: palette.dim }}>variables </span>
          {props.prompt.variables.length > 0 ? props.prompt.variables.join(', ') : '—'}
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
