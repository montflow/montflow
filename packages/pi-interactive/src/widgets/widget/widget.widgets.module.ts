import { Box, Container, type Component } from '@earendil-works/pi-tui';
import { Function, Pipeable } from 'effect';

const WidgetBase = class {
  readonly _tag = 'Widget' as const;

  readonly component: Component;

  constructor(component: Component) {
    this.component = component;
  }
};

/**
 * Pipeable handle over a Pi TUI node. Lift with {@link make} (or start from
 * {@link container}), compose with {@link add} / {@link addAll}, and finish
 * with {@link compile} at the `ui.custom` boundary, e.g.
 * `Widget.container().pipe(Widget.add(Title.make("Skills")), Widget.compile)`.
 *
 * Unlike `Format` (immutable strings), the handle threads a mutable TUI node:
 * `add` appends in place and returns a new handle over the same node. Treat
 * handles as single-use builder chains — do not fork one handle into two pipes.
 */
export const Widget = Pipeable.Mixin(WidgetBase);
export type Widget = InstanceType<typeof Widget>;

/** Type guard for the `Widget | Component` unions in composition APIs. */
export const isWidget = (node: Widget | Component): node is Widget => node instanceof Widget;

/** Lifts a Pi component into a composable handle. */
export const make = (component: Component): Widget => new Widget(component);

/** Fresh empty `Container` handle — the usual pipe entry point. */
export const container = (): Widget => new Widget(new Container());

/**
 * Appends a child to the handled node: `Container` and `Box` parents grow in
 * place, anything else wraps both in a fresh `Container`. Dual API — compose
 * in a pipe or call directly:
 * `Widget.container().pipe(Widget.add(Title.make("Skills")))` or
 * `Widget.add(Widget.container(), Title.make("Skills"))`.
 */
export const add: {
  (child: Widget | Component): (self: Widget) => Widget;
  (self: Widget, child: Widget | Component): Widget;
} = Function.dual(2, (self: Widget, child: Widget | Component): Widget => {
  const node = isWidget(child) ? child.component : child;
  const parent = self.component;
  if (parent instanceof Container || parent instanceof Box) {
    parent.addChild(node);
    return new Widget(parent);
  }
  const next = new Container();
  next.addChild(parent);
  next.addChild(node);
  return new Widget(next);
});

/**
 * Appends each child in order — the array form of {@link add}. Dual API:
 * `shell.pipe(Widget.addAll([a, b]))` or `Widget.addAll(shell, [a, b])`.
 */
export const addAll: {
  (children: ReadonlyArray<Widget | Component>): (self: Widget) => Widget;
  (self: Widget, children: ReadonlyArray<Widget | Component>): Widget;
} = Function.dual(2, (self: Widget, children: ReadonlyArray<Widget | Component>): Widget => {
  let next = self;
  for (const child of children) next = add(next, child);
  return next;
});

/**
 * Unwraps the handle to the raw Pi component for `ui.custom` factories,
 * `addChild`, and other Pi APIs.
 */
export const compile = (self: Widget): Component => self.component;
