#!/usr/bin/env bun
import { resolve } from 'node:path';
import { generateEmbeddedPayload, loadManifest } from '@montflow/payload';
import raw from '../payload.json' with { type: 'json' };

const packageRoot = resolve(import.meta.dirname, '..');
const loaded = loadManifest(raw, '@montflow/profiles');
if (!loaded.ok) throw new Error(loaded.problem);

const summary = await generateEmbeddedPayload({
  packageRoot,
  manifest: loaded.manifest,
  output: resolve(packageRoot, 'src', 'apps', 'doctor', 'embedded-payload.generated.ts'),
});
console.log(`embedded ${summary}`);
