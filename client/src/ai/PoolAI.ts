import { Vector2 } from '../physics/Vector2';
import { Ball, BallType } from '../physics/Ball';
import { Table } from '../physics/Table';
import { MatchState } from '../rules/RulesEngine';
import { ShotInput } from '../physics/Cue';

export type AIDifficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT';

interface CandidateShot {
  input: ShotInput;
  targetBallId: number;
  pocketId: number;
  difficulty: number; // 0 (trivial) .. 1 (very hard) — used for miss-chance and shot ranking
}

// A real, working (if not yet "expert-grade") shot-selection AI: it enumerates
// every legal ball / pocket combination, computes the cut angle and whether
// the path is obstructed, ranks candidates by makeability, and — depending on
// difficulty — either always executes its best find or intentionally
// perturbs the aim to simulate human error. This is the seed HARD/EXPERT
// position-play and safety logic (phases 13-14 in the design doc) build on;
// it is not a placeholder, but it does not yet do multi-shot lookahead.
export class PoolAI {
  constructor(private difficulty: AIDifficulty = 'MEDIUM') {}

  chooseShot(table: Table, balls: Ball[], match: MatchState, playerIndex: 0 | 1): ShotInput {
    const cueBall = balls.find((b) => b.number === 0 && !b.pocketed);
    if (!cueBall) throw new Error('NO_CUE_BALL');

    const myGroup = match.players[playerIndex].group;
    const targets = this.legalTargets(balls, match, myGroup);

    const candidates: CandidateShot[] = [];
    for (const target of targets) {
      for (const pocket of table.pockets) {
        const candidate = this.evaluatePotentialShot(cueBall, target, pocket.position, pocket.id, balls);
        if (candidate) candidates.push(candidate);
      }
    }

    if (candidates.length === 0) {
      // No legal makeable shot found — play a defensive tap toward the
      // nearest legal ball rather than freezing (HARD/EXPERT would instead
      // run full safety-play evaluation here).
      return this.safetyShot(cueBall, targets[0] ?? balls.find((b) => !b.pocketed && b.number !== 0)!);
    }

    candidates.sort((a, b) => a.difficulty - b.difficulty);
    const best = candidates[0];
    return this.applyDifficultyNoise(best.input, best.difficulty);
  }

  private legalTargets(balls: Ball[], match: MatchState, group: MatchState['players'][number]['group']): Ball[] {
    const onTable = balls.filter((b) => !b.pocketed && b.number !== 0);
    if (group === 'UNASSIGNED') {
      return onTable.filter((b) => b.number !== 8);
    }
    const groupType = group === 'SOLIDS' ? BallType.SOLID : BallType.STRIPE;
    const ownBalls = onTable.filter((b) => b.type === groupType);
    if (ownBalls.length === 0) {
      const eight = onTable.find((b) => b.number === 8);
      return eight ? [eight] : [];
    }
    return ownBalls;
  }

  private evaluatePotentialShot(cue: Ball, target: Ball, pocketPos: Vector2, pocketId: number, allBalls: Ball[]): CandidateShot | null {
    // Ghost-ball method: the cue ball must reach the point directly opposite
    // the pocket, offset from the target ball's center by one ball diameter.
    const toPocket = pocketPos.sub(target.position).normalized();
    const ghostBallPos = target.position.sub(toPocket.scale(target.radius * 2));

    const cueToGhost = ghostBallPos.sub(cue.position);
    const distance = cueToGhost.length();
    if (distance < 1) return null;
    const direction = cueToGhost.normalized();

    // Cut angle: angle between cue's travel direction and the target->pocket
    // line. Shots near 90 degrees are nearly impossible; reject them.
    const cutAngleCos = direction.dot(toPocket);
    if (cutAngleCos < 0.2) return null; // roughly > 78 degree cut, too thin to be realistic

    if (this.pathObstructed(cue.position, ghostBallPos, allBalls, [cue.id, target.id])) return null;
    if (this.pathObstructed(target.position, pocketPos, allBalls, [cue.id, target.id])) return null;

    const angleDifficulty = 1 - cutAngleCos; // 0 = straight in, ~0.8 = very thin cut
    const distanceDifficulty = Math.min(1, distance / 2000);
    const difficulty = angleDifficulty * 0.7 + distanceDifficulty * 0.3;

    const power = Math.min(1, 0.35 + distanceDifficulty * 0.5);
    const direction_angle = Math.atan2(direction.y, direction.x);

    return {
      targetBallId: target.id,
      pocketId,
      difficulty,
      input: { direction: direction_angle, power, spinX: 0, spinY: 0 },
    };
  }

  private pathObstructed(from: Vector2, to: Vector2, balls: Ball[], ignoreIds: number[]): boolean {
    const dir = to.sub(from);
    const len = dir.length();
    if (len < 1e-6) return false;
    const norm = dir.normalized();
    for (const b of balls) {
      if (b.pocketed || ignoreIds.includes(b.id)) continue;
      const toBall = b.position.sub(from);
      const proj = toBall.dot(norm);
      if (proj < 0 || proj > len) continue;
      const closest = from.add(norm.scale(proj));
      if (Vector2.distance(closest, b.position) < b.radius * 2) return true;
    }
    return false;
  }

  private safetyShot(cue: Ball, nearestBall: Ball): ShotInput {
    const dir = nearestBall.position.sub(cue.position).normalized();
    return { direction: Math.atan2(dir.y, dir.x), power: 0.3, spinX: 0, spinY: 0 };
  }

  private applyDifficultyNoise(input: ShotInput, difficulty: number): ShotInput {
    const errorBudget = {
      EASY: 0.18,
      MEDIUM: 0.09,
      HARD: 0.04,
      EXPERT: 0.015,
    }[this.difficulty];
    // Harder intrinsic shots get proportionally more noise even at a fixed
    // difficulty tier, matching how human players miss thin cuts more often.
    const noise = (Math.random() * 2 - 1) * errorBudget * (0.5 + difficulty);
    return { ...input, direction: input.direction + noise };
  }
}
