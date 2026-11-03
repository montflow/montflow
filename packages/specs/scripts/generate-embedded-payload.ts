#!/usr/bin/env bun
import { resolve } from 'node:path';
import { generateEmbeddedPayload, loadManifest } from '@montflow/payload';
import raw from '../payload.json' with { type: 'json' };

const packageRoot = resolve(import.meta.dirname, '..');
const loaded = loadManifest(raw, '@montflow/specs');
if (!loaded.ok) throw new Error(loaded.problem);

const summary = await generateEmbeddedPayload({
  packageRoot,
  manifest: loaded.manifest,
  output: resolve(packageRoot, 'src', 'modules', 'doctor', 'embedded-payload.generated.ts'),
});
console.log(`embedded ${summary}`);
