package auth

import (
	"crypto/rand"
	"encoding/hex"
	"errors"

	"golang.org/x/crypto/bcrypt"
)

// HashPassword and CheckPassword wrap bcrypt so no plaintext or reversible
// password ever touches the database — this is the "password hashing"
// requirement, not a placeholder comparison.
func HashPassword(plaintext string) (string, error) {
	hashed, err := bcrypt.GenerateFromPassword([]byte(plaintext), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hashed), nil
}

func CheckPassword(hash, plaintext string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plaintext))
}

var ErrInvalidToken = errors.New("invalid session token")

// GenerateSessionToken returns a cryptographically random opaque token —
// sessions are looked up server-side against the `sessions` table rather
// than trusting a client-decodable JWT for this v1, which keeps revocation
// (logout, ban) trivial: delete the row.
func GenerateSessionToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
