# Host service

The process the CLI runs in, behind one port: the environment, `PATH` probes,
and the one spawn `dispatch` makes. The only module that touches Node's
process APIs. Tests use `fake`.
