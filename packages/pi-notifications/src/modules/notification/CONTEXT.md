# Notification module

Effect-first notification primitives for Pi extensions (notification
descriptors, channel names).

## Belongs here

- Notification descriptor shapes (`make`)
- Channel names adapters deliver through (`isValidChannel`, `CHANNELS`)

## Does not belong here

- Adapter implementations (phone, push, desktop delivery) — those live in
  adapter modules added later
- Pi business logic (commands, tools, event handlers) — that lives in the
  consuming extension
