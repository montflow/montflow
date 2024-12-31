import { Loop, StepCallback } from "@montflow/loop";

type Position = { x: number; y: number };
type Vector = Position;
type Range = { min: number; max: number };

const loop = Loop();

const SPEED_RANGE: Range = { min: 150, max: 350 };
const MAGNITUDE = [-1, 1];

const VARIANCE = 0.2;

const getRandomInRange = ({ min, max }: Range) => Math.random() * (max - min) + min;
const pickRandom = <T>(arr: Array<T>): T => {
  if (arr.length === 0) {
    throw new Error("Array cannot be empty");
  }
  const randomIndex = Math.floor(Math.random() * arr.length);
  return arr[randomIndex];
};

const viewport = document.getElementsByClassName("viewport")[0]! as HTMLDivElement;
const ball = document.getElementsByClassName("ball")[0]! as HTMLDivElement;
const velocity: Vector = {
  x: getRandomInRange(SPEED_RANGE) * pickRandom(MAGNITUDE),
  y: getRandomInRange(SPEED_RANGE) * pickRandom(MAGNITUDE),
};

const getPosition = (): Position => ({
  x: Number(ball.style.top.replace("px", "")),
  y: Number(ball.style.left.replace("px", "")),
});

const setPosition = ({ x, y }: Position) => {
  ball.style.top = `${x}px`;
  ball.style.left = `${y}px`;
};

const boundingBox = {
  left: 0,
  top: 0,
  right: viewport.clientWidth - ball.offsetWidth,
  bottom: viewport.clientHeight - ball.offsetHeight,
};

setPosition({
  x: getRandomInRange({ min: boundingBox.left, max: boundingBox.right }),
  y: getRandomInRange({ min: boundingBox.top, max: boundingBox.bottom }),
});

const update: StepCallback = dt => {
  const position = getPosition();

  const newPosition: Position = {
    x: position.x + velocity.x * dt,
    y: position.y + velocity.y * dt,
  };

  if (newPosition.x <= boundingBox.top) {
    newPosition.x = boundingBox.top;
    velocity.x = -Math.sign(velocity.x) * getRandomInRange(SPEED_RANGE);
    velocity.y += velocity.y * (Math.random() * VARIANCE * 2 - VARIANCE);
  } else if (newPosition.x >= boundingBox.bottom) {
    newPosition.x = boundingBox.bottom;
    velocity.x = -Math.sign(velocity.x) * getRandomInRange(SPEED_RANGE);
    velocity.y += velocity.y * (Math.random() * VARIANCE * 2 - VARIANCE);
  }

  if (newPosition.y <= boundingBox.left) {
    newPosition.y = boundingBox.left;
    velocity.y = -Math.sign(velocity.y) * getRandomInRange(SPEED_RANGE);
    velocity.x += velocity.x * (Math.random() * VARIANCE * 2 - VARIANCE);
  } else if (newPosition.y >= boundingBox.right) {
    newPosition.y = boundingBox.right;
    velocity.y = -Math.sign(velocity.y) * getRandomInRange(SPEED_RANGE);
    velocity.x += velocity.x * (Math.random() * VARIANCE * 2 - VARIANCE);
  }

  setPosition(newPosition);
};

loop.add(update);
