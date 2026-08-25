# Production setup — DigitalOcean droplet

First-time setup for serving the Next.js app at `app.pocketpm.fyi`, alongside
the PocketBase and Express services already on the box.

Run every command as `root` (or with `sudo`) on the droplet.

**What changes:** `app.pocketpm.fyi` stops serving static files from
`/var/www/pocketpm` and starts reverse-proxying to a Next.js process on
`127.0.0.1:3001`.

**What does not change:** PocketBase (`127.0.0.1:8090`) and the Express API
(`127.0.0.1:3000`) are untouched. The old prototype stays on disk at
`/var/www/pocketpm` as a rollback target.

---

## ⚠ Read before you start

**1. `deploy/Caddyfile` is an exact copy of your live `/etc/caddy/Caddyfile`,
with one change.** The `pb` and `api` blocks are byte-for-byte identical. The
only edit is inside the `app.pocketpm.fyi` block:

```diff
  app.pocketpm.fyi {
-     root * /var/www/pocketpm
-     file_server
+     reverse_proxy 127.0.0.1:3001
      encode gzip
  }
```

`encode gzip` is kept as-is. No `header_up` directives were added — Caddy's
`reverse_proxy` already sets `X-Forwarded-For`, `X-Forwarded-Proto`, and
`X-Forwarded-Host` by default.

Still diff before installing, in case the live file has changed since:

```bash
diff /etc/caddy/Caddyfile /opt/pocketpm-web/deploy/Caddyfile
```

**2. Node version.** These steps install **Node 20 LTS**. This box also runs
PocketBase and the Express API, and a *Current* release is the wrong risk
profile for it. Next.js 16 requires Node 20.9 or newer, so 20 LTS is supported.

The app is developed locally against Node 26. That difference is tolerable
because `package-lock.json` pins every dependency and the build is verified on
the droplet before the service restarts — but it does mean **the production
build must be verified on the droplet, not assumed from a local build**. Step 6
does exactly that.

**3. Changing the system Node affects every service on this box.** PocketBase is
a Go binary and is unaffected, but the Express API runs on the same system Node.
After any Node change, verify it explicitly — see step 2.

---

## 1. Preflight — disk and memory

```bash
df -h /
free -h
```

**Disk.** `npm ci` plus a Next.js build needs real headroom — roughly 400 MB for
`node_modules`, 200 MB for `.next`, plus a growing npm cache. With ~9 GB free you
are fine, but keep at least **2 GB free** at all times; the deploy script warns
below that threshold. If it gets tight:

```bash
npm cache clean --force
journalctl --vacuum-time=7d
apt-get autoremove --purge
```

**Memory.** A Next.js build is memory-hungry and is the most likely thing to be
OOM-killed on a small droplet. If `free -h` shows under 2 GB of RAM and no swap,
add swap before building:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

---

## 2. Install Node 20 LTS

**First, record what is already installed.** You need this to roll back, and to
know whether you are changing anything for the Express API:

```bash
node -v 2>/dev/null || echo "no system node"
which node npm
systemctl list-units --type=service | grep -iE 'express|api|pocketpm'
```

If a Node is already present and the Express API depends on it, read the
verification step at the bottom of this section **before** upgrading.

Install:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
```

Verify — the major version must be 20, and at least 20.9 for Next.js 16:

```bash
node -v    # expect v20.x.x, minimum v20.9.0
npm -v
```

### Verify the Express API still runs

The Express API shares this system Node. Changing it can break that service, so
check before moving on — this is the step where a Node change would show up:

```bash
systemctl status <express-service-name> --no-pager
curl -s https://api.pocketpm.fyi/health      # expect {"status":"ok",...}
journalctl -u <express-service-name> -n 30 --no-pager
```

If the API is broken by the change, roll Node back to the version you recorded
above:

```bash
apt-cache madison nodejs | head            # list available versions
apt-get install -y nodejs=<previous-version>
systemctl restart <express-service-name>
curl -s https://api.pocketpm.fyi/health
```

If the two services genuinely need different Node versions, run one under `nvm`
as its own service user, or containerise it. Don't discover that in production.

> PocketBase is a Go binary with no Node dependency and is unaffected by
> anything in this section.

---

## 3. Create the service user

The app runs unprivileged. `--system` creates an account that cannot log in.

```bash
useradd --system --create-home --home-dir /opt/pocketpm-web --shell /usr/sbin/nologin pocketpm
```

---

## 4. Clone the repository

```bash
git clone https://github.com/cdclayton1911-cpu/PocketPM.git /opt/pocketpm-web
chown -R pocketpm:pocketpm /opt/pocketpm-web
```

If `/opt/pocketpm-web` already exists from step 3, clone into it:

```bash
git clone https://github.com/cdclayton1911-cpu/PocketPM.git /tmp/ppm && \
  mv /tmp/ppm/* /tmp/ppm/.[!.]* /opt/pocketpm-web/ && rmdir /tmp/ppm && \
  chown -R pocketpm:pocketpm /opt/pocketpm-web
```

**If the repo is private,** HTTPS cloning will prompt for credentials, which
will not work unattended. Generate a deploy key instead:

```bash
sudo -u pocketpm ssh-keygen -t ed25519 -N "" -f /opt/pocketpm-web/.ssh/id_ed25519
cat /opt/pocketpm-web/.ssh/id_ed25519.pub
```

Add that public key to the repo under **Settings → Deploy keys** (read-only is
sufficient), then clone with the SSH URL
`git@github.com:cdclayton1911-cpu/PocketPM.git`.

---

## 5. Create the environment file

```bash
cp /opt/pocketpm-web/.env.example /etc/pocketpm-web.env
chown root:root /etc/pocketpm-web.env
chmod 600 /etc/pocketpm-web.env
nano /etc/pocketpm-web.env
```

Review the values. Everything in it is a public URL — **no secrets belong in
this file**, and the Anthropic key in particular must stay in the Express
service's own environment.

Delete any commented explanation blocks you don't want; systemd parses this as
literal `KEY=value` lines, so avoid quotes and trailing comments on value lines.

---

## 6. First build

Build once by hand, before involving systemd, so any failure is easy to read:

```bash
cd /opt/pocketpm-web
sudo -u pocketpm npm ci
sudo -u pocketpm npm run build
```

Then confirm the app starts and binds to loopback:

```bash
sudo -u pocketpm npm start -- --hostname 127.0.0.1 --port 3001 &
sleep 5
curl -I http://127.0.0.1:3001/     # expect HTTP/1.1 200 OK
kill %1
```

Do not continue until that returns 200.

---

## 7. Install the systemd unit

```bash
cp /opt/pocketpm-web/deploy/pocketpm-web.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now pocketpm-web
```

Verify:

```bash
systemctl status pocketpm-web --no-pager
curl -I http://127.0.0.1:3001/
```

If it fails to start:

```bash
journalctl -u pocketpm-web -n 50 --no-pager
```

Confirm it is bound to loopback only — it must **not** be listening on `0.0.0.0`:

```bash
ss -tlnp | grep 3001
```

---

## 8. Swap the Caddyfile

**Back up first. This is your rollback path — do not skip it.**

```bash
cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.$(date +%Y%m%d-%H%M%S)
ls -la /etc/caddy/Caddyfile.bak.*
```

Now diff the new file against the current one and confirm the **only**
differences are inside the `app.pocketpm.fyi` block:

```bash
diff /etc/caddy/Caddyfile /opt/pocketpm-web/deploy/Caddyfile
```

Expected output — three lines, all within the app block:

```
2,3c2,4
<     root * /var/www/pocketpm
<     file_server
---
>     # Was: root * /var/www/pocketpm + file_server (the single-file prototype).
>     # The prototype remains on disk at /var/www/pocketpm as the rollback target.
>     reverse_proxy 127.0.0.1:3001
```

If anything in the `pb` or `api` blocks differs, **stop.** The live file is
always authoritative — the copy in this repo was taken at a point in time and
may be stale. Edit `/opt/pocketpm-web/deploy/Caddyfile` to match your live one
before continuing.

Once the diff is limited to the app block:

```bash
cp /opt/pocketpm-web/deploy/Caddyfile /etc/caddy/Caddyfile
```

---

## 9. Validate and reload Caddy

Validate **before** reloading — a syntax error takes down all three sites:

```bash
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

Only if that passes:

```bash
systemctl reload caddy
systemctl status caddy --no-pager
```

---

## 10. Verify all three sites

```bash
curl -I https://app.pocketpm.fyi     # Next.js app — expect 200
curl -s  https://api.pocketpm.fyi/health   # expect {"status":"ok",...}
curl -I  https://pb.pocketpm.fyi/api/health # PocketBase — expect 200
```

Confirm the app is genuinely the new build, not a cached copy of the prototype —
the old one's title was `PocketPM v8`:

```bash
curl -s https://app.pocketpm.fyi | grep -i "<title>"
```

> If you use Cloudflare in front of these domains (the live responses show
> `server: cloudflare`), purge the cache after switching, or you may keep seeing
> the old static prototype for a while.

---

## Routine deploys

After first-time setup, deploying is one command:

```bash
sudo /opt/pocketpm-web/deploy/deploy.sh
```

It pulls `main`, runs `npm ci` and `npm run build`, restarts the service, and
health-checks `127.0.0.1:3001` before exiting. **A failed build exits without
restarting**, so a broken commit leaves the previous version serving.

Expect a few seconds of instability during a deploy — the build writes into
`node_modules/` and `.next/` while the old process is still running.

---

## Rollback

### Roll back the app to a previous commit

```bash
cd /opt/pocketpm-web
sudo -u pocketpm git log --oneline -10
sudo -u pocketpm git reset --hard <good-sha>
sudo -u pocketpm npm ci && sudo -u pocketpm npm run build
systemctl restart pocketpm-web
curl -I http://127.0.0.1:3001/
```

### Roll all the way back to the old static prototype

The prototype is still at `/var/www/pocketpm` — nothing in this process deletes
it. Restore the Caddyfile backup from step 8:

```bash
ls -la /etc/caddy/Caddyfile.bak.*
cp /etc/caddy/Caddyfile.bak.<timestamp> /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy
```

Optionally stop the Next.js service so it isn't running unused:

```bash
systemctl disable --now pocketpm-web
```

`app.pocketpm.fyi` is now serving `/var/www/pocketpm` again. PocketBase and the
Express API are unaffected throughout — no rollback step touches them.

---

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Caddy returns 502 | `systemctl status pocketpm-web`; confirm it's on port 3001 with `ss -tlnp \| grep 3001` |
| Service won't start | `journalctl -u pocketpm-web -n 50 --no-pager` |
| Build killed with no error | OOM — see the swap step in section 1; check `dmesg \| tail` |
| Build fails on disk | `df -h /`, then `npm cache clean --force` |
| Env var not picked up | systemd reads `/etc/pocketpm-web.env` at start only: `systemctl restart pocketpm-web` |
| Old prototype still showing | Cloudflare cache — purge it |
| `npm ci` fails on lockfile | `package-lock.json` is out of sync with `package.json`; fix and commit locally, don't edit on the server |
