package protocol

import "github.com/example/8ball-pool/server/internal/physics"

// Message types exchanged over the /ws/game/:roomId socket. The client NEVER
// sends ball positions, pocket events, fouls, or turn changes — only intent
// (a shot, a chat line, a rematch request). The server computes every
// outcome and pushes it back as STATE_UPDATE. This is what "server decides
// who won, whether a ball was pocketed, whose turn it is" means in code.
type MessageType string

const (
	MsgShot         MessageType = "SHOT"
	MsgStateUpdate  MessageType = "STATE_UPDATE"
	MsgJoined       MessageType = "JOINED"
	MsgError        MessageType = "ERROR"
	MsgPing         MessageType = "PING"
	MsgPong         MessageType = "PONG"
	MsgRematchReq   MessageType = "REMATCH_REQUEST"
	MsgPlayerLeft   MessageType = "PLAYER_LEFT"
	MsgReconnected  MessageType = "RECONNECTED"
)

type Envelope struct {
	Type MessageType     `json:"type"`
	Data interface{}     `json:"data,omitempty"`
}

type ShotMessage struct {
	Shot physics.ShotInput `json:"shot"`
}

type BallDTO struct {
	ID       int     `json:"id"`
	Number   int     `json:"number"`
	Type     string  `json:"type"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Pocketed bool    `json:"pocketed"`
}

type StateUpdateMessage struct {
	Balls         []BallDTO `json:"balls"`
	CurrentPlayer int       `json:"currentPlayer"`
	TableOpen     bool      `json:"tableOpen"`
	GameOver      bool      `json:"gameOver"`
	Winner        *int      `json:"winner,omitempty"`
	FoulReasons   []string  `json:"foulReasons,omitempty"`
	Tick          int       `json:"tick"`
}

type ErrorMessage struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}
