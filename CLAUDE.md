# Kids Hub — notes for Claude

Read `ARCHITECTURE.md` first; it is the source of truth for scope and data model.

## Conventions
- **No build step.** Plain HTML + ES modules in `public/`. No frameworks, no bundler for front ends.
- API = Cloudflare Pages Functions in `functions/`; shared server code in `lib/` (imported relatively).
- Throw `HttpError(status, message)` from handlers; `functions/api/_middleware.js` turns it into JSON.
- Auth lives in middleware: `/api/admin/*` → `data.adult` (Access), `/api/kid/*` → `data.device` (Bearer token), `/api/hook/*` → call `authenticateApiKey` in the handler.
- The **ledger is append-only** (DB triggers enforce it). Balances are `SUM(delta)`. Spend + related writes go in one `env.DB.batch()`.
- Schema changes = new numbered file in `migrations/`. Never edit an applied migration. GitHub Actions applies them to production on push to `main`; keep them backward-compatible with the previous code (add columns/tables, don't rename), since Pages may deploy the code a minute before or after.
- Kid UI: picture-first, huge tap targets, Baloo 2 font, works on iPad and Android. `ui_mode = 'reader'` may add text.
- Apps are registered in `lib/apps.js`; kid-facing endpoints for an app must check `requireKidApp()`. Set `ready: true` when an app ships.
- Images live in R2 under unguessable keys and are served by `functions/img/[[path]].js`.
- Wrap all `localStorage` access (use `store` / `session` from `public/shared/api.js`).

## Local dev
```
npm install
cp .dev.vars.example .dev.vars        # set your email
npm run db:migrate:local
npm run dev                            # http://localhost:8788
```
`DEV_ADMIN_EMAIL` bypasses Access on localhost only. `GEMINI_MOCK=1` makes placeholder pictures instead of calling Gemini; `GEMINI_MOCK=block` simulates Gemini refusing (copyright/safety) to test the fallback.

## Catalog notes
- Prompts and categories live in `lib/catalog.js`; generation in `lib/gemini.js` (tries AI Studio, then Vertex express).
- Coloring pages are generated *from the storybook picture*, so redoing the storybook means redoing the cutout and coloring too.
- Gemini can’t output real transparency: the storybook prompt asks for flat pure white, and `public/shared/cutout.js` removes it in the browser.
- Gemini refuses well-known characters/brands (e.g. Mickey). Don't work around the filter; the fallback is the product photo (`use-photo`) + browser cutout + `public/shared/lineart.js` coloring page.
