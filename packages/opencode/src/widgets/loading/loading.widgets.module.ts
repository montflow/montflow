import { Effect } from 'effect';
import type { CustomViewPort } from '../../modules/ports/view/index.js';
import type { RenderOutput } from '../../modules/ports/grid-page/index.js';

/**
 * Run a closed Effect behind a locked host overlay: the overlay mounts
 * before the effect starts and clears when it settles, so a slow dispatch
 * cannot race the user's input. The Pi widget took a component factory; the
 * host takes a render function, which is the same contract one layer up.
 * @param view - custom-view seam
 * @param render - overlay element factory
 * @param self - effect to run behind the overlay
 * @returns the effect's result, with the overlay always cleared
 */
export const withStatus =
  <A, E, R>(view: CustomViewPort, render: () => RenderOutput, self: Effect.Effect<A, E, R>) =>
  (): Effect.Effect<A, E, R> =>
    Effect.suspend(() => {
      view.show(render);
      return self.pipe(Effect.ensuring(Effect.sync(() => view.clear())));
    });
