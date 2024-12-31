export type Position = { x: number; y: number };
export type GameState = "start" | "in-play" | "death";
export type PieceLabel = "O" | "I" | "S" | "Z" | "L" | "J" | "T";
export type Rotation = number;
export type Color = string;
export type Difficulty = "easy";
export type Input = "left" | "right" | "down" | "rotate-clockwise" | "rotate-anticlockwise";

export type Cell = {
  piece: { label: PieceLabel; id: number } | null;
};

export type Grid = Cell[][];

export type Piece = {
  id: number;
  label: PieceLabel;
  position: Position;
  rotation: Rotation;
};
