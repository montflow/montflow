import { Function } from "@montflow/core";
import { Snapshot, Source } from "./source";
import { State } from "./state";
import { Watcher } from "./watcher";

export type Dependencies = Map<Watcher, Function.Callable>;
export const registry = new WeakMap<State<unknown>, Dependencies>();

export function register<V>(
  source: State<V>,
  watcher: Watcher,
  callback: (snapsnot: Snapshot<V>) => void
) {
  let dependencies = registry.get(source);

  if (!dependencies) {
    dependencies = new Map();
    registry.set(source, dependencies);
  }

  dependencies.set(watcher, callback);
}

export function unregister<V>(state: Source<V>, watcher: Watcher) {
  const dependencies = registry.get(state);

  if (!dependencies) {
    return;
  }

  dependencies.delete(watcher);
}

export function trigger<V>(source: Source<V>, snapshot: Snapshot<V>) {
  const dependencies = registry.get(source);

  if (!dependencies) {
    return;
  }

  for (const [_, callback] of dependencies) callback(snapshot);
}
