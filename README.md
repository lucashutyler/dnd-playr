# dnd-playr

A shared bookkeeper for D&D players. No pencil, no paper, no DM overhead.

Everyone at the table opens the same room on their phone. You track your own HP and
resources; the party tracks the enemies together. That's the whole app.

## Why this exists

Every combat tracker out there assumes the **DM** owns the monsters — stat blocks, HP,
initiative all live on the DM's side, and players get a read-only view at best. This
inverts that. The players do the bookkeeping, and the DM doesn't have to touch anything.

That inversion produces the one design decision the rest of the app hangs off:

> **Players don't know a monster's max HP.** So we don't track HP for enemies — we track
> a _damage tally_. "Ogre: 32 dealt." Counting up, not down. No max-HP field, ever.

This is simpler than what most trackers do, and it's why they fight you when you try to
use them this way.

## What it does

- **A room is a link.** One player makes a room and gets a URL. Share it, or hold up
  the QR code and let everyone point a camera at it. No accounts, no email, no signup.
  Claim a character or roll a new one.
- **Rooms are permanent.** Your campaign's room is still there next week. And next year.
- **Your strip.** HP (current / max / temp), death saves, conditions, and resource
  tracks — spell slots, hit dice, rage, ki, superiority dice, whatever your class has.
- **The table view.** Everyone's HP, conditions and remaining resources sit directly
  above the enemies, live, so you can read "can I survive another round" and "how close
  is it to dead" without switching screens.
- **The enemy ledger.** Anyone can add an enemy by whatever name the table is using
  ("big guy with the axe"), and anyone can log damage to it. Tap one to see the whole
  history — who hit it, for how much, in what order. Monsters that get healed count
  down again, because a tally that can only rise isn't a ledger.
- **Encounters archive, they don't vanish.** "New encounter" clears the board in one
  tap and keeps every hit on the record.
- **Realtime.** Websockets. Someone takes damage, everyone's screen updates.
- **Undo.** Every change is an event, so a fat-fingered tap on a phone is one tap back.

## What it deliberately doesn't do

No dice roller. No character sheet. No SRD monster database. No maps, no tokens, no
initiative automation, no chat, no DM screen. If you want those, use Roll20 or Avrae —
this is the thing you keep open _next to_ the game, not the thing you play the game in.

## Joining

Open the link — or paste it into the join box, or type just the bit on the end. Then
give the passphrase if the room has one, and either:

- **Claim a character already in the room** — yours, from last week's session or from
  your other device. Reopening the tab in a month, or switching from phone to tablet, is
  just claiming your character again. Nothing to restore, nobody to ask.
- **Or start a new one** — pick a name and a class, and your resource tracks get seeded
  for you.

Your device keeps an opaque token in `localStorage` that remembers the claim, so next
time you land straight back on your character.

## Security

The boundary is the **room**, not the row:

- A room lives at `/room/k7m3qp`. That id is generated, and long enough that nobody
  finds your room by guessing. The internal database id is never on the wire.
- A room can also claim a **custom link** like `/room/c/samsroom` — but only once it has
  a passphrase. A name somebody picked is the first thing anyone would try, so the
  pretty link is convenience and the passphrase is the actual door. Both links work, and
  whichever one you arrived on is the one you stay on.
- A room can have an optional **passphrase**. Set it if you're playing somewhere public.
- A room can be **locked** once everyone's in, so nobody else can join at all.
- **Inside a room, everyone is equal.** Anyone can claim any character, add enemies, and
  edit anything. There's no host, no permissions, nothing to administer — it's your
  table, and the people at it are people you trust. Every action is undoable, which is
  what actually handles the honest mistakes.

Codes come from an unambiguous alphabet (no `I`/`1`, no `O`/`0`) so people can read them
out loud across a table.

If you ever do want a locked-down room, opt-in host controls sit in
[docs/todo.md](docs/todo.md) — backlogged on purpose rather than built by default.

## A social note worth reading before you use this

A precise shared damage ledger slowly leaks monster HP. After a few rounds the table can
do the math: "we've dealt 47 and it's still up." Most tables don't care. Some DMs hate
it. It's cheap to ask yours before you build habits around it.

If it's a problem, the intended fix is a room setting that shows tallies rounded or
banded ("~50") rather than exact — see [docs/todo.md](docs/todo.md).

## Quick start

```bash
npm install
npm run dev
```

Backend on `:3000`, frontend on `:5173` with the API proxied. Open the frontend, make a
room, and open the code on your phone on the same network.

```bash
npm run build && npm start
```

Builds the frontend and serves it from the Node process on `:3000` as a single deployable.
See [docs/deploy.md](docs/deploy.md) for putting it behind a reverse proxy — the websocket
upgrade headers are the one thing that reliably goes wrong.

Data lives in one SQLite file (`data/dnd-playr.db` by default).

```bash
npm run backup
```

That takes a coherent snapshot of a live database. Don't just copy the file while the
server is running: WAL mode keeps recent writes in a sidecar, and a plain copy can miss
them.

## Stack

Chosen for "one person can hold all of this in their head":

| Piece    | Choice                         | Why                                                              |
| -------- | ------------------------------ | ---------------------------------------------------------------- |
| Backend  | Node + Fastify                 | Small, fast, good websocket story                                |
| Realtime | `ws`                           | Raw websockets. No Socket.IO, no rooms abstraction we don't need |
| Storage  | SQLite (`better-sqlite3`)      | One file. Synchronous. Zero ops. Lasts forever                   |
| Frontend | Vue 3 + Vite, `<script setup>` | Reactivity is the whole app                                      |
| State    | One composable, no Pinia       | Server is authoritative; the client is a view of it              |
| Styling  | Plain CSS + custom properties  | Mobile-first, hand-tuned, no framework                           |

Notably absent: Tailwind, a component library, an ORM, Redux-anything, Docker. If one of
those earns its way in later, fine — but it has to earn it.

## Layout

```
server/          Fastify app, websocket hub, SQLite access
  db/            schema.sql, migrations, queries
  events/        the mutation handlers (one per event type)
client/          Vue app
  components/    character strip, enemy row, resource track, ...
  composables/   useSession() — the socket + reactive state
  styles/        design tokens, base
docs/            todo.md and friends
data/            SQLite file (gitignored)
```

## License

MIT. See [LICENSE](LICENSE).
