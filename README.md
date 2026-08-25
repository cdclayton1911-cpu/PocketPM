# Pocket PM

Commercial construction management platform. *Bid Bigger. Build Smarter. Win More.*

A production rebuild of the single-file prototype at `prototype/pocket_pm_v9.html`
(27 modules, vanilla JS, no build step) as a modular Next.js application.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router), TypeScript strict |
| Styling | Tailwind CSS v4 |
| Primitives | shadcn/ui (Radix base) |
| Server state | TanStack Query |
| Validation | Zod |
| Data + auth SDK | PocketBase JS SDK |
| Tests | Vitest (+ Testing Library), Playwright |

### Version note — Next.js 16 / Tailwind v4

The original project brief pinned **Next.js 15**. That pin was dropped as
arbitrary: the app targets **Next.js 16** and **Tailwind CSS v4**, which is what
`create-next-app@latest` provisions today.

The practical consequence is theming. Tailwind v4 replaces the JavaScript
`tailwind.config.ts` theme object with a CSS-first `@theme` block, so the
prototype's design tokens live in `src/app/globals.css` rather than in a config
file. See "Theming" below.

## Architecture

The browser talks to **one** backend: the Express proxy. It never calls
PocketBase or Anthropic directly.

```
Next.js  ->  api.pocketpm.fyi (Express)  ->  pb.pocketpm.fyi (PocketBase)
                                         ->  Anthropic Claude
```

- **All data operations** — auth, CRUD, and AI — route through the Express proxy
  via `src/lib/api.ts`.
- **The Anthropic API key lives only on the Express server.** It is never shipped
  to the client and never stored in this repo.
- `src/lib/pocketbase.ts` is scaffolded to satisfy the required file structure but
  is intentionally unwired; it stays that way until something (e.g. realtime
  subscriptions) actually needs a direct PocketBase connection.

Both backends are already deployed. This repo does not provision or migrate them.

## Theming

The prototype's CSS custom properties (`prototype/pocket_pm_v9.html`, `:root`,
lines 9–20) are ported verbatim into `src/app/globals.css` as `--ppm-*` variables,
then mapped onto shadcn's semantic slots (`--primary`, `--destructive`, …) and
exposed to Tailwind through the `@theme` block.

Components consume semantic utilities (`bg-success`, `text-muted-foreground`,
`rounded-r12`). **Hardcoded hex values in components are not allowed** — if a
color is missing, add a token rather than inlining it.

The prototype is light-theme only, so no dark theme was invented for it.

## Getting started

Requires Node.js 20+.

```bash
npm install
cp .env.example .env.local
npm run dev
```

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

## Repository layout

```
prototype/   the v9 single-file prototype — the functional spec
docs/        system architecture reference
src/app/     (auth) login, (app) the 27 module routes
src/components/{ui,layout,shared}
src/lib/     pocketbase.ts, api.ts, ai.ts
src/hooks/   useProject, useProjects, ...
src/types/   types for the 21 PocketBase collections
```

## Local environment note

Keep this repository **outside** iCloud-synced folders (`~/Desktop`,
`~/Documents`). With "Optimize Mac Storage" enabled, macOS evicts local copies of
`node_modules` files and re-fetches them on demand, which makes `tsc` and
`eslint` stall and eventually fail with `ETIMEDOUT` on `readFileSync`.
`~/Projects` is a safe location.
