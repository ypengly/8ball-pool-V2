import { Vector2 } from '../physics/Vector2';
import { Ball, ballTypeForNumber } from '../physics/Ball';
import { Table } from '../physics/Table';
import { BALL_RADIUS } from '../physics/Constants';

// Builds a standard triangle rack: 8-ball in the center of the third row,
// one solid and one stripe in the back corners (a common tournament rule to
// avoid trivially predictable breaks), rest randomized-but-deterministic per
// seed so replays/rematches can reproduce an identical rack when needed.
export function buildRack(table: Table, seed: number = 1): Ball[] {
  const balls: Ball[] = [];
  const footSpot = new Vector2(table.width * 0.75, table.height / 2);
  const headSpot = new Vector2(table.width * 0.25, table.height / 2);

  const cue = new Ball(0, 0, ballTypeForNumber(0), headSpot);
  balls.push(cue);

  const spacing = BALL_RADIUS * 2 + 0.5;
  const rowDir = new Vector2(Math.sqrt(3) / 2, 0);

  const solids = [1, 2, 3, 4, 5, 6, 7];
  const stripes = [9, 10, 11, 12, 13, 14, 15];
  const order = deterministicShuffle([...solids, ...stripes], seed);

  // Rack positions by (row, col) — 5 rows, apex at footSpot pointing right.
  const slots: { row: number; col: number }[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) slots.push({ row, col });
  }

  const numbers: number[] = new Array(15);
  // Apex (row0) and the two back-row-adjacent corners follow convention;
  // the 8-ball always goes in the center of row 2 (3rd row, index 2 within it).
  let cursor = 0;
  const eightSlotIndex = slots.findIndex((s) => s.row === 2 && s.col === 1);
  for (let i = 0; i < slots.length; i++) {
    if (i === eightSlotIndex) {
      numbers[i] = 8;
    } else {
      numbers[i] = order[cursor++];
    }
  }

  slots.forEach((slot, i) => {
    const x = footSpot.x + slot.row * rowDir.x * spacing;
    const y = footSpot.y + (slot.col - slot.row / 2) * spacing;
    const ball = new Ball(numbers[i], numbers[i], ballTypeForNumber(numbers[i]), new Vector2(x, y));
    balls.push(ball);
  });

  return balls;
}

function deterministicShuffle(arr: number[], seed: number): number[] {
  const a = [...arr];
  let s = seed;
  const rand = () => {
    // Simple LCG so rack layout is reproducible from a seed (needed for
    // replay-exact rematches and server/client agreement on break shots).
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
