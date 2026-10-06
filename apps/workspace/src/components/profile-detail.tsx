import type { Profiles } from '../services/index.js';
import { MarkdownBody } from './markdown-body.js';
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
 * the instructions plus review checklist rendered as markdown —
 * truncated to a compact preview or windowed full view by
 * `MarkdownBody`. Chromeless — the caller owns border and title. The
 * footer names the next action (`v` toggles modes, `j`/`k` scroll the
 * full view). Mirrors `SkillDetail` line for line.
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
      <MarkdownBody
        lines={lines()}
        mode={props.mode}
        scrollOffset={props.scrollOffset}
        maxBodyLines={props.maxBodyLines}
      />
    </box>
  );
};
