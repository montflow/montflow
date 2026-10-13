# Recording UI walkthroughs (video + screenshots)

How to produce the demo media published by `creating-pull-requests`.

This is generic guidance. If the repo ships its own recording tooling, or documents a specific way to record (dev-server commands, ports, seed scripts, auth fixtures), follow that first and treat this document as the fallback.

## 1. Isolate the tooling (use the gitignored scratch dir)

Install the browser automation in the repo's gitignored scratch directory, not in source:

```bash
mkdir -p ./tmp/e2e && cd ./tmp/e2e
bun init -y
bun add playwright
bunx playwright install chromium
```

Write scripts and capture artifacts under `./tmp/e2e/`. Because `tmp/` is gitignored, the repo's `git status` stays clean and nothing is committed.

## 2. Launch a browser

Start the app with the repo's own dev command, then drive it headless. If the bundled browser fails to launch (e.g. missing shared libraries on NixOS), point the automation at a system-provided browser instead:

```ts
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME, // e.g. a Nix-provided chromium
});
```

Find a system browser with your package manager or distro (NixOS: `nix build --no-link --print-out-paths nixpkgs#chromium`). Keep it overridable via `CHROME=` so the script stays portable.

## 3. Record video + screenshots

```ts
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  recordVideo: { dir: "./tmp/e2e/videos", size: { width: 1600, height: 1000 } },
});
const page = await context.newPage();
// ...interact...
await page.screenshot({ path: `./tmp/e2e/shots/${name}.png` });

const video = page.video();
await context.close();      // video is only flushed on context close
await browser.close();
console.log(await video.path());
```

- Keep the default timeout generous (`page.setDefaultTimeout(20000)`).
- Add short `waitForTimeout` beats (~700 ms) so the video is watchable.
- Drive the app the way the target feature works; take a screenshot per state.

## 4. Convert with real ffmpeg

ffmpeg bundled with browser tooling is often **stripped** (no H.264: `Unrecognized option 'movflags'`). Use a full ffmpeg:

```bash
# webm -> mp4 (PR-friendly)
ffmpeg -y -i in.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart out.mp4

# optional inline GIF (prefer MP4; only if the user wants a GIF)
ffmpeg -y -i out.mp4 \
  -vf "fps=10,scale=1100:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer" \
  -loop 0 out.gif
```

Get a full ffmpeg from your package manager or distro (NixOS: `nix shell nixpkgs#ffmpeg -c ffmpeg ...`).

## 5. Interacting with a modern JS app

App-specific quirks live in the repo's own docs; these are the general pitfalls:

- **Wait for the app to settle before clicking.** Filling a field immediately after `domcontentloaded` can let a native form submit fire (the URL gains `?`). Wait for an element, then pause briefly.
- Prefer stable selectors: `data-testid` (`page.getByTestId(...)`), ids, or accessible roles.
- `input[type=password]` still exposes a `textbox` role — `getByRole('textbox')` can match multiple fields; use ids.
- Custom "confirm" buttons may need **two** clicks (first arms, second submits); re-locate the button by position because its label changes.
- Custom tabs may render as `role=button`, not `role=tab`.
- Sliders: focus the slider (`locator('[role="slider"]').focus()`) then `keyboard.press("ArrowRight")`.
- Assert state (e.g. a `data-testid` banner) before screenshotting.

## 6. Seeding demo data

Prefer seeding through the app's own API rather than clicking the UI:

- Start from the repo's dev command and note the API base URL it serves.
- Log in once through the API to capture the auth credential (cookie or token), then replay it on subsequent calls.
- Carry both a user session and any privileged credential in the same client when different procedures need different auth.
- Create prerequisite domain data first, then the entity under test (e.g. create the parent record before the child).
- Unwrap the API's result envelope (`{ ok: true, value }` / `{ ok: false, error }`) before reading fields.

## 7. Cleanup

Everything lives under the gitignored `./tmp/e2e`; nothing is committed. Delete the directory when done, or keep it to re-record.
