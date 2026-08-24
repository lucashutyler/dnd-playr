# Running it for real

One Node process, one SQLite file. There is no cluster, no queue, no cache, and
nothing to orchestrate — a table of six phones is not a workload.

## Requirements

- Node 22 or newer (the server uses `--env-file-if-exists`)
- A writable directory for the database
- A reverse proxy, if you want TLS — which you do, because tokens travel over it

## Build and run

```bash
npm ci
npm run build     # bundles the client into server/public
NODE_ENV=production npm start
```

`npm start` serves the API, the built client, and the websocket from a single
process on `:3000`. There is no separate frontend to host.

### Settings

Every value has a working default, so `.env` is optional. See `.env.example`.

| Variable    | Default             | Notes                                          |
| ----------- | ------------------- | ---------------------------------------------- |
| `PORT`      | `3000`              |                                                |
| `HOST`      | `0.0.0.0`           | Bind to `127.0.0.1` if a proxy is in front     |
| `DB_PATH`   | `data/dnd-playr.db` | Created on first run, along with its directory |
| `LOG_LEVEL` | `info`              | `debug` also logs every applied intent         |

## Behind a reverse proxy

The one thing that actually goes wrong here is the websocket upgrade. A proxy
that does not forward `Upgrade` and `Connection` will serve the page perfectly
and then leave every client reconnecting forever, which looks like an app bug
and is not one.

### Caddy

Caddy handles upgrades on its own and gets you TLS without asking:

```
dnd.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name dnd.example.com;

    # ssl_certificate / ssl_certificate_key as usual

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # The two lines the whole thing hinges on.
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Longer than the 30s heartbeat, or the proxy will cut idle sockets
        # that the server considers perfectly healthy.
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

The server runs with `trustProxy` on, so `X-Forwarded-For` is what the join rate
limiter sees. If you do not set that header, every client looks like the proxy.

### Checking it worked

```bash
curl -s https://dnd.example.com/api/health
```

Then open the app and look at the dot on the Share button: green is a live
socket. If the page loads but the dot never goes green, it is the two `proxy_set_header`
lines above, essentially every time.

## Backups

The database is one file, but **do not just copy it while the server is running.**
WAL mode means recent writes live in a sidecar `-wal` file, and a plain `cp` can
take a copy that is missing them.

```bash
npm run backup                          # data/backups/dnd-playr-<timestamp>.db
npm run backup -- /mnt/backups/tue.db   # or wherever
```

That uses SQLite's own backup API, which takes a coherent snapshot of a live
database without stopping anything. Restoring is the reverse: stop the server,
put the file at `DB_PATH`, start it again.

A nightly cron is plenty:

```
17 4 * * *  cd /srv/dnd-playr && npm run backup
```

If the server is stopped, copying `dnd-playr.db`, `-wal` and `-shm` together is
also fine. It is only the half-copy that bites.

## Migrations

They run automatically at startup, in filename order, each in its own
transaction. Deploying is: pull, `npm ci`, `npm run build`, restart. There is no
migration command to remember and no step that can be skipped.

Roll back by restoring a backup. The migrations are forward-only on purpose —
a down-migration nobody has ever run is not a safety net.

## Logs

Structured JSON on stdout, from pino. Pipe it wherever you keep logs.

Two things are deliberately never in there: the `Authorization` header, and the
`token` query parameter on the websocket upgrade. Both are bearer credentials,
and a log line containing one hands over somebody's seat. There is a test for it.

At `LOG_LEVEL=debug` every applied intent is logged with its type, room link id and
member id — useful when a table reports something odd, and still free of anything
sensitive.

## What this does not need

No Redis, no session store, no load balancer, no container. Sticky sessions are
not a consideration because there is one process. If you ever genuinely outgrow
that, the thing to reach for first is a bigger machine.
