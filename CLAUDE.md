# bankst-os-frontend
**Cross-repo or platform task?** Stop here and read `AGENTS.md` instead.

Authoritative frontend runtime for `bankst-os`. Serves `bankst.co` via Cloudflare Tunnel.

## What This Repo Owns

- Static frontend at `:3000`
- Core FastAPI (`core`) at `:8765` — firms, funds, returns, mandates
- PostgreSQL backend

## Key Paths

| Path | Purpose |
|---|---|
| `apps/bankst-os-frontend/` | Static files |
| `apps/hf_returns_app/models.py` | Canonical DB models |
| `services/bankst-os/` | Alembic migrations (0001→0009) |

## Running

```bash
# frontend
python3 -m http.server 3000

# core API
source .venv/bin/activate
uvicorn main:app --host 127.0.0.1 --port 8765
```

Both managed by PM2 in production — `pm2 restart frontend` / `pm2 restart core`.

## Database

- PostgreSQL at `127.0.0.1:5432`, db `bankst_os`
- Use `127.0.0.1` not `localhost` (Tailscale conflict)
- Creds in `~/.zshrc` as `PGUSER` / `PGPASSWORD`

## Common Failure Modes

- DB connection refused → check `127.0.0.1` not `localhost`; check PM2 `core` is running
- Static files not serving → `pm2 restart frontend`; confirm port 3000 is not blocked
- Stale mapping data → check `LAST_SNAPSHOT.md` for DB freshness; may need Dell sync

## Cross-Repo Context

For cross-repo, architectural, or ambiguous tasks only:
- GitHub: https://github.com/oliverjones-w/platform-docs
- Local (Mac): `~/workspace/platform-docs`
- Start at: `agent/ENTRY.md`
