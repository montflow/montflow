import { Effect, type Scope } from 'effect';
import * as Vitest from '@effect/vitest';
import type { Plugin } from '@opencode/plugin/effect';
import * as PluginEntry from '../index.js';
import type { PortsContext } from '../../ports.module.js';

Vitest.describe('PluginEntry contract', () => {
  Vitest.it('the host server context satisfies the port context', () => {
    Vitest.expectTypeOf<Plugin.Context>().toMatchTypeOf<PortsContext>();
  });

  Vitest.it('MontflowPlugin is the host Plugin at Scope.Scope', () => {
    Vitest.expectTypeOf<PluginEntry.MontflowPlugin>().toEqualTypeOf<Plugin.Plugin<Scope.Scope>>();
  });

  Vitest.it('entry returns the host plugin contract', () => {
    const plugin = PluginEntry.entry<Scope.Scope>('montflow-specs', () => Effect.void);
    Vitest.expectTypeOf(plugin).toEqualTypeOf<PluginEntry.MontflowPlugin>();
    Vitest.expectTypeOf<ReturnType<typeof plugin.effect>>().toEqualTypeOf<
      Effect.Effect<void, never, Scope.Scope>
    >();
  });

  Vitest.it('entry exposes a callable effect at runtime', () => {
    const plugin = PluginEntry.entry('montflow-specs', () => Effect.void);
    Vitest.expect(plugin.id).toBe('montflow-specs');
    Vitest.expect(plugin.effect).toBeTypeOf('function');
  });
});
