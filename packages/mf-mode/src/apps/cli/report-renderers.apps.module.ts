import type * as ReportEngines from './report-engines.apps.module.js';

/**
 * `mf-mode report` output: one `key=value` line per file, the trace's
 * problems, and `next=`, the one thing to do with the files.
 */

const quote = (text: string): string => '"' + text.replace(/"/g, "'") + '"';

/** How many trace problems to list before summarizing the rest. */
const SHOWN = 5;

export const report = (result: ReportEngines.ReportResult): string => {
  const lines = ['html=' + result.html];
  if (result.png !== undefined && result.pdf !== undefined) {
    lines.push('png=' + result.png, 'pdf=' + result.pdf);
  } else {
    lines.push('images=skipped reason=' + quote(result.skipped ?? 'unknown'));
  }
  lines.push('events=' + result.events + ' problems=' + result.problems.length);
  for (const problem of result.problems.slice(0, SHOWN)) {
    lines.push('problem line=' + problem.line + ' message=' + quote(problem.message));
  }
  if (result.problems.length > SHOWN) {
    lines.push(
      'problems_more=' + (result.problems.length - SHOWN) + ' see="Trace health in the HTML"',
    );
  }
  lines.push(
    result.png !== undefined && result.pdf !== undefined
      ? 'next=' +
          quote(
            'mf-mode pr attach ' +
              result.png +
              ' ' +
              result.pdf +
              ', then paste its lines under ## Proof',
          )
      : 'next=' + quote('link the HTML in your reply; pass --browser to get the PNG and PDF'),
  );
  return lines.join('\n');
};
