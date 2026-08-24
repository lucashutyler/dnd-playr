# CLAUDE.md

Working notes for Claude Code in this repo. Read [README.md](README.md) for what the app
is; this file is about how to build it without breaking the shape.

## The prime directive

**Simple beats complete.** This is a bookkeeper, not a virtual tabletop. When a feature
request arrives, the first question is "can the table just... type that into a text
field?" Usually yes. Ship the text field.

Corollary: prefer deleting a concept over adding a flag.

## Commands

```bash
npm run dev          # server (:3000) + vite (:5173, proxies /api and /ws)
npm run dev:server   # server only
npm run dev:client   # vite only
npm run build        # build client into server/public
npm start            # production: single Node process on :3000
npm test             # vitest
npm run lint         # eslint + prettier check
```

## Architecture in one paragraph

The server is authoritative. Clients never mutate state directly — they send an **intent**
over the websocket (`{type: "damage.add", enemyId, amount}`), the server validates it,
applies it, appends it to the `events` table, persists the new state, and broadcasts a
**full snapshot** of the session to every connected member. Clients replace their local
state with the snapshot. That's it.

Full snapshots, not patches. A session is a handful of characters and enemies — a few KB
of JSON. Snapshotting eliminates an entire category of desync bugs for a payload size
nobody will ever notice. If a session ever gets big enough that this hurts, that's the
signal to add patches, and not before.

## Handler contract

A file in `server/events/` exports `{ type, validate, apply }` and may also export:

- `prepare(payload)` — async, awaited **outside** the write transaction. This is where
  anything slow or asynchronous goes. Argon2id hashing a passphrase is the reason it
  exists; better-sqlite3 transactions are synchronous and must not straddle an await.
- `undo({ db, session, member, logged })` — makes the mutation reversible. See below.

## The wire

Three frame types server to client, and that is the whole protocol:

```
{ type: 'snapshot', snapshot: {...} }   after any change, and on connect
{ type: 'ack', id }                     only if the intent carried an id
{ type: 'error', id, error }            id is null when we could not parse one
```

Client to server is an intent: `{ type, ...payload }`, optionally with an `id`
to correlate the ack or error. There is no member id on the wire in either
direction — the socket already knows who it is.

## Data flow rules

1. **Every mutation is an event.** New mutation → new file in `server/events/`, exporting
   `{ validate, apply }`. Never mutate session state from a route handler or socket
   handler directly.
2. **Events are append-only.** They power undo and damage attribution. Never delete or
   rewrite one; to undo, append the inverse.
3. **Optimistic UI is allowed, reconciliation is mandatory.** The client may apply a tap
   locally for responsiveness, but the next snapshot always wins, unconditionally. No
   merge logic.
4. **The socket carries no auth state.** Every connection authenticates once at upgrade
   via `?token=`, and the server holds the resolved member on the connection object. The
   client never sends its member id — the server knows it.

## Data model

SQLite, in `server/db/schema.sql`. Roughly:

- `sessions` — id, `url_id` (the link), `slug` (nullable alias), name,
  `passphrase_hash` (nullable), `locked`, `archived_at`, timestamps

  These are **three separate things** and none is derived from another: `name` is what
  the table calls itself and is free text that two rooms may share, `url_id` is
  generated, and `slug` names the URL. Renaming a room must never move a link, and
  claiming a link must never touch the name. Tests hold this.

- `members` — id, session_id, `token_hash`, `character_id` (nullable), display_name, last_seen
- `characters` — id, session_id, name, class, level, hp_current, hp_max, hp_temp, ac,
  death saves, `conditions` (json), `notes`
- `resources` — id, character_id, name, current, max, `resets_on` (`short` | `long` | `never`), sort
- `enemies` — id, session_id, label, `damage_total`, status (`active` | `defeated` | `fled`), sort
- `events` — id, session_id, member_id, type, `payload` (json), created_at

### The one modeling idea to preserve

**Everything a character spends is a `resource` row.** Spell slots aren't special — level
3 slots are just a track named "Level 3" with `current`/`max` that resets on a long rest.
So are hit dice, rage, ki, superiority dice, bardic inspiration, sorcery points, and the
homebrew thing someone's warlock has. One UI component, one set of event types, every
class covered, zero class logic in the codebase.

Do not add a `spell_slots` table. It's been considered; this is better.

### The second one

**Characters are unowned.** The claim lives on the member (`members.character_id`), not
on the character — so a character has no owner column, and _many members can point at one
character_. That's not an edge case, it's the normal path: it's how phone-plus-tablet
works, and how you resume next week when your old token is long gone. Joining a room and
claiming a character are two separate steps, and you can sit in a room claiming nothing.

Do not add `characters.member_id`. It looks like the obvious direction and it's backwards.

### The third one

**Enemies have no `hp_max` and no `hp_current`.** They have `damage_total`: a signed
running tally that is exactly the sum of its entries in the event log. Damage adds,
healing subtracts, and it is deliberately not clamped at zero — a tally that disagreed
with the history underneath it would be worse than an odd-looking negative.

If you find yourself wanting a max, re-read the README — you've reinvented a DM tool.
Attribution and per-hit history live in `events` and are read back with `json_extract`.
Never add a hits column; two sources for one number is how they drift.

`enemies.archived_at` is how "new encounter" works. It archives, never deletes, and one
shared timestamp is what groups a set of enemies into one encounter afterwards.

## Security model

- Never trust the client for identity. `token` → `token_hash` lookup → member. Always.
- Store `token_hash` and `passphrase_hash`, never the plaintext — and note these two
  secrets are hashed differently on purpose. Member tokens are 32 bytes we generated, so
  there is no weak token to grind: SHA-256 is correct and a slow KDF would only add
  latency to every reconnect. Room passphrases are chosen by a human and will be
  "dragons": those get argon2id.
- Tokens are 32 random bytes, base64url. They are bearer credentials — treat them like it.
- **Authorization stops at the room door.** Once a member is authenticated into a room,
  every intent against that room is permitted. Do not write per-row ownership checks —
  no "is this your character", no "did you add this enemy". There is deliberately no host
  role; don't reintroduce one outside the opt-in design in the backlog.
- Rate-limit join attempts per room. The link id is the only thing standing between a
  stranger and a room with no passphrase, so enumeration has to stay boring.
- **A room has one identifier: `url_id`.** Six characters of `abcdefghjkmnpqrstuvwxyz23456789`,
  widening rather than ever failing to allocate. There used to be a second, four-letter
  code for reading aloud; it was deleted rather than kept in step with this one.
- `sessions.slug` is an optional alias, and it may only exist on a room that has a
  passphrase — enforced when claiming it _and_ when clearing the passphrase. A chosen
  name is guessable by design; do not let one outlive the thing protecting it.
- No PII anywhere. Display names only. Don't add email, don't add OAuth.

## Frontend conventions

- Vue 3, `<script setup>`, Composition API. No Options API.
- One composable owns the connection and state: `useSession()`. Components read from it
  and call intent functions on it. No prop-drilling of session state, no Pinia.
- Styling is plain CSS in SFC `<style scoped>` blocks, using tokens from
  `client/styles/tokens.css`. No utility classes, no CSS-in-JS, no component library.
- Prefer a CSS keyframe over Vue's `<Transition>` for anything that must not get
  stuck. Transition drives its leave state from animation frames, and a backgrounded
  tab suspends those — which is exactly what a phone does when you glance at a
  message mid-combat. A wedged, half-faded toast over the controls is worse than no
  animation at all.
- Tab panels are `v-show`, not `v-if`. Unmounting throws away half-typed input.
- **Whichever link somebody arrived on is the one they keep.** A room with a custom name
  answers to both `/room/<url_id>` and `/room/c/<slug>`, and rewriting one into the other
  is a redirect nobody asked for. `formFor()` in `client/src/room-url.js` is the whole
  rule: the address bar changes only when the URL in it stops working, which happens when
  a custom name is released out from under it — and once it has fallen back it stays
  fallen back rather than springing to a reclaimed name. The share panel is where the
  prettier link gets offered.
- Colors, spacing, radii, and type scale come from custom properties. If you're writing a
  raw hex or a raw `px` in a component, you probably want a token.

## Mobile-first rules (non-negotiable)

The primary device is a phone held in one hand at a table, in a dim room, next to a beer.

- Design at 375px first. Desktop is the adaptation, not the baseline.
- Tap targets ≥ 44px. HP steppers should be bigger — they're the most-used control.
- No horizontal scroll, ever, at any width.
- Primary actions in the bottom third of the screen, reachable by thumb.
- Three tabs, bottom nav: **Me**, **Party**, **Fight**. Resist a fourth.
- Support dark mode from the start via `prefers-color-scheme`. Tables are dim.
- Every destructive action is undoable rather than confirmed. Confirmation dialogs on a
  phone are worse than an undo toast.

## Testing

- Event handlers get unit tests — they're pure `(state, payload) => state`. This is where
  the bugs live, and they're cheap to cover.
- One integration test per socket flow: join, mutate, broadcast, reconnect-and-resume.
- Don't chase component-render coverage. It's not where the risk is.

## Things not to build

Dice roller. Character sheet import. SRD/monster database. Initiative order automation.
Maps or tokens. Chat. A DM mode. Accounts. Mobile native apps.

If the user asks for one of these, build it — but say plainly that it's outside the shape
the docs describe, so it's a deliberate choice rather than drift.

## Current state

See [docs/todo.md](docs/todo.md). **All seven phases are done.** Twenty-six event
handlers live in `server/events/`, and [docs/deploy.md](docs/deploy.md) covers running
it for real.

Two operational rules the code depends on:

- **The hub tears down in `preClose`, not `onClose`.** By `onClose` Fastify is already
  waiting for open connections to end, and an upgraded websocket never ends on its own,
  so a restart hangs for as long as anyone is connected. There is a test that opens
  sockets, never closes them, and asserts the app lets go in under two seconds.
- **Credentials never reach the logs.** The `Authorization` header is redacted and the
  `token` query parameter on the upgrade URL is scrubbed, both tested. Adding a new log
  line that includes a raw URL or header would undo that.

Both doors are rate limited: joins per room, and a sliding window of intents per
socket, counted before the handler is even looked up so a flood of junk still costs the
sender its budget. Offenders are refused, never disconnected.

`sessions.archived_at` closes a room the same way `enemies.archived_at` ends an
encounter — a timestamp, never a delete. A closed room keeps working for whoever is
already inside so reopening is one tap; it just refuses anyone new until it is reopened,
which a join has to ask for explicitly with `restore: true`.

**Undo is a handler capability, not a framework.** A mutation is reversible exactly
when its file exports `undo({ db, session, member, logged })`, which is why several
handlers log a `previous*` field they otherwise would not need — a clamped or absorbed
change cannot be inverted from its result alone. `history.undo` walks the sender's own
recent events, takes back the first reversible one it finds, and appends a record of
having done so. Undone hits are filtered out of the enemy history read model so the
tally still equals the sum of what is displayed.

Two rules worth keeping that the code now depends on:

- **No class progression tables.** `server/characters/presets.js` decides which tracks a
  class starts with; the numbers are all 0 for the player to type once. Hit dice are the
  exception because they equal the level. A slot table is the first step toward the SRD
  database the README rules out.
- **The hub re-reads `session` and `member` on every intent.** The rows cached at upgrade
  go stale the moment someone claims a character, and a stale claim would apply damage to
  whoever they used to be playing.

The riskiest untested code is the reconnect loop in `useSession()` — it needs a fake
WebSocket and timer control, and the composable's module-scoped state would have to
become resettable first.

Fastify's AJV is configured with `removeAdditional: false`, so an unknown field is a 400
rather than being silently stripped. Phase 2's intents depend on that being loud.

Note `.gitattributes` pins `eol=lf`. This machine has `core.autocrlf=true` globally, and
without the override `prettier --check` fails on every file.
