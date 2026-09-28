package rules

import (
	"github.com/example/8ball-pool/server/internal/physics"
)

type PlayerGroup string

const (
	GroupSolids      PlayerGroup = "SOLIDS"
	GroupStripes     PlayerGroup = "STRIPES"
	GroupUnassigned  PlayerGroup = "UNASSIGNED"
)

type PlayerState struct {
	ID    int
	Group PlayerGroup
}

type MatchState struct {
	Players       [2]PlayerState
	CurrentPlayer int
	TableOpen     bool
	IsBreakShot   bool
	BallInHand    bool
	GameOver      bool
	Winner        *int
}

func InitialMatchState(breakingPlayer int) MatchState {
	return MatchState{
		Players:       [2]PlayerState{{0, GroupUnassigned}, {1, GroupUnassigned}},
		CurrentPlayer: breakingPlayer,
		TableOpen:     true,
		IsBreakShot:   true,
	}
}

type ShotResult struct {
	PocketedBalls              []*physics.Ball
	FirstContactBallID         int
	HasFirstContact            bool
	CushionContactAfterFirstHit bool
	CueBallPocketed            bool
	EightBallPocketed          bool
}

type ShotOutcome struct {
	Foul          bool
	FoulReasons   []string
	TurnPasses    bool
	BallInHand    bool
	GameOver      bool
	Winner        *int
	GroupAssigned *PlayerGroup
}

// BuildShotResult reconstructs what happened during a shot from the raw
// physics events plus before/after ball snapshots — same contract as the
// client's buildShotResult in RulesEngine.ts, so both sides reach the same
// verdict from the same physics trace.
func BuildShotResult(events []physics.CollisionEvent, ballsBefore, ballsAfter []*physics.Ball) ShotResult {
	before := map[int]bool{}
	for _, b := range ballsBefore {
		before[b.ID] = b.Pocketed
	}
	var pocketed []*physics.Ball
	for _, b := range ballsAfter {
		if b.Pocketed && !before[b.ID] {
			pocketed = append(pocketed, b)
		}
	}

	firstContactBallID := 0
	hasFirstContact := false
	firstContactTick := -1
	for _, e := range events {
		if e.Type == physics.EventBallBall {
			cueInvolved := e.BallID == 0 || (e.HasOtherBall && e.OtherBallID == 0)
			if cueInvolved {
				if e.BallID == 0 {
					firstContactBallID = e.OtherBallID
				} else {
					firstContactBallID = e.BallID
				}
				hasFirstContact = true
				firstContactTick = e.Tick
				break
			}
		}
	}

	cushionAfter := false
	if hasFirstContact {
		for _, e := range events {
			if e.Type == physics.EventCushion && e.Tick > firstContactTick {
				cushionAfter = true
				break
			}
		}
	}

	cueBallPocketed := false
	eightBallPocketed := false
	for _, b := range pocketed {
		if b.Number == 0 {
			cueBallPocketed = true
		}
		if b.Number == 8 {
			eightBallPocketed = true
		}
	}

	return ShotResult{
		PocketedBalls:              pocketed,
		FirstContactBallID:         firstContactBallID,
		HasFirstContact:            hasFirstContact,
		CushionContactAfterFirstHit: cushionAfter,
		CueBallPocketed:            cueBallPocketed,
		EightBallPocketed:          eightBallPocketed,
	}
}

// ResolveShot is the same pure decision function as RulesEngine.ts's
// resolveShot — given match state before the shot and what happened, decide
// fouls, turn order, group assignment and win conditions. Pure and
// side-effect free so it is easy to unit test and safe to call from the
// websocket handler on the hot path.
func ResolveShot(state MatchState, result ShotResult, ballsOnTableAfterShot []*physics.Ball) ShotOutcome {
	var foulReasons []string
	player := state.Players[state.CurrentPlayer]
	opponentIdx := 1 - state.CurrentPlayer

	if result.CueBallPocketed {
		foulReasons = append(foulReasons, "SCRATCH")
	}
	if !result.HasFirstContact && !state.IsBreakShot {
		foulReasons = append(foulReasons, "NO_CONTACT")
	}
	if !state.TableOpen && result.HasFirstContact {
		firstBallType := physics.BallTypeForNumber(result.FirstContactBallID)
		expectedType := physics.BallSolid
		if player.Group == GroupStripes {
			expectedType = physics.BallStripe
		}
		contactedEight := result.FirstContactBallID == 8
		playerIsOnEight := playerHasClearedGroup(player.Group, ballsOnTableAfterShot)
		if !contactedEight && firstBallType != expectedType {
			foulReasons = append(foulReasons, "WRONG_BALL_FIRST")
		}
		if contactedEight && !playerIsOnEight {
			foulReasons = append(foulReasons, "HIT_EIGHT_EARLY")
		}
	}
	if !state.IsBreakShot && len(result.PocketedBalls) == 0 && !result.CushionContactAfterFirstHit && result.HasFirstContact {
		foulReasons = append(foulReasons, "NO_RAIL_AFTER_CONTACT")
	}

	foul := len(foulReasons) > 0

	var groupAssigned *PlayerGroup
	if state.TableOpen && !foul && len(result.PocketedBalls) > 0 {
		for _, b := range result.PocketedBalls {
			if b.Number != 0 && b.Number != 8 {
				g := GroupSolids
				if b.Type == physics.BallStripe {
					g = GroupStripes
				}
				groupAssigned = &g
				break
			}
		}
	}

	gameOver := false
	var winner *int
	if result.EightBallPocketed {
		remainingExcludingEight := make([]*physics.Ball, 0, len(ballsOnTableAfterShot))
		for _, b := range ballsOnTableAfterShot {
			if b.Number != 8 {
				remainingExcludingEight = append(remainingExcludingEight, b)
			}
		}
		cleared := playerHasClearedGroup(player.Group, remainingExcludingEight) || state.TableOpen
		gameOver = true
		w := opponentIdx
		if !foul && cleared {
			w = state.CurrentPlayer
		}
		winner = &w
	}

	legalOwnPot := false
	if !foul {
		for _, b := range result.PocketedBalls {
			if state.TableOpen {
				if b.Number != 0 {
					legalOwnPot = true
					break
				}
				continue
			}
			expectedType := physics.BallSolid
			if player.Group == GroupStripes {
				expectedType = physics.BallStripe
			}
			if b.Type == expectedType {
				legalOwnPot = true
				break
			}
		}
	}
	turnPasses := !legalOwnPot || foul

	return ShotOutcome{
		Foul:          foul,
		FoulReasons:   foulReasons,
		TurnPasses:    turnPasses,
		BallInHand:    foul,
		GameOver:      gameOver,
		Winner:        winner,
		GroupAssigned: groupAssigned,
	}
}

func ApplyOutcome(state MatchState, outcome ShotOutcome) MatchState {
	next := state
	next.IsBreakShot = false
	if outcome.GroupAssigned != nil {
		next.TableOpen = false
		next.Players[next.CurrentPlayer].Group = *outcome.GroupAssigned
		other := GroupStripes
		if *outcome.GroupAssigned == GroupStripes {
			other = GroupSolids
		}
		opponentIdx := 1 - next.CurrentPlayer
		next.Players[opponentIdx].Group = other
	}
	next.BallInHand = outcome.BallInHand
	next.GameOver = outcome.GameOver
	next.Winner = outcome.Winner
	if outcome.TurnPasses && !outcome.GameOver {
		next.CurrentPlayer = 1 - next.CurrentPlayer
	}
	return next
}

func playerHasClearedGroup(group PlayerGroup, ballsOnTable []*physics.Ball) bool {
	if group == GroupUnassigned {
		return false
	}
	targetType := physics.BallSolid
	if group == GroupStripes {
		targetType = physics.BallStripe
	}
	for _, b := range ballsOnTable {
		if b.Type == targetType && !b.Pocketed {
			return false
		}
	}
	return true
}
