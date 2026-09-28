package physics

import "math"

type ShotInput struct {
	Direction float64 `json:"direction"`
	Power     float64 `json:"power"`
	SpinX     float64 `json:"spinX"`
	SpinY     float64 `json:"spinY"`
}

func ClampShotInput(in ShotInput) ShotInput {
	clamp := func(v, lo, hi float64) float64 {
		if v < lo {
			return lo
		}
		if v > hi {
			return hi
		}
		return v
	}
	return ShotInput{
		Direction: in.Direction,
		Power:     clamp(in.Power, 0, 1),
		SpinX:     clamp(in.SpinX, -1, 1),
		SpinY:     clamp(in.SpinY, -1, 1),
	}
}

// IsPlausibleShot is the server's cheap first-pass anti-cheat check — reject
// obviously-impossible inputs (e.g. a client sending power > 1.0 to try to
// get super-human cue-ball speed) before spending CPU re-simulating the shot.
func IsPlausibleShot(in ShotInput) bool {
	return in.Power >= 0 && in.Power <= 1 && math.Abs(in.SpinX) <= 1 && math.Abs(in.SpinY) <= 1
}

func ApplyShot(cueBall *Ball, raw ShotInput) {
	in := ClampShotInput(raw)
	speed := in.Power * MaxShotPower
	dir := Vector2{math.Cos(in.Direction), math.Sin(in.Direction)}
	cueBall.Velocity = dir.Scale(speed)
	cueBall.Spin = Vector2{in.SpinX * speed * 0.5, in.SpinY * speed * 0.5}
	cueBall.AngularVelocity = in.SpinY * 40
}
