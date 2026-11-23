import * as Fs from 'node:fs';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import * as Pr from '../../../modules/pr/index.js';

const REPO = NodePath.resolve(import.meta.dirname, '../../../../../..');

Vitest.describe('PR template', () => {
  Vitest.it('the repository PR template is the standard mf-mode pr template prints', () => {
    const file = Fs.readFileSync(NodePath.join(REPO, '.github/pull_request_template.md'), 'utf8');
    Vitest.expect(file).toBe(Pr.template());
  });
});
