import type { Skill } from '../../modules/index.js';
import * as Doctor from '../doctor/index.js';
import type * as Sync from '../sync/index.js';
import type { VerifyReport } from './engines.apps.module.js';

/**
 * Pure `data -> text` renderers for both `mf-skills` front ends. They carry
 * the token contract: lean by default, `verbose` only adds detail, and a
 * failure is never suppressed.
 */

/** One rendered line per stored skill. */
export const list = (
  skills: ReadonlyArray<Skill.Skill>,
  options: { readonly verbose?: boolean; readonly status?: string | undefined } = {},
): string => {
  if (skills.length === 0) {
    return options.status === undefined
      ? 'No skills.'
      : `No skills with status '${options.status}'.`;
  }
  const lines = skills.map((skill) => {
    const extra =
      options.verbose === true
        ? [
            skill.groups.length > 0 ? `groups: ${skill.groups.join(', ')}` : '',
            skill.dependencies.length > 0 ? `deps: ${skill.dependencies.join(', ')}` : '',
          ]
            .filter((part) => part !== '')
            .join(' · ')
        : '';
    const suffix = extra === '' ? '' : ` (${extra})`;
    return `\u2022 ${skill.id} \u2014 ${skill.description}${suffix}`;
  });
  return lines.join('\n');
};

/** Render a raw `SKILL.md` unchanged. */
export const show = (raw: string): string => raw;

/** The one-line verdict for a single verification result. */
export const verifyLine = (result: Skill.VerifyResult): string => {
  if (result.valid) return '\u2713 verified';
  const count = result.issues.length;
  return `\u2717 not verified \u2014 ${count} issue${count === 1 ? '' : 's'}`;
};

/**
 * Render a verification report. Failures always print their issues;
 * passing skills print only under `verbose`.
 * @param report - report from the `verify` engine
 * @param options - include passing skills
 * @returns the display text
 */
export const verify = (
  report: VerifyReport,
  options: { readonly verbose?: boolean } = {},
): string => {
  const lines: Array<string> = [];
  for (const entry of report.entries) {
    if (entry.result.valid && options.verbose !== true) continue;
    lines.push(`${entry.name}: ${verifyLine(entry.result)}`);
    for (const found of entry.result.issues) lines.push(`  ${found.field}: ${found.message}`);
  }
  if (report.entries.length === 0) lines.push('No skills.');
  const count = report.entries.length;
  lines.push(
    `${count} skill${count === 1 ? '' : 's'} \u00b7 ${report.issueCount} issue${report.issueCount === 1 ? '' : 's'}`,
  );
  return lines.join('\n');
};

/** `3 skills`, `1 skill`. */
const counted = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * Every outcome in report order: the group heading, and the label its count
 * uses in the footer. A write run says `Created`; the engine calls it `added`.
 */
const SYNC_GROUPS = [
  { outcome: 'added', heading: 'Created', total: 'created' },
  { outcome: 'updated', heading: 'Updated', total: 'updated' },
  { outcome: 'unchanged', heading: 'Unchanged', total: 'unchanged' },
  { outcome: 'refused', heading: 'Refused', total: 'refused' },
  { outcome: 'skipped', heading: 'Skipped', total: 'skipped' },
] as const;

/**
 * The footer: counts for the outcomes that are present, in group order, then
 * the verdict the exit code agrees with. A write run has no verdict line: its
 * `Synced` header and counts are the confirmation.
 * @param result - result from `Sync.runSync`
 * @returns the summary and verdict, newline-joined
 */
const syncFooter = (result: Sync.SyncResult): string => {
  const totals = SYNC_GROUPS.map((group) => ({
    total: group.total,
    count: result.skills.filter((skill) => skill.outcome === group.outcome).length,
  }))
    .filter((entry) => entry.count > 0)
    .map((entry) => `${entry.count} ${entry.total}`)
    .join(' \u00b7 ');
  if (!result.check) return totals;
  const attention = result.skills.filter(
    (skill) => skill.drift === 'stale' || skill.drift === 'diverged',
  ).length;
  const wouldChange = attention > 0 ? attention : result.changed.length;
  return result.drifted
    ? `${totals}\n\u2717 drift \u2014 ${counted(wouldChange, 'skill')} would change.`
    : `${totals}\n\u2713 current.`;
};

/** One line of drift detail for a managed or unmanaged check run. */
const driftNote = (skill: Sync.SyncSkillStatus): string =>
  skill.drift === 'diverged'
    ? `diverged (${(skill.differingFiles ?? []).join(', ')}; manifest @${(skill.manifestCommit ?? 'unknown').slice(0, 7)})`
    : (skill.drift ?? 'current');

/**
 * A `sync` report: a header naming both roots, one group per present outcome,
 * then counts and (for `--check`) a verdict. `verbose` adds one line per file
 * under the skill it came from. Both front ends render through here, so the
 * same store state prints the same bytes.
 * @param result - result from `Sync.runSync`
 * @param options - per-file detail
 * @returns the rendered report
 */
export const sync = (
  result: Sync.SyncResult,
  options: { readonly verbose?: boolean } = {},
): string => {
  const lines = [
    `${result.check ? 'Checked' : 'Synced'} ${result.sourceRoot} \u2192 ${result.targetRoot}`,
  ];
  for (const group of SYNC_GROUPS) {
    const skills = result.skills.filter((skill) => skill.outcome === group.outcome);
    if (skills.length === 0) continue;
    lines.push(`${group.heading} (${skills.length})`);
    for (const skill of skills) {
      const note =
        skill.outcome === 'skipped'
          ? (skill.reason ?? 'internal')
          : result.check
            ? driftNote(skill)
            : undefined;
      lines.push(note === undefined ? `  ${skill.name}` : `  ${skill.name} \u2014 ${note}`);
      if (options.verbose === true) {
        for (const file of skill.files) lines.push(`    ${file.file}: ${file.outcome}`);
      }
    }
  }
  if (result.skills.length === 0) lines.push('No skills in the source store.');
  lines.push('', syncFooter(result));
  return lines.join('\n');
};

/**
 * The one-line fix after a `--check` run reports drift. Shared by both front
 * ends so the invocation is always the caller's own typeable form.
 * @param result - result from `Sync.runSync`
 * @returns the refusal line
 */
export const syncRefusal = (result: Sync.SyncResult): string =>
  `Re-run without --check to apply: ${result.invocation}`;

/** The fix after a normal sync refused to overwrite diverged skills. */
export const forceRefusal = (result: Sync.SyncResult): string => {
  const detail = result.skills
    .filter((skill) => skill.outcome === 'refused')
    .map(
      (skill) =>
        `${skill.name} (${(skill.differingFiles ?? []).join(', ')} @${(skill.manifestCommit ?? 'unknown').slice(0, 7)})`,
    )
    .join('; ');
  return `Refusing to overwrite diverged skill(s): ${detail}. Re-run with ${result.invocation} --force to replace them.`;
};

/** Confirmation after a create. */
export const created = (skill: Skill.Skill): string =>
  `Created skill '${skill.name}' at .agents/skills/${skill.id}/SKILL.md.`;

/** Confirmation after a modify. */
export const saved = (skill: Skill.Skill): string => `Saved skill '${skill.name}'.`;

/** Confirmation after a delete. */
export const deleted = (name: string): string => `Deleted skill '${name}'.`;

/** Doctor report, one line per shipped skill. */
export const doctor = (result: Doctor.DoctorResult): string => Doctor.doctorMessage(result);
