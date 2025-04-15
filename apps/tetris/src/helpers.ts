import { Number } from "@montflow/core";
import { PieceLayouts } from "./data";
import { Orientation, Piece, PieceLayout, PieceTag, Position, PositionString } from "./tetris";

export function clamp(value: number, range: Number.Range): number {
  const { min, max } = Number.resolveRange(range);

  if (min > max) {
    throw new Error("min must be less than or equal to max");
  }

  return Math.min(Math.max(value, min), max);
}

export function nextPick<T>(array: readonly T[]): T {
  if (array.length === 0) throw new Error("Cannot pick from empty array");
  return array[Math.floor(Math.random() * array.length)];
}

export function nextInt(range: Number.Range = [0, 1]): number {
  const { min, max } = Number.resolveRange(range);

  if (!Number.isInt(min) || !Number.isInt(max)) {
    throw new Error("Both min and max must be integers");
  }

  if (min > max) {
    throw new Error("Min cannot be greater than max");
  }

  if (min === max) {
    return min;
  }

  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function isBetween(
  value: number,
  range: Number.Range,
  options: { inclusive?: boolean } = { inclusive: true }
): boolean {
  const { min, max } = Number.resolveRange(range);

  if (options.inclusive) {
    return value >= min && value <= max;
  }
  return value > min && value < max;
}

export function intersection<T>(iterableA: Iterable<T>, iterableB: Iterable<T>): Set<T> {
  const setB = iterableB instanceof Set ? iterableB : new Set(iterableB);
  return new Set([...iterableA].filter(x => setB.has(x)));
}

export function leftDifference<T>(iterableA: Iterable<T>, iterableB: Iterable<T>): Set<T> {
  const setB = iterableB instanceof Set ? iterableB : new Set(iterableB);
  return new Set([...iterableA].filter(x => !setB.has(x)));
}

export function rightDifference<T>(iterableA: Iterable<T>, iterableB: Iterable<T>): Set<T> {
  const setA = iterableA instanceof Set ? iterableA : new Set(iterableA);
  return new Set([...iterableB].filter(x => !setA.has(x)));
}

export function getPieceLayout(tag: PieceTag, orientation: Orientation): PieceLayout {
  // @ts-ignore
  const layout = PieceLayouts[tag][orientation] as PieceLayout;
  if (!layout) {
    throw new Error(`Invalid orientation ${orientation} for piece ${tag}`);
  }
  return layout;
}

export function stringToPosition(str: PositionString): Position {
  const [x, y] = str.split(" ").map(Number.Constructor);
  return { x, y };
}

export function positionToString({ x, y }: Position): PositionString {
  return `${x} ${y}`;
}

export function adjacentElement<T>(
  array: readonly T[],
  index: number,
  direction: "left" | "right"
): T {
  if (array.length === 0) {
    throw new Error("Array cannot be empty");
  }

  const length = array.length;
  const normalizedIndex = ((index % length) + length) % length; // Handle negative indices

  if (direction === "left") {
    const leftIndex = (normalizedIndex - 1 + length) % length;
    return array[leftIndex];
  } else {
    const rightIndex = (normalizedIndex + 1) % length;
    return array[rightIndex];
  }
}

export function computeBlockPositions({ tag, position }: Piece, orientation: Orientation) {
  return [...getPieceLayout(tag, orientation)]
    .map(stringToPosition)
    .map(({ x, y }) => ({ x: x + position.x, y: y + position.y }));
}
