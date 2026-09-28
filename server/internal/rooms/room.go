package rooms

import (
	"log"
	"sync"
	"time"

	"github.com/example/8ball-pool/server/internal/physics"
	"github.com/example/8ball-pool/server/internal/rules"
	"github.com/example/8ball-pool/server/internal/protocol"
)

const maxTicksPerShot = 120 * 20 // 20 simulated seconds safety cap

// Room owns one authoritative match. Every mutation to World/MatchState goes
// through HandleShot while mu is held — this is the single choke point that
// makes the server, not any client, the source of truth for who won, whether
// a ball was pocketed, whose turn it is, and whether a shot was a foul.
type Room struct {
	ID    string
	mu    sync.Mutex
	world *physics.World
	match rules.MatchState

	conns map[int]*Conn // playerIndex (0 or 1) -> connection
}

type Conn struct {
	Send chan protocol.Envelope
}

func NewRoom(id string, seed int64, breakingPlayer int) *Room {
	table := physics.NewTable()
	balls := physics.BuildRack(table, seed)
	return &Room{
		ID:    id,
		world: physics.NewWorld(table, balls),
		match: rules.InitialMatchState(breakingPlayer),
		conns: map[int]*Conn{},
	}
}

func (r *Room) Attach(playerIndex int, conn *Conn) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.conns[playerIndex] = conn
}

func (r *Room) Detach(playerIndex int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.conns, playerIndex)
	r.broadcastLocked(protocol.Envelope{Type: protocol.MsgPlayerLeft, Data: playerIndex})
}

// HandleShot is the ONLY entry point that advances the match. It:
//  1. Rejects the shot outright if it isn't that player's turn (anti-cheat:
//     illegal turns) or the input is physically impossible (anti-cheat:
//     impossible shot power/angles).
//  2. Re-simulates the entire shot server-side — the client's own physics
//     was only ever a prediction; this is the authoritative run.
//  3. Resolves rules, updates match state, and broadcasts the confirmed
//     result to every connection in the room.
func (r *Room) HandleShot(playerIndex int, input physics.ShotInput) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.match.GameOver {
		r.sendErrorLocked(playerIndex, "GAME_OVER", "the match has already ended")
		return
	}
	if playerIndex != r.match.CurrentPlayer {
		r.sendErrorLocked(playerIndex, "NOT_YOUR_TURN", "it is not your turn")
		return
	}
	if !physics.IsPlausibleShot(input) {
		r.sendErrorLocked(playerIndex, "IMPLAUSIBLE_SHOT", "shot input rejected by server validation")
		return
	}

	var cueBall *physics.Ball
	for _, b := range r.world.Balls {
		if b.Number == 0 && !b.Pocketed {
			cueBall = b
			break
		}
	}
	if cueBall == nil {
		r.sendErrorLocked(playerIndex, "NO_CUE_BALL", "no cue ball on table")
		return
	}

	ballsBefore := make([]*physics.Ball, len(r.world.Balls))
	for i, b := range r.world.Balls {
		ballsBefore[i] = b.Clone()
	}

	physics.ApplyShot(cueBall, input)

	var allEvents []physics.CollisionEvent
	ticks := 0
	for !r.world.IsSettled() && ticks < maxTicksPerShot {
		events := r.world.Step()
		allEvents = append(allEvents, events...)
		ticks++
	}
	if ticks >= maxTicksPerShot {
		log.Printf("room %s: shot exceeded max ticks, forcing settle (physics bug guard)", r.ID)
	}

	result := rules.BuildShotResult(allEvents, ballsBefore, r.world.Balls)
	outcome := rules.ResolveShot(r.match, result, r.world.Balls)
	r.match = rules.ApplyOutcome(r.match, outcome)

	if result.CueBallPocketed && !outcome.GameOver {
		cueBall.Pocketed = false
		cueBall.Position = physics.Vector2{X: r.world.Table.Width * 0.25, Y: r.world.Table.Height / 2}
		cueBall.Velocity = physics.Vector2{}
	}

	r.broadcastStateLocked(outcome.FoulReasons)
}

func (r *Room) broadcastStateLocked(foulReasons []string) {
	balls := make([]protocol.BallDTO, 0, len(r.world.Balls))
	for _, b := range r.world.Balls {
		balls = append(balls, protocol.BallDTO{
			ID: b.ID, Number: b.Number, Type: string(b.Type),
			X: b.Position.X, Y: b.Position.Y, Pocketed: b.Pocketed,
		})
	}
	var winner *int
	if r.match.Winner != nil {
		w := *r.match.Winner
		winner = &w
	}
	r.broadcastLocked(protocol.Envelope{
		Type: protocol.MsgStateUpdate,
		Data: protocol.StateUpdateMessage{
			Balls:         balls,
			CurrentPlayer: r.match.CurrentPlayer,
			TableOpen:     r.match.TableOpen,
			GameOver:      r.match.GameOver,
			Winner:        winner,
			FoulReasons:   foulReasons,
			Tick:          r.world.Tick,
		},
	})
}

func (r *Room) broadcastLocked(env protocol.Envelope) {
	for _, c := range r.conns {
		select {
		case c.Send <- env:
		case <-time.After(2 * time.Second):
			log.Printf("room %s: dropping slow connection send", r.ID)
		}
	}
}

func (r *Room) sendErrorLocked(playerIndex int, code, message string) {
	if c, ok := r.conns[playerIndex]; ok {
		c.Send <- protocol.Envelope{Type: protocol.MsgError, Data: protocol.ErrorMessage{Code: code, Message: message}}
	}
}
