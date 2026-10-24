#!/usr/bin/env bash
# Executa migração + seed + testes de RLS num Postgres local descartável.
# Uso: supabase/tests/run.sh   (requer binários do PostgreSQL 14+)
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
TMP="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
cleanup() { "$PGBIN/pg_ctl" -D "$TMP/data" stop -m fast >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
RUNAS=()
if [ "$(id -u)" = 0 ]; then chown -R postgres "$TMP"; RUNAS=(runuser -u postgres --); fi
"${RUNAS[@]}" "$PGBIN/initdb" -D "$TMP/data" -A trust -U postgres >/dev/null
"${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" start -w >/dev/null || { cat "$TMP/log"; exit 1; }
PSQL=("${RUNAS[@]}" psql -h "$TMP" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$DIR/tests/supabase_stub.sql"
for f in "$DIR"/migrations/*.sql; do echo "migração: $(basename "$f")"; "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f "$DIR/seed.sql"
"${PSQL[@]}" -f "$DIR/tests/rls_test.sql"
