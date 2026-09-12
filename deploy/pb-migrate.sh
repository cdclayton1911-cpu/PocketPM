#!/usr/bin/env bash
#
# Pocket PM — apply PocketBase schema migrations during deploy.
#
# Called by deploy.sh after the build succeeds and before the web app restarts,
# so new code and the schema it needs land seconds apart instead of in whatever
# order someone ran scripts in. Runs as root, drives the `pocketbase` binary
# directly against its data directory: NO superuser credential is stored
# anywhere, and the web app gains no new permission.
#
# Also runnable on its own to look first:
#
#   sudo PLAN_ONLY=1 /opt/pocketpm-web/deploy/pb-migrate.sh
#
# ## What it does, in order
#
#   1. Refuse unless the installed PocketBase is the version pinned in
#      deploy/POCKETBASE_VERSION. The rollback behaviour below was tested on
#      that version; a different one has to be re-tested before it is trusted.
#   2. Work out which repo migrations (pb_migrations/*.js) are not yet in
#      PocketBase's own _migrations table. None: done, PocketBase untouched.
#   3. Refuse any pending migration not marked `// compat: additive` in its
#      first lines, unless ALLOW_BREAKING=1. Additive means the currently
#      running code works against the new schema. Anything else needs the
#      two-deploy treatment, and that is a decision, not a default.
#   4. Stop PocketBase. Copy data.db and auxiliary.db to BACKUP_DIR.
#   5. RESTORE TEST: copy the backup into a scratch directory, start a
#      throwaway PocketBase on it, and require the same collections and the
#      same row count per collection as the live database. A backup that has
#      never been restored is a check that can only report clean.
#   6. `pocketbase migrate up`. PocketBase runs the whole pending batch in ONE
#      transaction: on failure nothing from the batch is applied, and earlier
#      migrations are untouched (tested on 0.40.1). Its _migrations table is
#      the record of what applied; it is printed before and after.
#   7. On failure: remove the pending files from PocketBase's migrations
#      directory (otherwise `serve` would retry them at boot), restart
#      PocketBase on the unchanged schema, and exit non-zero so deploy stops
#      WITHOUT restarting the web app. Old code, old schema, still consistent.
#
# ## Scope of the backup
#
# data.db and auxiliary.db only: what a migration can change. Uploaded files
# (pb_data/storage) are not copied — migrations never touch them. This is a
# schema-change safety net, not disaster recovery.
#
# ## Downtime
#
# PocketBase is stopped for steps 4–6, typically a few seconds. See
# docs/STATUS.md: revisit before customers depend on uptime.

set -Euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PB_BIN="${PB_BIN:-/opt/pocketbase/pocketbase}"
PB_DATA="${PB_DATA:-/opt/pocketbase/pb_data}"
PB_MIGRATIONS="${PB_MIGRATIONS:-/opt/pocketbase/pb_migrations}"
# Empty PB_SERVICE: do not manage a service (local rehearsal).
PB_SERVICE="${PB_SERVICE-pocketbase}"
# The user PocketBase runs as. "auto" reads it from the service unit, so this
# follows the unit rather than needing to be kept in step with it. Every
# PocketBase and sqlite3 command below runs as this user: a sqlite3 read made
# as root while PocketBase is stopped can leave root-owned -shm/-wal files in
# pb_data, which PocketBase, running as its own user, then cannot open.
PB_USER="${PB_USER-auto}"
PB_HEALTH="${PB_HEALTH:-http://127.0.0.1:8090/api/health}"
REPO_MIGRATIONS="${REPO_MIGRATIONS:-$HERE/../pb_migrations}"
BACKUP_DIR="${BACKUP_DIR:-/opt/pocketbase/backups}"
BACKUP_KEEP="${BACKUP_KEEP:-5}"
EXPECTED_VERSION_FILE="${EXPECTED_VERSION_FILE:-$HERE/POCKETBASE_VERSION}"
RESTORE_PORT="${RESTORE_PORT:-8199}"
ALLOW_BREAKING="${ALLOW_BREAKING:-0}"
PLAN_ONLY="${PLAN_ONLY:-0}"
LABEL="${LABEL:-manual}"
# Self-test only: delete one row from the RESTORED copy, to prove the restore
# comparison can fail. Never set in deploy.
RESTORE_SELFTEST_CORRUPT="${RESTORE_SELFTEST_CORRUPT:-0}"

if [[ -t 1 ]]; then
	RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BOLD=$'\033[1m'; OFF=$'\033[0m'
else
	RED=""; GREEN=""; YELLOW=""; BOLD=""; OFF=""
fi
step() { printf '\n%s==>%s %s\n' "$BOLD" "$OFF" "$1"; }
ok()   { printf '%s  ✓%s %s\n' "$GREEN" "$OFF" "$1"; }
warn() { printf '%s  !%s %s\n' "$YELLOW" "$OFF" "$1"; }
fail() { printf '\n%s  ✗ SCHEMA:%s %s\n\n' "$RED" "$OFF" "$1" >&2; exit 1; }

if [[ "$PB_USER" == "auto" ]]; then
	PB_USER=""
	if [[ -n "$PB_SERVICE" ]] && command -v systemctl >/dev/null; then
		PB_USER="$(systemctl show -p User --value "$PB_SERVICE" 2>/dev/null || true)"
	fi
	[[ "$PB_USER" == "root" ]] && PB_USER=""
fi

as_pb() { if [[ -n "$PB_USER" ]]; then sudo -u "$PB_USER" "$@"; else "$@"; fi; }

DB="$PB_DATA/data.db"

# sqlite3, loudly. Never -readonly: a read-only open of a WAL database fails
# once PocketBase has shut down cleanly (no -shm file), and an empty result
# there would make EVERY migration look pending — including applied ones.
q() {
	local out
	if ! out="$(as_pb sqlite3 "$@" 2>&1)"; then
		printf '%s  ✗ sqlite3 failed on %s: %s%s\n' "$RED" "$1" "$out" "$OFF" >&2
		return 1
	fi
	[[ -n "$out" ]] && printf '%s\n' "$out"
	return 0
}

history() {
	# `applied` is when; `file` is what. PocketBase's own record, not ours.
	q "$DB" "select '     ' || file from _migrations order by applied desc limit ${1:-8};"
}

pb_stop() {
	[[ -z "$PB_SERVICE" ]] && return 0
	systemctl stop "$PB_SERVICE"
	ok "stopped $PB_SERVICE"
}

pb_start() {
	[[ -z "$PB_SERVICE" ]] && return 0
	systemctl start "$PB_SERVICE"
	for (( i = 1; i <= 20; i++ )); do
		if curl -fsS -o /dev/null --max-time 3 "$PB_HEALTH" 2>/dev/null; then
			ok "$PB_SERVICE healthy"
			return 0
		fi
		sleep 1
	done
	fail "$PB_SERVICE did not become healthy at $PB_HEALTH. Check: journalctl -u $PB_SERVICE -n 50"
}

# name|count per non-view collection, sorted. The restore test compares these.
inventory() {
	local db="$1" name
	local names count
	names="$(q "$db" "select name from _collections where type != 'view' order by name;")" || return 1
	[[ -n "$names" ]] || { echo "no collections in $db" >&2; return 1; }
	while IFS= read -r name; do
		count="$(q "$db" "select count(*) from \"$name\";")" || return 1
		printf '%s|%s\n' "$name" "$count"
	done <<<"$names"
}

# ── 1. version ───────────────────────────────────────────────────────────────
step "PocketBase version"
command -v sqlite3 >/dev/null || fail "sqlite3 is not installed (apt install sqlite3)."
[[ -x "$PB_BIN" ]] || fail "no PocketBase binary at $PB_BIN"
[[ -f "$DB" ]] || fail "no database at $DB"

EXPECTED="$(tr -d '[:space:]' < "$EXPECTED_VERSION_FILE")"
ACTUAL="$("$PB_BIN" --version | awk '{print $NF}')"
if [[ "$ACTUAL" != "$EXPECTED" ]]; then
	fail "installed PocketBase is $ACTUAL; deploy/POCKETBASE_VERSION pins $EXPECTED.
     Migration rollback was tested on $EXPECTED. Re-test on $ACTUAL, then update the pin."
fi
ok "$ACTUAL (matches pin)"

# ── 2. pending ───────────────────────────────────────────────────────────────
step "Pending migrations"
APPLIED="$(q "$DB" "select file from _migrations;")" || fail "could not read _migrations from $DB — refusing to guess what is pending."
[[ -n "$APPLIED" ]] || fail "_migrations in $DB is empty; a real PocketBase always has its own entries. Refusing to guess."
PENDING=()
if [[ -d "$REPO_MIGRATIONS" ]]; then
	for f in "$REPO_MIGRATIONS"/*.js; do
		[[ -e "$f" ]] || continue
		grep -qxF "$(basename "$f")" <<<"$APPLIED" || PENDING+=("$f")
	done
fi

if (( ${#PENDING[@]} == 0 )); then
	ok "none — schema unchanged, PocketBase not touched"
	exit 0
fi

# ── 3. compatibility guard ───────────────────────────────────────────────────
BREAKING=0
for f in "${PENDING[@]}"; do
	if head -n 5 "$f" | grep -qx '// compat: additive'; then
		printf '     %s  (additive)\n' "$(basename "$f")"
	else
		printf '%s     %s  (NOT marked additive)%s\n' "$YELLOW" "$(basename "$f")" "$OFF"
		BREAKING=1
	fi
done

if (( BREAKING )) && [[ "$ALLOW_BREAKING" != "1" ]]; then
	fail "a pending migration is not marked '// compat: additive', so the code running now
     may not work against the new schema. Either make it additive, or ship it
     deliberately with the two-deploy treatment and re-run with ALLOW_BREAKING=1."
fi
(( BREAKING )) && warn "ALLOW_BREAKING=1 — proceeding with a non-additive migration"

echo "     applied so far (newest first):"
history

if [[ "$PLAN_ONLY" == "1" ]]; then
	printf '\n  PLAN_ONLY=1 — nothing stopped, copied, or applied.\n'
	printf '  To see what these migrations change, run locally: npm run schema:plan\n\n'
	exit 0
fi

# ── 4. stop + backup ─────────────────────────────────────────────────────────
step "Backup"
pb_stop
# From here, any failure must bring PocketBase back up before exiting.
SCRATCH=""
trap 'printf "%s  ✗ unexpected failure at line %s — restarting PocketBase on the unchanged schema%s\n" "$RED" "$LINENO" "$OFF" >&2; [[ -n "$SCRATCH" ]] && rm -rf "$SCRATCH"; pb_start; exit 1' ERR

STAMP="$(date -u +%Y%m%dT%H%M%SZ)-$LABEL"
BACKUP="$BACKUP_DIR/$STAMP"
mkdir -p "$BACKUP"
for f in data.db auxiliary.db; do
	if [[ -f "$PB_DATA/$f" ]]; then cp -p "$PB_DATA/$f" "$BACKUP/"; fi
done
[[ -f "$BACKUP/data.db" ]] || { pb_start; fail "backup has no data.db. Nothing applied."; }
ok "copied to $BACKUP ($(du -sh "$BACKUP" | awk '{print $1}'))"

# ── 5. restore test ──────────────────────────────────────────────────────────
step "Restore test"
SCRATCH="$(mktemp -d)"
cp -p "$BACKUP"/* "$SCRATCH/"
mkdir -p "$SCRATCH/_no_migrations" "$SCRATCH/_no_hooks"
if [[ -n "$PB_USER" ]]; then chown -R "$PB_USER" "$SCRATCH"; fi

if [[ "$RESTORE_SELFTEST_CORRUPT" == "1" ]]; then
	warn "SELF-TEST: deleting one row from the restored copy; this check must now fail"
	as_pb sqlite3 "$SCRATCH/data.db" "delete from _superusers where rowid = (select min(rowid) from _superusers);"
fi

# Compared BEFORE any PocketBase opens the copy. PocketBase repairs some things
# at boot (it creates an installer superuser when none exist), so a comparison
# made afterwards checks the repaired copy, not the backup, and passes a
# backup that has lost rows. Rehearsal caught exactly that.
LIVE_INV="$(inventory "$DB")" || { rm -rf "$SCRATCH"; pb_start; fail "could not inventory the live database. Nothing applied."; }
RESTORED_INV="$(inventory "$SCRATCH/data.db")" || { rm -rf "$SCRATCH"; pb_start; fail "could not inventory the restored copy. Nothing applied."; }
if [[ "$LIVE_INV" != "$RESTORED_INV" ]]; then
	# diff exits 1 when they differ, which is the expected case here; do not let
	# that trip the ERR trap before the specific message below.
	{ diff <(echo "$LIVE_INV") <(echo "$RESTORED_INV") || true; } | sed 's/^/     /' >&2
	rm -rf "$SCRATCH"; pb_start
	fail "the restored backup does not match the live database (above: < live, > restored).
     Nothing applied; PocketBase restarted on the unchanged schema."
fi

# Then a real PocketBase must open the restored files and answer.
RESTORE_URL="http://127.0.0.1:$RESTORE_PORT/api/health"

# Something already answering on the restore port would make the health check
# below pass against the WRONG instance. Refuse rather than test nothing.
if curl -fsS -o /dev/null --max-time 2 "$RESTORE_URL" 2>/dev/null; then
	rm -rf "$SCRATCH"; pb_start
	fail "port $RESTORE_PORT is already answering, so a restore test there would prove nothing.
     Stop whatever is on it (lsof -iTCP:$RESTORE_PORT) or set RESTORE_PORT. Nothing applied."
fi

# Started directly, never through a shell function: backgrounding a function
# makes \$! the SUBSHELL, and killing that leaves PocketBase running.
SERVE=("$PB_BIN" serve --dir="$SCRATCH" --migrationsDir="$SCRATCH/_no_migrations"
	--hooksDir="$SCRATCH/_no_hooks" --automigrate=false --http="127.0.0.1:$RESTORE_PORT")
if [[ -n "$PB_USER" ]]; then
	# sudo relays SIGTERM to the child it runs.
	sudo -u "$PB_USER" "${SERVE[@]}" >"$SCRATCH/serve.log" 2>&1 &
else
	"${SERVE[@]}" >"$SCRATCH/serve.log" 2>&1 &
fi
RESTORE_PID=$!
HEALTHY=0
for (( i = 1; i <= 20; i++ )); do
	# Healthy only while OUR process is alive. If it died (say, it lost a race
	# for the port), whatever answers is someone else, and that is not a pass.
	if curl -fsS -o /dev/null --max-time 2 "$RESTORE_URL" 2>/dev/null && kill -0 "$RESTORE_PID" 2>/dev/null; then
		HEALTHY=1; break
	fi
	kill -0 "$RESTORE_PID" 2>/dev/null || break
	sleep 0.5
done
# The process may already have exited; that is not an error here.
kill "$RESTORE_PID" 2>/dev/null || true
wait "$RESTORE_PID" 2>/dev/null || true

# And confirm it is really gone, so the next run's precheck is meaningful.
for (( i = 1; i <= 20; i++ )); do
	curl -fsS -o /dev/null --max-time 1 "$RESTORE_URL" 2>/dev/null || break
	sleep 0.5
done
if curl -fsS -o /dev/null --max-time 1 "$RESTORE_URL" 2>/dev/null; then
	rm -rf "$SCRATCH"; pb_start
	fail "something is still answering on port $RESTORE_PORT after the restore instance stopped. Nothing applied."
fi

if (( ! HEALTHY )); then
	cat "$SCRATCH/serve.log" >&2
	rm -rf "$SCRATCH"; pb_start
	fail "a PocketBase started on the restored backup never became healthy. Nothing applied."
fi
rm -rf "$SCRATCH"
ok "restored backup matches live ($(wc -l <<<"$LIVE_INV" | tr -d ' ') collections, row counts identical) and a throwaway PocketBase served it"

# ── 6. apply ─────────────────────────────────────────────────────────────────
step "Applying ${#PENDING[@]} migration(s)"
mkdir -p "$PB_MIGRATIONS"
COPIED=()
for f in "${PENDING[@]}"; do
	cp "$f" "$PB_MIGRATIONS/"
	COPIED+=("$PB_MIGRATIONS/$(basename "$f")")
done
if [[ -n "$PB_USER" ]]; then chown "$PB_USER" "${COPIED[@]}"; fi

trap - ERR
if ! as_pb "$PB_BIN" migrate up --dir="$PB_DATA" --migrationsDir="$PB_MIGRATIONS"; then
	# ── 7. failure: leave a consistent old state ──
	rm -f "${COPIED[@]}"
	echo "     _migrations after the failed batch (unchanged — the batch rolled back):" >&2
	history >&2
	pb_start
	fail "migrate up failed; the whole batch rolled back. Its files were removed from
     $PB_MIGRATIONS so PocketBase will not retry them at boot. PocketBase is
     running on the unchanged schema; the web app was NOT restarted.
     Backup: $BACKUP"
fi

echo "     applied (newest first):"
history
NOW_APPLIED="$(q "$DB" "select file from _migrations;")" || { pb_start; fail "migrate up reported success but _migrations could not be read back."; }
for f in "${PENDING[@]}"; do
	grep -qxF "$(basename "$f")" <<<"$NOW_APPLIED" ||
		{ pb_start; fail "$(basename "$f") reported success but is not in _migrations."; }
done
ok "all ${#PENDING[@]} recorded in _migrations"

pb_start

# Keep the newest BACKUP_KEEP backups. Names sort by UTC timestamp.
ls -1d "$BACKUP_DIR"/*/ 2>/dev/null | sort -r | tail -n "+$(( BACKUP_KEEP + 1 ))" |
	while IFS= read -r old; do rm -rf "$old"; done
exit 0
