import { Ball, BallType } from '../physics/Ball';
import { CollisionEvent } from '../physics/World';

export type PlayerGroup = 'SOLIDS' | 'STRIPES' | 'UNASSIGNED';

export interface PlayerState {
  id: number;
  group: PlayerGroup;
}

export interface MatchState {
  players: [PlayerState, PlayerState];
  currentPlayer: 0 | 1;
  tableOpen: boolean;
  isBreakShot: boolean;
  ballInHand: boolean;
  gameOver: boolean;
  winner: 0 | 1 | null;
}

export interface ShotResult {
  pocketedBalls: Ball[];
  firstContactBallId: number | null;
  cushionContactAfterFirstHit: boolean;
  cueBallPocketed: boolean;
  eightBallPocketed: boolean;
}

export interface ShotOutcome {
  foul: boolean;
  foulReasons: string[];
  turnPasses: boolean;
  ballInHand: boolean;
  gameOver: boolean;
  winner: 0 | 1 | null;
  groupAssigned: PlayerGroup | null;
}

export function initialMatchState(breakingPlayer: 0 | 1): MatchState {
  return {
    players: [
      { id: 0, group: 'UNASSIGNED' },
      { id: 1, group: 'UNASSIGNED' },
    ],
    currentPlayer: breakingPlayer,
    tableOpen: true,
    isBreakShot: true,
    ballInHand: false,
    gameOver: false,
    winner: null,
  };
}

// Reconstructs a ShotResult from the raw physics events + before/after ball
// snapshots produced across an entire shot (from cue strike until the table
// is settled again). Kept separate from World so the rules engine has zero
// physics dependencies beyond the data types — this is what "don't put rules
// inside rendering/physics code" means in practice.
export function buildShotResult(events: CollisionEvent[], ballsBefore: Ball[], ballsAfter: Ball[]): ShotResult {
  const pocketed = ballsAfter.filter((b) => b.pocketed && !ballsBefore.find((ob) => ob.id === b.id)?.pocketed);

  let firstContactBallId: number | null = null;
  for (const e of events) {
    if (e.type === 'BALL_BALL') {
      const cueInvolved = e.ballId === 0 || e.otherBallId === 0;
      if (cueInvolved) {
        firstContactBallId = e.ballId === 0 ? e.otherBallId! : e.ballId;
        break;
      }
    }
  }

  const firstContactTick = events.find((e) => e.type === 'BALL_BALL' && (e.ballId === 0 || e.otherBallId === 0))?.tick;

  return {
    pocketedBalls: pocketed,
    firstContactBallId,
    cushionContactAfterFirstHit:
      firstContactTick !== undefined && events.some((e) => e.type === 'CUSHION' && e.tick > firstContactTick),
    cueBallPocketed: pocketed.some((b) => b.number === 0),
    eightBallPocketed: pocketed.some((b) => b.number === 8),
  };
}

// Core rules resolution: given the match state before the shot and what
// happened during it, decides fouls, turn order, group assignment, and win
// conditions. This function is pure (no I/O, no mutation of its inputs) so
// it can be unit tested exhaustively and re-run identically on the server.
export function resolveShot(state: MatchState, result: ShotResult, ballsOnTableAfterShot: Ball[]): ShotOutcome {
  const foulReasons: string[] = [];
  const player = state.players[state.currentPlayer];
  const opponentIdx = state.currentPlayer === 0 ? 1 : 0;

  // --- Foul: scratch (cue ball pocketed) ---
  if (result.cueBallPocketed) {
    foulReasons.push('SCRATCH');
  }

  // --- Foul: no ball contacted at all ---
  if (result.firstContactBallId === null && !state.isBreakShot) {
    foulReasons.push('NO_CONTACT');
  }

  // --- Foul: wrong group contacted first (once assigned) ---
  if (!state.tableOpen && result.firstContactBallId !== null) {
    const firstBallType = ballTypeOf(result.firstContactBallId);
    const expectedType = player.group === 'SOLIDS' ? BallType.SOLID : BallType.STRIPE;
    const contactedEight = result.firstContactBallId === 8;
    const playerIsOnEight = playerHasClearedGroup(player.group, ballsOnTableAfterShot);
    if (!contactedEight && firstBallType !== expectedType) {
      foulReasons.push('WRONG_BALL_FIRST');
    }
    if (contactedEight && !playerIsOnEight) {
      foulReasons.push('HIT_EIGHT_EARLY');
    }
  }

  // --- Foul: no rail contact after hit and nothing pocketed (except on break) ---
  if (!state.isBreakShot && result.pocketedBalls.length === 0 && !result.cushionContactAfterFirstHit && result.firstContactBallId !== null) {
    foulReasons.push('NO_RAIL_AFTER_CONTACT');
  }

  const foul = foulReasons.length > 0;

  // --- Group assignment: first legal pot on an open table assigns groups ---
  let groupAssigned: PlayerGroup | null = null;
  if (state.tableOpen && !foul && result.pocketedBalls.length > 0) {
    const nonEight = result.pocketedBalls.find((b) => b.number !== 0 && b.number !== 8);
    if (nonEight) {
      groupAssigned = nonEight.type === BallType.SOLID ? 'SOLIDS' : 'STRIPES';
    }
  }

  // --- Win/loss on the 8-ball ---
  let gameOver = false;
  let winner: 0 | 1 | null = null;
  if (result.eightBallPocketed) {
    // Whether the player was legally "on the 8" is evaluated against the
    // table state as it stood immediately before this shot potted the 8, i.e.
    // excluding the 8-ball itself from the remaining count.
    const remainingExcludingEight = ballsOnTableAfterShot.filter((b) => b.number !== 8);
    const cleared = playerHasClearedGroup(player.group, remainingExcludingEight) || state.tableOpen;
    if (foul || !cleared) {
      // Pocketing the 8-ball early, on a foul, or via a scratch is an
      // immediate loss for the shooter.
      gameOver = true;
      winner = opponentIdx as 0 | 1;
    } else {
      gameOver = true;
      winner = state.currentPlayer;
    }
  }

  // --- Turn passes unless player legally pocketed one of their own balls ---
  const legalOwnPot = !foul && result.pocketedBalls.some((b) => {
    if (state.tableOpen) return b.number !== 0; // any non-cue pot on open table continues turn
    const expectedType = player.group === 'SOLIDS' ? BallType.SOLID : BallType.STRIPE;
    return b.type === expectedType;
  });
  const turnPasses = !legalOwnPot || foul;

  return {
    foul,
    foulReasons,
    turnPasses,
    ballInHand: foul,
    gameOver,
    winner,
    groupAssigned,
  };
}

export function applyOutcome(state: MatchState, outcome: ShotOutcome): MatchState {
  const next: MatchState = JSON.parse(JSON.stringify(state));
  next.isBreakShot = false;
  if (outcome.groupAssigned) {
    next.tableOpen = false;
    next.players[next.currentPlayer].group = outcome.groupAssigned;
    next.players[next.currentPlayer === 0 ? 1 : 0].group = outcome.groupAssigned === 'SOLIDS' ? 'STRIPES' : 'SOLIDS';
  }
  next.ballInHand = outcome.ballInHand;
  next.gameOver = outcome.gameOver;
  next.winner = outcome.winner;
  if (outcome.turnPasses && !outcome.gameOver) {
    next.currentPlayer = next.currentPlayer === 0 ? 1 : 0;
  }
  return next;
}

function ballTypeOf(number: number): BallType {
  if (number === 0) return BallType.CUE;
  if (number === 8) return BallType.EIGHT;
  if (number >= 1 && number <= 7) return BallType.SOLID;
  return BallType.STRIPE;
}

// A player has "cleared their group" once no balls of their assigned type
// remain on the table (not yet pocketed). Takes the live table state so this
// stays a pure function testable with any hypothetical board position.
function playerHasClearedGroup(group: PlayerGroup, ballsOnTable: Ball[]): boolean {
  if (group === 'UNASSIGNED') return false;
  const targetType = group === 'SOLIDS' ? BallType.SOLID : BallType.STRIPE;
  return !ballsOnTable.some((b) => b.type === targetType && !b.pocketed);
}
