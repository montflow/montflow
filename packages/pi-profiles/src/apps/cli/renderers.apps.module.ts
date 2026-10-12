import * as PiProfiles from '../../modules/pi-profiles/index.js';
import type { ProfileVerifyReport } from './engines.apps.module.js';

/**
 * Pure `data -> text` renderers for the profiles store. No Effect, no I/O:
 * the slash command notifies what these return, the `mf-profiles` binary
 * prints it, so the two surfaces cannot disagree about output. Failures are
 * never suppressed; passing items appear only under `verbose`.
 */

/** Render the profile list, or a hint when the store is empty. */
export const list = (profiles: ReadonlyArray<PiProfiles.Profile>): string =>
  profiles.length === 0
    ? 'No profiles yet — create one with `/mf-profiles create <name>`.'
    : profiles.map((profile) => `• ${profile.name} — ${profile.description}`).join('\n');

/** Render one profile: description, model, skills, instructions, checklist. */
export const show = (profile: PiProfiles.Profile): string => {
  const header =
    profile.description === '' ? profile.name : `${profile.name} — ${profile.description}`;
  const meta = [
    profile.model === '' ? null : `model: ${profile.model}`,
    profile.skills.length === 0 ? null : `skills: ${profile.skills.join(', ')}`,
  ].filter((line): line is string => line !== null);
  const checklist =
    profile.checklist.length === 0
      ? ''
      : `\n\nReview checklist:\n${profile.checklist.map((item) => `- [ ] ${item}`).join('\n')}`;
  const instructions = profile.instructions === '' ? '(no instructions yet)' : profile.instructions;
  return `${header}${meta.length > 0 ? `\n${meta.join('\n')}` : ''}\n\n${instructions}${checklist}`;
};

/** Render a save confirmation (also used after a create). */
export const saved = (profile: PiProfiles.Profile): string => `Saved profile '${profile.name}'.`;

/** Render a delete confirmation. */
export const deleted = (name: string): string => `Deleted profile '${name}'.`;

/** Render one profile's verification outcome: a line when valid, findings otherwise. */
export const verify = (name: string, result: PiProfiles.VerifyResult): string => {
  if (result.valid) return `✓ '${name}' matches the standard format.`;
  const count = result.issues.length;
  const findings = result.issues.map((found) => `• [${found.field}] ${found.message}`).join('\n');
  return `✗ '${name}' has ${count} issue${count === 1 ? '' : 's'}:\n${findings}`;
};

/**
 * Render a whole-store verification report. Failures are never suppressed; a
 * passing profile appears only under `verbose`, matching {@link verify}.
 */
export const renderVerifyAll = (report: ProfileVerifyReport, verbose = false): string => {
  const lines: Array<string> = [];
  for (const entry of report.entries) {
    if (entry.result.valid && !verbose) continue;
    lines.push(`${entry.name}: ${PiProfiles.verifyInfoLine(entry.result)}`);
    for (const issue of entry.result.issues) lines.push(`  ${issue.field}: ${issue.message}`);
  }
  if (report.entries.length === 0) lines.push('No profiles.');
  lines.push(
    `${report.entries.length} profile${report.entries.length === 1 ? '' : 's'} \u00b7 ${report.issueCount} issue${report.issueCount === 1 ? '' : 's'}`,
  );
  for (const warning of report.warnings) lines.push(`! ${warning}`);
  return lines.join('\n');
};
