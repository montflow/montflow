#!/usr/bin/env bun
import * as Cli from '@montflow/version/cli';
import { PACKAGE_IDENTITY, PACKAGE_ROOT, rootCommand } from './binary.apps.module.js';

/**
 * `mf-profiles` binary entry.
 *
 * The version comes from this package's embedded manifest and the command
 * tree owns its `version` subcommand; everything else — argv, help, platform
 * layers, exit codes — lives in `@montflow/version`.
 */
Cli.run({ identity: PACKAGE_IDENTITY, packageRoot: PACKAGE_ROOT, command: rootCommand });
