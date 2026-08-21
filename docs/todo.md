# Build plan

Ordered so that something is usable at a real table as early as possible. Phase 4 is the
first version worth actually playing with; everything after is polish and hardening.

Status: **Phase 0 complete.** Scaffold runs, tests and lint pass, dev proxy verified.

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

## Phase 1 — Rooms and joining

- [ ] `schema.sql`: `sessions`, `members`, `characters`, `resources`, `enemies`, `events`
- [ ] Migration runner (a numbered-files-in-a-folder loop; don't reach for a library)
- [ ] Room code generator — unambiguous alphabet, collision check
- [ ] `POST /api/sessions` → create room, return code + host token
- [ ] `POST /api/sessions/:code/join` → validate passphrase, seat member, return token
- [ ] Token hashing (argon2id), passphrase hashing, rate limit on join
- [ ] Client: landing screen — big "Create room" / "Join with code"
- [ ] Client: persist token in `localStorage`, auto-rejoin on load
- [ ] Members can sit in a room with no character claimed (that's the state after joining)

## Phase 2 — The realtime spine

- [ ] Websocket upgrade with `?token=` auth; reject unauthenticated cleanly
- [ ] Connection registry: session id → set of sockets
- [ ] `server/events/` module contract: `{ validate, apply }` per event type
- [ ] Apply pipeline: validate → apply → append to `events` → persist → broadcast snapshot
- [ ] Snapshot builder (one query set → one JSON blob)
- [ ] `useSession()` composable: connect, reconnect with backoff, expose reactive state
- [ ] Heartbeat / ping-pong, drop dead sockets
- [ ] Presence: who's connected right now (derive from live sockets, don't store it)

## Phase 3 — Characters: claim or create

- [ ] Character chooser, shown right after joining: the room's existing characters to
      claim, plus "start a new one"
- [ ] Claiming binds your token to that character; several devices may bind to one
      character at once, and that's fine
- [ ] Create flow: name + class picker, which seeds that class's resource tracks
      (spell slots by level, hit dice, rage, ki, whatever it has)
- [ ] Switch or release your character without deleting it
- [ ] HP: current / max / temp. Damage applies to temp first — get this right once
- [ ] Big thumb-sized `-` / `+` steppers, plus a tap-for-custom-amount input
- [ ] Death saves (three up, three down, reset on heal above 0)
- [ ] Conditions as a chip list, free-text plus a suggested set
- [ ] Resource tracks: add / rename / set max / spend / restore / reorder
- [ ] Short rest and long rest buttons — reset tracks by `resets_on`

## Phase 4 — The enemy ledger ← _first genuinely usable build_

- [ ] Add enemy by free-text label, from any player
- [ ] Log damage to an enemy; attributed to the logging member via `events`
- [ ] Running tally per enemy, plus a per-player breakdown on tap
- [ ] Mark defeated / fled; defeated ones collapse to the bottom rather than vanishing
- [ ] Rename, reorder, remove
- [ ] "New encounter" — archive the current enemy list in one tap

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

## Open questions

Worth answering before the phase that depends on them.

1. **Damage attribution granularity.** Per-player totals, or full per-hit history? The
   `events` table supports both; the question is what the UI shows. Leaning: totals in
   the list, history on tap. _(needed by Phase 4)_
2. **Healing enemies.** Monsters do get healed sometimes. A negative damage entry handles
   it and keeps the tally honest — but does the UI expose it, or is it an edge case that
   free-text notes can absorb? _(needed by Phase 4)_
3. **Encounter archiving.** Does "new encounter" hard-delete enemies or soft-archive them?
   Soft is barely more work and makes the recap view free later. _(needed by Phase 4)_
4. **Room lifetime.** README promises "forever." Does that survive a year of abandoned
   test rooms? Probably needs a cleanup pass for rooms that were never actually used —
   never touched after creation, say. _(needed by Phase 7)_
