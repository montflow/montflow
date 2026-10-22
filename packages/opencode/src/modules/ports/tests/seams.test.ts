import { Context, Effect, type Scope } from 'effect';
import * as Vitest from '@effect/vitest';
import type { Plugin } from '@opencode/plugin/effect';
import type { Command } from '@opencode/plugin/effect';
import type { Context as TuiContext, SlotMap } from '@opencode/plugin/tui/context';
import type { Agent } from '@opencode/schema/agent';
import type { Skill } from '@opencode/schema/skill';
import * as Ports from '../ports.module.js';
import type { SessionSnapshot } from '../data/index.js';
import type { PageDefinition, SlotClaim, SlotPath } from '../grid-page/index.js';

/** A montflow-owned service that must never enter the host plugin runtime. */
class ForeignService extends Context.Service<ForeignService, { readonly tag: string }>()(
  'montflow/ForeignService',
) {}

type ForeignR = Scope.Scope | ForeignService;

/** Only the host-injected requirement may reach a host plugin. */
const acceptsHostPlugin = (plugin: Plugin.Plugin<Scope.Scope>): string => plugin.id;

/** A plugin asking for a montflow Tag: legal as a value, never as a host entry. */
const foreignPlugin: Plugin.Plugin<ForeignR> = {
  id: 'montflow-foreign',
  effect: () => Effect.void,
};

/**
 * The host TUI context minus the slot seam. The slot seam erases the host's
 * `render` output and per-slot input types by design (no OpenTUI/Solid types
 * cross into the adapter), so it is asserted separately, on the placement
 * contract it does mirror.
 */
type HostWithoutSlot = Omit<TuiContext, 'ui'> & { readonly ui: Omit<TuiContext['ui'], 'slot'> };
type MirrorWithoutSlot = Omit<Ports.TuiPortsContext, 'ui'> & {
  readonly ui: Omit<NonNullable<Ports.TuiPortsContext['ui']>, 'slot'>;
};

/** The placement keys a host slot claim may carry. */
type PlacementKey = 'prepend' | 'append' | 'before' | 'after' | 'replace';

Vitest.describe('port seam contract', () => {
  Vitest.it('the host server context carries every server port seam', () => {
    Vitest.expectTypeOf<Plugin.Context>().toExtend<Ports.PortsContext>();
  });

  Vitest.it('the host server domains match their mirrors', () => {
    Vitest.expectTypeOf<Plugin.Context['command']>().toExtend<
      NonNullable<Ports.PortsContext['command']>
    >();
    Vitest.expectTypeOf<Plugin.Context['tool']>().toExtend<
      NonNullable<Ports.PortsContext['tool']>
    >();
    Vitest.expectTypeOf<Plugin.Context['agent']>().toExtend<
      NonNullable<Ports.PortsContext['agent']>
    >();
    Vitest.expectTypeOf<Plugin.Context['skill']>().toExtend<
      NonNullable<Ports.PortsContext['skill']>
    >();
    Vitest.expectTypeOf<Plugin.Context['model']>().toExtend<
      NonNullable<Ports.PortsContext['model']>
    >();
    Vitest.expectTypeOf<Plugin.Context['session']>().toExtend<
      NonNullable<Ports.PortsContext['session']>
    >();
    Vitest.expectTypeOf<Plugin.Context['location']>().toExtend<
      NonNullable<Ports.PortsContext['location']>
    >();
  });

  Vitest.it('the host TUI context carries every TUI port seam', () => {
    Vitest.expectTypeOf<HostWithoutSlot>().toExtend<MirrorWithoutSlot>();
  });

  Vitest.it('the slot seam mirrors the host placement contract', () => {
    Vitest.expectTypeOf<SlotPath>().toEqualTypeOf<keyof SlotMap>();
    Vitest.expectTypeOf<Exclude<keyof SlotClaim, 'render'>>().toEqualTypeOf<PlacementKey>();
    Vitest.expectTypeOf<
      Exclude<keyof Parameters<TuiContext['ui']['slot']>[0], 'render'>
    >().toEqualTypeOf<PlacementKey>();

    Vitest.expectTypeOf<
      { readonly render: () => null; readonly append: 'app' } extends SlotClaim ? true : false
    >().toEqualTypeOf<true>();
    Vitest.expectTypeOf<
      {
        readonly render: () => null;
        readonly append: 'app';
        readonly prepend: 'app';
      } extends SlotClaim
        ? true
        : false
    >().toEqualTypeOf<false>();
    Vitest.expectTypeOf<
      {
        readonly render: () => never;
        readonly append: 'app';
        readonly prepend: 'app';
      } extends Parameters<TuiContext['ui']['slot']>[0]
        ? true
        : false
    >().toEqualTypeOf<false>();
  });

  Vitest.it('the assembled ports expose every seam exactly once', () => {
    Vitest.expectTypeOf<keyof Ports.Ports>().toEqualTypeOf<
      | 'agent'
      | 'command'
      | 'data'
      | 'grid'
      | 'interaction'
      | 'model'
      | 'session'
      | 'skill'
      | 'storage'
      | 'tool'
      | 'view'
      | 'cwd'
    >();
  });

  Vitest.it('the registry seams require exactly Scope.Scope', () => {
    Vitest.expectTypeOf<ReturnType<Ports.Ports['command']['register']>>().toEqualTypeOf<
      Effect.Effect<void, never, Scope.Scope>
    >();
    Vitest.expectTypeOf<ReturnType<Ports.Ports['tool']['remove']>>().toEqualTypeOf<
      Effect.Effect<void, never, Scope.Scope>
    >();
    Vitest.expectTypeOf<ReturnType<Ports.Ports['tool']['add']>>().toEqualTypeOf<
      Effect.Effect<void, never, Scope.Scope>
    >();
    Vitest.expectTypeOf<ReturnType<Ports.Ports['skill']['add']>>().toEqualTypeOf<
      Effect.Effect<void, never, Scope.Scope>
    >();
    Vitest.expectTypeOf<ReturnType<Ports.Ports['agent']['upsert']>>().toEqualTypeOf<
      Effect.Effect<void, never, Scope.Scope>
    >();
  });

  Vitest.it('the read seams stay infallible and requirement-free', () => {
    Vitest.expectTypeOf<ReturnType<Ports.Ports['command']['list']>>().toEqualTypeOf<
      Effect.Effect<readonly Command.Info[]>
    >();
    Vitest.expectTypeOf<ReturnType<Ports.Ports['agent']['list']>>().toEqualTypeOf<
      Effect.Effect<readonly Agent.Info[]>
    >();
    Vitest.expectTypeOf<ReturnType<Ports.Ports['skill']['list']>>().toEqualTypeOf<
      Effect.Effect<readonly Skill.Info[]>
    >();
    Vitest.expectTypeOf<Ports.Ports['data']['sessions']>().toEqualTypeOf<
      () => readonly SessionSnapshot[]
    >();
  });

  Vitest.it('the client-local seams stay synchronous over the host context', () => {
    Vitest.expectTypeOf<Ports.Ports['grid']['registerPage']>().toEqualTypeOf<
      (page: PageDefinition) => () => void
    >();
    Vitest.expectTypeOf<Ports.Ports['view']['clear']>().toEqualTypeOf<() => void>();
    Vitest.expectTypeOf<Ports.Ports['interaction']['confirm']>().toEqualTypeOf<
      (options: {
        readonly title: string;
        readonly message: string;
        readonly label?: { readonly confirm?: string; readonly cancel?: string };
      }) => Effect.Effect<boolean | undefined>
    >();
  });

  Vitest.it('a foreign montflow Tag cannot cross into the host runtime', () => {
    // @ts-expect-error -- R must be exactly Scope.Scope; the host provides no montflow Tag.
    acceptsHostPlugin(foreignPlugin);
    Vitest.expectTypeOf<Plugin.Plugin<ForeignR>>().not.toEqualTypeOf<Plugin.Plugin<Scope.Scope>>();
  });
});
