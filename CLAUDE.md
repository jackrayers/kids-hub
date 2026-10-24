# Kids Hub — notes for Claude

Read `ARCHITECTURE.md` first; it is the source of truth for scope and data model.

## Conventions
- **No build step.** Plain HTML + ES modules in `public/`. No frameworks, no bundler for front ends.
- API = Cloudflare Pages Functions in `functions/`; shared server code in `lib/` (imported relatively).
- Throw `HttpError(status, message)` from handlers; `functions/api/_middleware.js` turns it into JSON.
- Auth lives in middleware: `/api/admin/*` → `data.adult` (Access), `/api/kid/*` → `data.device` (Bearer token), `/api/hook/*` → call `authenticateApiKey` in the handler.
- The **ledger is append-only** (DB triggers enforce it). Balances are `SUM(delta)`. Spend + related writes go in one `env.DB.batch()`.
- Schema changes = new numbered file in `migrations/`. Never edit an applied migration.
- Kid UI: picture-first, huge tap targets, Baloo 2 font, works on iPad and Android. `ui_mode = 'reader'` may add text.
- Images live in R2 under unguessable keys and are served by `functions/img/[[path]].js`.
- Wrap all `localStorage` access (use `store` / `session` from `public/shared/api.js`).

## Local dev
```
npm install
cp .dev.vars.example .dev.vars        # set your email
npm run db:migrate:local
npm run dev                            # http://localhost:8788
```
`DEV_ADMIN_EMAIL` bypasses Access on localhost only.
