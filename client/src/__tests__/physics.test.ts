import { describe, it, expect } from 'vitest';
import { World } from '../physics/World';
import { Table } from '../physics/Table';
import { Ball, BallType } from '../physics/Ball';
import { Vector2 } from '../physics/Vector2';
import { BALL_RADIUS } from '../physics/Constants';

function freshWorld(balls: Ball[]): World {
  return new World(new Table(), balls);
}

describe('Ball-ball collision', () => {
  it('transfers momentum and separates two balls without leaving them overlapped', () => {
    const a = new Ball(0, 0, BallType.CUE, new Vector2(500, 500));
    a.velocity = new Vector2(1000, 0);
    const b = new Ball(1, 1, BallType.SOLID, new Vector2(560, 500));
    const world = freshWorld([a, b]);

    for (let i = 0; i < 10; i++) world.step();

    const dist = Vector2.distance(a.position, b.position);
    expect(dist).toBeGreaterThanOrEqual(BALL_RADIUS * 2 - 1);
    // Struck ball should now be moving away, striker should have slowed.
    expect(b.velocity.length()).toBeGreaterThan(0);
  });
});

describe('Cushion collision', () => {
  it('reflects a ball off the rail without letting it escape the table', () => {
    const table = new Table();
    const ball = new Ball(0, 0, BallType.CUE, new Vector2(100, 20));
    ball.velocity = new Vector2(0, -1000);
    const world = freshWorld([ball]);

    for (let i = 0; i < 30; i++) world.step();

    expect(ball.position.y).toBeGreaterThanOrEqual(-1);
    expect(ball.velocity.y).toBeGreaterThan(-1); // no longer moving toward the rail
  });
});

describe('Friction', () => {
  it('eventually brings a moving ball to rest', () => {
    const ball = new Ball(0, 0, BallType.CUE, new Vector2(1270, 635));
    ball.velocity = new Vector2(500, 0);
    const world = freshWorld([ball]);

    let ticks = 0;
    while (!world.isSettled() && ticks < 100000) {
      world.step();
      ticks++;
    }
    expect(world.isSettled()).toBe(true);
    expect(ticks).toBeLessThan(100000);
  });
});

describe('Pocket detection', () => {
  it('marks a ball pocketed once it enters a pocket radius', () => {
    const table = new Table();
    const ball = new Ball(0, 1, BallType.SOLID, new Vector2(60, 60));
    ball.velocity = new Vector2(-2000, -2000);
    const world = freshWorld([ball]);

    for (let i = 0; i < 20; i++) world.step();

    expect(ball.pocketed).toBe(true);
    expect(ball.velocity.length()).toBe(0);
  });
});

describe('No-tunneling guarantee', () => {
  it('never lets a fast ball pass through a stationary one', () => {
    const a = new Ball(0, 0, BallType.CUE, new Vector2(200, 500));
    a.velocity = new Vector2(4500, 0); // max shot power
    const b = new Ball(1, 1, BallType.SOLID, new Vector2(800, 500));
    const world = freshWorld([a, b]);

    for (let i = 0; i < 5; i++) world.step();

    // b must have been struck (moved) rather than a passing through it.
    expect(b.position.x).toBeGreaterThan(800);
  });
});
