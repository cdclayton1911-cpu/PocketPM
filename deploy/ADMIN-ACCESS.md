# PocketBase: its own user, and admin access only through a tunnel

Decided 2026-09-12. Run the steps in order; each has a check and a rollback.
The order keeps a way back in at every point: the tunnel is proven before the
allowlist, and the allowlist is proven before Caddy stops serving the admin
surface publicly.

Everything below runs on the droplet unless it says "on your Mac".

## 0. Deploy, then look

```bash
sudo /opt/pocketpm-web/deploy/deploy.sh
```

This run is still carried out by the *old* `deploy.sh`: bash keeps reading the
file it started with, even after the fetch replaces it. So the new schema step
and the `/api/version` check first run on the *next* deploy. Then:

```bash
sudo PLAN_ONLY=1 /opt/pocketpm-web/deploy/pb-migrate.sh
```

Expect `0.40.1 (matches pin)` and `none — schema unchanged`. `pb_migrations/`
in the repo is empty, and the ~40 auto-written files already on the server are
recorded as applied, so nothing is pending.

## 1. Run PocketBase as `pocketbase`

Back up, create the user, hand it the directories PocketBase writes, and
install the drop-in (`deploy/pocketbase.service.d/override.conf`: user, group,
`--automigrate=false`, hardening):

```bash
sudo tar czf /root/pb_data_pre_user_$(date +%F-%H%M).tar.gz -C /opt/pocketbase pb_data
sudo useradd --system --no-create-home --home-dir /opt/pocketbase --shell /usr/sbin/nologin pocketbase
sudo systemctl stop pocketbase
sudo chown -R pocketbase:pocketbase /opt/pocketbase/pb_data /opt/pocketbase/pb_migrations
sudo chmod -R a+rX /opt/pocketbase/pb_hooks
sudo mkdir -p /etc/systemd/system/pocketbase.service.d
sudo cp /opt/pocketpm-web/deploy/pocketbase.service.d/override.conf /etc/systemd/system/pocketbase.service.d/
sudo systemctl daemon-reload && sudo systemctl start pocketbase
```

What stays root-owned, and why:

- **The binary:** PocketBase must not be able to replace itself.
- **`pb_hooks/`:** PocketBase must not be able to rewrite its own guards.
- **`/opt/pocketbase/backups/`:** only deploy writes there.

### Prove it

```bash
sudo /opt/pocketpm-web/deploy/verify-pocketbase-user.sh
```

It checks, in order:

1. The process belongs to `pocketbase` and automigrate is off.
2. Nothing under `pb_data` is owned by anyone else.
3. The server answers `/api/health`.
4. The CLI, running as `pocketbase`, creates a temporary superuser.
5. The running server signs that account in and reads a real project.
6. The running server writes twice: it updates the temporary account, then
   deletes it.

Exit 0 only if every check passes. The temporary account's password is random
and never shown, and the account is removed even if a check fails.

### What "half-worked" looks like

Tested on 0.40.1 with the database file, and separately a stray lock file
(`data.db-shm`), made unwritable. PocketBase:

- starts, and `systemctl status` says active (running)
- answers `/api/health`
- serves every page and existing record
- lets users sign in

**Every save fails** with a generic `Failed to create record.` (HTTP 400).
**Nothing appears in `journalctl`.** In the app, pages look normal and each save
shows an error. Only a write reveals it, which is why the verification script
makes the running server write.

The script reports that state as a failure at check 4, and check 2 names the
stray file. The usual cause is something run as root inside `pb_data`, such as
a `sqlite3` read that left a root-owned `data.db-shm`. Fix it with the server
stopped, then re-run the check:

```bash
sudo systemctl stop pocketbase
sudo chown -R pocketbase:pocketbase /opt/pocketbase/pb_data
sudo systemctl start pocketbase
sudo /opt/pocketpm-web/deploy/verify-pocketbase-user.sh
```

Never delete a `data.db-wal` file to fix this: it can hold committed writes.
Change its owner instead.

### Roll back step 1

```bash
sudo rm /etc/systemd/system/pocketbase.service.d/override.conf
sudo systemctl daemon-reload && sudo systemctl restart pocketbase
```

Root can read the `pocketbase`-owned files, so nothing else needs undoing.

## 2. The tunnel (on your Mac)

```bash
ssh -N -L 8090:127.0.0.1:8090 <you>@<droplet>
```

Leave it running and open `http://localhost:8090/_/` to sign in. Then tell me,
and I'll check that the scripts work through it:

```bash
PB_URL=http://127.0.0.1:8090 npm run verify:schema
```

From here on, the tunnel is the admin route.

## 3. The superuser allowlist (run through the tunnel)

```bash
PB_URL=http://127.0.0.1:8090 node scripts/apply-admin-lockdown.mjs
PB_URL=http://127.0.0.1:8090 node scripts/apply-admin-lockdown.mjs --apply
```

This sets `trustedProxy.headers = ["X-Real-Client-IP"]` and
`superuserIPs = ["127.0.0.1"]`. The script:

- refuses unless `PB_URL` is the tunnel
- afterwards, proves the tunnel still has superuser access and that a
  public-looking address is refused
- rolls itself back if either check fails

Until step 4, requests through Caddy still reach PocketBase as 127.0.0.1, so
this step locks nobody out.

**Roll back:** run the same command with `--rollback`.

## 4. Caddy stops serving the admin surface (on the droplet)

```bash
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.$(date +%Y%m%d-%H%M%S)
diff /etc/caddy/Caddyfile /opt/pocketpm-web/deploy/Caddyfile
```

The diff should show only two changes: the `pb.pocketpm.fyi` block (the
superuser block and the header) and the removed `api.pocketpm.fyi` block. If it
shows anything else, the server's copy has drifted from the repo; stop and send
me the diff. Otherwise:

```bash
sudo cp /opt/pocketpm-web/deploy/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && sudo systemctl reload caddy
```

Then I run the following. `verify:admin` probes every spelling PocketBase
accepts and must pass all of them.

```bash
npm run verify:admin
PB_URL=http://127.0.0.1:8090 npm run verify:hooks
PB_URL=http://127.0.0.1:8090 npm run verify:tenancy
PB_URL=http://127.0.0.1:8090 npm run verify:routes
```

**Roll back:** copy the `.bak` back and `systemctl reload caddy`.

### Why the block covers so many spellings

Tested on 0.40.1, PocketBase reaches the superuser endpoints through:

- `_superusers` in any letter case
- `%5Fsuperusers`, the underscore percent-encoded
- the collection id, `pbc_3142635823`

The admin UI also answers at `/_`, `/_/` and `/%5F/`. The Caddy matcher is a
case-insensitive pattern on the decoded path that covers all of them.

The server-side hooks are not affected: they fire for every spelling, including
through `/api/batch`, because they bind to the collection PocketBase resolves.
Caddy is the only place anything is blocked by name.

## 5. The old Express API

```bash
systemctl is-enabled pocketpm-proxy; systemctl is-active pocketpm-proxy
```

Expect `disabled` and `inactive`. If not, run
`sudo systemctl disable --now pocketpm-proxy`. After step 4, Caddy serves
nothing for `api.pocketpm.fyi`. Delete its DNS record in Cloudflare so the name
stops resolving.

## 6. The old 0.22.4 binary

Check that nothing refers to it:

```bash
systemctl cat pocketbase | grep -n "0\.22"; grep -rsn "0\.22\.4\|pocketbase\.0\.22" /etc/systemd /etc/cron* /etc/caddy /opt/pocketpm-web/deploy
```

No output means nothing references it. (The repo was checked too; nothing there
does.) Then delete it:

```bash
sudo rm /opt/pocketbase/pocketbase.0.22.4.bak /opt/pocketbase/pocketbase_0.22.4_linux_amd64.zip
```

## Locked out

If the allowlist ever refuses you and the tunnel cannot help, one edit to the
stopped database clears the allowlist. This was tested on 0.40.1: a full lockout
(token and sign-in both refused) was restored by this edit and a restart.

```bash
sudo systemctl stop pocketbase
sudo -u pocketbase sqlite3 /opt/pocketbase/pb_data/data.db "update _params set value = json_set(value, '\$.superuserIPs', json('[]')) where id = 'settings';"
sudo systemctl start pocketbase
```

Run it as `pocketbase`, not root, or the half-working state above follows. This
works because the settings are stored unencrypted: the unit sets no
`--encryptionEnv`.
