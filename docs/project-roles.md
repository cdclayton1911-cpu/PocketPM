# Project roles

**Built.** `project_roles`, `/team`, and `verify:tenancy` section 7.

## The split that makes this safe

`projects.members` says **who can see the project**. `project_roles` says **what
people are called and what they are responsible for**. They are deliberately not
the same table.

Two reasons:

1. **108 API rules across 22 collections** read
   `project.members.id ?= @request.auth.id`. That list is the mechanism this
   app's entire tenancy rests on, and `verify:tenancy` guards it. Moving
   membership into a join table would mean rewriting all 108 and re-proving
   every one.
2. **An external architect must be recordable without being admitted.** If a
   role row granted access, there would be no way to say "this is our architect"
   without handing them the project.

`verify:tenancy` section 7 proves the negative directly: A names B's account in
a role on A's project, and B still cannot see the project or its records.
Granting access stays a separate, deliberate act.

## A party is a user or a contact

`user` is null for outside parties, who are held as name, company, email, phone.
The API rule requires one or the other (`user != "" || contact_name != ""`), so
a row can never name nobody — a role that cannot be routed to is worse than no
role.

**Only outside parties are enterable in the UI today.** Linking an existing
account needs a user picker, and the only list available is `users.listRule`,
which still returns every user across every company — the known issue in
`docs/schema-notes.md`. Putting a cross-company directory in front of users to
build a picker would be trading a real leak for a convenience. The internal case
waits for that narrowing, which is small and now has a concrete reason to
happen.

## The external reviewer problem — OPEN, needs a decision

The architect is the party submittals route to, is not a PocketPM user, and will
not become one. Recording them is done. **How they act on a workflow step is
not.**

### The constraint that rules out half the options

**SMTP is still not configured** — `smtp.example.com`, and `meta.appURL` is
still `http://localhost:8090`. Anything that works by emailing the architect a
link cannot be delivered today, regardless of how well it is designed. See
`docs/password-reset.md`, which is blocked on the same thing.

### Option 1 — Contact record, internal user acts on their behalf

The architect exists as a role. When their stamped PDF comes back by email,
someone here records the disposition, attaches the file, and the step records
*who entered it, when, and on whose behalf*.

- **Cost:** none beyond what is built.
- **Honest:** ball-in-court is a statement about the real world, not the system.
- **Limit:** no audit trail from the reviewer themselves. The record says "P.
  Lewis recorded: Approved as Noted, per A. Vasquez, 12 March" — which is what a
  paper transmittal log has always said.
- **Works today.**

### Option 2 — Tokenised single-purpose link

Email a signed link opening one page: view the revision PDF, choose a
disposition, upload a markup. No account, no login.

- **Cost:** token issue/expiry/revocation, a public route that must be airtight,
  and file access for a non-user — the protected file handler currently requires
  a session, so it needs a token path that does not weaken it for everyone else.
- **Blocked:** cannot send the link. Needs SMTP first.
- **Related:** `invitations` already has `token`, `expires_at`, `role`, and was
  locked to project members with no token path precisely so acceptance would go
  through a POST handler. Same machinery, already reasoned about.

### Option 3 — Invited account

The architect signs up and joins `members` with role architect.

- **Cost:** low technically — auth and file protection already work.
- **Blocked:** `users.listRule` lets any authenticated user enumerate every user
  across every company. Admitting external parties makes that a cross-company
  directory handed to outsiders. Must be narrowed first.
- **Contradicts the premise:** they will not sign up.

### Option 4 — Option 1 now, option 2 when SMTP exists

Ship the on-behalf-of flow. The schema already supports attaching a `user`
later, so a reviewer who does get an account is an update, not a migration.

**Recommended.** It is the only one that works today, it is what the paper
process already does, and it does not spend the security budget of a public
token route on a feature nobody can yet receive an email about.

### What I would want decided

- **Option 1 or 4 to proceed now** — they are the same first step.
- If option 2 is wanted eventually: SMTP is the prerequisite, and it is the same
  prerequisite password reset has been waiting on.
- If option 3: `users.listRule` must be narrowed first, which also unblocks the
  user picker for internal roles.
