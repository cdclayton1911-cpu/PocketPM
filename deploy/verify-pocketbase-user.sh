#!/usr/bin/env bash
#
# Pocket PM — prove PocketBase runs as its own user and can really write.
#
#   sudo /opt/pocketpm-web/deploy/verify-pocketbase-user.sh
#
# "It started" is not proof. Tested on 0.40.1: a PocketBase that can read
# pb_data but not write it starts, answers /api/health, serves records and
# signs users in. The first save fails with a generic "Failed to create
# record." and NOTHING reaches journalctl. So this makes the RUNNING server
# write, twice, and reads a real record.
#
# Checks, each PASS or FAIL:
#   1. the service's main process runs as $EXPECT_USER, with automigrate off
#   2. nothing under pb_data is owned by anyone else
#   3. the server answers /api/health
#   4. the CLI, running as $EXPECT_USER, creates a temporary superuser
#      (a write to data.db by that user)
#   5. the running server signs it in and reads a real project record
#   6. the running server writes: updates that superuser, then deletes it
#
# The temporary superuser's password is random, never printed, never stored,
# and the account is removed on exit whatever happens. Exit 0 only if every
# check passes.

set -uo pipefail

PB_BIN="${PB_BIN:-/opt/pocketbase/pocketbase}"
PB_DATA="${PB_DATA:-/opt/pocketbase/pb_data}"
PB_MIGRATIONS="${PB_MIGRATIONS:-/opt/pocketbase/pb_migrations}"
PB_URL="${PB_URL:-http://127.0.0.1:8090}"
# Empty PB_SERVICE skips the service checks; empty EXPECT_USER runs as the
# current user. Both exist for the local test, not for production.
PB_SERVICE="${PB_SERVICE-pocketbase}"
EXPECT_USER="${EXPECT_USER-pocketbase}"

FAILS=0
pass() { printf '  PASS  %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; FAILS=$((FAILS + 1)); }

as_user() {
	if [[ -n "$EXPECT_USER" && "$(id -un)" != "$EXPECT_USER" ]]; then sudo -u "$EXPECT_USER" "$@"; else "$@"; fi
}

# Pull one value out of a JSON document on stdin by a dotted key path, such as
# "record.id"; empty when absent. The path is only split and walked as keys;
# nothing from it is ever run as code.
field() {
	python3 -c '
import json, sys
try:
    v = json.load(sys.stdin)
    for k in sys.argv[1].split("."):
        v = v[k]
    print("" if v is None else v)
except Exception:
    print("")' "$1"
}

cli() { as_user "$PB_BIN" "$@" --dir="$PB_DATA" --migrationsDir="$PB_MIGRATIONS" --automigrate=false; }

echo "PocketBase at $PB_URL, data in $PB_DATA"
echo

# ── 1. who is it running as ──────────────────────────────────────────────────
if [[ -n "$PB_SERVICE" ]]; then
	PID="$(systemctl show -p MainPID --value "$PB_SERVICE")"
	RUNS_AS=""
	[[ -n "$PID" && "$PID" != "0" ]] && RUNS_AS="$(ps -o user= -p "$PID" | tr -d ' ')"
	if [[ "$RUNS_AS" == "$EXPECT_USER" ]]; then pass "the running server's process belongs to $RUNS_AS"
	else fail "the running server's process belongs to '${RUNS_AS:-nothing running}', expected $EXPECT_USER"; fi

	if systemctl show -p ExecStart --value "$PB_SERVICE" | grep -q -- "--automigrate=false"; then pass "automigrate is off"
	else fail "the service does not start with --automigrate=false"; fi
fi

# ── 2. ownership ─────────────────────────────────────────────────────────────
if [[ -n "$EXPECT_USER" ]]; then
	STRAYS="$(find "$PB_DATA" ! -user "$EXPECT_USER" -print 2>/dev/null | head -5)"
	if [[ -z "$STRAYS" ]]; then pass "everything under pb_data is owned by $EXPECT_USER"
	else fail "owned by someone else (first 5): $(echo $STRAYS)"; fi
fi

# ── 3. health ────────────────────────────────────────────────────────────────
if [[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$PB_URL/api/health")" == "200" ]]; then pass "answers /api/health"
else fail "no answer at $PB_URL/api/health"; fi

# ── 4. a write by the user, through the CLI ──────────────────────────────────
EMAIL="verify-$(date +%s)-$$@verify.invalid"
SECRET="$(openssl rand -hex 20)"
CREATED=0
DELETED=0
cleanup() {
	if (( CREATED && ! DELETED )); then
		if cli superuser delete "$EMAIL" >/dev/null 2>&1; then
			echo "  (temporary superuser removed by cleanup)"
		else
			echo "  !! could not remove the temporary superuser $EMAIL. Delete it in the admin UI."
		fi
	fi
}
trap cleanup EXIT

if OUT="$(cli superuser upsert "$EMAIL" "$SECRET" 2>&1)"; then
	CREATED=1
	pass "created a temporary superuser as ${EXPECT_USER:-$(id -un)} (a write to data.db)"
else
	fail "could not create a temporary superuser as ${EXPECT_USER:-$(id -un)}: $(echo "$OUT" | tail -1)"
fi

# ── 5. the running server reads ──────────────────────────────────────────────
TOKEN=""
if (( CREATED )); then
	# The body goes through stdin, so the password is not on a command line.
	AUTH="$(printf '{"identity":"%s","password":"%s"}' "$EMAIL" "$SECRET" |
		curl -s --max-time 10 -H 'content-type: application/json' --data-binary @- \
			"$PB_URL/api/collections/_superusers/auth-with-password")"
	TOKEN="$(printf '%s' "$AUTH" | field token)"
	SUID="$(printf '%s' "$AUTH" | field record.id)"
	if [[ -n "$TOKEN" ]]; then pass "the running server signed the temporary superuser in"
	else fail "the running server did not sign it in: $(printf '%s' "$AUTH" | field message)"; fi
fi

if [[ -n "$TOKEN" ]]; then
	N="$(curl -s --max-time 10 -H "Authorization: $TOKEN" \
		"$PB_URL/api/collections/projects/records?perPage=1&fields=id" | field totalItems)"
	if [[ "$N" =~ ^[0-9]+$ ]] && (( N >= 1 )); then pass "the running server read a real record (project records: $N)"
	else fail "the running server returned no project records (got '${N}')"; fi

	# ── 6. the running server writes ─────────────────────────────────────────
	CODE="$(printf '{"emailVisibility":true}' | curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X PATCH \
		-H "Authorization: $TOKEN" -H 'content-type: application/json' --data-binary @- \
		"$PB_URL/api/collections/_superusers/records/$SUID")"
	if [[ "$CODE" == "200" ]]; then pass "the running server wrote to data.db (updated the temporary superuser)"
	else fail "the running server could not write: the update returned $CODE"; fi

	CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X DELETE -H "Authorization: $TOKEN" \
		"$PB_URL/api/collections/_superusers/records/$SUID")"
	if [[ "$CODE" == "204" ]]; then
		DELETED=1
		pass "the running server wrote again (deleted the temporary superuser)"
	else
		fail "the running server could not delete the temporary superuser: returned $CODE"
	fi
fi

echo
if (( FAILS )); then
	echo "$FAILS check(s) failed."
	echo "If health and the read passed but a write failed, this is the half-working state:"
	echo "pages and sign-ins work, and every save fails with \"Failed to create record.\""
	echo "The usual cause is a file in pb_data owned by someone other than ${EXPECT_USER:-the PocketBase user} (check 2)."
	echo "See deploy/ADMIN-ACCESS.md, section 1."
	exit 1
fi
echo "All checks passed."
