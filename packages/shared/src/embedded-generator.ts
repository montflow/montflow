import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface EmbeddedGeneratorOptions {
  packageRoot: string;
  sourceDir: string;
  outputPath: string;
  names?: readonly string[];
  exportName?: string;
  mode?: 'skills' | 'prompts' | 'files';
  header?: string;
}

export async function generateEmbeddedPayload(options: EmbeddedGeneratorOptions): Promise<void> {
  const {
    packageRoot,
    sourceDir,
    outputPath,
    names,
    exportName = 'EMBEDDED_SKILL_PAYLOAD',
    mode = 'skills',
    header,
  } = options;

  const PACKAGE_ROOT = resolve(packageRoot);
  const SOURCE_DIR = join(PACKAGE_ROOT, sourceDir);
  const OUTPUT = join(PACKAGE_ROOT, outputPath);

  let payload: any;

  if (mode === 'prompts') {
    const entries = (await readdir(SOURCE_DIR)).filter((entry: string) => entry.endsWith('.json')).toSorted();
    const result: Record<string, string> = {};
    for (const file of entries) {
      if (names && !names.includes(file.slice(0, -'.json'.length))) continue;
      result[file.slice(0, -'.json'.length)] = await Bun.file(join(SOURCE_DIR, file)).text();
    }
    payload = result;
  } else if (mode === 'skills') {
    const skillNames = names || (await readdir(SOURCE_DIR)).filter((entry: string) => !entry.startsWith('.')).toSorted();
    const result: Record<string, Record<string, string>> = {};
    for (const name of skillNames) {
      const dir = join(SOURCE_DIR, name as string);
      try {
        const entries = (await readdir(dir)).filter((entry: string) => !entry.startsWith('.')).toSorted();
        const files: Record<string, string> = {};
        for (const entry of entries) {
          files[entry as string] = await Bun.file(join(dir, entry as string)).text();
        }
        if (files['SKILL.md'] === undefined && names) {
          throw new Error(`skill '${name}' has no SKILL.md — refusing to generate`);
        }
        if (files['SKILL.md'] !== undefined || Object.keys(files).length > 0) {
          result[name as string] = files;
        }
      } catch (e) {
        if (names) throw e;
        continue;
      }
    }
    payload = result;
  } else {
    // files mode - read files as flat map or by structure
    if (mode === 'files') {
      const entries = (await readdir(SOURCE_DIR)).filter((entry: string) => !entry.startsWith('.')).toSorted();
      const result: Record<string, string> | Record<string, Record<string, string>> = {};
      // For profiles/prompts we want to store as flat or nested; check structure
      // Try to read as files directly in dir or in subdirs
      for (const entry of entries) {
        const fullPath = join(SOURCE_DIR, entry as string);
        try {
          const stat = await Bun.file(fullPath).stat?.() || null;
        } catch {}
      }
      // Default: treat as directory of items where each is a file or dir
      for (const entry of entries) {
        const dir = join(SOURCE_DIR, entry as string);
        try {
          const subEntries = (await readdir(dir)).filter((f: string) => !f.startsWith('.')).toSorted();
          if (subEntries.length > 0 && subEntries.every((f) => !f.includes('.'))) {
            // it's a directory containing files
            const fileMap: Record<string, string> = {};
            for (const f of subEntries) {
              fileMap[f as string] = await Bun.file(join(dir, f as string)).text();
            }
            if (Object.keys(fileMap).length > 0) (result as any)[entry as string] = fileMap;
          } else if (subEntries.includes('PROFILE.md') || subEntries.includes('SKILL.md')) {
            const fileMap: Record<string, string> = {};
            for (const f of subEntries) {
              fileMap[f as string] = await Bun.file(join(dir, f as string)).text();
            }
            if (Object.keys(fileMap).length > 0) (result as any)[entry as string] = fileMap;
          } else {
            // maybe files directly
            const fileMap: Record<string, string> = {};
            for (const f of subEntries) {
              fileMap[f as string] = await Bun.file(join(dir, f as string)).text();
            }
            if (Object.keys(fileMap).length > 0) (result as any)[entry as string] = fileMap;
          }
        } catch {
          // try as file
          try {
            const content = await Bun.file(dir).text();
            (result as any)[entry as string] = content;
          } catch {
            continue;
          }
        }
      }
      payload = result;
    } else {
      const entries = (await readdir(SOURCE_DIR)).filter((entry: string) => !entry.startsWith('.')).toSorted();
      const result: Record<string, Record<string, string>> = {};
      if (names) {
        for (const name of names) {
          const dir = join(SOURCE_DIR, name as string);
          try {
            const files = (await readdir(dir)).filter((f: string) => !f.startsWith('.')).toSorted();
            const fileMap: Record<string, string> = {};
            for (const f of files) {
              fileMap[f as string] = await Bun.file(join(dir, f as string)).text();
            }
            if (Object.keys(fileMap).length > 0) result[name as string] = fileMap;
          } catch {
            continue;
          }
        }
      } else {
        for (const entry of entries) {
          const dir = join(SOURCE_DIR, entry as string);
          try {
            const files = (await readdir(dir)).filter((f: string) => !f.startsWith('.')).toSorted();
            const fileMap: Record<string, string> = {};
            for (const f of files) {
              fileMap[f as string] = await Bun.file(join(dir, f as string)).text();
            }
            if (Object.keys(fileMap).length > 0) result[entry as string] = fileMap;
          } catch {
            continue;
          }
        }
      }
      payload = result;
    }
  }

  const defaultHeader = header || `/**
 * DO NOT EDIT — generated by shared embedded payload generator.
 *
 * Embedded payload so the binary is self-contained under \`bun build --compile\`,
 * where the package directory does not exist at runtime.
 */
`;

  const body =
    defaultHeader +
    `export const ${exportName}: ${
      mode === 'prompts'
        ? `Readonly<Record<string, string>>`
        : mode === 'files'
          ? `Readonly<Record<string, any>>`
          : `Readonly<Record<string, Readonly<Record<string, string>>>>`
    } = ${JSON.stringify(payload, null, 2)};
`;

  await Bun.write(OUTPUT, body);
  if (mode === 'prompts') {
    const count = Object.keys(payload as Record<string, string>).length;
    console.log(`wrote ${OUTPUT.replace(PACKAGE_ROOT, '.')} — ${count} items`);
  } else {
    const p = payload as Record<string, Record<string, string>>;
    const count = Object.keys(p).length;
    const bytes = Object.values(p).reduce(
      (total: number, files: any) => total + Object.values(files).reduce((sum: number, text: any) => sum + (text as string).length, 0),
      0,
    );
    console.log(`wrote ${OUTPUT.replace(PACKAGE_ROOT, '.')} — ${count} items, ${bytes} bytes of payload`);
  }
}
