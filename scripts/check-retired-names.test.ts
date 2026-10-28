import { describe, expect, it } from 'vitest';
import { scanText } from './check-retired-names.js';

const basename = (value: string): string => value.split('/').at(-1) ?? value;

const scan = (file: string, contents: string) => scanText(file, contents, basename);

describe('scanText', () => {
  it('flags a retired compound name', () => {
    expect(scan('src/a.ts', 'const x = "pi-prompts";')).toHaveLength(1);
  });

  it('flags a capitalized Pi word and a .pi path', () => {
    expect(scan('src/a.ts', 'The Pi runtime')).toHaveLength(1);
    expect(scan('src/a.ts', 'join(home, ".pi", "agent")')).toHaveLength(1);
  });

  it('flags mixed-case and snake-case variants', () => {
    expect(scan('src/a.ts', 'loadPiProfiles()')).toHaveLength(1);
    expect(scan('src/a.ts', 'pi_prompts')).toHaveLength(1);
    expect(scan('src/a.ts', 'Pi-native')).toHaveLength(1);
  });

  it('flags a retired menu command', () => {
    expect(scan('src/a.ts', 'use /mf-prompts-tui')).toHaveLength(1);
  });

  it('ignores frozen history, changelogs, and generated payloads', () => {
    expect(scan('.agents/@montflow/specs/x/A/A001/TASK.md', 'pi-prompts')).toStrictEqual([]);
    expect(scan('packages/prompts/skills/x/CHANGELOG.md', 'pi-prompts')).toStrictEqual([]);
    expect(scan('pkg/src/apps/doctor/embedded-payload.generated.ts', 'pi-prompts')).toStrictEqual(
      [],
    );
  });

  it('allows only the migration constant line in its owning file', () => {
    const file = 'packages/prompts/src/modules/prompts/prompts.module.ts';
    expect(scan(file, "export const LEGACY_STORE_SEGMENTS = ['.agents', '@montflow', 'pi-prompts'] as const;")).toStrictEqual([]);
    expect(scan(file, 'const other = "pi-prompts";')).toHaveLength(1);
  });

  it('does not flag ordinary words containing pi', () => {
    expect(scan('src/a.ts', 'const pipeline = pick(options);')).toStrictEqual([]);
    expect(scan('src/a.ts', 'capability')).toStrictEqual([]);
  });
});
