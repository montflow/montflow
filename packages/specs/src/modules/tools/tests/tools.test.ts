import * as Vitest from '@effect/vitest';
import * as Tools from '../index.js';

const COMMANDS = ['# Workspace', '', '## Commands', '', '- test: `bun test`', ''];

const canonical = Tools.renderToolsSection();

Vitest.describe('Tools.verifyAgentsTools', () => {
  Vitest.it('accepts the canonical section', () => {
    const result = Tools.verifyAgentsTools([...COMMANDS, canonical].join('\n'));
    Vitest.expect(result.valid).toBe(true);
    Vitest.expect(result.issues).toHaveLength(0);
  });

  Vitest.it('reports a missing section', () => {
    const result = Tools.verifyAgentsTools(COMMANDS.join('\n'));
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues.map((found) => found.code)).toEqual([Tools.CODES.missing]);
    Vitest.expect(result.issues[0]?.field).toBe(Tools.AGENTS_FILE);
  });

  Vitest.it('ignores a deeper heading named Tools', () => {
    const markdown = [...COMMANDS, '### Tools', ''].join('\n');
    Vitest.expect(Tools.toolsSection(markdown)).toBeUndefined();
    Vitest.expect(Tools.verifyAgentsTools(markdown).issues[0]?.code).toBe(Tools.CODES.missing);
  });

  Vitest.it('reports a section with no table header', () => {
    const markdown = [...COMMANDS, '## Tools', '', 'Ask the CLI.', ''].join('\n');
    const result = Tools.verifyAgentsTools(markdown);
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues[0]?.code).toBe(Tools.CODES.noTable);
  });

  Vitest.it('reports a known binary with no row', () => {
    const markdown = [
      '## Tools',
      '',
      '| CLI | Description |',
      '| --- | --- |',
      '| `other` | something else |',
      '',
    ].join('\n');
    const result = Tools.verifyAgentsTools(markdown);
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues.map((found) => found.code)).toEqual([Tools.CODES.missingRow]);
  });

  Vitest.it('reports an empty description cell', () => {
    const markdown = [
      '## Tools',
      '',
      '| CLI | Description |',
      '| --- | --- |',
      '| `mf-specs` | |',
      '',
    ].join('\n');
    const result = Tools.verifyAgentsTools(markdown);
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues.map((found) => found.code)).toEqual([Tools.CODES.emptyDescription]);
  });

  Vitest.it('accepts an extra row for an unknown binary', () => {
    const markdown = [
      '## Tools',
      '',
      '| CLI | Description |',
      '| --- | --- |',
      '| `mf-specs` | spec truth |',
      '| `own-tool` | workspace tool |',
      '',
    ].join('\n');
    Vitest.expect(Tools.verifyAgentsTools(markdown).valid).toBe(true);
  });
});

Vitest.describe('Tools.addToolsSection', () => {
  Vitest.it('inserts after the Commands section', () => {
    const repaired = Tools.addToolsSection([...COMMANDS, '## Specs', '', '- store', ''].join('\n'));
    const lines = repaired.split('\n');
    const heading = lines.indexOf(`## ${Tools.TOOLS_HEADING}`);
    const specs = lines.indexOf('## Specs');
    Vitest.expect(heading).toBeGreaterThan(0);
    Vitest.expect(heading).toBeLessThan(specs);
    Vitest.expect(Tools.verifyAgentsTools(repaired).valid).toBe(true);
  });

  Vitest.it('appends at the end when no Commands section exists', () => {
    const repaired = Tools.addToolsSection('# Workspace\n');
    Vitest.expect(Tools.verifyAgentsTools(repaired).valid).toBe(true);
  });

  Vitest.it('is idempotent', () => {
    const once = Tools.addToolsSection(COMMANDS.join('\n'));
    Vitest.expect(Tools.addToolsSection(once)).toBe(once);
  });

  Vitest.it('replaces a stale row and keeps an unknown row', () => {
    const stale = [
      '## Tools',
      '',
      '| CLI | Description |',
      '| --- | --- |',
      '| `mf-specs` | old text |',
      '| `own-tool` | workspace tool |',
      '',
    ].join('\n');
    const repaired = Tools.addToolsSection(stale);
    Vitest.expect(repaired).toContain('`own-tool` | workspace tool');
    Vitest.expect(repaired).not.toContain('old text');
    Vitest.expect(Tools.verifyAgentsTools(repaired).valid).toBe(true);
  });
});

Vitest.describe('Tools.renderToolsSection', () => {
  Vitest.it('renders the two required columns', () => {
    Vitest.expect(canonical).toContain(`| ${Tools.TOOL_COLUMNS[0]} | ${Tools.TOOL_COLUMNS[1]} |`);
    Vitest.expect(canonical).toContain('`mf-specs`');
    Vitest.expect(canonical.endsWith('\n')).toBe(true);
  });
});
