-- Match history schema. The Room/Hub code in internal/rooms does not yet
-- persist matches here (it's purely in-memory today) — this migration exists
-- so the next phase (persisting match results + updating ratings/ELO after
-- HandleShot detects GameOver) has a schema to write into without another
-- migration round-trip. Wiring it up is tracked in PHASES.md.
CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code TEXT NOT NULL,
    game_mode TEXT NOT NULL DEFAULT 'CLASSIC_8BALL',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    winner_user_id UUID REFERENCES users(id),
    rating_change INT
);

CREATE TABLE match_players (
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    player_index SMALLINT NOT NULL CHECK (player_index IN (0, 1)),
    ball_group TEXT,
    PRIMARY KEY (match_id, user_id)
);

CREATE TABLE rating_history (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
    rating_before INT NOT NULL,
    rating_after INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE statistics (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    games_played INT NOT NULL DEFAULT 0,
    balls_pocketed INT NOT NULL DEFAULT 0,
    fouls INT NOT NULL DEFAULT 0,
    scratches INT NOT NULL DEFAULT 0,
    break_and_runs INT NOT NULL DEFAULT 0,
    bank_shots INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_matches_room_code ON matches(room_code);
CREATE INDEX idx_rating_history_user_id ON rating_history(user_id);
