import { describe, it, expect } from 'vitest';
import { Ball, BallType } from '../physics/Ball';
import { Vector2 } from '../physics/Vector2';
import {
  initialMatchState,
  resolveShot,
  applyOutcome,
  ShotResult,
} from '../rules/RulesEngine';

function ball(id: number, number: number, type: BallType, pocketed = false): Ball {
  const b = new Ball(id, number, type, new Vector2(0, 0));
  b.pocketed = pocketed;
  return b;
}

describe('RulesEngine', () => {
  it('assigns groups on the first legal pot from an open table', () => {
    const state = initialMatchState(0);
    const table = [ball(0, 0, BallType.CUE), ball(1, 3, BallType.SOLID, true)];
    const result: ShotResult = {
      pocketedBalls: [ball(1, 3, BallType.SOLID, true)],
      firstContactBallId: 3,
      cushionContactAfterFirstHit: false,
      cueBallPocketed: false,
      eightBallPocketed: false,
    };
    const outcome = resolveShot(state, result, table);
    expect(outcome.foul).toBe(false);
    expect(outcome.groupAssigned).toBe('SOLIDS');
    const next = applyOutcome(state, outcome);
    expect(next.tableOpen).toBe(false);
    expect(next.players[0].group).toBe('SOLIDS');
    expect(next.players[1].group).toBe('STRIPES');
    expect(next.currentPlayer).toBe(0); // legal own-group pot keeps the turn
  });

  it('calls a scratch a foul and passes the turn with ball-in-hand', () => {
    const state = initialMatchState(0);
    const result: ShotResult = {
      pocketedBalls: [ball(0, 0, BallType.CUE, true)],
      firstContactBallId: 3,
      cushionContactAfterFirstHit: true,
      cueBallPocketed: true,
      eightBallPocketed: false,
    };
    const outcome = resolveShot(state, result, []);
    expect(outcome.foul).toBe(true);
    expect(outcome.foulReasons).toContain('SCRATCH');
    expect(outcome.ballInHand).toBe(true);
    const next = applyOutcome(state, outcome);
    expect(next.currentPlayer).toBe(1);
  });

  it('penalizes hitting the wrong group first once groups are assigned', () => {
    const state = initialMatchState(0);
    state.tableOpen = false;
    state.players[0].group = 'SOLIDS';
    state.players[1].group = 'STRIPES';
    const result: ShotResult = {
      pocketedBalls: [],
      firstContactBallId: 10, // a stripe, but player 0 is SOLIDS
      cushionContactAfterFirstHit: true,
      cueBallPocketed: false,
      eightBallPocketed: false,
    };
    const outcome = resolveShot(state, result, []);
    expect(outcome.foul).toBe(true);
    expect(outcome.foulReasons).toContain('WRONG_BALL_FIRST');
  });

  it('awards the win to the shooter who legally pockets the 8-ball after clearing their group', () => {
    const state = initialMatchState(0);
    state.tableOpen = false;
    state.players[0].group = 'SOLIDS';
    state.players[1].group = 'STRIPES';
    // No solids remain on the table -> player 0 is legally "on the 8".
    const tableState = [ball(0, 0, BallType.CUE), ball(9, 8, BallType.EIGHT, true)];
    const result: ShotResult = {
      pocketedBalls: [ball(9, 8, BallType.EIGHT, true)],
      firstContactBallId: 8,
      cushionContactAfterFirstHit: true,
      cueBallPocketed: false,
      eightBallPocketed: true,
    };
    const outcome = resolveShot(state, result, tableState);
    expect(outcome.gameOver).toBe(true);
    expect(outcome.winner).toBe(0);
  });

  it('awards the opponent the win if the 8-ball is pocketed early (group not cleared)', () => {
    const state = initialMatchState(0);
    state.tableOpen = false;
    state.players[0].group = 'SOLIDS';
    state.players[1].group = 'STRIPES';
    // A solid (id 2) remains on the table -> player 0 is NOT yet on the 8.
    const tableState = [ball(0, 0, BallType.CUE), ball(2, 3, BallType.SOLID, false), ball(9, 8, BallType.EIGHT, true)];
    const result: ShotResult = {
      pocketedBalls: [ball(9, 8, BallType.EIGHT, true)],
      firstContactBallId: 8,
      cushionContactAfterFirstHit: true,
      cueBallPocketed: false,
      eightBallPocketed: true,
    };
    const outcome = resolveShot(state, result, tableState);
    expect(outcome.gameOver).toBe(true);
    expect(outcome.winner).toBe(1);
  });

  it('fouls a shot that contacts nothing and reaches no rail', () => {
    const state = initialMatchState(0);
    state.isBreakShot = false;
    const result: ShotResult = {
      pocketedBalls: [],
      firstContactBallId: null,
      cushionContactAfterFirstHit: false,
      cueBallPocketed: false,
      eightBallPocketed: false,
    };
    const outcome = resolveShot(state, result, []);
    expect(outcome.foul).toBe(true);
    expect(outcome.foulReasons).toContain('NO_CONTACT');
  });
});
