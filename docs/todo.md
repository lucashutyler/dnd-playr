# Build plan

Ordered so that something is usable at a real table as early as possible. Phase 4 is the
first version worth actually playing with; everything after is polish and hardening.

Status: **Phase 4 complete.** This is the first build worth taking to a table.

---

## Phase 0 — Scaffold ✅

- [x] Single root `package.json` — no npm workspaces, one install and one lockfile.
      Layout: `server/`, `client/`, `docs/`, `data/`
- [x] Fastify server with `/api/health`; config in `server/config.js`, every value
      defaulted so `.env` stays optional (`node --env-file-if-exists`, no dotenv dep)
- [x] Vite + Vue 3, dev proxy for `/api` and `/ws`, `host: true` so a real phone on the
      LAN can open the dev build
- [x] `npm run dev` runs both under `concurrently`
- [x] ESLint flat config + Prettier + vitest; a smoke test covers health and the API 404
- [x] `.gitignore`, plus `.gitattributes` pinning `eol=lf` — the machine has
      `core.autocrlf=true` globally, which otherwise breaks `prettier --check`
- [x] `npm run build` emits to `server/public`; `npm start` serves API, static assets,
      and an SPA fallback from one process

Design tokens and the dark-mode palette landed here too, since the landing screen needed
them — see `client/src/styles/tokens.css`.

## Phase 1 — Rooms and joining ✅

- [x] `001_init.sql`: `sessions`, `members`, `characters`, `resources`, `enemies`, `events`
- [x] Migration runner — numbered files in a folder, each applied in one
      transaction, no library
- [x] Room code generator — 24-letter alphabet, unbiased `randomInt`, collision
      check, widens a character rather than ever spinning forever
- [x] `POST /api/sessions` → creates a room and seats the creator as an ordinary
      member (no host token: there is no host)
- [x] `POST /api/sessions/:code/join` → validates passphrase, seats member
- [x] `GET /api/session` → resumes a stored token, works even on a locked room
- [x] argon2id for passphrases, SHA-256 for tokens (see the security note in
      CLAUDE.md for why these differ), rate limit keyed per room code
- [x] Client: landing screen with create and join, and a passphrase field that
      only appears once the server says the room wants one
- [x] Client: token in `localStorage`, auto-rejoin on load
- [x] Members can sit in a room with no character claimed — the normal state
      after joining

34 tests cover codes, hashing, migrations, and every route branch. The full flow
was also driven in a browser at 375px: create → reload → resume → leave → join
with a lowercase code → wrong passphrase → right passphrase → seated second.

## Phase 2 — The realtime spine ✅

- [x] Websocket upgrade with `?token=` auth; anything else gets a clean 401, and
      any path but `/ws` gets a 404
- [x] Connection registry: session id → set of sockets
- [x] `server/events/` contract: `{ type, validate, apply }` per file, registered
      in one line. `member.rename` and `session.rename` are the first two, and
      exist mostly to prove the pipeline before Phase 3 leans on it
- [x] Apply pipeline: validate → apply → append to `events` → persist → broadcast
- [x] Snapshot builder — one query set, one JSON blob, with `characters` and
      `enemies` already in shape so Phases 3 and 4 only have to fill them
- [x] `useSession()` owns the socket: connect, exponential backoff with jitter,
      and a token check after repeated failures so a dead token does not retry
      into a wall forever
- [x] Heartbeat ping/pong every 30s, terminating whoever missed the last round
- [x] Presence derived from live sockets, never stored (a test asserts there is
      no `online` column)

Verified with two browser tabs on different origins, so two real members: a
rename in one appeared live in the other, presence updated on arrival and
departure, and killing the server mid-session left both tabs reconnecting and
then recovering with state intact.

Presence is deliberately unhurried: a member stays on the roster for a minute after
their last socket drops, and the client waits three seconds before admitting it is
reconnecting. A phone at a table locks and backgrounds constantly, and the roster
flickering for someone sitting right there was worse than being briefly wrong.

Follow-up worth doing: the reconnect logic in `useSession()` has no automated
test — it needs a fake WebSocket and timer control, and the composable's
module-scoped state would have to become resettable first. It is the riskiest
untested code in the repo.

## Phase 3 — Characters: claim or create ✅

- [x] Character chooser after joining: the room's existing characters to claim,
      plus "start a new one". Already-held sheets say so rather than being hidden
- [x] Claiming binds the member to the character. Two devices on one character is
      the normal path and the chooser says "2 devices" rather than warning
- [x] Create flow: name, class and level, which seeds that class's tracks
- [x] Release without deleting — the sheet stays in the room for next week
- [x] HP current / max / temp, damage eating temp first, healing capped at max and
      clearing death saves. Setting a max for the first time starts you at full
- [x] Oversized damage and heal buttons, quick 1 / 5 / 10 chips, and a custom amount
- [x] Death saves, shown only when actually down rather than merely unconfigured
- [x] Conditions as chips: free text, with the usual suspects one tap away
- [x] Resource tracks: add, rename, set max, spend, restore, reorder, remove
- [x] Short and long rest, resetting tracks by `resets_on`. A long rest also refills
      hit points, drops temporary ones, and clears death saves

Fifteen event handlers now, all one-file-per-mutation. Verified in two browsers on
different origins: a second device claimed the same character and damage applied on
one appeared on the other.

**No class progression tables live in this codebase, on purpose.** A class preset
decides which tracks exist — hit dice, the right number of slot levels, the class's
signature resource — and every value starts at 0 for the player to fill in once.
Hit dice are the one exception, because they are just the level. Shipping a 20x9
slot table would be the first step toward the SRD database the README rules out.

## Phase 4 — The enemy ledger ✅ ← _first genuinely usable build_

- [x] Add by free-text label, from any player, and the add box stays open
      because enemies arrive in batches
- [x] Damage attributed to whoever logged it, straight off the socket
- [x] Running tally, with the full per-hit history on tap: a per-player summary
      first, then every entry newest-first
- [x] Healing an enemy is a first-class button, not a hidden negative
- [x] Defeated and fled sink below whatever is still standing rather than vanishing
- [x] Rename, reorder, remove
- [x] "New encounter" archives in one tap. Nothing is deleted, and one shared
      `archived_at` is what makes a set of enemies one encounter afterwards

**The tally is exactly the sum of its own history**, and a test asserts it. It is
not clamped at zero: if a monster gets healed for more than the party has dealt,
the number goes negative rather than lying about the ledger underneath it.

The history is read out of `events` with `json_extract`, never a column, so
attribution and the tally cannot drift apart. Only enemies in the current
encounter carry their hits into the snapshot, which is what keeps it small.

You do not need a character to work the ledger — a player who has not claimed a
sheet can still log the party's damage.

## Phase 5 — Party view and polish

- [ ] Party tab: everyone's HP bar + slot pips at a glance, live
- [ ] Bottom nav: Me / Party / Fight
- [ ] Design tokens, dark mode, a real type scale
- [ ] Undo toast on every mutation (append inverse event)
- [ ] Optimistic updates with snapshot reconciliation
- [ ] Empty states, loading states, offline banner
- [ ] Reconnect that doesn't lose your scroll position or your half-typed input

## Phase 6 — Securing and hardening

- [ ] Set / change / clear room passphrase — anyone in the room can, no host gate
- [ ] Lock room toggle
- [ ] Soft-delete a room: archived and restorable by code, not destroyed. This one earns
      a typed confirmation _and_ stays reversible
- [ ] Rate limits: join attempts, event floods per socket
- [ ] Payload validation on every intent; cap string lengths and array sizes
- [ ] Prune `events` beyond N per session, or roll them up — decide before it matters

## Phase 7 — Deploy

- [ ] Single-process production build verified end to end
- [ ] Reverse proxy notes (`wss://` upgrade headers — the classic footgun)
- [ ] SQLite WAL mode, and a documented backup = copy-the-file story
- [ ] Basic structured request/event logging

---

## Backlog

Not scheduled. Pulled in only if the table actually asks.

- [ ] **Room cleanup pass** — rooms created and never touched again are the only
      ones worth reaping, and even then only after a long while. "Forever" is a
      promise to real campaigns, not to abandoned test rooms.
- [ ] **Opt-in host controls** — a room setting that, once switched on, reserves
      character removal / room deletion / passphrase changes to whoever turned it on.
      Off by default and probably forever; it exists for the table that asks for it.
- [ ] **Fuzzy damage mode** — show tallies banded (`~50`) instead of exact, to stop the
      ledger leaking monster HP. See the social note in the README. This is the most
      likely of these to be needed.
- [ ] Session log / recap view — the `events` table already contains it
- [ ] Multiple characters per member (someone's running two)
- [ ] Companion/pet HP under a character
- [ ] Concentration flag with a visible reminder
- [ ] Optional DM seat — read-only party overview, no monster management
- [ ] Export a session to JSON
- [ ] PWA install + offline read of last snapshot
- [ ] Per-character portrait/color so the party view is scannable at a glance

## Settled

Recorded so they do not get relitigated later.

- **Damage attribution is full per-hit history**, not just per-player totals. The
  list shows the tally; tapping shows every hit. Folded into Phase 4.
- **Healing an enemy is a first-class action**, not an edge case for the notes
  field to absorb. It is a negative entry against the tally. Folded into Phase 4.
- **History is kept.** "New encounter" archives, it does not delete. Folded into
  Phase 4.
- **Room lifetime is not urgent.** The README's "forever" stands; reaping rooms
  that were created and never touched again sits in the backlog, not in a phase.
- **Second devices claim, they are not re-seated.** Settled in Phase 1: the claim
  lives on the member, so many members can point at one character.
