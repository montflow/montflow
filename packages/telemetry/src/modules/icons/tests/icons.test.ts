import * as Vitest from '@effect/vitest';
import { ASSET_BUDGET_BYTES, catalog, providerIcon, toolIcon } from '../index.js';

Vitest.describe('Icons.resolve runtime', () => {
  Vitest.it('resolves known providers and tools', () => {
    Vitest.expect(providerIcon('anthropic').id).toBe('anthropic');
    Vitest.expect(providerIcon('OpenAI').id).toBe('openai');
    Vitest.expect(toolIcon('bash').id).toBe('bash');
    Vitest.expect(toolIcon('Edit').id).toBe('edit');
  });

  Vitest.it('falls back deterministically for unknown identities', () => {
    Vitest.expect(providerIcon('acme').id).toBe('unknown');
    Vitest.expect(providerIcon('acme').glyph).toBe('A');
    Vitest.expect(providerIcon(undefined).id).toBe('unknown');
    Vitest.expect(toolIcon('nope').id).toBe('unknown');
    Vitest.expect(toolIcon(undefined).id).toBe('unknown');
  });

  Vitest.it('ships every icon as a local inline SVG', () => {
    const entries = [...Object.values(catalog().providers), ...Object.values(catalog().tools)];
    for (const entry of entries) {
      Vitest.expect(entry.svg.startsWith('data:image/svg+xml,')).toBe(true);
      Vitest.expect(entry.svg).not.toContain('http://');
    }
    const bytes = entries.reduce((total, entry) => total + entry.svg.length, 0);
    Vitest.expect(bytes).toBeLessThanOrEqual(ASSET_BUDGET_BYTES);
  });
});
