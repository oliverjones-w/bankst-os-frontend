"""
Seed script for BankSt OS
- Populates job_function from functions.json
- Populates firm + firm_alias from firm_aliases.json

Run with SSH tunnel already open on localhost:5432, or set OPEN_TUNNEL=1
to have the script open it automatically.
"""

import json, os, subprocess, time, signal, sys
import psycopg2
from psycopg2.extras import execute_values

DB_URL = "postgresql://oliverjones:mac337@localhost:5432/bankst_os"
SSH_USER = "oliverjones"
SSH_HOST = "100.82.94.80"
SSH_PASSWORD = "420FundingSecured!"

# ── helpers ──────────────────────────────────────────────────────────────────

def normalize(text):
    return text.lower().strip()

def open_tunnel():
    """Open SSH tunnel using sshpass for password auth."""
    cmd = [
        "sshpass", "-p", SSH_PASSWORD,
        "ssh", "-o", "StrictHostKeyChecking=no",
        "-L", "5432:localhost:5432",
        f"{SSH_USER}@{SSH_HOST}", "-N"
    ]
    proc = subprocess.Popen(cmd)
    time.sleep(3)
    return proc

# ── seed functions ────────────────────────────────────────────────────────────

def seed_job_functions(cur):
    with open("functions.json") as f:
        rows = json.load(f)

    data = [
        (r["Function"], r["Risk Taker"], int(r["Order"]), True)
        for r in rows
        if r["Function"] != "--"
    ]

    execute_values(cur, """
        INSERT INTO job_function (name, risk_taker, hierarchy, active)
        VALUES %s
        ON CONFLICT (name) DO NOTHING
    """, data)

    print(f"  job_function: {cur.rowcount} rows inserted ({len(data)} attempted)")


def seed_firms(cur):
    with open("firm_aliases.json") as f:
        firms = json.load(f)

    # Insert firms
    firm_data = [(f["canonical"], f["id"]) for f in firms]
    execute_values(cur, """
        INSERT INTO firm (name, firm_key)
        VALUES %s
        ON CONFLICT DO NOTHING
        RETURNING firm_id, firm_key
    """, firm_data)

    # Build firm_key → firm_id map
    cur.execute("SELECT firm_id, firm_key FROM firm WHERE firm_key = ANY(%s)",
                ([f["id"] for f in firms],))
    key_to_id = {row[1]: row[0] for row in cur.fetchall()}

    print(f"  firm: {len(key_to_id)} rows present")

    # Build alias rows
    alias_rows = []
    for f in firms:
        firm_id = key_to_id.get(f["id"])
        if not firm_id:
            continue

        def add(texts, alias_type):
            for t in texts:
                t = t.strip()
                if not t or t == "--":
                    continue
                alias_rows.append((firm_id, t, normalize(t), alias_type, True))

        add(f.get("aliases", []), "alias")
        add(f.get("platforms", []), "platform")
        add(f.get("blacklist", []), "blacklist")
        add(f.get("affiliates", []), "alias")  # treat affiliates as aliases

    execute_values(cur, """
        INSERT INTO firm_alias (firm_id, alias_text, alias_normalized, alias_type, active)
        VALUES %s
        ON CONFLICT DO NOTHING
    """, alias_rows)

    print(f"  firm_alias: {cur.rowcount} rows inserted ({len(alias_rows)} attempted)")


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    tunnel = None
    if "--tunnel" in sys.argv:
        print("Opening SSH tunnel...")
        tunnel = open_tunnel()

    try:
        conn = psycopg2.connect(DB_URL)
        conn.autocommit = False
        cur = conn.cursor()

        print("Seeding job_function...")
        seed_job_functions(cur)

        print("Seeding firm + firm_alias...")
        seed_firms(cur)

        conn.commit()
        print("\nDone.")

    except Exception as e:
        if 'conn' in dir():
            conn.rollback()
        print(f"Error: {e}")
        raise

    finally:
        if tunnel:
            tunnel.terminate()

if __name__ == "__main__":
    main()
