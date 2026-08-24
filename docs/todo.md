# Build plan

Ordered so that something is usable at a real table as early as possible. Phase 4 is the
first version worth actually playing with; everything after is polish and hardening.

Status: **All seven phases complete**, plus the navigation work below. See
[deploy.md](deploy.md) for running it.

---

## After the phases — rooms have links

A playtest found the obvious hole: a room had no URL, so it could not be shared,
bookmarked, or returned to, and a stray back gesture lost it.

- [x] A room is a link. `/room/k7m3qp`, generated at creation, six characters of an
      unambiguous alphabet, widening if it ever had to
- [x] **The four-letter code is gone.** It was a second identifier doing a job the
      link now does better, and a code short enough to read aloud is too short to
      paste around. One id, or they drift
- [x] Custom links: `/room/c/samsroom`, unique across every room including closed
      ones, and only on a room that already has a passphrase — enforced both when
      claiming one and when trying to clear the passphrase out from under it
- [x] Copy link, and a QR code to hold up at the table. Rendered as one SVG path,
      always dark-on-white so a camera can read it whatever the theme is
- [x] Seats are stored per room, so opening somebody else's link does not resume
      whichever room you were last in. The pre-links token upgrades itself once
- [x] Navigation is `replaceState` throughout: back leaves the app rather than
      stranding you on the form you passed through. Landing on a link you have no
      seat in fills the join box in for you
- [x] The join box takes a pasted link, a custom name, or just the id
- [x] Names are resolved, never redirected to. A room answers to both its generated
      link and its custom name, and the address bar only changes when the URL in it
      stops working. The join box echoes the name somebody was given rather than
      swapping it for the id behind it
- [x] The server disambiguates a name from a link id, because by shape they can be
      identical — `samsroom` is eight lowercase characters and so is a link id. Only
      the server knows both namespaces

Codes were the Jackbox idea and they were the wrong shape here. Jackbox has a TV
in the room to display one; a table has phones, and phones have cameras and
clipboards.

## After the phases — party and fight share a screen

A second playtest note: during combat, party hit points and enemy tallies are read
together. Having them on separate tabs meant flipping back and forth mid-turn.

- [x] Two tabs instead of three. **Me** is your sheet and your device; **The table**
      is the party and what it is fighting
- [x] The party is a compact strip above the fight — one line each, name, bar,
      current/max, temporary points, and conditions when there are any. Tapping one
      opens class, level, AC, resource tracks and who is holding the sheet
- [x] The strip is sticky and capped at 45dvh, so it stays put while the enemy list
      scrolls under it and a large party still cannot crowd out the fight
- [x] Room settings moved to the bottom of the table tab, where the room lives.
      Your display name and leaving moved to Me, since both are about your device

Verified at 375px with three characters and eight enemies: the strip takes 27% of
the screen, all three party bars stay pinned while scrolling deep into the list, and
nothing overflows.

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
- [x] Room id generator — unbiased `randomInt`, collision check, widens a character
      rather than ever spinning forever (this was the four-letter code at the time;
      see the navigation work above for what replaced it)
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

## Phase 5 — Party view and polish ✅

- [x] Party tab: every character's HP bar, conditions and filled-in tracks at a
      glance, plus who is holding each sheet and whether they are here
- [x] Bottom nav, with a count of what is still standing (started as Me / Party /
      Fight; see the note below on why it is two tabs now)
- [x] Design tokens, dark mode and the type scale — landed in Phase 0, verified
      here at 375px in both schemes
- [x] Undo toast, and `history.undo` behind it
- [x] Empty states throughout, and a banner while the socket is down
- [x] Tab panels use `v-show`, so switching tabs or riding out a reconnect keeps
      a half-typed enemy name and any open editor. Scroll position survives too,
      because snapshots patch in place rather than remounting
- [ ] ~~Optimistic updates~~ — **considered and declined**, see below

### Undo is scoped, and that is deliberate

A handler is reversible exactly when it exports `undo`. Hit points, resource
spends, every ledger entry, removals, releasing a character and clearing the
board all are. Renames and field edits are not: retyping is quicker than an
offer to take it back, and each unreversible handler is one less place for a
wrong inverse to hide.

Undo only ever takes back **your own** last action — someone else's mistake is
not yours to undo from a toast — and it steps further back each time it is used.
Nothing is deleted or rewritten: undoing appends, and the undo is itself an
event. A hit that has been taken back drops out of the per-enemy history read
model, so the tally still equals the sum of what you see. A test covers exactly
that, and it caught the case where it did not.

### Why optimistic updates were declined

CLAUDE.md permits optimism, it does not require it. The round trip is a socket
frame and a snapshot — imperceptible on the LAN a table actually plays on — and
speculative local state is precisely the merge-shaped bug surface the whole
full-snapshot design exists to avoid. The controls give immediate tactile
feedback instead. Revisit only if a real table reports lag.

## Phase 6 — Securing and hardening ✅

- [x] Set, change and clear the room passphrase from inside the room. Anyone
      seated can — the room is the boundary, not any one person in it
- [x] Lock toggle. A lock is a door, not an eviction: nobody new gets in and
      everybody already there keeps working
- [x] Closing a room archives it. Nothing is deleted, it stays reversible from
      the undo toast, and it still earns a typed confirmation — you type the
      room code back before the button will do anything
- [x] Rate limits on both doors: joins per room code, and a sliding window of
      intents per socket
- [x] Ceilings on characters, enemies and resource tracks per room
- [x] ~~Prune `events`~~ — **decided against**, see below

### Where the passphrase goes, and does not

Hashing runs in a new optional `prepare()` hook that the hub awaits _before_
opening the write transaction, because argon2id is deliberately slow and has no
business holding a database lock. The handler's logged payload is
`{ hasPassphrase }` and nothing else — a test asserts the plaintext and the hash
never reach the event log, and a live run confirmed it.

### Why the event log is not pruned

The history is the product: it is what undo walks, what damage attribution reads,
and what the recap view in the backlog will want. The two queries that touch it
are both bounded regardless of how long a campaign runs — undo looks at the last
50 of your own events, and the per-enemy hit history now joins against live
enemies, so archiving an encounter is what takes its hits out of scope. Rows are
a few dozen bytes. Revisit only if a real campaign makes this measurably slow.

## Phase 7 — Deploy ✅

- [x] Single-process production build verified end to end, from an empty `data/`:
      migrations ran, the API answered, the built client and its hashed assets
      were served, client routes fell back to the app, a socket connected,
      applied an intent and got its ack
- [x] Reverse proxy notes in [deploy.md](deploy.md) — nginx and Caddy, with the
      two `proxy_set_header` lines the whole thing hinges on and a read timeout
      longer than the 30s heartbeat
- [x] WAL confirmed on, and `npm run backup` for a coherent snapshot of a live
      database
- [x] Structured logging, with the credentials deliberately kept out of it

### The backup story changed

The README used to say "back up by copying that file", which is wrong once WAL
is on: recent writes live in a sidecar and a plain copy can miss them.
`npm run backup` uses SQLite's own backup API instead, and works while the
server is running. Verified against a live database — the copy opened cleanly
with every row and the right tally.

### Nothing sensitive reaches the logs

The `Authorization` header is redacted and the `token` query parameter on the
websocket upgrade is scrubbed, both with tests. A live run was grepped
afterwards for tokens, token hashes and the header: none of them appear.

### The shutdown bug this phase existed to find

`app.close()` hung whenever a socket was still attached — which on a real
deploy is every restart, because a phone that walked out of range never sends a
close frame. Phase 2 terminated the sockets in an `onClose` hook, which was the
right action at the wrong time: by then Fastify is already waiting for open
connections to end. Moving it to `preClose` fixed it, and there is now a test
that opens sockets, never closes them, and asserts the app lets go in under two
seconds.

Worth noting what this means about Phase 2's claim: the socket termination was
necessary but never sufficient, and nothing until now actually exercised it.

Signal-based shutdown itself cannot be verified on Windows — `kill` there
force-terminates rather than delivering a signal, so the handler never runs.
What matters is `app.close()`, and that is what the test covers.

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
