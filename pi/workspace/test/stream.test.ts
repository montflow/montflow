import { test, expect } from 'vitest';
import { FixerActivityStore, MAX_STREAM_CHARS, StreamStore } from '../stream';

test('StreamStore: append accumulates text and thinking separately', () => {
  const store = new StreamStore();
  store.append('reviewer:generic', 'reviewer generic', 'text', 'Hello ');
  store.append('reviewer:generic', 'reviewer generic', 'text', 'world');
  store.append('reviewer:generic', 'reviewer generic', 'thinking', 'think…');

  const stream = store.get('reviewer:generic');
  expect(stream?.text).toBe('Hello world');
  expect(stream?.thinking).toBe('think…');
  expect(stream?.label).toBe('reviewer generic');
});

test('StreamStore: empty deltas are ignored', () => {
  const store = new StreamStore();
  store.append('supervisor', 'supervisor', 'text', '');
  expect(store.get('supervisor')).toBeUndefined();
});

test('StreamStore: keeps the tail past the char cap', () => {
  const store = new StreamStore();
  store.append('supervisor', 'supervisor', 'text', 'a'.repeat(MAX_STREAM_CHARS + 100));
  const stream = store.get('supervisor');
  expect(stream?.text).toHaveLength(MAX_STREAM_CHARS);
  // The tail is kept (the newest content survives), not the head.
  expect(stream?.text.endsWith('a'.repeat(MAX_STREAM_CHARS))).toBe(true);
});

test('StreamStore: active lists only streams with output, newest first', () => {
  const store = new StreamStore();
  store.append('reviewer:security', 'reviewer security', 'text', 'x');
  store.append('supervisor', 'supervisor', 'thinking', 'y');

  const active = store.active();
  expect(active.map((stream) => stream.key)).toEqual([
    'supervisor',
    'reviewer:security',
  ]);
  // A key that only ever got empty deltas is not "active".
  store.append('reviewer:generic', 'reviewer generic', 'text', '');
  expect(store.active()).toHaveLength(2);
});

test('StreamStore: clear drops every buffer', () => {
  const store = new StreamStore();
  store.append('supervisor', 'supervisor', 'text', 'x');
  store.clear();
  expect(store.active()).toHaveLength(0);
  expect(store.get('supervisor')).toBeUndefined();
});

// ─── FixerActivityStore ──────────────────────────────────────────────

test('FixerActivityStore: records and reads per-fixer tools', () => {
  const store = new FixerActivityStore();
  expect(store.getTool('F1')).toBeUndefined();
  store.setTool('F1', 'read');
  store.setTool('F2', 'grep');
  expect(store.getTool('F1')).toBe('read');
  expect(store.getTool('F2')).toBe('grep');
});

test('FixerActivityStore: undefined clears a tool; clear drops everything', () => {
  const store = new FixerActivityStore();
  store.setTool('F1', 'read');
  store.setTool('F1', undefined);
  expect(store.getTool('F1')).toBeUndefined();
  store.setTool('F2', 'bash');
  store.clear();
  expect(store.getTool('F2')).toBeUndefined();
});