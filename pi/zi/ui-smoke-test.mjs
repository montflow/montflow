// Smoke test for the hub-and-spoke UI: single router, folder picker,
// multi-instance same-folder support, version gate, --stop.
import { spawn, execSync } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { setTimeout as sleep } from 'node:timers/promises'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'

const CLI = '/home/daniel/.local/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js'
const EXT_DIR = dirname(fileURLToPath(import.meta.url))
const ROUTER_STATE = join(homedir(), '.local', 'state', 'zi', 'router.json')
const OTHER_CWD = '/tmp/ws-other-project'
const BASE_PORT = 24342

let failures = 0
const check = (n, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures++
}

const startPi = (cwd, extension) => {
  const agent = spawn('node', [CLI, '--mode', 'rpc', '--no-session', '-e', extension], { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
  let stderr = ''
  agent.stderr.on('data', (d) => (stderr += d.toString()))
  const decoder = new StringDecoder('utf8')
  let buffer = ''
  const events = []
  agent.stdout.on('data', (chunk) => {
    buffer += decoder.write(chunk)
    let i
    while ((i = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, i).replace(/\r$/, '')
      buffer = buffer.slice(i + 1)
      if (line) {
        try {
          events.push(JSON.parse(line))
        } catch {}
      }
    }
  })
  const send = (obj) => agent.stdin.write(`${JSON.stringify(obj)}\n`)
  const waitFor = async (pred, ms = 15000) => {
    const start = Date.now()
    while (Date.now() - start < ms) {
      const hit = events.find(pred)
      if (hit) return hit
      await sleep(100)
    }
    return null
  }
  return { agent, events, send, waitFor, get stderr() { return stderr } }
}

const browserWs = async (port) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)
  const msgs = []
  ws.on('message', (d) => msgs.push(JSON.parse(d.toString())))
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej) })
  await sleep(400)
  return { ws, msgs }
}

const lastFolders = (b) => b.msgs.filter((m) => m.type === 'folders').at(-1)?.folders ?? []

try {
  // --- 0. clean slate ---
  await mkdir(OTHER_CWD, { recursive: true }).catch(() => {})
  await fetch(`http://127.0.0.1:${BASE_PORT}/api/shutdown`, { method: 'POST' }).catch(() => {})
  await sleep(500)
  await rm(ROUTER_STATE, { force: true }).catch(() => {})

  // --- 1. pi A in the extension dir launches the UI ---
  const a = startPi(EXT_DIR, `${EXT_DIR}/index.ts`)
  a.send({ type: 'prompt', message: '/montflow --port=24342' })
  await a.waitFor((e) => e.type === 'response' && e.command === 'prompt')
  const notifyA = await a.waitFor(
    (e) => e.type === 'extension_ui_request' && e.method === 'notify' && /available at/.test(e.message ?? ''),
  )
  const port = Number(/127\.0\.0\.1:(\d+)/.exec(notifyA.message)[1])
  check('router on uncommon port', port >= BASE_PORT && port <= BASE_PORT + 10, String(port))
  check('notify says available', /available at/.test(notifyA.message), notifyA.message)

  // --- 2. router health + SPA + state file ---
  const health = await (await fetch(`http://127.0.0.1:${port}/healthz`)).json()
  check('healthz ok + version 1', health.ok === true && health.version === 3)
  const spa = await (await fetch(`http://127.0.0.1:${port}/`)).text()
  check('SPA served by router', spa.includes('<div id="root">'))
  const routerState = JSON.parse(await readFile(ROUTER_STATE, 'utf8'))
  check('router state file written', routerState.port === port && typeof routerState.pid === 'number')

  // --- 2b. workspace marker auto-created, named after the git branch ---
  const wsMarker = JSON.parse(
    await readFile(join(EXT_DIR, '.agents', '@montflow', 'workspace.json'), 'utf8'),
  )
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: EXT_DIR, encoding: 'utf8' }).trim()
  check('workspace marker named after git branch', wsMarker.name === branch, wsMarker.name)
  check('workspace id is an 8-char slug', /^[0-9a-f]{8}$/.test(wsMarker.id), wsMarker.id)

  // --- 3. browser: folders + hello for instance A ---
  const b = await browserWs(port)
  check('browser gets folders list (1)', lastFolders(b).length === 1, JSON.stringify(lastFolders(b).map((f) => f.id)))
  check('instance A has clean slug', lastFolders(b)[0]?.id === 'zi', lastFolders(b)[0]?.id)
  check('hello for instance A', b.msgs.some((m) => m.type === 'hello' && m.folder === 'zi'))

  // --- 4. command dispatch over WS (no agent turn) ---
  b.ws.send(JSON.stringify({ folder: 'zi', command: { type: 'command', text: '/montflow --port=24342' } }))
  await sleep(1500)
  check('command dispatched (no agent turn)', !b.msgs.some((m) => m.type === 'event' && m.event?.type === 'agent_start'))

  // --- 5. prompt round-trip over WS ---
  b.ws.send(JSON.stringify({ folder: 'zi', command: { type: 'prompt', text: 'hello from ws' } }))
  await sleep(2500)
  check('prompt → forwarded message_start(user)', b.msgs.some(
    (m) => m.type === 'event' && m.event?.type === 'message_start' && m.event?.message?.role === 'user' && JSON.stringify(m.event.message.content).includes('hello from ws'),
  ))

  // --- 6. second pi in a DIFFERENT folder → second folder ---
  const c = startPi(OTHER_CWD, `${EXT_DIR}/index.ts`)
  c.send({ type: 'prompt', message: '/montflow --port=24342' })
  await c.waitFor((e) => e.type === 'response' && e.command === 'prompt')
  await sleep(2500)
  check('different-folder instance appears', lastFolders(b).length === 2, JSON.stringify(lastFolders(b).map((f) => f.id)))
  const otherFolder = lastFolders(b).find((f) => f.cwd === OTHER_CWD)
  check('other folder id', !!otherFolder, otherFolder?.id)

  // --- 7. SECOND pi in the SAME folder → instance #2, both coexist ---
  const d = startPi(EXT_DIR, `${EXT_DIR}/index.ts`)
  d.send({ type: 'prompt', message: '/montflow --port=24342' })
  await d.waitFor((e) => e.type === 'response' && e.command === 'prompt')
  await sleep(2500)
  const folders3 = lastFolders(b)
  check('same-folder instance #2 appears (3 total)', folders3.length === 3, JSON.stringify(folders3.map((f) => f.id)))
  const inst2 = folders3.find((f) => f.id.startsWith('zi--'))
  check('instance #2 has suffixed id', !!inst2, inst2?.id)
  check('instance #2 named #2', inst2?.name === 'zi #2', inst2?.name)
  check('instance A still present (we did NOT stop it)', folders3.some((f) => f.id === 'zi'))

  // instance #2's hello arrived
  check('hello for instance #2', b.msgs.some((m) => m.type === 'hello' && m.folder === inst2.id))

  // prompt routed to instance #2 specifically
  b.ws.send(JSON.stringify({ folder: inst2.id, command: { type: 'prompt', text: 'hi instance two' } }))
  await sleep(2500)
  check('instance #2 prompt routes to it', b.msgs.some(
    (m) => m.type === 'event' && m.folder === inst2.id && m.event?.type === 'message_start' && m.event?.message?.role === 'user' && JSON.stringify(m.event.message.content).includes('hi instance two'),
  ))

  // --- 8. version mismatch: fake backend with wrong version is rejected ---
  const fake = new WebSocket(`ws://127.0.0.1:${port}/backend`)
  const fakeMsgs = []
  fake.on('message', (d) => fakeMsgs.push(JSON.parse(d.toString())))
  await new Promise((res, rej) => { fake.on('open', res); fake.on('error', rej) })
  fake.send(JSON.stringify({ type: 'register', folder: 'bad-version', cwd: '/tmp/bad', name: 'bad', version: 999, instanceId: 'fake-1' }))
  await sleep(800)
  const mismatch = fakeMsgs.find((m) => m.type === 'error' && m.code === 'VERSION_MISMATCH')
  check('version mismatch rejected', !!mismatch, mismatch?.message?.slice(0, 80) ?? '(none)')
  check('mismatched backend closed', fake.readyState === WebSocket.CLOSED || fake.readyState === WebSocket.CLOSING)
  check('bad version NOT in picker', !lastFolders(b).some((f) => f.id === 'bad-version'))

  // --- 9. instance #2 (pi d) exits → only IT drops; A and B survive ---
  d.agent.kill('SIGTERM')
  await sleep(1500)
  const folders4 = lastFolders(b)
  check('instance #2 dropped after exit', folders4.length === 2 && !folders4.some((f) => f.id === inst2.id), JSON.stringify(folders4.map((f) => f.id)))
  check('instance A survived', folders4.some((f) => f.id === 'zi'))
  check('different-folder instance survived', folders4.some((f) => f.cwd === OTHER_CWD))

  // --- 10. --stop shuts the router down ---
  c.send({ type: 'prompt', message: '/montflow --port=24342 --stop' })
  await sleep(1500)
  const stopResp = c.events.find((e) => e.type === 'extension_ui_request' && e.method === 'notify' && /stopped/.test(e.message ?? ''))
  check('--stop acknowledged', !!stopResp, stopResp?.message ?? '(none)')
  const healthAfter = await fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.json()).catch(() => null)
  check('router is down after stop', healthAfter === null || healthAfter.ok !== true)
  await rm(ROUTER_STATE, { force: true }).catch(() => {})

  b.ws.close()
  fake.close()
  a.agent.kill('SIGTERM')
  c.agent.kill('SIGTERM')
  await sleep(500)
} catch (err) {
  failures++
  console.error('SMOKE TEST ERROR:', err.message)
} finally {
  await fetch(`http://127.0.0.1:${BASE_PORT}/api/shutdown`, { method: 'POST' }).catch(() => {})
  await fetch(`http://127.0.0.1:${BASE_PORT + 1}/api/shutdown`, { method: 'POST' }).catch(() => {})
  await rm(ROUTER_STATE, { force: true }).catch(() => {})
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}
