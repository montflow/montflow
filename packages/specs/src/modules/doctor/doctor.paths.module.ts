import { Path } from 'effect';

import { RIGORS } from '../rigor/index.js';

/** Rigor file names, derived from the one enum; no second list. */
export const SPEC_RIGOR_NAMES = RIGORS;

/** Root of the installed package, holding `skills/` and `prompts/`. */
export const packageRoot = (path: Path.Path): string =>
  path.resolve(import.meta.dirname, '..', '..', '..');

/** Directory the package ships a skill in. */
export const shippedSkillDir = (path: Path.Path, name: string): string =>
  path.join(packageRoot(path), 'skills', name);

/** Directory the package ships its prompts in. */
export const shippedPromptDir = (path: Path.Path): string =>
  path.join(packageRoot(path), 'prompts');

/** Directory `doctor` installs one skill into. */
export const installedSkillDir = (path: Path.Path, root: string, name: string): string =>
  path.join(root, '.agents', 'skills', name);

/** Directory `doctor` installs its prompts into. */
export const installedPromptDir = (path: Path.Path, root: string): string =>
  path.join(root, '.agents', '@montflow', 'prompts');

/** File `doctor` installs one prompt into. */
export const installedPromptFile = (path: Path.Path, root: string, name: string): string =>
  path.join(installedPromptDir(path, root), `${name}.json`);

/** File the package ships one prompt in. */
export const shippedPromptFile = (path: Path.Path, name: string): string =>
  path.join(shippedPromptDir(path), `${name}.json`);

/** Directory the package ships its rigor files in. */
export const shippedRigorDir = (path: Path.Path): string => path.join(packageRoot(path), 'rigors');

/** File the package ships one rigor instruction in. */
export const shippedRigorFile = (path: Path.Path, name: string): string =>
  path.join(shippedRigorDir(path), `${name}.md`);

/** Directory `doctor` installs the rigor files into. */
export const installedRigorDir = (path: Path.Path, root: string): string =>
  path.join(root, '.agents', '@montflow', 'rigors');

/** File `doctor` installs one rigor instruction into. */
export const installedRigorFile = (path: Path.Path, root: string, name: string): string =>
  path.join(installedRigorDir(path, root), `${name}.md`);
