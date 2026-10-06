export * from './modules/index.js';
export * from './services/index.js';
// Surfaces that dispatch their own runs (extensions wiring an agentic
// flow to the engine) need the layer factory and the per-root runtime
// host; the workspace app reaches the same runtime through its own
// service, which keeps the package behind a lazy `import()`.
export * as Runtime from './apps/runtime/index.js';
