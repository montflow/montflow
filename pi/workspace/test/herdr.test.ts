import { test, expect, afterEach } from 'vitest';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { herdrEnabled, reportHerdrState } from '../herdr';

const savedEnv = {
  HERDR_ENV: process.env.HERDR_ENV,
  HERDR_SOCKET_PATH: process.env.HERDR_SOCKET_PATH,
  HERDR_PANE_ID: process.env.HERDR_PANE_ID,
};

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('herdrEnabled: false when the herdr env is absent', () => {
  delete process.env.HERDR_ENV;
  delete process.env.HERDR_SOCKET_PATH;
  delete process.env.HERDR_PANE_ID;
  expect(herdrEnabled()).toBe(false);
});

test('herdrEnabled: true only with HERDR_ENV=1 + socket path + pane id', () => {
  process.env.HERDR_ENV = '1';
  process.env.HERDR_SOCKET_PATH = '/tmp/herdr.sock';
  process.env.HERDR_PANE_ID = 'w1:p1';
  expect(herdrEnabled()).toBe(true);

  process.env.HERDR_ENV = '0';
  expect(herdrEnabled()).toBe(false);
});

test('reportHerdrState: no-op outside herdr (never throws, never connects)', async () => {
  delete process.env.HERDR_ENV;
  await expect(reportHerdrState('working', 'x')).resolves.toBeUndefined();
});

/**
 * Runs a one-shot herdr-socket fake on a temp unix socket: collects every
 * newline-delimited JSON request and acks it so the sender sees delivery.
 */
const withFakeHerdrSocket = async (
  callback: (socketPath: string, received: unknown[]) => Promise<void>,
): Promise<void> => {
  const socketPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'herdr-test-')), 'herdr.sock');
  const received: unknown[] = [];
  const server = net.createServer((socket) => {
    socket.on('data', (data) => {
      for (const line of data.toString().split('\n')) {
        if (line.trim() === '') continue;
        received.push(JSON.parse(line));
      }
      socket.write('{"ok":true}\n');
    });
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  try {
    await callback(socketPath, received);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(path.dirname(socketPath), { recursive: true, force: true });
  }
};

test('reportHerdrState: speaks herdr pane.report_agent protocol with increasing seq', () =>
  withFakeHerdrSocket(async (socketPath, received) => {
    process.env.HERDR_ENV = '1';
    process.env.HERDR_SOCKET_PATH = socketPath;
    process.env.HERDR_PANE_ID = 'w24:p2';

    await reportHerdrState('working', '[loop 1/3 · cycle 1/5] supervisor brief');
    await reportHerdrState('idle');

    expect(received).toHaveLength(2);
    const first = received[0] as { method: string; params: Record<string, unknown> };
    const second = received[1] as { method: string; params: Record<string, unknown> };
    expect(first.method).toBe('pane.report_agent');
    expect(first.params.pane_id).toBe('w24:p2');
    expect(first.params.source).toBe('herdr:pi');
    expect(first.params.agent).toBe('pi');
    expect(first.params.state).toBe('working');
    expect(first.params.message).toBe('[loop 1/3 · cycle 1/5] supervisor brief');
    expect(second.params.state).toBe('idle');
    // Monotonic seq: herdr resolves concurrent reporters by it.
    expect((second.params.seq as number) > (first.params.seq as number)).toBe(true);
  }));

test('reportHerdrState: unreachable socket is swallowed (the loop never blocks on herdr)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'herdr-test-'));
  process.env.HERDR_ENV = '1';
  // Nothing listens here — both attempts fail, and the call still resolves.
  process.env.HERDR_SOCKET_PATH = path.join(dir, 'missing.sock');
  process.env.HERDR_PANE_ID = 'w24:p2';
  await expect(reportHerdrState('working')).resolves.toBeUndefined();
  fs.rmSync(dir, { recursive: true, force: true });
});