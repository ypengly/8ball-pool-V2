-- NONE of the tables in this file are read or written by any Go code yet.
-- They exist so the schema for later phases (clubs, friends, tournaments,
-- cosmetics, achievements, trick-shot editor) is decided now and won't force
-- a breaking migration later, per the design doc's full table list. Treat
-- this file as a reserved-schema sketch, not a working feature.

CREATE TABLE achievements (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL
);

CREATE TABLE player_achievements (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id TEXT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE cues (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    rarity TEXT NOT NULL DEFAULT 'common'
);

CREATE TABLE player_cues (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cue_id TEXT NOT NULL REFERENCES cues(id) ON DELETE CASCADE,
    equipped BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (user_id, cue_id)
);

CREATE TABLE tables_cosmetic (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    theme TEXT NOT NULL
);

CREATE TABLE player_tables (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    table_id TEXT NOT NULL REFERENCES tables_cosmetic(id) ON DELETE CASCADE,
    equipped BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (user_id, table_id)
);

CREATE TABLE clubs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    owner_user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE club_members (
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (club_id, user_id)
);

CREATE TABLE friends (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | blocked
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, friend_user_id)
);

CREATE TABLE tournaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    bracket_size INT NOT NULL CHECK (bracket_size IN (8, 16, 32)),
    status TEXT NOT NULL DEFAULT 'REGISTERING',
    starts_at TIMESTAMPTZ
);

CREATE TABLE tournament_players (
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seed INT,
    eliminated BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (tournament_id, user_id)
);

CREATE TABLE replays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
    frame_data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE trick_shots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    layout_data JSONB NOT NULL,
    likes INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE challenge_attempts (
    id BIGSERIAL PRIMARY KEY,
    trick_shot_id UUID NOT NULL REFERENCES trick_shots(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    success BOOLEAN NOT NULL,
    time_ms INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
