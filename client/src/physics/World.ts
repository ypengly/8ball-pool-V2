import { Vector2 } from './Vector2';
import { Ball } from './Ball';
import { Table } from './Table';
import {
  PHYSICS_DT,
  SLIDING_FRICTION,
  ROLLING_FRICTION,
  SPIN_DAMPING,
  CUSHION_RESTITUTION,
  BALL_RESTITUTION,
  STOP_VELOCITY_THRESHOLD,
  STOP_SPIN_THRESHOLD,
} from './Constants';

export interface CollisionEvent {
  type: 'BALL_BALL' | 'CUSHION' | 'POCKET';
  ballId: number;
  otherBallId?: number;
  pocketId?: number;
  tick: number;
}

// World runs the exact same step() logic on both the client (for immediate
// visual feedback / prediction) and the Go server (ported line-for-line in
// server/internal/physics). Determinism matters more than raw fidelity: the
// server re-simulates every shot from the same initial conditions the client
// sent and must arrive at the same pocketed/foul outcome, or multiplayer
// desyncs. Everything here is intentionally simple, stable, and free of
// nondeterministic operations (no Math.random, no frame-rate dependence).
export class World {
  table: Table;
  balls: Ball[];
  tick: number = 0;
  private events: CollisionEvent[] = [];

  constructor(table: Table, balls: Ball[]) {
    this.table = table;
    this.balls = balls;
  }

  activeBalls(): Ball[] {
    return this.balls.filter((b) => !b.pocketed);
  }

  isSettled(): boolean {
    return this.activeBalls().every(
      (b) => b.velocity.length() < STOP_VELOCITY_THRESHOLD && Math.abs(b.angularVelocity) < STOP_SPIN_THRESHOLD
    );
  }

  // Advance the whole table by one fixed physics tick. Returns any collision
  // events generated this tick (used by the rules engine to detect fouls,
  // combos, and by the highlight system to detect notable shots).
  step(): CollisionEvent[] {
    this.events = [];
    const balls = this.activeBalls();

    // Sub-stepping guards against tunneling: at max shot power a ball can
    // travel further than its own diameter in a single 120Hz tick, which
    // would let it skip clean through another ball or a thin cushion gap.
    // We compute how many substeps are needed so no ball moves more than
    // half its radius per substep, then integrate+resolve at that finer
    // resolution while still emitting events tagged with the outer tick.
    let maxSpeed = 0;
    for (const b of balls) maxSpeed = Math.max(maxSpeed, b.velocity.length());
    const maxRadius = balls.length > 0 ? balls[0].radius : 1;
    const worstCaseStep = maxSpeed * PHYSICS_DT;
    const substeps = Math.max(1, Math.min(8, Math.ceil(worstCaseStep / (maxRadius * 0.5))));
    const subDt = PHYSICS_DT / substeps;

    for (let s = 0; s < substeps; s++) {
      this.integrate(balls, subDt);
      this.resolveBallCollisions(balls);
      this.resolveCushionCollisions(balls);
      this.resolvePockets(balls);
    }

    this.applyFriction(balls, PHYSICS_DT);
    this.tick++;
    return this.events;
  }

  private integrate(balls: Ball[], dt: number) {
    for (const b of balls) {
      if (b.pocketed) continue;
      b.position = b.position.add(b.velocity.scale(dt));
    }
  }

  private applyFriction(balls: Ball[], dt: number) {
    for (const b of balls) {
      if (b.pocketed) continue;
      const speed = b.velocity.length();
      if (speed < STOP_VELOCITY_THRESHOLD) {
        b.velocity = Vector2.zero();
      } else {
        // Two-phase friction model: while spin and velocity aren't matched
        // (sliding), decelerate faster; once "rolling" (approximated here by
        // low remaining spin), decelerate slowly. This lets draw/follow shots
        // feel distinct without a full rolling-without-slipping contact model.
        const isSliding = Math.abs(b.spin.x) > 0.05 || Math.abs(b.spin.y) > 0.05;
        const decel = isSliding ? SLIDING_FRICTION : ROLLING_FRICTION;
        const newSpeed = Math.max(0, speed - decel * 9810 * dt); // 9810 mm/s^2 ~ "1g" scale factor tuned for feel
        b.velocity = b.velocity.normalized().scale(newSpeed);

        // Topspin/backspin bleed off, converting into forward/backward roll
        // then decaying — this produces the classic follow/draw curve.
        const spinTransfer = b.spin.scale(decel * 4 * dt);
        b.velocity = b.velocity.add(spinTransfer);
        b.spin = b.spin.scale(1 - Math.min(1, 6 * dt));
      }
      b.angularVelocity *= SPIN_DAMPING;
      if (Math.abs(b.angularVelocity) < STOP_SPIN_THRESHOLD) b.angularVelocity = 0;
    }
  }

  private resolveBallCollisions(balls: Ball[]) {
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i];
        const b = balls[j];
        if (a.pocketed || b.pocketed) continue;
        const delta = b.position.sub(a.position);
        const dist = delta.length();
        const minDist = a.radius + b.radius;
        if (dist < minDist && dist > 1e-6) {
          const normal = delta.normalized();
          // Positional correction: push balls apart so they never overlap on
          // the next tick (prevents jitter/stuck balls at the contact point).
          const overlap = minDist - dist;
          const correction = normal.scale(overlap / 2);
          a.position = a.position.sub(correction);
          b.position = b.position.add(correction);

          // Only resolve an impulse if balls are actually closing (moving
          // toward each other along the normal) — otherwise we'd add energy
          // to balls that are already separating post-correction.
          const relVel = b.velocity.sub(a.velocity);
          const approachSpeed = relVel.dot(normal);
          if (approachSpeed < 0) {
            // Equal-mass elastic collision impulse along the contact normal.
            const impulseMag = -(1 + BALL_RESTITUTION) * approachSpeed / (1 / a.mass + 1 / b.mass);
            const impulse = normal.scale(impulseMag);
            a.velocity = a.velocity.sub(impulse.scale(1 / a.mass));
            b.velocity = b.velocity.add(impulse.scale(1 / b.mass));

            // A portion of the struck ball's incoming spin/english transfers
            // as a slight tangential deflection (throw), and side spin bleeds
            // into the cue ball's post-collision angular velocity.
            const tangent = normal.perp();
            const throwAmount = a.spin.y * 0.15;
            b.velocity = b.velocity.add(tangent.scale(throwAmount));

            this.events.push({ type: 'BALL_BALL', ballId: a.id, otherBallId: b.id, tick: this.tick });
          }
        }
      }
    }
  }

  private resolveCushionCollisions(balls: Ball[]) {
    for (const b of balls) {
      if (b.pocketed) continue;
      for (const cushion of this.table.cushions) {
        const distToLine = this.pointSegmentDistance(b.position, cushion.a, cushion.b);
        const alongNormal = b.position.sub(cushion.a).dot(cushion.normal);
        if (distToLine < b.radius && alongNormal < b.radius) {
          const penetration = b.radius - alongNormal;
          if (penetration > 0) {
            b.position = b.position.add(cushion.normal.scale(penetration));
          }
          const vn = b.velocity.dot(cushion.normal);
          if (vn < 0) {
            b.velocity = b.velocity.sub(cushion.normal.scale((1 + CUSHION_RESTITUTION) * vn));
            // Side spin causes the ball to rebound at a slightly altered
            // angle off the cushion ("cushion swerve").
            const tangent = cushion.normal.perp();
            b.velocity = b.velocity.add(tangent.scale(b.spin.y * 0.08));
            this.events.push({ type: 'CUSHION', ballId: b.id, tick: this.tick });
          }
        }
      }
    }
  }

  private resolvePockets(balls: Ball[]) {
    for (const b of balls) {
      if (b.pocketed) continue;
      for (const pocket of this.table.pockets) {
        if (Vector2.distance(b.position, pocket.position) < pocket.radius) {
          b.pocketed = true;
          b.velocity = Vector2.zero();
          b.spin = Vector2.zero();
          b.angularVelocity = 0;
          this.events.push({ type: 'POCKET', ballId: b.id, pocketId: pocket.id, tick: this.tick });
          break;
        }
      }
    }
  }

  private pointSegmentDistance(p: Vector2, a: Vector2, b: Vector2): number {
    const ab = b.sub(a);
    const t = Math.max(0, Math.min(1, p.sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-9)));
    const closest = a.add(ab.scale(t));
    return Vector2.distance(p, closest);
  }
}
