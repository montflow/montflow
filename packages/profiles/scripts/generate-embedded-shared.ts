#!/usr/bin/env bun
import { generateEmbeddedPayload } from '@montflow/shared';
import { resolve } from 'node:path';

const PACKAGE_ROOT = resolve(import.meta.dirname, '..');
await generateEmbeddedPayload({
  packageRoot: PACKAGE_ROOT,
  sourceDir: 'profiles',
  outputPath: 'src/apps/doctor/embedded-profiles.generated.ts',
  exportName: 'EMBEDDED_PROFILES_PAYLOAD',
  mode: 'files',
});
await generateEmbeddedPayload({
  packageRoot: PACKAGE_ROOT,
  sourceDir: 'prompts',
  outputPath: 'src/apps/doctor/embedded-prompts.generated.ts',
  exportName: 'EMBEDDED_PROMPTS_PAYLOAD',
  mode: 'files',
});
