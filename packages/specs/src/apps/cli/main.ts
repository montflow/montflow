#!/usr/bin/env bun
import * as Cli from '@montflow/version/cli';
import { PACKAGE_IDENTITY, PACKAGE_ROOT, rootCommand } from './cli.slash.module.js';

Cli.run({ identity: PACKAGE_IDENTITY, packageRoot: PACKAGE_ROOT, command: rootCommand });
