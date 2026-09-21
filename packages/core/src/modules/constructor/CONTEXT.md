# constructor module

Type-level utilities for describing `new`-able values, plus the runtime guard
that detects them. Used by `macro.singleton` to discriminate constructors from
plain makers.

## Belongs here

- `Constructor<TInstance, TArgs>` and its arity variants (`Nullary` through
  `Decenary`, `Anyary`, `Any`)
- `Args` / `Instance` — argument and instance type extractors
- `isConstructor` — runtime guard for constructor functions

## Does not belong here

- Maker (`...args => instance`) signatures — those live in `function`
- Function callability guards (`isCallable`) — those live in `function`
- Actually invoking or instantiating a constructor — that is caller concern
