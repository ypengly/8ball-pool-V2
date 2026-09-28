import { Vector2 } from './Vector2';
import { BALL_MASS, BALL_RADIUS } from './Constants';

export enum BallType {
  CUE = 'CUE',
  SOLID = 'SOLID',
  STRIPE = 'STRIPE',
  EIGHT = 'EIGHT',
}

export class Ball {
  id: number;
  number: number; // 0 = cue ball, 1-7 solids, 8 = eight ball, 9-15 stripes
  type: BallType;
  position: Vector2;
  velocity: Vector2;
  // Angular velocity around the vertical (spin) axis affects curved rolling
  // (side spin -> "swerve"); angularVelocity.x/y model topspin/backspin
  // transfer that determines post-collision rolling direction.
  spin: Vector2; // top/back (x = forward-axis roll bias), side (y)
  angularVelocity: number; // spin about vertical axis (english / side spin)
  radius: number;
  mass: number;
  pocketed: boolean;

  constructor(id: number, number: number, type: BallType, position: Vector2) {
    this.id = id;
    this.number = number;
    this.type = type;
    this.position = position;
    this.velocity = Vector2.zero();
    this.spin = Vector2.zero();
    this.angularVelocity = 0;
    this.radius = BALL_RADIUS;
    this.mass = BALL_MASS;
    this.pocketed = false;
  }

  isMoving(stopThreshold: number): boolean {
    return this.velocity.length() > stopThreshold;
  }

  clone(): Ball {
    const b = new Ball(this.id, this.number, this.type, this.position.clone());
    b.velocity = this.velocity.clone();
    b.spin = this.spin.clone();
    b.angularVelocity = this.angularVelocity;
    b.pocketed = this.pocketed;
    return b;
  }
}

// Standard rack: 1-7 solids, 8 ball, 9-15 stripes, ball 0 is cue.
export function ballTypeForNumber(n: number): BallType {
  if (n === 0) return BallType.CUE;
  if (n === 8) return BallType.EIGHT;
  if (n >= 1 && n <= 7) return BallType.SOLID;
  return BallType.STRIPE;
}
