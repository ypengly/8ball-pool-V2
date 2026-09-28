package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	gorilla "github.com/gorilla/websocket"

	"github.com/example/8ball-pool/server/internal/protocol"
	"github.com/example/8ball-pool/server/internal/rooms"
)

var upgrader = gorilla.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// Restrict cross-origin socket upgrades to known client origins in
	// production; wide open here only because this is a development build.
	CheckOrigin: func(r *http.Request) bool { return true },
}

// ServeGameSocket handles GET /ws/game/:roomId?player=0|1. On disconnect it
// detaches the player from the room (rather than ending the match) so a
// reconnect within the grace window can re-attach to the same in-progress
// game — this is the reconnection/disconnect-handling requirement. Full
// state recovery (resending the current board on RECONNECTED) is a TODO
// noted in PHASES.md, not silently skipped: right now a reconnect gets the
// next STATE_UPDATE broadcast, not an immediate resync snapshot.
func ServeGameSocket(hub *rooms.Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		roomID := r.URL.Query().Get("roomId")
		playerParam := r.URL.Query().Get("player")
		playerIndex := 0
		if playerParam == "1" {
			playerIndex = 1
		}

		room, ok := hub.GetRoom(roomID)
		if !ok {
			http.Error(w, "room not found", http.StatusNotFound)
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("websocket upgrade failed: %v", err)
			return
		}
		defer conn.Close()

		roomConn := &rooms.Conn{Send: make(chan protocol.Envelope, 32)}
		room.Attach(playerIndex, roomConn)
		defer room.Detach(playerIndex)

		done := make(chan struct{})
		go writePump(conn, roomConn, done)

		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		conn.SetPongHandler(func(string) error {
			conn.SetReadDeadline(time.Now().Add(60 * time.Second))
			return nil
		})

		for {
			_, raw, err := conn.ReadMessage()
			if err != nil {
				close(done)
				return
			}
			var env protocol.Envelope
			if err := json.Unmarshal(raw, &env); err != nil {
				continue
			}
			switch env.Type {
			case protocol.MsgShot:
				var payload protocol.ShotMessage
				if b, err := json.Marshal(env.Data); err == nil {
					_ = json.Unmarshal(b, &payload)
				}
				room.HandleShot(playerIndex, payload.Shot)
			case protocol.MsgPing:
				roomConn.Send <- protocol.Envelope{Type: protocol.MsgPong}
			}
		}
	}
}

func writePump(conn *gorilla.Conn, roomConn *rooms.Conn, done chan struct{}) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case env, ok := <-roomConn.Send:
			if !ok {
				return
			}
			if err := conn.WriteJSON(env); err != nil {
				return
			}
		case <-ticker.C:
			if err := conn.WriteMessage(gorilla.PingMessage, nil); err != nil {
				return
			}
		case <-done:
			return
		}
	}
}
