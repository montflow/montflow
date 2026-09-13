import * as Vitest from '@effect/vitest';
import { Schema } from 'effect';
import * as Workflow from '../index.js';

const workflow = Workflow.make('ship-feature', 'Ship a feature.');

Vitest.describe('Workflow.FromJson runtime', () => {
  Vitest.it('decodes a workflow file', () => {
    const json = JSON.stringify(Workflow.encode(workflow));
    Vitest.expect(Schema.decodeUnknownSync(Workflow.FromJson)(json)).toStrictEqual(workflow);
  });

  Vitest.it('rejects malformed JSON', () => {
    Vitest.expect(() => Schema.decodeUnknownSync(Workflow.FromJson)('{oops')).toThrow();
  });

  Vitest.it('round-trips through encode', () => {
    const json = Schema.encodeUnknownSync(Workflow.FromJson)(workflow);
    Vitest.expect(JSON.parse(json)).toStrictEqual(Workflow.encode(workflow));
  });
});
