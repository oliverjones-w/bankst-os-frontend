# bankst-os-frontend

Authoritative frontend and core API runtime for bankst-os. Static frontend at `:3000`, core FastAPI at `:8765`, PostgreSQL backend.

## Source of Truth

Obsidian vault (on Dell at `C:\obsidian-vault`) is the canonical source of truth for all intelligence objects. Postgres and SQLite files are derived layers — do not treat them as authoritative.

## Local Repo Rules

- The `core` PM2 process (port 8765) runs `api.py` from this directory — it is the backend, not just a frontend repo.
- Always use `127.0.0.1:5432` for Postgres. Never `localhost` — Tailscale creates a routing conflict on this machine.
- Schema changes must go through Alembic in `services/bankst-os/` only. Never `ALTER TABLE` directly.

## Cross-Repo Context

Cross-repo or platform task → read `~/workspace/platform-docs/agent/ENTRY.md`.
