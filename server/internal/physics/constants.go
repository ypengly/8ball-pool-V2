package physics

const (
	PhysicsHz = 120.0
	PhysicsDt = 1.0 / PhysicsHz

	BallRadius = 28.575 / 2
	BallMass   = 0.17

	TableWidth  = 2540.0
	TableHeight = 1270.0

	PocketRadius = BallRadius * 1.9

	SlidingFriction    = 0.2
	RollingFriction    = 0.01
	SpinDamping        = 0.99
	CushionRestitution = 0.75
	BallRestitution    = 0.96

	StopVelocityThreshold = 2.0
	StopSpinThreshold     = 0.05

	MaxShotPower = 4500.0
)
