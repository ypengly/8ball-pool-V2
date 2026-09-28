package physics

type BallType string

const (
	BallCue    BallType = "CUE"
	BallSolid  BallType = "SOLID"
	BallStripe BallType = "STRIPE"
	BallEight  BallType = "EIGHT"
)

func BallTypeForNumber(n int) BallType {
	switch {
	case n == 0:
		return BallCue
	case n == 8:
		return BallEight
	case n >= 1 && n <= 7:
		return BallSolid
	default:
		return BallStripe
	}
}

type Ball struct {
	ID              int
	Number          int
	Type            BallType
	Position        Vector2
	Velocity        Vector2
	Spin            Vector2
	AngularVelocity float64
	Radius          float64
	Mass            float64
	Pocketed        bool
}

func NewBall(id, number int, ballType BallType, position Vector2) *Ball {
	return &Ball{
		ID:       id,
		Number:   number,
		Type:     ballType,
		Position: position,
		Radius:   BallRadius,
		Mass:     BallMass,
	}
}

func (b *Ball) Clone() *Ball {
	clone := *b
	return &clone
}
