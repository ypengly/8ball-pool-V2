package api

import (
	"context"
	"net/http"
	"time"
)

type profileResponse struct {
	UserID      string `json:"userId"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Rating      int    `json:"rating"`
	Wins        int    `json:"wins"`
	Losses      int    `json:"losses"`
}

func (s *Server) GetProfile(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(userIDContextKey).(string)
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var resp profileResponse
	resp.UserID = userID
	err := s.DB.QueryRow(ctx, `
		SELECT u.username, p.display_name, r.rating, r.wins, r.losses
		FROM users u
		JOIN profiles p ON p.user_id = u.id
		JOIN ratings r ON r.user_id = u.id
		WHERE u.id = $1
	`, userID).Scan(&resp.Username, &resp.DisplayName, &resp.Rating, &resp.Wins, &resp.Losses)
	if err != nil {
		writeError(w, http.StatusNotFound, "PROFILE_NOT_FOUND", "profile not found")
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

type leaderboardEntry struct {
	Username string `json:"username"`
	Rating   int    `json:"rating"`
	Wins     int    `json:"wins"`
	Losses   int    `json:"losses"`
}

// GetLeaderboard handles GET /api/leaderboard?limit=50. Global leaderboard
// only for this v1 — regional/friends/club leaderboards (design doc section
// 37) need region and club-membership columns this schema doesn't have yet.
func (s *Server) GetLeaderboard(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	rows, err := s.DB.Query(ctx, `
		SELECT u.username, r.rating, r.wins, r.losses
		FROM ratings r
		JOIN users u ON u.id = r.user_id
		ORDER BY r.rating DESC
		LIMIT 50
	`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "DB_ERROR", "could not load leaderboard")
		return
	}
	defer rows.Close()

	entries := []leaderboardEntry{}
	for rows.Next() {
		var e leaderboardEntry
		if err := rows.Scan(&e.Username, &e.Rating, &e.Wins, &e.Losses); err != nil {
			continue
		}
		entries = append(entries, e)
	}
	writeJSON(w, http.StatusOK, entries)
}
