# Local on-premises deployment

The on-premises package runs the production client, local APIs, and Yjs
WebSockets in an egress-isolated application container and exposes them through
a small TCP gateway on one loopback-only browser origin. Its
initial supported feature set is **projects, outlines, Tables, and bound
Grids**. It does not use Firebase, Google login, Cloud Functions or Storage,
Firebase emulators, a tunnel, or a development server at runtime.

Attachments, sharing, administration, API keys, project deletion, schedule
execution, the public demo, OAuth, MCP, and cloud/local migration or
synchronization are not supported in this initial local package.

## Configure and start

Docker Compose v2 is required. Choose a private password, an absolute host
directory for all persistent data, and optionally a host port (the default is
`7070`). Do not put the password in the image or in a `VITE_` build variable.

```bash
mkdir -p "$HOME/.local/share/outliner"
export OUTLINER_LOCAL_PASSWORD='replace-with-a-long-password'
export OUTLINER_DATA_DIR="$HOME/.local/share/outliner"
export OUTLINER_ONPREM_PORT=7070
docker compose -f compose.onprem.yml build
docker compose -f compose.onprem.yml up -d
```

Open `http://127.0.0.1:7070`. Compose refuses to resolve the configuration if
the password or data directory is missing. The application also refuses to
become ready when its SQLite storage is corrupt or unwritable. Only the chosen
host loopback port on the gateway is published; the application container is
reachable only over Compose's internal runtime network, with no separately
published backend or tunnel port. Images and dependencies must be obtained
during `build`; normal startup performs no package or required-asset download.

## Inspect, stop, and restart

```bash
docker compose -f compose.onprem.yml ps
docker compose -f compose.onprem.yml logs --tail=100 app
curl --fail "http://127.0.0.1:${OUTLINER_ONPREM_PORT:-7070}/health"
docker compose -f compose.onprem.yml restart app
docker compose -f compose.onprem.yml stop
docker compose -f compose.onprem.yml start
```

A normal `stop`, `down`, or restart gives connected documents time to flush.
The complete directory named by `OUTLINER_DATA_DIR` is mounted at `/data` and
contains both project metadata and all project/Table Yjs state. Never delete
that directory when recreating the container:

```bash
docker compose -f compose.onprem.yml down
docker compose -f compose.onprem.yml up -d --force-recreate
```

To replace the password, set a new nonempty `OUTLINER_LOCAL_PASSWORD` in the
operator environment and recreate the service. Existing sessions are
invalidated, while stored projects remain owned by the stable `local-user`.

```bash
export OUTLINER_LOCAL_PASSWORD='a-new-long-password'
docker compose -f compose.onprem.yml up -d --force-recreate
```

## Stopped backup and restore

Stop the deployment before copying data. A live copy of only
`projects.sqlite` is not a complete or necessarily consistent backup: the
whole directory also contains document storage. Forced termination cannot
recover edits that had not yet committed to that storage.

```bash
docker compose -f compose.onprem.yml down
cp -a "$OUTLINER_DATA_DIR" "${OUTLINER_DATA_DIR}.backup"
```

To validate a restore with the same application version, copy that complete
backup into a new empty directory, point Compose at it, and start again. A new
password login may be required, but project, page, item, Table, Grid, and Grid
source identities are retained.

```bash
restore_dir="$HOME/.local/share/outliner-restored"
rm -rf "$restore_dir"
cp -a "${OUTLINER_DATA_DIR}.backup" "$restore_dir"
export OUTLINER_DATA_DIR="$restore_dir"
docker compose -f compose.onprem.yml up -d
```

If startup or `/health` fails, inspect `docker compose ... logs app`; do not
replace the retained directory with an empty one. Restore the original usable
mount after diagnosing a permissions or corruption failure.

The existing `docker-compose.yml`, Firebase deployment commands, cloud image,
and cloud data paths are separate and unchanged. `compose.onprem.yml` uses its
own project/service/image names and never changes cloud identities or ACLs.
