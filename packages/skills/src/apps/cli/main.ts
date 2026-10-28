#!/usr/bin/env bun
import { Cli } from '@montflow/version';
import { rootCommand } from './binary.apps.module.js';

/**
 * `mf-skills` binary entry.
 *
 * Identity, the shared `version` subcommand, platform layers, and exit codes
 * live in `@montflow/version`; this file only names its own command tree.
 */
Cli.run({
  packageRoot: `${import.meta.dirname}/../../..`,
  command: rootCommand,
});
