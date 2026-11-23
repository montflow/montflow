#!/usr/bin/env bun
import { generateEmbeddedPayload } from '@montflow/shared';
import { resolve } from 'node:path';

const PACKAGE_ROOT = resolve(import.meta.dirname, '..');
await generateEmbeddedPayload({
  packageRoot: PACKAGE_ROOT,
  sourceDir: 'skills',
  outputPath: 'src/apps/doctor/embedded-payload.generated.ts',
  exportName: 'EMBEDDED_SKILL_PAYLOAD',
  mode: 'skills',
});
