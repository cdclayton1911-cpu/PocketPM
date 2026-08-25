#!/usr/bin/env bash
#
# Pocket PM — production deploy.
#
#   sudo /opt/pocketpm-web/deploy/deploy.sh
#
# Idempotent: safe to re-run. Pulls main, installs, builds, restarts, then
# verifies the service actually answers before reporting success.
#
# The build runs BEFORE the service is restarted, and a failed build exits
# without restarting — a broken commit leaves the previous version serving.
#
# Note on downtime: `npm ci` and `next build` modify node_modules/ and .next/
# in place while the old process is still running, so expect a few seconds of
# instability during a deploy. That is acceptable at this scale; for true
# zero-downtime you would build into a fresh directory and flip a symlink.

set -Eeuo pipefail

APP_DIR="/opt/pocketpm-web"
SERVICE="pocketpm-web"
HEALTH_URL="http://127.0.0.1:3001/"
RUN_AS="pocketpm"
BRANCH="main"

HEALTH_RETRIES=30
HEALTH_DELAY=2

# ── output helpers ───────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
	RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BOLD=$'\033[1m'; OFF=$'\033[0m'
else
	RED=""; GREEN=""; YELLOW=""; BOLD=""; OFF=""
fi
step() { printf '\n%s==>%s %s\n' "$BOLD" "$OFF" "$1"; }
ok()   { printf '%s  ✓%s %s\n' "$GREEN" "$OFF" "$1"; }
warn() { printf '%s  !%s %s\n' "$YELLOW" "$OFF" "$1"; }
die()  { printf '\n%s  ✗ FAILED:%s %s\n\n' "$RED" "$OFF" "$1" >&2; exit 1; }

trap 'die "line $LINENO: \`$BASH_COMMAND\`"' ERR

# ── preflight ────────────────────────────────────────────────────────────────
step "Preflight"

[[ $EUID -eq 0 ]] || die "must run as root (needs systemctl). Try: sudo $0"
[[ -d $APP_DIR ]] || die "$APP_DIR does not exist. Run first-time setup first — see deploy/SETUP.md"
id -u "$RUN_AS" >/dev/null 2>&1 || die "user '$RUN_AS' does not exist. See deploy/SETUP.md"
command -v node >/dev/null || die "node is not installed. See deploy/SETUP.md"
command -v npm  >/dev/null || die "npm is not installed. See deploy/SETUP.md"

cd "$APP_DIR"

ok "node $(node -v), npm $(npm -v)"

# Refuse to clobber uncommitted edits made directly on the server. Override
# deliberately with FORCE=1 if you know the local changes are disposable.
if ! sudo -u "$RUN_AS" git diff --quiet || ! sudo -u "$RUN_AS" git diff --cached --quiet; then
	if [[ "${FORCE:-0}" == "1" ]]; then
		warn "working tree is dirty — discarding local changes (FORCE=1)"
	else
		die "working tree at $APP_DIR has uncommitted changes.
     Commit or discard them, or re-run with FORCE=1 to overwrite:
       sudo FORCE=1 $0"
	fi
fi

# Warn if disk is tight — npm ci plus a Next build needs real headroom.
AVAIL_MB=$(df -Pm "$APP_DIR" | awk 'NR==2 {print $4}')
if (( AVAIL_MB < 2048 )); then
	warn "only ${AVAIL_MB}MB free on $APP_DIR — a build may fail. Consider: npm cache clean --force"
else
	ok "${AVAIL_MB}MB free"
fi

PREV_SHA=$(sudo -u "$RUN_AS" git rev-parse HEAD)
ok "current commit ${PREV_SHA:0:8}"

# ── fetch ────────────────────────────────────────────────────────────────────
step "Fetching origin/$BRANCH"

sudo -u "$RUN_AS" git fetch --prune origin "$BRANCH"
sudo -u "$RUN_AS" git reset --hard "origin/$BRANCH"

NEW_SHA=$(sudo -u "$RUN_AS" git rev-parse HEAD)
if [[ "$PREV_SHA" == "$NEW_SHA" ]]; then
	ok "already at ${NEW_SHA:0:8} — rebuilding anyway to stay idempotent"
else
	ok "${PREV_SHA:0:8} -> ${NEW_SHA:0:8}"
	sudo -u "$RUN_AS" git --no-pager log --oneline "$PREV_SHA..$NEW_SHA" | sed 's/^/     /'
fi

# ── install ──────────────────────────────────────────────────────────────────
step "Installing dependencies (npm ci)"

# `npm ci` is deliberate: it installs exactly package-lock.json and fails if the
# lockfile is out of sync, which is what you want on a server.
sudo -u "$RUN_AS" npm ci --no-audit --no-fund

ok "dependencies installed"

# ── build ────────────────────────────────────────────────────────────────────
step "Building"

# Nothing below this point runs if the build fails: the ERR trap exits, and the
# service is never restarted, so the previous version keeps serving.
if ! sudo -u "$RUN_AS" npm run build; then
	die "build failed — service NOT restarted, previous version still serving.
     Fix the build and re-run. Nothing on the server was changed."
fi

ok "build succeeded"

# ── restart ──────────────────────────────────────────────────────────────────
step "Restarting $SERVICE"

systemctl restart "$SERVICE"
ok "restart issued"

# ── health check ─────────────────────────────────────────────────────────────
step "Health check"

for (( i = 1; i <= HEALTH_RETRIES; i++ )); do
	if curl -fsS -o /dev/null --max-time 5 "$HEALTH_URL" 2>/dev/null; then
		ok "$HEALTH_URL responding (after ${i} attempt(s))"
		printf '\n%s  ✓ Deployed %s%s\n\n' "$GREEN" "${NEW_SHA:0:8}" "$OFF"
		exit 0
	fi

	if ! systemctl is-active --quiet "$SERVICE"; then
		printf '\n%s  Service died. Last 40 log lines:%s\n' "$RED" "$OFF" >&2
		journalctl -u "$SERVICE" -n 40 --no-pager >&2
		die "$SERVICE is not running after restart."
	fi

	sleep "$HEALTH_DELAY"
done

printf '\n%s  Timed out. Last 40 log lines:%s\n' "$RED" "$OFF" >&2
journalctl -u "$SERVICE" -n 40 --no-pager >&2
die "$HEALTH_URL did not respond within $(( HEALTH_RETRIES * HEALTH_DELAY ))s.
     The service may be running but unhealthy. To roll back:
       cd $APP_DIR
       sudo -u $RUN_AS git reset --hard $PREV_SHA
       sudo $0"
