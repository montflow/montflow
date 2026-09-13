import { RuleTester } from 'oxlint/plugins-dev';

import { noNodePlatformImportsRule } from './no-node-platform-imports.ts';

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });

tester.run('montflow/no-node-platform-imports', noNodePlatformImportsRule, {
  valid: [
    {
      filename: 'src/runtime.ts',
      code: 'import { FileSystem } from "effect/FileSystem";',
    },
    {
      filename: 'src/runtime.ts',
      code: 'import { NodeFileSystem } from "@effect/platform-node";',
    },
    {
      filename: 'src/runtime.ts',
      code: 'import { join } from "./local-path.ts";',
    },
    {
      filename: 'src/store.test.ts',
      code: 'import * as Fs from "node:fs";',
    },
    {
      filename: 'src/services/store/tests/helpers.ts',
      code: 'import * as Os from "node:os";',
    },
  ],
  invalid: [
    {
      filename: 'src/runtime.ts',
      code: 'import * as Fs from "node:fs";',
      errors: [
        {
          messageId: 'platformImport',
          data: { module: 'node:fs', suggestion: 'FileSystem' },
        },
      ],
    },
    {
      filename: 'src/runtime.ts',
      code: 'import { join } from "node:path";',
      errors: [
        {
          messageId: 'platformImport',
          data: { module: 'node:path', suggestion: 'Path' },
        },
      ],
    },
    {
      filename: 'src/runtime.ts',
      code: 'import { execFile } from "node:child_process";',
      errors: [
        {
          messageId: 'platformImport',
          data: { module: 'node:child_process', suggestion: 'Command' },
        },
      ],
    },
    {
      filename: 'src/runtime.ts',
      code: 'export { tmpdir } from "node:os";',
      errors: [{ messageId: 'platformImport' }],
    },
    {
      filename: 'src/runtime.ts',
      code: 'const Fs = await import("node:fs/promises");',
      errors: [{ messageId: 'platformImport' }],
    },
    {
      filename: 'src/runtime.ts',
      code: 'import { randomUUID } from "node:crypto";',
      errors: [{ messageId: 'platformImport' }],
    },
    {
      filename: 'src/runtime.ts',
      code: 'import { Worker } from "node:worker_threads";',
      errors: [{ messageId: 'platformImport' }],
    },
    {
      filename: 'src/runtime.ts',
      code: 'import test from "node:test";',
      errors: [{ messageId: 'platformImport' }],
    },
  ],
});
