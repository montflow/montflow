import { Effect, FileSystem, Path } from 'effect';
import * as Report from '../../modules/report/index.js';
import * as Trace from '../../modules/trace/index.js';
import { Host } from '../../services/index.js';

/**
 * `mf-mode report`: an mf-mode-observe trace in, the run report out as HTML,
 * plus a PNG of its summary card and a PDF of the whole page when a
 * Chromium-family browser is found. A missing browser never fails the
 * command: the HTML is written and the reason the images were skipped is
 * returned.
 */

export interface ReportOptions {
  /** Workspace root: a relative trace or out path resolves against it. */
  readonly root: string;
  readonly trace: string;
  /** Directory for the outputs; the trace's directory when undefined. */
  readonly out: string | undefined;
  readonly title: string | undefined;
  readonly browser: string | undefined;
  readonly images: boolean;
}

export interface ReportResult {
  readonly html: string;
  readonly png: string | undefined;
  readonly pdf: string | undefined;
  readonly browser: string | undefined;
  /** Why the PNG and PDF were not written, when they were not. */
  readonly skipped: string | undefined;
  readonly events: number;
  readonly problems: ReadonlyArray<Trace.Problem>;
}

/** Executables tried on `PATH`, in order. */
const PATH_BROWSERS = [
  'chromium',
  'chromium-browser',
  'google-chrome',
  'google-chrome-stable',
  'chrome',
  'chrome-headless-shell',
  'microsoft-edge',
  'brave-browser',
] as const;

/** macOS app bundles tried last, in order. */
const APP_BROWSERS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
] as const;

const PLAYWRIGHT_CACHES = ['Library/Caches/ms-playwright', '.cache/ms-playwright'] as const;

const firstLine = (text: string): string => text.trim().split('\n')[0] ?? '';

const fileUrl = (path: string, hash: string): string =>
  'file://' + encodeURI(path).replace(/#/g, '%23').replace(/\?/g, '%3F') + hash;

/**
 * The browser to render with: `--browser`, then `MF_MODE_BROWSER`, then
 * `PATH`, then a Playwright headless shell, then a macOS app.
 * @param flag - the `--browser` value, if any
 * @returns its path or name, or undefined when none is found
 */
export const findBrowser = (flag: string | undefined) =>
  Effect.gen(function* () {
    if (flag !== undefined) return flag;
    const host = yield* Host.Host;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const fromEnv = host.env['MF_MODE_BROWSER'];
    if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
    for (const name of PATH_BROWSERS) if (yield* host.installed(name)) return name;
    const exists = (file: string) => fs.exists(file).pipe(Effect.orElseSucceed(() => false));
    const list = (dir: string) =>
      fs.readDirectory(dir).pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
    const home = host.env['HOME'];
    if (home !== undefined) {
      for (const cache of PLAYWRIGHT_CACHES) {
        const base = path.join(home, cache);
        const shells = (yield* list(base))
          .filter((entry) => entry.startsWith('chromium_headless_shell-'))
          .toSorted()
          .toReversed();
        for (const shell of shells) {
          for (const sub of yield* list(path.join(base, shell))) {
            const candidate = path.join(base, shell, sub, 'chrome-headless-shell');
            if (yield* exists(candidate)) return candidate;
          }
        }
      }
    }
    for (const app of APP_BROWSERS) if (yield* exists(app)) return app;
    return undefined;
  });

const HEIGHT = /mf-mode-height:(\d+)/;
const PROBE =
  "<script>document.title='mf-mode-height:'+document.documentElement.scrollHeight</script>";

/**
 * Write the summary-card PNG and the full-page PDF with one browser.
 * @returns undefined on success, else why it failed
 */
const capture = (options: {
  readonly browser: string;
  readonly html: string;
  readonly png: string;
  readonly pdf: string;
}) =>
  Effect.gen(function* () {
    const host = yield* Host.Host;
    const fs = yield* FileSystem.FileSystem;
    const profile = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-mode-report-' });
    const base = [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--user-data-dir=' + profile,
    ];
    const card = '#card';
    const probe = options.html.replace(/\.html$/, '') + '.probe.html';
    const page = yield* fs.readFileString(options.html);
    yield* fs.writeFileString(probe, page.replace('</body>', PROBE + '</body>'));
    const dumped = yield* host.exec(options.browser, [
      ...base,
      '--window-size=1200,900',
      '--dump-dom',
      fileUrl(probe, card),
    ]);
    yield* fs.remove(probe).pipe(Effect.ignore);
    if (dumped.code !== 0) {
      return options.browser + ' exited ' + dumped.code + ': ' + firstLine(dumped.stderr);
    }
    const height = Number(HEIGHT.exec(dumped.stdout)?.[1] ?? 1400);
    const shot = yield* host.exec(options.browser, [
      ...base,
      '--window-size=1200,' + Math.max(400, Math.min(height, 8000)),
      '--force-device-scale-factor=2',
      '--screenshot=' + options.png,
      fileUrl(options.html, card),
    ]);
    const printed = yield* host.exec(options.browser, [
      ...base,
      '--no-pdf-header-footer',
      '--print-to-pdf-no-header',
      '--print-to-pdf=' + options.pdf,
      fileUrl(options.html, ''),
    ]);
    const missing = [];
    if (!(yield* fs.exists(options.png))) missing.push('PNG (' + firstLine(shot.stderr) + ')');
    if (!(yield* fs.exists(options.pdf))) missing.push('PDF (' + firstLine(printed.stderr) + ')');
    return missing.length === 0
      ? undefined
      : options.browser + ' wrote no ' + missing.join(' and no ');
  }).pipe(
    Effect.scoped,
    Effect.catch((error) => Effect.succeed('could not render images: ' + String(error))),
  );

/**
 * Render a trace into the report files.
 * @param options - the trace, where to write, and how to render
 * @returns the files written and the trace's problems
 */
export const report = (options: ReportOptions) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tracePath = path.resolve(options.root, options.trace);
    const source = yield* fs
      .readFileString(tracePath)
      .pipe(Effect.mapError((error) => 'Cannot read ' + tracePath + ': ' + error.message));
    const trace = Trace.parseTrace(source);
    if (trace.events.length === 0) {
      return yield* Effect.fail(
        'No valid events in ' +
          options.trace +
          ' (' +
          Trace.plural(trace.problems.length, 'unreadable line') +
          '). Append events with the emit.sh script of the mf-mode-observe skill.',
      );
    }
    const model = Trace.buildModel(trace, options.title);
    const dir = path.resolve(options.root, options.out ?? path.dirname(tracePath));
    const stem = path.basename(options.trace).replace(/\.jsonl?$/i, '');
    const html = path.join(dir, stem + '.report.html');
    yield* fs
      .makeDirectory(dir, { recursive: true })
      .pipe(Effect.mapError((error) => error.message));
    yield* fs
      .writeFileString(html, Report.renderReport(model, path.basename(options.trace)))
      .pipe(Effect.mapError((error) => 'Cannot write ' + html + ': ' + error.message));
    const result = {
      html,
      png: undefined,
      pdf: undefined,
      browser: undefined,
      skipped: undefined,
      events: trace.events.length,
      problems: model.problems,
    };
    if (!options.images) return { ...result, skipped: '--no-images' };
    const browser = yield* findBrowser(options.browser);
    if (browser === undefined) {
      return {
        ...result,
        skipped:
          'no Chromium-family browser found; install one, set MF_MODE_BROWSER, or pass --browser',
      };
    }
    const png = path.join(dir, stem + '.report.png');
    const pdf = path.join(dir, stem + '.report.pdf');
    const failed = yield* capture({ browser, html, png, pdf });
    return failed === undefined
      ? { ...result, png, pdf, browser }
      : { ...result, browser, skipped: failed };
  });
