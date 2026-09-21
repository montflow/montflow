# async module

Promise helpers: a few scheduling primitives and the type aliases that
describe promise-or-value inputs. Effect's `Effect`/`Stream` own the majority
of async work; reach here only for raw-Promise gaps.

## Belongs here

- `Maybe<T>` and `Lazy<T>` — promise-or-sync type aliases
- `wait`, `tick` — timer-based delays returning Promises
- `withMinimumDuration` — fans out task promises while enforcing a floor delay
- `isPromise` — structural then/catch guard

## Does not belong here

- Effect fibers, queues, or `Effect` scheduling — those are `effect`
- Function-signature aliases (`Nullary`, `Unary`, `Callable`) — those live in
  `function`
- Type aliasing the global `Promise` type — that lives in `alias`
