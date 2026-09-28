# Build status against the full design doc

The design doc specifies ~60 systems (roguelike mode, career mode, clubs,
tournaments, trick-shot editor, replay/highlight system, cosmetics, daily
challenges, developer debug tools, etc.). Building all of it as genuinely
complete, tested code is a multi-month project for a team. This document
tracks, honestly, what exists right now vs. what's designed-for-later.

## ✅ Built and real (not placeholders)

- **Custom deterministic physics** (`client/src/physics/`, ported to
  `server/internal/physics/`): ball-ball collision with impulse resolution,
  cushion collision, pocket detection, two-phase friction (sliding/rolling),
  spin/english affecting rebound and throw, substep integration to prevent
  tunneling at high shot power, fixed 120Hz timestep.
- **8-ball rules engine** (`client/src/rules/RulesEngine.ts`, ported to
  `server/internal/rules/`): break/open table, group assignment on first
  legal pot, scratch, wrong-ball-first foul, no-rail-after-contact foul,
  early/illegal 8-ball loss, legal 8-ball win, turn passing. Pure functions,
  unit tested.
- **Deterministic seeded rack builder** (`Rack.ts` / `rack.go`) — same seed
  produces the same layout on both client and server.
- **Basic AI** (`client/src/ai/PoolAI.ts`) — ghost-ball shot geometry,
  obstruction/line-of-sight checks, cut-angle difficulty scoring, and
  difficulty-tiered aim noise (EASY/MEDIUM/HARD/EXPERT miss chance). Real
  shot selection, not scripted or random.
- **Phaser WebGL rendering** (`TableScene.ts`) of the actual physics state —
  not a DOM/CSS simulation. HTML/CSS is used only for the HUD, as specified.
- **Server-authoritative multiplayer skeleton** (`internal/rooms/room.go`):
  the server re-simulates every shot itself and is the sole source of truth
  for fouls/turns/win-loss. Rejects out-of-turn and physically-impossible
  shot inputs (first-pass anti-cheat).
- **WebSocket protocol + reconnection primitive** (`internal/websocket`,
  `internal/protocol`, `NetworkClient.ts`): shot-intent in, confirmed state
  out; disconnect detaches a player from the room rather than ending the
  match.
- **REST API**: register/login/logout (bcrypt + server-side session tokens,
  not JWT, for instant revocation), profile, global leaderboard, room
  creation/join, FIFO quick-match pairing.
- **Postgres schema** for what's actually wired up (`001_core.sql`,
  `002_matches.sql` — the latter's tables aren't written to yet, see below)
  plus a reserved schema sketch for future systems (`003_future_systems.sql`,
  explicitly unused by any code today).
- **Docker Compose** running client, server, and Postgres together, with
  migrations auto-applied on first Postgres boot.
- **Unit tests** for physics (collision, friction, pockets, no-tunneling) and
  rules (fouls, group assignment, win/loss) — see the caveat below about not
  having run them.

## ⚠️ Built but incomplete / needs follow-up

- **Match persistence**: `matches`, `match_players`, `rating_history`,
  `statistics` tables exist (`002_matches.sql`) but `room.go` never writes to
  them — a completed match currently updates in-memory `MatchState` only and
  is lost when the room is garbage collected. Wiring `HandleShot`'s
  `GameOver` branch to insert a match row and update `ratings` is the next
  concrete task.
- **ELO rating changes**: `ratings.rating` is initialized to 1000 on
  registration but nothing ever changes it after a match.
- **Reconnection**: disconnect/reattach works at the connection level, but a
  reconnecting client doesn't yet get an immediate full-board resync
  snapshot — it just waits for the next `STATE_UPDATE` from a future shot.
- **Online mode isn't wired into the Phaser scene yet**: `TableScene`
  currently only drives local single-player-vs-AI through `GameSession`
  directly. `NetworkClient.ts` is a complete, usable class, but nothing in
  the scene switches between "local" and "online" mode yet.
- **AI is MEDIUM-equivalent only**: no safety play, no position play
  (leave for next shot), no multi-shot lookahead. The difficulty enum and
  noise model exist for EASY/HARD/EXPERT but the underlying shot search is
  the same greedy nearest-legal-pot algorithm at every tier.
- **Room/seat assignment race**: `JoinRoom` always hands out player index 1
  without reserving it — fine for a link shared with one known opponent, not
  safe as a public matchmaking endpoint yet.

## ❌ Not built (schema reserved, no code)

Everything else in the design doc: 9-ball/10-ball/straight pool/speed
pool/trick shot/puzzle modes, career mode, Pool Rogue, tournaments (schema
only), clubs (schema only), friends (schema only), trick-shot editor (schema
only), replay/highlight system (schema only), cosmetics/cue-and-table
collections (schema only), daily challenges, weekly events, achievements
(schema only), spectator mode, developer debug overlay, physics lab, audio,
dynamic environments/music, controller/mobile input, accessibility options,
masse/jump shots, region/rating-aware matchmaking (current version is FIFO
pairing only).

## Known unverified risk

This was built in a sandbox with **no network access and no Go toolchain**,
so none of it has actually been compiled or run:
- `npm install` failed (registry blocked) — the TypeScript has never been
  type-checked by `tsc` or bundled by Vite.
- No `go` binary was available — the Go code has never been `go vet`'d,
  `go build`'d, or `go test`'d.

Both sides were written carefully and manually traced (including fixing one
real bug: an import cycle between the `rooms` and `websocket` Go packages,
resolved by extracting `internal/protocol`), but you should run
`npm install && npm test` and `go build ./... && go vet ./...` yourself
before relying on this — there are near-certainly small issues (a typo, an
off-by-one in a type conversion) that only a real compiler/test run will
catch. Treat this as a strong first draft that needs a green CI run before
you trust it, not as verified-working code.
