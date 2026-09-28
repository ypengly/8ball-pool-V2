import { World, CollisionEvent } from '../physics/World';
import { Table } from '../physics/Table';
import { Ball } from '../physics/Ball';
import { Vector2 } from '../physics/Vector2';
import { ShotInput, applyShot, isPlausibleShot } from '../physics/Cue';
import { buildRack } from './Rack';
import {
  MatchState,
  initialMatchState,
  buildShotResult,
  resolveShot,
  applyOutcome,
  ShotOutcome,
} from './RulesEngine';

export interface ShotReplayFrame {
  tick: number;
  balls: { id: number; x: number; y: number; pocketed: boolean }[];
}

export interface ShotCompletion {
  outcome: ShotOutcome;
  matchState: MatchState;
  frames: ShotReplayFrame[]; // for replay/spectator playback
  events: CollisionEvent[];
}

const MAX_TICKS_PER_SHOT = 120 * 20; // hard safety cap: 20 simulated seconds

// GameSession is the single source of truth used identically by the client
// (for local/AI play and prediction) and the Go server (ported to Go for
// authoritative resolution). It never touches rendering or networking.
export class GameSession {
  world: World;
  match: MatchState;

  constructor(seed: number = 1, breakingPlayer: 0 | 1 = 0) {
    const table = new Table();
    const balls = buildRack(table, seed);
    this.world = new World(table, balls);
    this.match = initialMatchState(breakingPlayer);
  }

  // Runs an entire shot to completion: applies the cue strike, steps physics
  // until every ball is settled (or the safety cap trips, which would only
  // happen from a physics bug, never legitimate play), then resolves rules.
  playShot(input: ShotInput, record: boolean = false): ShotCompletion {
    if (!isPlausibleShot(input)) {
      throw new Error('IMPLAUSIBLE_SHOT_INPUT');
    }
    const cueBall = this.world.balls.find((b) => b.number === 0 && !b.pocketed);
    if (!cueBall) throw new Error('NO_CUE_BALL_ON_TABLE');

    const ballsBefore = this.world.balls.map((b) => b.clone());
    applyShot(cueBall, input);

    const allEvents: CollisionEvent[] = [];
    const frames: ShotReplayFrame[] = [];
    let ticks = 0;
    while (!this.world.isSettled() && ticks < MAX_TICKS_PER_SHOT) {
      const events = this.world.step();
      allEvents.push(...events);
      if (record) {
        frames.push({
          tick: this.world.tick,
          balls: this.world.balls.map((b) => ({ id: b.id, x: b.position.x, y: b.position.y, pocketed: b.pocketed })),
        });
      }
      ticks++;
    }

    // If a scratch occurred, respot the cue ball at the head spot for the
    // next player's ball-in-hand — actual placement UI happens client-side;
    // here we just guarantee a legal, on-table cue ball exists for the next
    // shot to be simulated against.
    const result = buildShotResult(allEvents, ballsBefore, this.world.balls);
    const outcome = resolveShot(this.match, result, this.world.balls);
    this.match = applyOutcome(this.match, outcome);

    if (result.cueBallPocketed && !outcome.gameOver) {
      this.respotCueBall();
    }

    return { outcome, matchState: this.match, frames, events: allEvents };
  }

  private respotCueBall(): void {
    const cue = this.world.balls.find((b) => b.number === 0);
    if (!cue) return;
    cue.pocketed = false;
    cue.position = new Vector2(this.world.table.width * 0.25, this.world.table.height / 2);
    cue.velocity = Vector2.zero();
  }
}
