import * as PrEngines from './pr-engines.apps.module.js';

/** `mf-mode pr attach` output: where each file went, then the markdown to paste. */
export const attached = (result: PrEngines.Attached): string =>
  [
    'attached=' +
      result.files.length +
      (result.branch === undefined ? '' : ' branch=' + result.branch + ' commit=' + result.commit),
    ...result.files.map((file) => 'file=' + file.name + ' via=' + file.via),
    ...result.notes.map((note) => 'note="' + note.replace(/"/g, "'") + '"'),
    ...PrEngines.markdown(result),
    'next="paste the markdown lines above under ## Proof in the PR body"',
  ].join('\n');
