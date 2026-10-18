import type { Skill } from '../../modules/index.js';
import * as Doctor from '../doctor/index.js';
import type { VerifyReport } from './engines.apps.module.js';

/**
 * Pure `data -> text` renderers for both pi-skills front ends. They carry
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

/** Confirmation after a create. */
export const created = (skill: Skill.Skill): string =>
  `Created skill '${skill.name}' at .agents/skills/${skill.id}/SKILL.md.`;

/** Confirmation after a modify. */
export const saved = (skill: Skill.Skill): string => `Saved skill '${skill.name}'.`;

/** Confirmation after a delete. */
export const deleted = (name: string): string => `Deleted skill '${name}'.`;

/** Doctor report, one line per shipped skill. */
export const doctor = (result: Doctor.DoctorResult): string => Doctor.doctorMessage(result);
