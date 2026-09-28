# 8-Ball Pool

A full-stack, server-authoritative multiplayer pool game. TypeScript + Phaser 3
client, Go + WebSocket server, PostgreSQL, Docker.

See **PHASES.md** for an honest breakdown of what's implemented vs. what's
architected-for-but-not-built-yet against the full design spec.

## Quickstart

```bash
docker compose up --build
```

- Client: http://localhost:5173
- Server: http://localhost:8080 (health check at `/healthz`)
- Postgres: localhost:5432 (user/pass/db: `pool`/`pool`/`pool`)

The Postgres container auto-runs everything in `server/migrations/` on first
boot via the standard `docker-entrypoint-initdb.d` mechanism.

## Running without Docker

**Client:**
```bash
cd client
npm install
npm run dev      # http://localhost:5173
npm test         # vitest — physics + rules unit tests
```

**Server** (needs Go 1.22+ and a running Postgres):
```bash
cd server
go mod tidy
DATABASE_URL=postgres://pool:pool@localhost:5432/pool?sslmode=disable go run ./cmd/server
```

> Note: this code was written and reviewed in a sandbox with no network
> access and no Go toolchain installed, so `npm install`, `npm test`,
> `go mod tidy`, and `go build` have **not** been executed here. The physics,
> rules, and networking logic were designed and manually traced for
> correctness, but you should run the test suite yourself before trusting it
> in production — see PHASES.md for specifics.

## Repository layout

```
client/               TypeScript + Phaser 3 + Vite
  src/physics/         Vector2, Ball, Table, World (deterministic sim), Cue
  src/rules/            RulesEngine, Rack, GameSession
  src/ai/               PoolAI (ghost-ball shot selection)
  src/scenes/           TableScene (Phaser WebGL rendering)
  src/ui/               HTML/CSS HUD, event bus
  src/networking/       NetworkClient (online multiplayer, server-authoritative)
  src/__tests__/        vitest unit tests for physics + rules

server/                 Go
  cmd/server/            main.go — HTTP/WebSocket wiring
  internal/physics/      Go port of the client physics engine (must stay in sync)
  internal/rules/        Go port of the rules engine
  internal/rooms/        Room (one authoritative match) + Hub (registry/matchmaking)
  internal/websocket/    Gorilla WebSocket handler
  internal/protocol/      Shared wire message types (Room and websocket both import this,
                          not each other — avoids the import cycle those two would otherwise form)
  internal/api/           REST handlers: auth, profile, leaderboard, rooms
  internal/auth/          bcrypt password hashing, session tokens
  internal/database/      pgx connection pool
  migrations/             SQL schema, numbered

docker-compose.yml
```

## Design principle carried through this codebase

Every gameplay decision — who won, whether a ball was pocketed, whose turn it
is, whether a shot was a foul — is decided in `internal/rules` /
`src/rules/RulesEngine.ts`, called from `internal/rooms/room.go`'s
`HandleShot`, which is server-authoritative: the client's own physics run is
only ever a prediction. The rules engine has zero physics or rendering
dependencies (it's a pure function of ball state + collision events), and the
physics engine has zero rules or rendering dependencies — so any of the three
can be tested, replaced, or extended independently.
