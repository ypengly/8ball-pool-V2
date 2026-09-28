import { Vector2 } from './Vector2';
import { Ball } from './Ball';
import { MAX_SHOT_POWER } from './Constants';

export interface ShotInput {
  direction: number; // radians
  power: number; // 0..1
  spinX: number; // -1..1, backspin(-) to topspin(+)
  spinY: number; // -1..1, left(-) to right(+) english
}

export function clampShotInput(input: ShotInput): ShotInput {
  return {
    direction: input.direction,
    power: Math.max(0, Math.min(1, input.power)),
    spinX: Math.max(-1, Math.min(1, input.spinX)),
    spinY: Math.max(-1, Math.min(1, input.spinY)),
  };
}

// Applies a validated shot to the cue ball, setting its initial velocity and
// the spin state that the friction model will bleed into velocity over time
// (this is what produces follow/draw/curve behavior downstream in World.step).
export function applyShot(cueBall: Ball, rawInput: ShotInput): void {
  const input = clampShotInput(rawInput);
  const speed = input.power * MAX_SHOT_POWER;
  const dir = new Vector2(Math.cos(input.direction), Math.sin(input.direction));
  cueBall.velocity = dir.scale(speed);
  // spin.x is stored along the shot direction (top/back), spin.y perpendicular (side/english)
  cueBall.spin = new Vector2(input.spinX * speed * 0.5, input.spinY * speed * 0.5);
  cueBall.angularVelocity = input.spinY * 40;
}

// Returns whether a proposed shot power/spin combination is physically
// possible given MAX_SHOT_POWER — used by both client validation (to clamp
// UI) and the server (to reject impossible inputs as a cheap anti-cheat
// check before it even bothers re-simulating the shot).
export function isPlausibleShot(input: ShotInput): boolean {
  return input.power >= 0 && input.power <= 1 && Math.abs(input.spinX) <= 1 && Math.abs(input.spinY) <= 1;
}
