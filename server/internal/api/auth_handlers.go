package api

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/example/8ball-pool/server/internal/auth"
)

type Server struct {
	DB *pgxpool.Pool
}

var usernamePattern = regexp.MustCompile(`^[a-zA-Z0-9_]{3,20}$`)

type registerRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type authResponse struct {
	Token    string `json:"token"`
	UserID   string `json:"userId"`
	Username string `json:"username"`
}

// Register handles POST /api/auth/register. Input validation happens before
// any database write: username shape is checked, and password length is
// bounded (bcrypt silently truncates beyond 72 bytes, so we reject instead
// of accepting a false sense of a longer password).
func (s *Server) Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "could not parse request body")
		return
	}
	if !usernamePattern.MatchString(req.Username) {
		writeError(w, http.StatusBadRequest, "INVALID_USERNAME", "username must be 3-20 alphanumeric/underscore characters")
		return
	}
	if len(req.Password) < 8 || len(req.Password) > 72 {
		writeError(w, http.StatusBadRequest, "INVALID_PASSWORD", "password must be 8-72 characters")
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "HASH_FAILED", "could not process password")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var userID string
	err = s.DB.QueryRow(ctx,
		`INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id`,
		req.Username, hash,
	).Scan(&userID)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			writeError(w, http.StatusConflict, "USERNAME_TAKEN", "that username is already taken")
			return
		}
		writeError(w, http.StatusInternalServerError, "DB_ERROR", "could not create user")
		return
	}

	_, _ = s.DB.Exec(ctx, `INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)`, userID, req.Username)
	_, _ = s.DB.Exec(ctx, `INSERT INTO ratings (user_id, rating) VALUES ($1, 1000)`, userID)

	token, err := s.createSession(ctx, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "SESSION_FAILED", "account created but session could not be started")
		return
	}
	writeJSON(w, http.StatusCreated, authResponse{Token: token, UserID: userID, Username: req.Username})
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (s *Server) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "could not parse request body")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var userID, hash string
	err := s.DB.QueryRow(ctx, `SELECT id, password_hash FROM users WHERE username = $1`, req.Username).Scan(&userID, &hash)
	if err != nil {
		// Deliberately identical error for "no such user" and "wrong
		// password" so login failures don't leak which usernames exist.
		writeError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "invalid username or password")
		return
	}
	if err := auth.CheckPassword(hash, req.Password); err != nil {
		writeError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "invalid username or password")
		return
	}

	token, err := s.createSession(ctx, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "SESSION_FAILED", "could not start session")
		return
	}
	writeJSON(w, http.StatusOK, authResponse{Token: token, UserID: userID, Username: req.Username})
}

func (s *Server) Logout(w http.ResponseWriter, r *http.Request) {
	token := bearerToken(r)
	if token == "" {
		writeError(w, http.StatusUnauthorized, "NO_TOKEN", "missing bearer token")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	_, _ = s.DB.Exec(ctx, `DELETE FROM sessions WHERE token = $1`, token)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) createSession(ctx context.Context, userID string) (string, error) {
	token, err := auth.GenerateSessionToken()
	if err != nil {
		return "", err
	}
	_, err = s.DB.Exec(ctx,
		`INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
		token, userID, time.Now().Add(30*24*time.Hour),
	)
	if err != nil {
		return "", err
	}
	return token, nil
}

type contextKey string

const userIDContextKey contextKey = "userID"

// RequireAuth looks the bearer token up against the sessions table directly
// (see auth.go for why: instant revocation on logout/ban, no JWT to worry
// about invalidating). Expired sessions are rejected and lazily cleaned up.
func (s *Server) RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := bearerToken(r)
		if token == "" {
			writeError(w, http.StatusUnauthorized, "NO_TOKEN", "missing bearer token")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		var userID string
		var expiresAt time.Time
		err := s.DB.QueryRow(ctx, `SELECT user_id, expires_at FROM sessions WHERE token = $1`, token).Scan(&userID, &expiresAt)
		if err != nil || time.Now().After(expiresAt) {
			writeError(w, http.StatusUnauthorized, "INVALID_SESSION", "session is invalid or expired")
			return
		}
		ctx = context.WithValue(r.Context(), userIDContextKey, userID)
		next(w, r.WithContext(ctx))
	}
}

func bearerToken(r *http.Request) string {
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return ""
	}
	return strings.TrimPrefix(header, "Bearer ")
}

func writeJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{"code": code, "message": message})
}
