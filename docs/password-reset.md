# Password reset

Request form at `/forgot-password`, confirmation at `/reset-password?token=…`,
handlers at `POST /api/auth/password-reset` and `.../confirm`.

**The code is complete and tested. It cannot send an email yet.** Three things
on the PocketBase instance have to change first, and none of them is a code
change. Until then a user gets "a reset link is on its way" and no link arrives.

## What is wrong on the instance

Checked against `pb.pocketpm.fyi` with the admin credentials in `.env.local`.

| Setting | Current | Needs to be |
|---|---|---|
| `smtp.enabled` | `false` | `true` |
| `smtp.host` | `smtp.example.com` (install default) | a real host |
| `smtp.username` | unset | a real account |
| `meta.senderAddress` | `support@example.com` (install default) | a deliverable address on a domain you control |
| `meta.appURL` | `http://localhost:8090` | `https://app.pocketpm.fyi` |
| `users.passwordResetTemplate` | unset | a template linking to `/reset-password` |

Three separate failures, each of which alone breaks the feature:

1. **SMTP is off.** With `enabled: false` PocketBase falls back to `sendmail` on
   the host. Nothing indicates that binary exists or is configured on the
   droplet.
2. **`appURL` is the install default.** Every emailed link is built from it, so
   even with working SMTP every link would point at `http://localhost:8090`.
3. **No reset template is set,** so PocketBase's built-in default applies. That
   default points at PocketBase's own admin UI, not at this app's
   `/reset-password` page — so the user would land on `pb.pocketpm.fyi` rather
   than in the app. (The template being unset is confirmed; the exact content of
   PocketBase's built-in default is not something this repo verified. Setting an
   explicit template makes it moot.)

## The failure is silent, and cannot be made loud from the app

`requestPasswordReset()` **resolves successfully with SMTP disabled** — verified
directly against the instance: it returned `true`, no error. So the handler's
`catch` never fires and the app has no way to know mail was not delivered.

That is a real violation of this project's "no silent failures" rule, and it is
not fixable in application code:

- The response deliberately cannot depend on whether the account exists, or the
  endpoint becomes an account-enumeration oracle. So it cannot report per-user
  delivery either.
- Detecting the misconfiguration at request time would mean reading PocketBase
  settings with **admin credentials from a public, unauthenticated route**. That
  trades a large security surface for a log line and was rejected.

The honest fix is to configure SMTP. Until then, treat this feature as present
but inert, and know that the reassuring message on screen is not evidence of
anything.

## Fixing it

Two of the three are not credentials, so a script handles them. It is a dry run
unless you pass `--apply`:

```bash
node scripts/apply-mail-settings.mjs
```

```bash
node scripts/apply-mail-settings.mjs --apply
```

That sets `meta.appURL` and installs a reset template pointing at
`{APP_URL}/reset-password?token={TOKEN}`. Override the base with
`APP_PUBLIC_URL` in `.env.local` if the app is served elsewhere.

**SMTP you do yourself,** in the PocketBase admin UI under Settings → Mail
settings. The script does not touch it: mail credentials do not belong in a
script in this repo. Set the host, port, username, password, and a
`senderAddress` on a domain you control, then use the admin UI's "Send test
email" before trusting it.

## What the handlers do

**Request** (`POST /api/auth/password-reset`)

- Byte-identical response for a known and an unknown address — verified. Matches
  the login and signup handlers, which are equally careful not to confirm
  whether an account exists.
- Rate limited, because this is an unauthenticated endpoint that sends mail to
  an address the caller picks: **3 per address per hour** and **10 per client IP
  per hour**, both must pass. Without it, the endpoint is a way to spam a third
  party and to burn an SMTP quota.
- The IP limit trusts `x-forwarded-for`, which is safe only because Caddy sets
  it and the app is bound to loopback. If the app is ever exposed without that
  proxy, the IP limit is worthless and the per-address limit is what remains.
- Same in-process-memory caveat as the AI limiter — see `docs/ai.md`.

**Confirm** (`POST /api/auth/password-reset/confirm`)

- Reports failure plainly ("that reset link is invalid or has expired"). A token
  is not an account identifier, so saying so reveals nothing — and a user
  holding a link they believe is good deserves better than silence.
- Clears this browser's session cookie on success: changing the password rotates
  the record's token key, so any existing session token is already dead.
- Reset tokens last 30 minutes (`users.passwordResetToken.duration`, 1800s).

## Verified

Against the running app, signed out:

- `/forgot-password` and `/reset-password` both reachable (added to
  `PUBLIC_PATHS` in `src/proxy.ts`); `/reset-password` is *not* in
  `AUTH_ONLY_PATHS`, so a signed-in user following a reset link is not bounced
  to the dashboard before they can use it
- known address and unknown address → identical 200 body
- malformed address → 400 with a field error
- 4th request for one address within the hour → 429 with `Retry-After: 3600`
- bogus token → 400, "invalid or has expired"
- mismatched passwords → 400 on `passwordConfirm`
- password under 8 characters → 400 on `password`
- missing `?token=` → the page says the link was truncated instead of rendering
  a form that could only fail

Not verified, because it cannot be until SMTP works: that an email arrives, that
its link resolves, and that a token from a real email is accepted.
