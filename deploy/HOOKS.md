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

PocketBase looks for `pb_hooks` **beside its data directory** by default, or
wherever `--hooksDir` points. Find out which is in use before copying anything:

```bash
systemctl cat pocketbase | grep -E 'ExecStart|WorkingDirectory'
```

Read the `--dir` value. If the unit passes `--hooksDir` explicitly, use that
path. Otherwise the default is the sibling of `--dir`: for `--dir=/opt/pb/pb_data`,
hooks live at `/opt/pb/pb_hooks`.

## Install

Replace `<PB_ROOT>` with the directory containing `pb_data`, and
`<PB_SERVICE>` with the unit name from the command above.

```bash
sudo cp -r /opt/pocketpm-web/pb_hooks/. <PB_ROOT>/pb_hooks/
```

Then restart PocketBase and confirm it came back:

```bash
sudo systemctl restart <PB_SERVICE> && sleep 2 && systemctl is-active <PB_SERVICE>
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
sudo rm -rf <PB_ROOT>/pb_hooks && sudo systemctl restart <PB_SERVICE>
```

```bash
systemctl is-active <PB_SERVICE> && curl -s -o /dev/null -w '%{http_code}\n' https://pb.pocketpm.fyi/api/health
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
