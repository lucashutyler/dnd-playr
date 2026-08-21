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

- `sessions` — id, code, name, `passphrase_hash` (nullable), `locked`, timestamps
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

**Enemies have no `hp_max` and no `hp_current`.** They have `damage_total`, which only
goes up. If you find yourself wanting a max, re-read the README — you've reinvented a DM
tool. Damage attribution lives in `events`, not in a column on `enemies`.

## Security model

- Never trust the client for identity. `token` → `token_hash` lookup → member. Always.
- Store `token_hash` and `passphrase_hash`, never the plaintext. Argon2id or bcrypt.
- Tokens are 32 random bytes, base64url. They are bearer credentials — treat them like it.
- **Authorization stops at the room door.** Once a member is authenticated into a room,
  every intent against that room is permitted. Do not write per-row ownership checks —
  no "is this your character", no "did you add this enemy". There is deliberately no host
  role; don't reintroduce one outside the opt-in design in the backlog.
- Rate-limit join attempts per code. A 4-letter code is brute-forceable; the passphrase
  and the lock flag are the real defenses, and the rate limit makes enumeration boring.
- Room codes are generated from `ABCDEFGHJKLMNPQRSTUVWXYZ` (no I, O) and checked for
  collisions against live rooms.
- No PII anywhere. Display names only. Don't add email, don't add OAuth.

## Frontend conventions

- Vue 3, `<script setup>`, Composition API. No Options API.
- One composable owns the connection and state: `useSession()`. Components read from it
  and call intent functions on it. No prop-drilling of session state, no Pinia.
- Styling is plain CSS in SFC `<style scoped>` blocks, using tokens from
  `client/styles/tokens.css`. No utility classes, no CSS-in-JS, no component library.
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

See [docs/todo.md](docs/todo.md). **Phase 0 is done**: the scaffold builds, runs, lints,
and tests. `/api/health` is the only route. There is no database, no websocket server, and
no session logic yet — Phase 1 starts those.

Note `.gitattributes` pins `eol=lf`. This machine has `core.autocrlf=true` globally, and
without the override `prettier --check` fails on every file.
