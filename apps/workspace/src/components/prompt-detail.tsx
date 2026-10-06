import type { Prompts } from '../services/index.js';
import { MarkdownBody } from './markdown-body.js';
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
 * variables), then the template rendered as markdown — truncated to a
 * compact preview or windowed full view by `MarkdownBody`. Chromeless —
 * the caller owns border and title. The footer names the next action
 * (`v` toggles modes, `j`/`k` scroll the full view). Mirrors
 * `SkillDetail` line for line.
 * @param props - prompt, view mode, scroll window, and the body line budget
 * @returns detail content element
 */
export const PromptDetail = (props: PromptDetailProps) => {
  const lines = () => props.prompt.template.split('\n');

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
          {props.prompt.variables.length > 0
            ? props.prompt.variables.map((variable) => variable.label).join(', ')
            : '—'}
        </text>
      </box>
      <MarkdownBody
        lines={lines()}
        mode={props.mode}
        scrollOffset={props.scrollOffset}
        maxBodyLines={props.maxBodyLines}
      />
    </box>
  );
};
