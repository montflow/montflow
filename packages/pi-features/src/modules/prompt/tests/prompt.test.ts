import * as Vitest from '@effect/vitest';
import { AUTHORING_FEATURE_SPEC, EXECUTING_FEATURE_SPEC } from '../../../skills/index.js';
import {
  AUTHOR_PREPROMPT,
  RESUME_PREPROMPT,
  buildAuthorPrompt,
  buildResumePrompt,
} from '../prompt.module.js';

Vitest.describe('Prompt.buildAuthorPrompt runtime', () => {
  Vitest.it('injects the authoring skill and the request', () => {
    const prompt = buildAuthorPrompt('Ship login');
    Vitest.expect(prompt).toContain(AUTHOR_PREPROMPT);
    Vitest.expect(prompt).toContain(AUTHORING_FEATURE_SPEC);
    Vitest.expect(prompt).toContain('Feature request: Ship login');
    Vitest.expect(prompt).not.toContain(EXECUTING_FEATURE_SPEC);
  });

  Vitest.it('trims the request', () => {
    Vitest.expect(buildAuthorPrompt('  Ship login  ')).toContain('Feature request: Ship login');
  });
});

Vitest.describe('Prompt.buildResumePrompt runtime', () => {
  Vitest.it('injects the executing skill and the state context', () => {
    const prompt = buildResumePrompt('ship-login', 'state pending\nactive phase A');
    Vitest.expect(prompt).toContain(RESUME_PREPROMPT);
    Vitest.expect(prompt).toContain(EXECUTING_FEATURE_SPEC);
    Vitest.expect(prompt).toContain('Feature: ship-login');
    Vitest.expect(prompt).toContain('state pending');
    Vitest.expect(prompt).not.toContain(AUTHORING_FEATURE_SPEC);
  });
});
