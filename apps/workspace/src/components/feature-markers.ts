import type { FeatureDetail } from '../services/features/index.js';

/**
 * Status glyph for a feature row, keyed by derived lifecycle state.
 * Single source for the list marker so the panel and detail never drift.
 * @param state - lifecycle state from the features service
 * @returns one-char marker
 */
export const featureMarker = (state: string): string => {
  switch (state) {
    case 'complete':
      return '✓';
    case 'in-progress':
      return '●';
    case 'blocked':
      return '■';
    case 'inconsistent':
      return '✗';
    case 'not-started':
      return '○';
    default:
      return '·';
  }
};

/**
 * Per-task status marker inside a feature detail phase block.
 * @param status - canonical task status from TASK.md
 * @returns one-char marker
 */
export const featureTaskMarker = (status: string): string => {
  switch (status) {
    case 'complete':
      return '✓';
    case 'in-progress':
      return '●';
    case 'blocked':
      return '✗';
    case 'pending':
      return '○';
    default:
      return '·';
  }
};

/**
 * Flatten a feature detail into display lines: header, issues, then
 * every phase with its tasks. Shared by the detail component and the
 * app scroll-window count so the two never drift.
 * @param detail - feature detail from the service
 * @returns display lines
 */
export const featureDetailLines = (detail: FeatureDetail): ReadonlyArray<string> => {
  const meta = detail.meta;
  const out: Array<string> = [];
  if (meta !== undefined && meta.description.trim() !== '') out.push(meta.description);
  if (meta !== undefined) {
    out.push(`status   ${meta.status}`);
    out.push(`state    ${detail.state}`);
    const locked = meta.lockedPhases.length > 0 ? ` · locked ${meta.lockedPhases.join(',')}` : '';
    out.push(`author   ${meta.author} · created ${meta.created}${locked}`);
  } else {
    out.push(`state    ${detail.state}`);
  }
  out.push(`tasks    ${detail.summary.complete}/${detail.summary.total} complete`);
  if (detail.issues.length > 0) {
    out.push('');
    out.push('issues');
    for (const found of detail.issues) out.push(`  ${found.field}: ${found.message}`);
  }
  for (const phase of detail.phases) {
    out.push('');
    out.push(`Phase ${phase.phase}${phase.locked ? ' · locked' : ''}`);
    for (const task of phase.tasks) {
      out.push(
        `  ${featureTaskMarker(task.status)} ${task.id}  ${task.name.padEnd(22)} ${task.type}`,
      );
    }
  }
  return out;
};
