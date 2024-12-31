import type { Grid, Position } from "./types";

export function nextRandomElement<T>(arr: T[]): T {
  const randomIndex = Math.floor(Math.random() * arr.length);
  return arr[randomIndex];
}

export function keysOf<T extends object>(obj: T): (keyof T)[] {
  return Object.keys(obj) as (keyof T)[];
}

export function nextRandomInt(range: { min?: number; max?: number } = {}): number {
  const { min, max } = { min: 0, max: 1, ...range };

  if (min > max) {
    throw new Error("min must be less than or equal to max");
  }

  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function computePieceDimensions(positions: Position[]): {
  width: number;
  height: number;
} {
  const xCoordinates = positions.map(pos => pos.x);
  const yCoordinates = positions.map(pos => pos.y);

  const minX = Math.min(...xCoordinates);
  const maxX = Math.max(...xCoordinates);
  const minY = Math.min(...yCoordinates);
  const maxY = Math.max(...yCoordinates);

  return {
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

export function gridPrint(grid: Grid) {
  const rows = grid[0].length;
  const cols = grid.length;

  for (let y = rows - 1; y >= 0; y--) {
    const rowCells = [];
    for (let x = 0; x < cols; x++) {
      const piece = grid[x][y].piece;
      rowCells.push(piece ? piece.label : " ");
    }
    console.log(`| ${rowCells.join(" | ")} | > ${y}`);
  }
}

export function cycle(grid: Grid): Grid {
  if (grid.length <= 0) grid;

  const cols = grid.length;
  const rows = grid[0].length;

  const output = [...grid];

  for (let row = 0; row < rows; row++) {
    let isComplete = true;

    for (let i = 0; i < cols; i++) {
      if (output[i][row].piece === null) {
        isComplete = false;
        break;
      }
    }

    if (!isComplete) continue;
    // If we detect a completed row:

    // shift all rows downwards (expect last row)
    for (let j = row; j < rows - 1; j++) {
      for (let i = 0; i < cols; i++) {
        output[i][j] = output[i][j + 1];
      }
    }

    // make last row empty
    for (let i = 0; i < cols; i++) {
      output[i][rows - 1] = { piece: null };
    }

    // decrement here to check the new set row (since we shifted everything downwards)
    row--;
  }

  return output;
}
