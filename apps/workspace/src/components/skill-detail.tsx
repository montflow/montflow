import type { Skills } from '../services/index.js';
import { MarkdownBody } from './markdown-body.js';
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
 * Skill detail content: description, meta rows, then the body rendered
 * as markdown — truncated to a compact preview or windowed full view by
 * `MarkdownBody`. Chromeless — the caller owns border and title. The
 * footer names the next action (`v` toggles modes, `j`/`k` scroll the
 * full view).
 * @param props - skill, view mode, scroll window, and the body line budget
 * @returns detail content element
 */
export const SkillDetail = (props: SkillDetailProps) => {
  const lines = () => props.skill.body.split('\n');

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
      <MarkdownBody
        lines={lines()}
        mode={props.mode}
        scrollOffset={props.scrollOffset}
        maxBodyLines={props.maxBodyLines}
      />
    </box>
  );
};
