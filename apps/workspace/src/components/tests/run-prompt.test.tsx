/** @jsxImportSource @opentui/solid */
import { testRender } from '@opentui/solid';
import { afterEach, describe, expect, test } from 'bun:test';
import type { JSX } from 'solid-js';
import { readFileSync } from 'node:fs';
import { Panel } from '../panel.js';
import {
  detailBodyRows,
  promptPaneColumns,
  promptPaneRows,
  promptPaneTextRows,
  runTranscriptMarkdown,
} from '../run-detail-lines.js';
import { RunPrompt } from '../run-prompt.js';

type Setup = Awaited<ReturnType<typeof testRender>>;

const setups: Array<Setup> = [];

afterEach(() => {
  for (const setup of setups.splice(0)) setup.renderer.destroy();
});

const DIR = '/home/daniel/dev/montflow/main/.agents/@montflow/runs/prompts-verify-tests-v2';

/** The run's own transcript: one JSON event per line, written by the store. */
const realEvents: ReadonlyArray<{ seq: number; role: string; text: string }> = readFileSync(
  `${DIR}/session.jsonl`,
  'utf8',
)
  .split('\n')
  .filter((line) => line.trim() !== '')
  .map((line) => JSON.parse(line));

/** A run whose prompt is a real specification-sized block of text. */
const realDetail = {
  summary: {
    id: 'run-1',
    name: 'prompts-verify-tests-v2',
    description: 'x',
    status: 'done',
    model: 'anthropic/claude',
    thinking: '',
    tools: [],
    prompt: realEvents[0]?.text ?? '',
    spec: '',
    progress: '',
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:04:00.000Z',
  },
  events: realEvents,
  receipt: undefined,
};

const render = async (
  element: () => JSX.Element,
  width: number,
  height: number,
): Promise<Setup> => {
  const setup = await testRender(element, { width, height });
  await setup.renderOnce();
  setups.push(setup);
  return setup;
};

const frameRows = (setup: Setup): ReadonlyArray<string> =>
  setup
    .captureCharFrame()
    .split('\n')
    .map((row) => row.trimEnd());

/** The prompt pane exactly as the app sizes and renders it. */
const renderPromptPane = (
  detail: { summary: { prompt: string } },
  width: number,
  height: number,
  options?: { readonly offset?: number; readonly focused?: boolean },
): Promise<Setup> =>
  render(
    () => (
      <box flexDirection="column" flexGrow={1} minHeight={0} paddingTop={1} paddingX={1}>
        <box
          flexDirection="column"
          flexShrink={0}
          height={promptPaneRows(height, width, detail.summary.prompt)}
          minHeight={0}
        >
          <Panel title="Prompt" selected={options?.focused ?? false}>
            <RunPrompt
              text={detail.summary.prompt}
              columns={promptPaneColumns(width)}
              rows={Math.max(promptPaneRows(height, width, detail.summary.prompt) - 3, 1)}
              offset={options?.offset ?? 0}
              focused={options?.focused ?? false}
            />
          </Panel>
        </box>
      </box>
    ),
    width,
    height,
  );

describe('prompt pane overflow guard', () => {
  test('a specification-sized prompt never paints past the pane border', async () => {
    const setup = await renderPromptPane(realDetail, 110, 26);
    const rows = frameRows(setup);
    const border = rows.findIndex((row) => row.includes('└─'));
    expect(border).toBeGreaterThan(0);
    // Nothing but blank rows below the pane's own border, and the last
    // line of the frame is the outer chrome — never body text.
    const after = rows.slice(border + 1).filter((row) => row !== '');
    expect(after).toStrictEqual([]);
  });

  test('the pane is exactly as tall as its text, borders and footer included', async () => {
    const setup = await renderPromptPane(realDetail, 110, 26);
    const rows = frameRows(setup);
    const top = rows.findIndex((row) => row.includes('┌─Prompt'));
    const bottom = rows.findIndex((row) => row.includes('└─'));
    expect(bottom - top + 1).toBe(promptPaneRows(26, 110, realDetail.summary.prompt));
  });

  test('a short prompt gets a short pane, and still stops at its own border', async () => {
    const detail = { summary: { prompt: 'fix the race' } };
    const setup = await renderPromptPane(detail, 110, 26);
    const rows = frameRows(setup);
    const top = rows.findIndex((row) => row.includes('┌─Prompt'));
    const bottom = rows.findIndex((row) => row.includes('└─'));
    // One text row, two borders, one footer row.
    expect(bottom - top + 1).toBe(4);
    expect(frameRows(setup).filter((row) => row.includes('fix the race'))).toHaveLength(1);
  });

  test('a one-row terminal cannot make the pane taller than the screen', () => {
    expect(promptPaneRows(1, 40, 'x'.repeat(4000))).toBe(promptPaneTextRows(1) + 3);
    expect(promptPaneTextRows(1)).toBe(4);
    expect(detailBodyRows(1, 40, 'x'.repeat(4000))).toBeGreaterThanOrEqual(5);
  });
});

describe('prompt pane scrolling', () => {
  test('reports the rows hidden above and below at the head of the prompt', async () => {
    const setup = await renderPromptPane(realDetail, 110, 26);
    const frame = setup.captureCharFrame();
    expect(frame).toContain('↓ ');
    expect(frame).not.toContain('↑ ');
  });

  test('moves the window down and reports rows above', async () => {
    const head = await renderPromptPane(realDetail, 110, 26, { offset: 0, focused: true });
    const scrolled = await renderPromptPane(realDetail, 110, 26, { offset: 8, focused: true });
    expect(head.captureCharFrame()).not.toBe(scrolled.captureCharFrame());
    expect(scrolled.captureCharFrame()).toContain('↑ ');
  });

  test('only the focused pane advertises the scroll keys', async () => {
    const focused = await renderPromptPane(realDetail, 110, 26, { focused: true });
    const blurred = await renderPromptPane(realDetail, 110, 26, { focused: false });
    expect(focused.captureCharFrame()).toContain('j/k scroll');
    expect(blurred.captureCharFrame()).not.toContain('j/k scroll');
  });
});

describe('transcript sizing with the prompt pane', () => {
  test('the prompt pane takes exactly its rows off the transcript budget', () => {
    const prompt = realDetail.summary.prompt;
    const height = 30;
    const width = 110;
    expect(detailBodyRows(height, width, prompt)).toBe(
      height - 8 - promptPaneRows(height, width, prompt),
    );
  });

  test('a real transcript is far larger than any pane, so the budget is a window', () => {
    expect(runTranscriptMarkdown(realDetail).length).toBeGreaterThan(
      detailBodyRows(30, 110, realDetail.summary.prompt),
    );
  });
});
