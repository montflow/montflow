import { Path } from 'effect';

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
