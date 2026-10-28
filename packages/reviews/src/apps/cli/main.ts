#!/usr/bin/env bun
import { Cli } from '@montflow/version';
import { PACKAGE_IDENTITY, rootCommand } from './binary.apps.module.js';

/**
 * `mf-reviews` binary entry.
 *
 * The version comes from this package's embedded manifest and the command
 * tree owns its `version` subcommand; everything else — argv, help, platform
 * layers, exit codes — lives in `@montflow/version`.
 */
Cli.run({ version: PACKAGE_IDENTITY.version, command: rootCommand });
