package rooms

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

// Hub tracks all live rooms. A production deployment would back this with
// Redis/Postgres so any server instance can route to a room (needed once
// this runs behind more than one process), but for a single-process
// foundation an in-memory map is honest and correct.
type Hub struct {
	mu    sync.RWMutex
	rooms map[string]*Room

	quickMatchMu    sync.Mutex
	quickMatchQueue []QueuedPlayer
}

type QueuedPlayer struct {
	PlayerID  string
	QueuedAt  time.Time
	MatchedCh chan *Room
}

func NewHub() *Hub {
	return &Hub{rooms: map[string]*Room{}}
}

func (h *Hub) CreateRoom(seed int64, breakingPlayer int) *Room {
	id := generateRoomCode()
	room := NewRoom(id, seed, breakingPlayer)
	h.mu.Lock()
	h.rooms[id] = room
	h.mu.Unlock()
	return room
}

func (h *Hub) GetRoom(id string) (*Room, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	r, ok := h.rooms[id]
	return r, ok
}

func (h *Hub) RemoveRoom(id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.rooms, id)
}

// EnqueueQuickMatch pairs the first two waiting players into a fresh room.
// This is intentionally simple FIFO pairing rather than rating/region-aware
// matchmaking — the ranking/region logic (design doc section 19) hooks in
// here once player rating and ping data are threaded through QueuedPlayer.
func (h *Hub) EnqueueQuickMatch(playerID string) chan *Room {
	h.quickMatchMu.Lock()
	defer h.quickMatchMu.Unlock()

	ch := make(chan *Room, 1)
	h.quickMatchQueue = append(h.quickMatchQueue, QueuedPlayer{PlayerID: playerID, QueuedAt: time.Now(), MatchedCh: ch})

	if len(h.quickMatchQueue) >= 2 {
		p1 := h.quickMatchQueue[0]
		p2 := h.quickMatchQueue[1]
		h.quickMatchQueue = h.quickMatchQueue[2:]
		room := h.CreateRoom(time.Now().UnixNano(), 0)
		p1.MatchedCh <- room
		p2.MatchedCh <- room
	}
	return ch
}

func generateRoomCode() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
