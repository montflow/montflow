import { Object, Result } from "@montflow/core";
import * as Solid from "solid-js";
import { PieceColor, PieceLayouts } from "./data";
import {
  adjacentElement,
  clamp,
  computeBlockPositions,
  getPieceLayout,
  isBetween,
  leftDifference,
  nextInt,
  nextPick,
  positionToString,
  rightDifference,
  stringToPosition,
} from "./helpers";
import { Computed, State } from "./reactive";
import { Styles } from "./styles";

export const CELL_SIZE = 32;
export const CELL_BORDER_COLOR = "";
export const CELL_EMPTY_COLOR = "";
export const BOARD_COL_COUNT = 10;
export const BOARD_ROW_COUNT = 20;

export const PIECES_BUFFER_SIZE = 5;

export const ROTATE_COUNTER_CLOCKWISE_KEYS = new Set(["q", "z"]);
export const ROTATE_CLOCKWISE_KEYS = new Set(["e", "x"]);
export const SLAM_DOWN_KEYS = new Set([" "]); // Spacebar

export const MOVE_RIGHT_KEYS = new Set(["ArrowRight", "d"]);
export const MOVE_LEFT_KEYS = new Set(["ArrowLeft", "a"]);
export const MOVE_DOWN_KEYS = new Set(["ArrowDown", "s"]);

export const PAUSE_KEYS = new Set(["p", "Escape"]);

export const SHOW_POSITIONS = false;

export const COMPLETE_MULTIPLIERS: Record<number, number> = {
  1: 1,
  2: 3,
  3: 4,
  4: 8,
};

/** "`x` `y`" */
export type PositionString = `${number} ${number}`;
export type Position = { x: number; y: number };
export type Orientation = "up" | "down" | "left" | "right";
export type TranslateDirection = "down" | "left" | "right";
export type RotationDirection = "clockwise" | "counter-clockwise";

export const PIECE_TAG_ARRAY = ["T", "L", "J", "Z", "S", "I", "O"] as const;
export type PieceTag = (typeof PIECE_TAG_ARRAY)[number];
export type PieceLayout = Set<PositionString>;
export type Level = {
  label: string;
  scoreThreshold: number;
  base: number;
  tickDuration: number;
};

const LEVELS = [
  { label: "", scoreThreshold: 30, base: 5, tickDuration: 750 },
  { label: "", scoreThreshold: 50, base: 10, tickDuration: 650 },
  { label: "", scoreThreshold: 75, base: 20, tickDuration: 600 },
  { label: "", scoreThreshold: 250, base: 35, tickDuration: 500 },
  { label: "", scoreThreshold: 500, base: 50, tickDuration: 400 },
  { label: "", scoreThreshold: 1000, base: 75, tickDuration: 300 },
  { label: "", scoreThreshold: 1500, base: 100, tickDuration: 225 },
] satisfies Array<Level>;

export type Piece = {
  id: number;
  tag: PieceTag;
  position: Position;
  orientation: Orientation;
};

const COLS = Array.from({ length: BOARD_COL_COUNT }, (_, i) => i);
const ROWS = Array.from({ length: BOARD_ROW_COUNT }, (_, i) => i);

let next = 0;
const createPiece = (tag: PieceTag): Piece => {
  const layouts = PieceLayouts[tag];
  const orientation = nextPick(Object.keys(layouts));
  const layout = getPieceLayout(tag, orientation);

  let left: number = 0;
  let right: number = 0;
  let down: number = 0;

  for (const position of layout) {
    const { x, y } = stringToPosition(position);

    if (x < left) {
      left = x;
    }

    if (x > right) {
      right = x;
    }

    if (y > down) {
      down = y;
    }
  }

  const position: Position = {
    x: nextInt([Math.abs(left), BOARD_COL_COUNT - right]),
    y: -down - 1,
  };

  return { id: next++, tag, position, orientation };
};

type Context = {
  paused: State.State<boolean>;
  pieceBuffer: State.State<PieceTag[]>;
  board: Map<PositionString, State.State<{ tag: PieceTag; id: number } | { tag: "none" }>>;
  score: State.State<number>;
  level: Computed.Computed<Level>;
};

const Context = Solid.createContext({} as Context);

export const Tetris: Solid.Component = () => {
  const controller = new AbortController();

  const paused: Context["paused"] = State.make(false);
  const score: Context["score"] = State.make(0);

  const level: Context["level"] = Computed.make(score, score$ => {
    let index = LEVELS.length - 1;

    for (let i = 0; i < LEVELS.length; i++) {
      const { scoreThreshold } = LEVELS[i];
      if (score$ > scoreThreshold) continue;
      index = i;
      break;
    }

    return LEVELS[index];
  });

  let accumulatedTime = 0;
  let lastTime = 0;
  let raf = 0;

  let piece = createPiece(nextPick(PIECE_TAG_ARRAY));

  const pieceBuffer: Context["pieceBuffer"] = State.make<PieceTag[]>(
    Array.from({ length: PIECES_BUFFER_SIZE }, () => nextPick(PIECE_TAG_ARRAY))
  );

  const board: Context["board"] = new Map();
  for (const x of COLS) {
    for (const y of ROWS) {
      board.set(`${x} ${y}`, State.make({ tag: "none" }));
    }
  }

  const tryTranslate = (direction: TranslateDirection): Result.Result<Position> => {
    const { id, tag, orientation } = piece;

    let offset: Position = { x: 0, y: 0 };

    switch (direction) {
      case "down": {
        offset.y += 1;
        break;
      }

      case "left": {
        offset.x -= 1;
        break;
      }

      case "right": {
        offset.x += 1;
        break;
      }
    }

    const currentBlockPositions = computeBlockPositions(piece, orientation);
    const newBlockPositions = currentBlockPositions.map(({ x, y }) => ({
      x: x + offset.x,
      y: y + offset.y,
    }));

    const canTranslate = newBlockPositions.every(({ x, y }) => {
      if (
        !isBetween(x, [0, BOARD_COL_COUNT - 1]) ||
        !isBetween(y, [-Infinity, BOARD_ROW_COUNT - 1])
      ) {
        return false;
      }

      const existing = board.get(positionToString({ x, y }));

      if (existing && existing.value.tag !== "none" && existing.value.id !== id) {
        return false;
      }

      return true;
    });

    if (!canTranslate) {
      return Result.err();
    }

    const toUpdate = leftDifference(newBlockPositions, currentBlockPositions);
    const toClear = rightDifference(newBlockPositions, currentBlockPositions);

    Solid.batch(() => {
      [...toClear].map(positionToString).forEach(str => {
        const block = board.get(str);
        if (!block) return;
        block.value = { tag: "none" };
      });

      [...toUpdate].map(positionToString).forEach(str => {
        const block = board.get(str);
        if (!block) return;
        block.value = { id, tag };
      });
    });

    piece.position = { x: piece.position.x + offset.x, y: piece.position.y + offset.y };

    return Result.ok();
  };

  const tryRotate = (direction: RotationDirection): Result.Result => {
    const { id, tag, orientation } = piece;

    const layouts = PieceLayouts[tag];
    const orientations = Object.keys(layouts);
    const currentOrientationIndex = orientations.findIndex(o => o === orientation);
    const nextOrientation = adjacentElement(
      orientations,
      currentOrientationIndex,
      direction === "clockwise" ? "right" : "left"
    );

    const currentBlockPositions = computeBlockPositions(piece, orientation);
    const nextBlockPositions = computeBlockPositions(piece, nextOrientation);

    const canRotate = nextBlockPositions.every(({ x, y }) => {
      if (
        !isBetween(x, [0, BOARD_COL_COUNT - 1]) ||
        !isBetween(y, [-Infinity, BOARD_ROW_COUNT - 1])
      ) {
        return false;
      }

      const existing = board.get(positionToString({ x, y }));

      if (existing && existing.value.tag !== "none" && existing.value.id !== id) {
        return false;
      }

      return true;
    });

    if (!canRotate) {
      return Result.err();
    }

    const toUpdate = leftDifference(nextBlockPositions, currentBlockPositions);
    const toClear = rightDifference(nextBlockPositions, currentBlockPositions);

    Solid.batch(() => {
      [...toClear].map(positionToString).forEach(str => {
        const block = board.get(str);
        if (!block) return;
        block.value = { tag: "none" };
      });

      [...toUpdate].map(positionToString).forEach(str => {
        const block = board.get(str);
        if (!block) return;
        block.value = { id, tag };
      });
    });

    piece.orientation = nextOrientation;

    return Result.ok();
  };

  /** @returns {number} amount of rows completed */
  const shiftCompleted = (): number => {
    let completed = 0;
    Solid.batch(() => {
      for (let row = 0; row < BOARD_ROW_COUNT; row++) {
        let isComplete = true;

        for (let col = 0; col < BOARD_COL_COUNT; col++) {
          const block = board.get(`${col} ${row}`)!;
          if (block.value.tag === "none") {
            isComplete = false;
            break;
          }
        }

        if (isComplete) {
          completed++;
          // When we detect a completed row:
          for (let y = row; y > 0; y--) {
            for (let x = 0; x < BOARD_COL_COUNT; x++) {
              const block = board.get(`${x} ${y}`)!;
              const blockAbove = board.get(`${x} ${y - 1}`);

              block.value = blockAbove ? blockAbove() : { tag: "none" };
            }
          }
        }
      }
    });

    return completed;
  };

  const completeCycle = () => {
    const queue = pieceBuffer();

    const next = queue.shift()!;
    queue.push(nextPick(PIECE_TAG_ARRAY));

    piece = createPiece(next);

    pieceBuffer.value = [...queue];

    const completed = shiftCompleted();

    const multiplier = COMPLETE_MULTIPLIERS[completed];

    if (multiplier) {
      score.value += level.value.base * multiplier;
    }
  };

  const tick = () => {
    const didMove = tryTranslate("down");

    if (!Result.isOk(didMove)) {
      completeCycle();
    }
  };

  const loop = (currentTime: DOMHighResTimeStamp) => {
    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;

    if (deltaTime > 1000) return (raf = requestAnimationFrame(loop));

    accumulatedTime += deltaTime;

    while (accumulatedTime >= level.value.tickDuration) {
      tick();
      accumulatedTime = clamp(accumulatedTime - level.value.tickDuration, [0, Infinity]);
    }

    raf = requestAnimationFrame(loop);
  };

  const handleInput = ({ key }: KeyboardEvent) => {
    if (paused()) return;

    if (MOVE_RIGHT_KEYS.has(key)) {
      tryTranslate("right");
      return;
    }

    if (MOVE_LEFT_KEYS.has(key)) {
      tryTranslate("left");
      return;
    }

    if (MOVE_DOWN_KEYS.has(key)) {
      const translateResult = tryTranslate("down");

      // When the translate down fails (we hit obstacle), we "place" the piece instantly
      if (Result.isErr(translateResult)) {
        completeCycle(); // Auto queue next turn
        accumulatedTime = 0; // Reset tick accumulation duration
      }
      return;
    }

    if (ROTATE_COUNTER_CLOCKWISE_KEYS.has(key)) {
      tryRotate("counter-clockwise");
      return;
    }

    if (ROTATE_CLOCKWISE_KEYS.has(key)) {
      tryRotate("counter-clockwise");
      return;
    }
  };

  Solid.onMount(() => {
    addEventListener("keydown", handleInput, { signal: controller.signal });
    raf = requestAnimationFrame(loop);
  });

  Solid.onCleanup(() => {
    cancelAnimationFrame(raf);
    controller.abort();
  });

  return (
    <div
      style={{
        ...Styles.flex,
        "flex-direction": "row",
        background: Styles.backgroundColor,
        border: `${Styles.borderThickness} solid ${Styles.borderColor()}`,
        "border-radius": "4px",
      }}
    >
      <Context.Provider value={{ board, paused, pieceBuffer, score, level }}>
        <Board />
        <InformationPanel />
      </Context.Provider>
    </div>
  );
};

export const Board: Solid.Component = () => {
  return (
    <div
      style={{
        "flex-shrink": 0,
        display: "grid",
        "grid-template-columns": `repeat(${BOARD_COL_COUNT}, ${CELL_SIZE}px)`,
        "grid-template-rows": `repeat(${BOARD_ROW_COUNT}, ${CELL_SIZE}px)`,
        "border-right": `${Styles.borderThickness} solid ${Styles.borderColor()}`,
      }}
    >
      <Solid.For each={COLS}>
        {x => <Solid.For each={ROWS}>{y => <BoardBlock position={{ x, y }} />}</Solid.For>}
      </Solid.For>
    </div>
  );
};

export const BoardBlock: Solid.Component<{ position: Position }> = ({ position }) => {
  const { board } = Solid.useContext(Context);
  const state = board.get(positionToString(position))!;
  const tag = () => state().tag;

  return (
    <Block
      position={position}
      tag={tag()}
      style={{ border: `calc(${Styles.borderThickness}/2) solid ${Styles.borderColor(0.5)}` }}
    />
  );
};

export const InformationPanel: Solid.Component = () => {
  const { pieceBuffer, score } = Solid.useContext(Context);

  const displayScore = () => {
    const currentScore = score();
    return String(currentScore).padStart(8, "0");
  };

  return (
    <div
      style={{
        padding: "16px",
        display: "flex",
        "flex-direction": "column",
        "justify-content": "space-between",
        "align-items": "center",
      }}
    >
      <div>
        <p
          style={{
            ...Styles.fontMono,
            margin: 0,
            "margin-bottom": "4px",
            "font-weight": 500,
            "font-size": "1.5rem",
          }}
        >
          Next piece
        </p>
        <Solid.For each={pieceBuffer().slice(0, 1)}>
          {piece => <PiecePreview piece={piece} />}
        </Solid.For>
      </div>
      <div style={{ ...Styles.flex, gap: "2px" }}>
        <Solid.For each={Array.from(displayScore())}>
          {n => <p style={{ ...Styles.fontMono, "font-size": "48px", margin: 0 }}>{n}</p>}
        </Solid.For>
      </div>
    </div>
  );
};

const PREVIEW_SIZE = 5;
const PREVIEW_CENTER = { x: 2, y: 2 } satisfies Position;

const PiecePreview: Solid.Component<{ piece: PieceTag }> = props => {
  const preview = Array.from({ length: PREVIEW_SIZE }, () =>
    Array.from({ length: PREVIEW_SIZE }, (): PieceTag | "none" => "none")
  );

  const layout = Object.values(PieceLayouts[props.piece])[0];

  for (const positionString of layout) {
    const position = stringToPosition(positionString);
    preview[PREVIEW_CENTER.x + position.x][PREVIEW_CENTER.y + position.y] = props.piece;
  }

  return (
    <div style={{ padding: "4px", border: "4px solid #8a3024", "background-color": "black" }}>
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "grid",
          "grid-template-columns": `repeat(${3}, ${CELL_SIZE}px)`,
          "grid-template-rows": `repeat(${3}, ${CELL_SIZE}px)`,
        }}
      >
        <Solid.For each={preview}>
          {(row, x) => (
            <Solid.For each={row}>
              {(tag, y) => <Block position={{ x: x(), y: y() }} tag={tag} />}
            </Solid.For>
          )}
        </Solid.For>
      </div>
    </div>
  );
};

export const Block: Solid.Component<{
  position: Position;
  tag: PieceTag | "none";
  style?: Solid.JSX.CSSProperties;
}> = props => {
  const { x: col, y: row } = props.position;

  return (
    <div
      style={{
        width: `${CELL_SIZE}px`,
        height: `${CELL_SIZE}px`,
        "grid-area": `${row + 1} /${col + 1} `,
        "background-color": PieceColor[props.tag],
        ...props.style,
      }}
    >
      <Solid.Show when={SHOW_POSITIONS}>
        <p
          style={{
            ...Styles.flexCenter,
            ...Styles.fontMono,
            "font-size": "10px",
            "font-weight": 600,
            rotate: "45deg",
            color: "rgba(0, 0, 0, 0.5)",
            "user-select": "none",
          }}
        >
          ({col},{row})
        </p>
      </Solid.Show>
    </div>
  );
};

if (BOARD_COL_COUNT < 3) {
  throw new Error("Board must be atleast 3 wide");
}
