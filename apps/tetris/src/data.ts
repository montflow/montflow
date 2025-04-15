import { Dictionary } from "@montflow/core";
import { Orientation, PieceLayout, PieceTag } from "./tetris";

export const PieceColor = {
  T: "oklch(70% 0.25 350)",
  L: "oklch(70% 0.25 50)",
  J: "oklch(70% 0.25 250)",
  Z: "oklch(70% 0.25 25)",
  S: "oklch(70% 0.25 150)",
  I: "oklch(70% 0.25 200)",
  O: "oklch(70% 0.25 90)",
  none: "transparent",
} as const satisfies Record<PieceTag | "none", string>;

// prettier-ignore
export const PieceLayouts = {
  T: {
    //     ⬜
    //  ⬜⬜⬜
    up: new Set([
              "0 1", 
      "-1 0", "0 0", "1 0"
    ]),
    //  ⬜
    //  ⬜⬜
    //  ⬜
    right: new Set([
      "0 1",
      "0 0", "1 0",
      "0 -1"
    ]),
    //  ⬜⬜⬜
    //    ⬜
    down: new Set([
      "-1 0", "0 0", "1 0",
              "0 -1"
    ]),
    //     ⬜
    //  ⬜⬜
    //    ⬜
    left: new Set([
              "0 1",
      "-1 0", "0 0",
              "0 -1"
    ])
  },
  L: {
    //    ⬜
    //   ⬜
    //  ⬜⬜
    up: new Set([
      "0 1",
      "0 0",
      "0 -1", "1 -1"
    ]),
    //   ⬜⬜⬜
    //  ⬜
    right: new Set([
      "-1 0", "0 0", "1 0",
      "-1 -1"
    ]),
    //  ⬜⬜
    //    ⬜
    //    ⬜
    down: new Set([
      "-1 1", "0 1",
              "0 0",
              "0 -1"
    ]),
    //     ⬜
    //  ⬜⬜⬜
    left: new Set([
              "1 1",
      "-1 0", "0 0", "1 0"
    ])
  },
  J: {
    //      ⬜
    //     ⬜
    //  ⬜⬜
    up: new Set([
              "0 1",
              "0 0",
      "-1 -1", "0 -1"
    ]),
    //   ⬜
    //  ⬜⬜⬜
    right: new Set([
      "-1 1",
      "-1 0", "0 0", "1 0"
    ]),
    //  ⬜⬜
    //  ⬜
    //  ⬜
    down: new Set([
      "0 1", "1 1",
      "0 0",
      "0 -1"
    ]),
    //  ⬜⬜⬜
    //      ⬜
    left: new Set([
      "-1 0", "0 0", "1 0",
              "1 -1"
    ])
  },
  Z: {
    //  ⬜⬜
    //    ⬜⬜
    up: new Set([
      "-1 0", "0 0",
              "0 -1", "1 -1"
    ]),
    //      ⬜
    //   ⬜⬜
    //  ⬜
    right: new Set([
              "0 1",
      "-1 0", "0 0",
      "-1 -1"
    ]),
    //  ⬜⬜
    //    ⬜⬜
    down: new Set([
      "-1 1", "0 1",
              "0 0", "1 0"
    ]),
    //     ⬜
    //  ⬜⬜
    // ⬜
    left: new Set([
              "1 1",
      "0 0", "1 0",
      "0 -1"
    ])
  },
  S: {
    //     ⬜⬜
    //  ⬜⬜
    up: new Set([
              "0 0", "1 0",
      "-1 -1", "0 -1"
    ]),
    //  ⬜
    //  ⬜⬜
    //    ⬜
    right: new Set([
      "-1 1",
      "-1 0", "0 0",
              "0 -1"
    ]),
    //     ⬜⬜
    //  ⬜⬜
    down: new Set([
              "0 1", "1 1",
      "-1 0", "0 0"
    ]),
    //     ⬜
    //  ⬜⬜
    // ⬜
    left: new Set([
              "0 1",
      "0 0", "1 0",
      "1 -1"
    ])
  },
  I: {
    //     ⬜
    //    ⬜
    //   ⬜
    //  ⬜
    up: new Set([
      "0 2",
      "0 1",
      "0 0",
      "0 -1"
    ]),
    //  ⬜⬜⬜⬜
    right: new Set([
      "-1 0", "0 0", "1 0", "2 0"
    ]),
  },
  O: {
    //  ⬜⬜
    //  ⬜⬜
    up: new Set([
      "0 0", "1 0",
      "0 -1", "1 -1"
    ]),
  }
} as const satisfies Record<PieceTag, Dictionary<Orientation, PieceLayout>>;
