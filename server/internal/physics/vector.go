package physics

import "math"

// Vector2 mirrors client/src/physics/Vector2.ts. Any change to the collision
// or friction math on one side must be mirrored on the other — this is the
// server's copy of ground truth, since the server re-simulates every shot
// and its result is authoritative over whatever the client predicted.
type Vector2 struct {
	X, Y float64
}

func (v Vector2) Add(o Vector2) Vector2  { return Vector2{v.X + o.X, v.Y + o.Y} }
func (v Vector2) Sub(o Vector2) Vector2  { return Vector2{v.X - o.X, v.Y - o.Y} }
func (v Vector2) Scale(s float64) Vector2 { return Vector2{v.X * s, v.Y * s} }
func (v Vector2) Dot(o Vector2) float64  { return v.X*o.X + v.Y*o.Y }
func (v Vector2) LengthSq() float64      { return v.X*v.X + v.Y*v.Y }
func (v Vector2) Length() float64        { return math.Sqrt(v.LengthSq()) }

func (v Vector2) Normalized() Vector2 {
	l := v.Length()
	if l < 1e-9 {
		return Vector2{0, 0}
	}
	return Vector2{v.X / l, v.Y / l}
}

// Perp returns the perpendicular vector, used for tangential collision components.
func (v Vector2) Perp() Vector2 {
	return Vector2{-v.Y, v.X}
}

func Distance(a, b Vector2) float64 {
	return a.Sub(b).Length()
}
