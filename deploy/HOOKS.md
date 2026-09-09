# Installing the PocketBase hooks

`deploy/deploy.sh` does **not** touch PocketBase. It pulls, builds, and restarts
`pocketpm-web` — the Next.js app. PocketBase is a separate service with a
separate data directory, and hooks are loaded by PocketBase at boot.

So this is its own procedure, run once per change to `pb_hooks/`.

## What the hooks do

`pb_hooks/main.pb.js` closes the status-forgery gap on `workflow_instances`: a
status or step change must be accompanied by a justifying `workflow_actions`
row, and a new workflow can only be created in its initial state. Read the file
header before changing it — in particular the note that handlers run in an
isolated VM and cannot see module scope.

## Where the directory goes

Confirmed on this droplet:

```
WorkingDirectory=/opt/pocketbase
ExecStart=/opt/pocketbase/pocketbase serve --http="127.0.0.1:8090"
```

No `--dir` and no `--hooksDir`, so PocketBase uses its defaults relative to the
working directory: data at `/opt/pocketbase/pb_data`, hooks at
**`/opt/pocketbase/pb_hooks`**. The service unit is `pocketbase`.

Re-check with the command below if the unit ever changes; the defaults move
with `--dir`.

```bash
systemctl cat pocketbase | grep -E 'ExecStart|WorkingDirectory'
```

## Install

Back up the data directory first — this restarts the database process.

```bash
tar czf ~/pb_pre_hooks_$(date +%F-%H%M).tar.gz /opt/pocketbase/pb_data
```

```bash
sudo mkdir -p /opt/pocketbase/pb_hooks && sudo cp -r /opt/pocketpm-web/pb_hooks/. /opt/pocketbase/pb_hooks/
```

```bash
sudo systemctl restart pocketbase && sleep 2 && systemctl is-active pocketbase
```

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://pb.pocketpm.fyi/api/health
```

**A syntax error in a hook file does not stop PocketBase from starting.** It
logs and carries on with the hook unregistered, so a healthy service is not
evidence the hook loaded. Verify with the script, not the health check:

```bash
npm run verify:hooks
```

That runs from the dev machine against production using `.env.local`, like
`verify:tenancy`. It reports an assertion count and fails loudly if the guard is
absent.

## Rollback

The hooks are additive — removing them restores exactly the previous behaviour,
which is the collection rules alone.

```bash
sudo rm -rf /opt/pocketbase/pb_hooks && sudo systemctl restart pocketbase
```

```bash
systemctl is-active pocketbase && curl -s -o /dev/null -w '%{http_code}\n' https://pb.pocketpm.fyi/api/health
```

After rollback `npm run verify:hooks` should FAIL — that is the expected result,
and it is how you know the rollback took effect rather than hoping it did.

Nothing in the app depends on the hooks being present: the workflow engine
satisfies them by construction, because it already writes the action row before
the state change. Rolling back reopens the gap; it does not break the app.

## What this does not cover

Request hooks intercept API requests. A migration's `app.save()` and direct
SQLite writes on the box bypass them, as measured in `docs/workflow-hooks.md`.
Both require shell access, which is a larger compromise than this control
addresses.
