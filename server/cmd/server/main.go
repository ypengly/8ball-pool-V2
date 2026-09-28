package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/example/8ball-pool/server/internal/api"
	"github.com/example/8ball-pool/server/internal/database"
	"github.com/example/8ball-pool/server/internal/rooms"
	"github.com/example/8ball-pool/server/internal/websocket"
)

func main() {
	databaseURL := getEnv("DATABASE_URL", "postgres://pool:pool@localhost:5432/pool?sslmode=disable")
	port := getEnv("PORT", "8080")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := database.Connect(ctx, databaseURL)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer pool.Close()

	hub := rooms.NewHub()
	server := &api.Server{DB: pool}
	roomsAPI := &api.RoomsAPI{Hub: hub}
	limiter := api.NewRateLimiter(10, 20) // 10 req/s sustained, burst of 20

	mux := http.NewServeMux()

	// Auth
	mux.HandleFunc("POST /api/auth/register", server.Register)
	mux.HandleFunc("POST /api/auth/login", server.Login)
	mux.HandleFunc("POST /api/auth/logout", server.Logout)

	// Profile
	mux.HandleFunc("GET /api/profile", server.RequireAuth(server.GetProfile))
	mux.HandleFunc("GET /api/leaderboard", server.GetLeaderboard)

	// Rooms / matchmaking
	mux.HandleFunc("POST /api/rooms", roomsAPI.CreateRoom)
	mux.HandleFunc("GET /api/rooms/{id}", roomsAPI.GetRoom)
	mux.HandleFunc("POST /api/rooms/{id}/join", roomsAPI.JoinRoom)
	mux.HandleFunc("POST /api/matchmaking/quick", roomsAPI.QuickMatch)

	// Health check for Docker/orchestration
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	// WebSocket game channel — the only place gameplay state actually moves.
	mux.HandleFunc("GET /ws/game/{roomId}", func(w http.ResponseWriter, r *http.Request) {
		// Re-route through the existing query-param based handler so the
		// path-based {roomId} and the handler's expected query params agree.
		q := r.URL.Query()
		q.Set("roomId", r.PathValue("roomId"))
		r.URL.RawQuery = q.Encode()
		websocket.ServeGameSocket(hub)(w, r)
	})

	handler := limiter.Middleware(mux)

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	go func() {
		log.Printf("8ball-pool server listening on :%s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Println("shutting down...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
