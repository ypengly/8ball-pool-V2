// All units are in millimeters and seconds unless noted, matched loosely to a
// regulation 9ft table so the numbers "feel" right. These constants must stay
// identical between the client prediction copy and the Go server's copy
// (server/internal/physics) since the server is authoritative and any drift
// causes desync between predicted and confirmed ball states.

export const PHYSICS_HZ = 120;
export const PHYSICS_DT = 1 / PHYSICS_HZ;

export const BALL_RADIUS = 28.575 / 2; // mm (standard 2 1/4" ball diameter)
export const BALL_MASS = 0.17; // kg (~6oz)

// Table playing surface (inside the cushions), 9ft table scaled down.
export const TABLE_WIDTH = 2540; // mm
export const TABLE_HEIGHT = 1270; // mm

export const POCKET_RADIUS = BALL_RADIUS * 1.9;

// Friction / damping coefficients, tuned empirically rather than derived from
// real-world drag coefficients — real billiards friction models are complex
// (rolling vs sliding transition) but this two-phase model is standard for
// arcade-quality pool games and produces stable, realistic-feeling results.
export const SLIDING_FRICTION = 0.2; // deceleration while ball slides & spins differently than rolling
export const ROLLING_FRICTION = 0.01; // deceleration while ball rolls without slipping
export const SPIN_DAMPING = 0.99; // per-tick angular velocity decay
export const CUSHION_RESTITUTION = 0.75;
export const BALL_RESTITUTION = 0.96;

export const STOP_VELOCITY_THRESHOLD = 2; // mm/s, below this we consider the ball stopped
export const STOP_SPIN_THRESHOLD = 0.05; // rad/s

export const MAX_SHOT_POWER = 4500; // mm/s cue-ball launch speed at 100% power
export const GRAVITY = 9810; // mm/s^2, used for jump-shot arcs only
