package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/example/8ball-pool/server/internal/rooms"
)

type RoomsAPI struct {
	Hub *rooms.Hub
}

type createRoomResponse struct {
	RoomID string `json:"roomId"`
}

// CreateRoom handles POST /api/rooms — creates a private room the caller can
// share the code for. Ranked/casual matchmaking goes through quick-match
// instead (see QuickMatch below), which pairs players automatically rather
// than handing out a shareable code.
func (a *RoomsAPI) CreateRoom(w http.ResponseWriter, r *http.Request) {
	room := a.Hub.CreateRoom(time.Now().UnixNano(), 0)
	writeJSON(w, http.StatusCreated, createRoomResponse{RoomID: room.ID})
}

func (a *RoomsAPI) GetRoom(w http.ResponseWriter, r *http.Request) {
	roomID := r.PathValue("id")
	_, ok := a.Hub.GetRoom(roomID)
	if !ok {
		writeError(w, http.StatusNotFound, "ROOM_NOT_FOUND", "no room with that id")
		return
	}
	writeJSON(w, http.StatusOK, createRoomResponse{RoomID: roomID})
}

type joinRoomResponse struct {
	RoomID      string `json:"roomId"`
	PlayerIndex int    `json:"playerIndex"`
}

// JoinRoom hands out a player slot (0 or 1) for the given room code, which
// the client then uses to open its WebSocket connection to /ws/game/:roomId.
// Slot assignment is not yet reservation-aware (a third client could still
// race for slot 1) — fine for a private room shared with one known
// opponent, but needs a real seat-claim before this is exposed publicly.
func (a *RoomsAPI) JoinRoom(w http.ResponseWriter, r *http.Request) {
	roomID := r.PathValue("id")
	if _, ok := a.Hub.GetRoom(roomID); !ok {
		writeError(w, http.StatusNotFound, "ROOM_NOT_FOUND", "no room with that id")
		return
	}
	writeJSON(w, http.StatusOK, joinRoomResponse{RoomID: roomID, PlayerIndex: 1})
}

type quickMatchRequest struct {
	PlayerID string `json:"playerId"`
}

// QuickMatch blocks (up to a timeout) until a second player queues, then
// returns the room both should connect to. A production version would
// return immediately and push the match via a separate notification
// channel/websocket instead of holding the HTTP request open.
func (a *RoomsAPI) QuickMatch(w http.ResponseWriter, r *http.Request) {
	var req quickMatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.PlayerID == "" {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "playerId is required")
		return
	}
	ch := a.Hub.EnqueueQuickMatch(req.PlayerID)
	select {
	case room := <-ch:
		writeJSON(w, http.StatusOK, createRoomResponse{RoomID: room.ID})
	case <-time.After(30 * time.Second):
		writeError(w, http.StatusRequestTimeout, "NO_MATCH_FOUND", "no opponent found, try again")
	}
}
