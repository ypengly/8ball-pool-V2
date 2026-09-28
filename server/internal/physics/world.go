package physics

import "math"

type EventType string

const (
	EventBallBall EventType = "BALL_BALL"
	EventCushion  EventType = "CUSHION"
	EventPocket   EventType = "POCKET"
)

type CollisionEvent struct {
	Type         EventType
	BallID       int
	OtherBallID  int
	PocketID     int
	HasOtherBall bool
	HasPocket    bool
	Tick         int
}

// World is the server's authoritative physics simulation. It must stay
// behaviorally identical to client/src/physics/World.ts: given the same
// initial ball positions/velocities and the same shot input, both must
// settle into the same pocketed/foul outcome, or online multiplayer desyncs
// between what the shooting client predicted and what the server confirms.
type World struct {
	Table *Table
	Balls []*Ball
	Tick  int
	events []CollisionEvent
}

func NewWorld(table *Table, balls []*Ball) *World {
	return &World{Table: table, Balls: balls}
}

func (w *World) ActiveBalls() []*Ball {
	out := make([]*Ball, 0, len(w.Balls))
	for _, b := range w.Balls {
		if !b.Pocketed {
			out = append(out, b)
		}
	}
	return out
}

func (w *World) IsSettled() bool {
	for _, b := range w.ActiveBalls() {
		if b.Velocity.Length() >= StopVelocityThreshold || math.Abs(b.AngularVelocity) >= StopSpinThreshold {
			return false
		}
	}
	return true
}

func (w *World) Step() []CollisionEvent {
	w.events = nil
	balls := w.ActiveBalls()

	maxSpeed := 0.0
	for _, b := range balls {
		if s := b.Velocity.Length(); s > maxSpeed {
			maxSpeed = s
		}
	}
	maxRadius := BallRadius
	if len(balls) > 0 {
		maxRadius = balls[0].Radius
	}
	worstCaseStep := maxSpeed * PhysicsDt
	substeps := int(math.Ceil(worstCaseStep / (maxRadius * 0.5)))
	if substeps < 1 {
		substeps = 1
	}
	if substeps > 8 {
		substeps = 8
	}
	subDt := PhysicsDt / float64(substeps)

	for s := 0; s < substeps; s++ {
		w.integrate(balls, subDt)
		w.resolveBallCollisions(balls)
		w.resolveCushionCollisions(balls)
		w.resolvePockets(balls)
	}

	w.applyFriction(balls, PhysicsDt)
	w.Tick++
	return w.events
}

func (w *World) integrate(balls []*Ball, dt float64) {
	for _, b := range balls {
		if b.Pocketed {
			continue
		}
		b.Position = b.Position.Add(b.Velocity.Scale(dt))
	}
}

func (w *World) applyFriction(balls []*Ball, dt float64) {
	for _, b := range balls {
		if b.Pocketed {
			continue
		}
		speed := b.Velocity.Length()
		if speed < StopVelocityThreshold {
			b.Velocity = Vector2{0, 0}
		} else {
			isSliding := math.Abs(b.Spin.X) > 0.05 || math.Abs(b.Spin.Y) > 0.05
			decel := RollingFriction
			if isSliding {
				decel = SlidingFriction
			}
			newSpeed := math.Max(0, speed-decel*9810*dt)
			b.Velocity = b.Velocity.Normalized().Scale(newSpeed)

			spinTransfer := b.Spin.Scale(decel * 4 * dt)
			b.Velocity = b.Velocity.Add(spinTransfer)
			decay := 1 - math.Min(1, 6*dt)
			b.Spin = b.Spin.Scale(decay)
		}
		b.AngularVelocity *= SpinDamping
		if math.Abs(b.AngularVelocity) < StopSpinThreshold {
			b.AngularVelocity = 0
		}
	}
}

func (w *World) resolveBallCollisions(balls []*Ball) {
	for i := 0; i < len(balls); i++ {
		for j := i + 1; j < len(balls); j++ {
			a, b := balls[i], balls[j]
			if a.Pocketed || b.Pocketed {
				continue
			}
			delta := b.Position.Sub(a.Position)
			dist := delta.Length()
			minDist := a.Radius + b.Radius
			if dist < minDist && dist > 1e-6 {
				normal := delta.Normalized()
				overlap := minDist - dist
				correction := normal.Scale(overlap / 2)
				a.Position = a.Position.Sub(correction)
				b.Position = b.Position.Add(correction)

				relVel := b.Velocity.Sub(a.Velocity)
				approachSpeed := relVel.Dot(normal)
				if approachSpeed < 0 {
					impulseMag := -(1 + BallRestitution) * approachSpeed / (1/a.Mass + 1/b.Mass)
					impulse := normal.Scale(impulseMag)
					a.Velocity = a.Velocity.Sub(impulse.Scale(1 / a.Mass))
					b.Velocity = b.Velocity.Add(impulse.Scale(1 / b.Mass))

					tangent := normal.Perp()
					throwAmount := a.Spin.Y * 0.15
					b.Velocity = b.Velocity.Add(tangent.Scale(throwAmount))

					w.events = append(w.events, CollisionEvent{
						Type: EventBallBall, BallID: a.ID, OtherBallID: b.ID, HasOtherBall: true, Tick: w.Tick,
					})
				}
			}
		}
	}
}

func (w *World) resolveCushionCollisions(balls []*Ball) {
	for _, b := range balls {
		if b.Pocketed {
			continue
		}
		for _, cushion := range w.Table.Cushions {
			distToLine := pointSegmentDistance(b.Position, cushion.A, cushion.B)
			alongNormal := b.Position.Sub(cushion.A).Dot(cushion.Normal)
			if distToLine < b.Radius && alongNormal < b.Radius {
				penetration := b.Radius - alongNormal
				if penetration > 0 {
					b.Position = b.Position.Add(cushion.Normal.Scale(penetration))
				}
				vn := b.Velocity.Dot(cushion.Normal)
				if vn < 0 {
					b.Velocity = b.Velocity.Sub(cushion.Normal.Scale((1 + CushionRestitution) * vn))
					tangent := cushion.Normal.Perp()
					b.Velocity = b.Velocity.Add(tangent.Scale(b.Spin.Y * 0.08))
					w.events = append(w.events, CollisionEvent{Type: EventCushion, BallID: b.ID, Tick: w.Tick})
				}
			}
		}
	}
}

func (w *World) resolvePockets(balls []*Ball) {
	for _, b := range balls {
		if b.Pocketed {
			continue
		}
		for _, pocket := range w.Table.Pockets {
			if Distance(b.Position, pocket.Position) < pocket.Radius {
				b.Pocketed = true
				b.Velocity = Vector2{0, 0}
				b.Spin = Vector2{0, 0}
				b.AngularVelocity = 0
				w.events = append(w.events, CollisionEvent{
					Type: EventPocket, BallID: b.ID, PocketID: pocket.ID, HasPocket: true, Tick: w.Tick,
				})
				break
			}
		}
	}
}

func pointSegmentDistance(p, a, b Vector2) float64 {
	ab := b.Sub(a)
	denom := ab.LengthSq()
	if denom < 1e-9 {
		denom = 1e-9
	}
	t := p.Sub(a).Dot(ab) / denom
	if t < 0 {
		t = 0
	}
	if t > 1 {
		t = 1
	}
	closest := a.Add(ab.Scale(t))
	return Distance(p, closest)
}
