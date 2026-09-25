"""Apply supabase/migrations/*.sql to any PostgreSQL database, in order.

    python -m scripts.migrate               # uses DATABASE_URL
    python -m scripts.migrate --local-shim  # plain Postgres (not Supabase)

With a Supabase project you can instead use the Supabase CLI
(`supabase db push`) or paste the files into the SQL editor. This script
records applied files in `public.nomi_migrations` so re-running it is safe.
"""

import sys
from pathlib import Path

import psycopg

from app.core.config import get_settings

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "supabase" / "migrations"
# Stand-ins for Supabase's `auth` schema, for plain PostgreSQL only.
SHIM_PATH = Path(__file__).resolve().parent / "sql" / "supabase_shim.sql"


def apply_migrations(url: str, local_shim: bool = False) -> list[str]:
    applied_now = []
    with psycopg.connect(url) as conn:
        if local_shim:
            conn.execute(SHIM_PATH.read_text())
        conn.execute(
            "create table if not exists public.nomi_migrations ("
            " name text primary key, applied_at timestamptz not null default now())"
        )
        # Supabase exposes public tables through its API; RLS with no policies
        # makes this bookkeeping table invisible there.
        conn.execute("alter table public.nomi_migrations enable row level security")
        done = {row[0] for row in conn.execute("select name from public.nomi_migrations")}
        for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
            if path.name in done:
                continue
            conn.execute(path.read_text())
            conn.execute("insert into public.nomi_migrations (name) values (%s)", (path.name,))
            applied_now.append(path.name)
    return applied_now


def main() -> int:
    url = get_settings().database_url
    if not url:
        print("Set DATABASE_URL first (see backend/.env.example).")
        return 1
    applied = apply_migrations(url, local_shim="--local-shim" in sys.argv)
    print("\n".join(f"applied {name}" for name in applied) or "Already up to date.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
