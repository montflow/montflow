#!/usr/bin/env bun
/**
 * Check a PR body against the standard before publishing:
 *
 *   bun packages/mf-mode/scripts/pr-check.ts --title "<title>" [--human] < body.md
 *
 * Prints the report and exits 1 when the body has errors, 2 on bad flags.
 */
import { parseArgs } from 'node:util';
import { check, render } from '../src/modules/pr/pr.module.ts';

const USAGE = 'usage: bun scripts/pr-check.ts [--title <title>] [--human] < body.md';

const flags = (() => {
  try {
    return parseArgs({
      options: { title: { type: 'string' }, human: { type: 'boolean', default: false } },
    }).values;
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
    process.exit(2);
  }
})();

const report = check({ body: await Bun.stdin.text(), title: flags.title });
console.log(render(report, { human: flags.human }));
process.exitCode = report.errors > 0 ? 1 : 0;
