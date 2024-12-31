<script lang="ts">
  import { onMount } from "svelte";
  import { None, pipe, Some, type Maybe } from "solzu";
  import { onNone, onSome } from "solzu/@maybe/fp";
  import type { PieceLabel, Color, Cell, Piece, Input, Position } from "./types";
  import { pieces } from "./data";
  import { Loop, Interval } from "@montflow/loop";
  import { cycle, gridPrint, keysOf, nextRandomElement, nextRandomInt } from "./helpers";

  type Props = {
    rows?: number;
    cols?: number;
    size?: number;
    debug?: boolean;
    borderColor?: string;
    borderSize?: number;
  };

  const {
    rows = 18,
    cols = 11,
    size = 24,
    borderColor = "rgba(0, 0, 0, 0.5)",
    debug = false,
    borderSize = 0,
  }: Props = $props();

  const loop = Loop();

  const colors = $state<Record<PieceLabel | "empty", Color>>({
    O: "#FFD700",
    I: "#00CED1",
    S: "#32CD32",
    Z: "#DC143C",
    L: "#FF8C00",
    J: "#4169E1",
    T: "#9370DB",
    empty: "rgba(255, 255, 255, 0.1)",
  });

  let grid: Cell[][] = $state(
    Array.from({ length: cols }, () => Array.from({ length: rows }, () => ({ piece: null })))
  );

  let next = 0;

  let piece = $state<Piece | null>(null);
  let buffer = $state<Piece | null>(null);
  let level = $state<number>(0);

  const setCell = ({ x, y }: Position, to: Piece | null) => {
    if (x < 0 || x >= cols) {
      return;
    }
    if (y < 0 || y >= rows) {
      return;
    }
    grid[x][y].piece = to === null ? null : { id: to.id, label: to.label };
  };

  const movePiece = (to: Piece) => {
    if (!piece) return;

    getCellsOf(piece).forEach(cell => setCell(cell, null));
    piece = to;
    getCellsOf(piece).forEach(cell => setCell(cell, piece));
  };

  const clearCells = () => {
    for (let i = 0; i < grid.length; i++) {
      for (let j = 0; j < grid[i].length; j++) {
        grid[i][j] = { piece: null };
      }
    }
  };

  const getFrameDuration = (level: number) => 500;

  const startGame = () => {
    clearCells();
    loop.clear();

    piece = nextPiece();
    buffer = nextPiece();

    const onIteration = (self: Interval) => {
      if (!piece) return;

      const result = tryInput("down");

      if (result.some) {
        piece = result.value;
        return;
      }

      const newGrid = cycle(grid);

      grid = newGrid;

      piece = buffer;
      buffer = nextPiece();
      loop.register(Interval({ duration: getFrameDuration(level), onIteration }));

      self.stop();
    };

    loop.register(
      Interval({
        duration: getFrameDuration(level),
        onIteration,
      })
    );
  };

  const nextPiece = (): Piece => {
    const label = nextRandomElement(keysOf(pieces));
    const positions = pieces[label];
    const rotation = nextRandomInt({ max: positions.length - 1 });

    const startingPosition = { x: nextRandomInt({ max: cols - 2 }), y: rows + 1 };

    return {
      id: next++,
      label,
      rotation,
      position: startingPosition,
    };
  };

  const getCellsOf = ({ label, position: { x: col, y: row }, rotation }: Piece) => {
    const rotations = pieces[label].length;
    const index = ((rotation % rotations) + rotations) % rotations;
    const positions = pieces[label][index];

    return positions.map(({ x, y }) => ({ x: col + x, y: row + y }));
  };

  const tryInput = (input: Input): Maybe<Piece> => {
    if (!piece) return None();

    const future = { ...piece };

    const {
      position: { x, y },
    } = future;

    switch (input) {
      case "left": {
        future.position = { x: x - 1, y };
        break;
      }
      case "right": {
        future.position = { x: x + 1, y };
        break;
      }

      case "down": {
        future.position = { x, y: y - 1 };
        break;
      }

      case "rotate-clockwise": {
        future.rotation += 1;
        break;
      }

      case "rotate-anticlockwise": {
        future.rotation -= 1;
        break;
      }
    }

    const cells = getCellsOf(future);
    const hasCollision = cells.some(({ x, y }) => {
      if (x < 0 || x >= cols || y < 0) {
        return true;
      }

      if (x >= 0 && x < cols && y >= 0 && y < rows) {
        const cell = grid[x][y];

        if (cell.piece !== null && cell.piece.id !== piece?.id) {
          return true;
        }
      }

      return false;
    });

    const result = hasCollision ? None() : Some(future);

    if (result.some) movePiece(result.value);
    return result;
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (!piece) return;

    switch (event.key) {
      case "ArrowDown":
      case "s": {
        pipe(
          tryInput("down"),
          onSome(({ position }) => (piece!.position = position))
        );
        break;
      }

      case "ArrowLeft":
      case "a": {
        pipe(
          tryInput("left"),
          onSome(({ position }) => (piece!.position = position))
        );
        break;
      }

      case "ArrowRight":
      case "d": {
        pipe(
          tryInput("right"),
          onSome(({ position }) => (piece!.position = position))
        );
        break;
      }

      case "r":
      case "z": {
        pipe(
          tryInput("rotate-clockwise"),
          onSome(({ rotation }) => (piece!.rotation = rotation))
        );
        break;
      }

      case "x": {
        pipe(
          tryInput("rotate-anticlockwise"),
          onSome(({ rotation }) => (piece!.rotation = rotation))
        );
        break;
      }
    }
  };

  const handleKeyup = (event: KeyboardEvent) => {};

  onMount(() => {
    addEventListener("keydown", handleKeydown);
    addEventListener("keyup", handleKeyup);

    startGame();
    return () => {
      removeEventListener("keydown", handleKeydown);
      removeEventListener("keyup", handleKeyup);
    };
  });
</script>

<div
  style="height: 100vh; width: 100vw; display: flex; justify-content: center; align-items: center;"
>
  <!-- Game Window -->
  <div
    style="display: inline-grid; border: {borderSize / 2}px solid {borderColor}; "
    style:grid-template-columns="repeat({cols}, {size}px)"
    style:grid-template-rows="repeat({rows}, {size}px)"
  >
    {#each grid as _, col}
      {#each grid[col] as cell, row}
        <div
          style:grid-column={col + 1}
          style:grid-row={rows - row}
          style:border="{borderSize / 2}px solid {borderColor}"
          style:background-color={colors[cell.piece?.label ?? "empty"]}
        >
          {#if debug}
            <div
              style=" height: 100%; width: 100%; display: flex; justify-content: center; align-items: center;"
            >
              <p
                style="font-size: 8px; font-family: monospace; line-height: 0px; user-select: none;"
              >
                {col},{row}
              </p>
            </div>
          {/if}
        </div>
      {/each}
    {/each}
  </div>
  <!-- Info Window -->
</div>
