package api

import (
	"net"
	"net/http"
	"sync"
	"time"
)

type bucket struct {
	tokens   float64
	lastFill time.Time
}

// RateLimiter is a simple per-IP token bucket. It is intentionally basic
// (in-memory, single-process) — swap for a Redis-backed limiter before
// running more than one server instance behind a load balancer.
type RateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket
	rate    float64 // tokens added per second
	burst   float64
}

func NewRateLimiter(ratePerSecond, burst float64) *RateLimiter {
	return &RateLimiter{buckets: map[string]*bucket{}, rate: ratePerSecond, burst: burst}
}

func (rl *RateLimiter) allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	b, ok := rl.buckets[key]
	now := time.Now()
	if !ok {
		b = &bucket{tokens: rl.burst, lastFill: now}
		rl.buckets[key] = b
	}
	elapsed := now.Sub(b.lastFill).Seconds()
	b.tokens = min(rl.burst, b.tokens+elapsed*rl.rate)
	b.lastFill = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

func min(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func (rl *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			host = r.RemoteAddr
		}
		if !rl.allow(host) {
			http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}
