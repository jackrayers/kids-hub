# Kids Hub — Architecture

Two kid-facing web apps (Santa Catalog, Print Shop) sharing one backend. Hosted at **kids.jackrayers.com**. Kids are 1–10 (main targets 4–6). Used on each household's own iPad/Android tablet as a home-screen PWA.

## Principles
- No build step. Vanilla HTML/CSS/JS modules, same conventions as jackrayers.com.
- Cloudflare Pages + Pages Functions (API) + D1 (data) + R2 (images).
- All logic behind a JSON API so a native client could be added later.
- Picture-first kid UI; profiles set `ui_mode` (`picture` for pre-readers, `reader` adds labels/search).
- Secrets (Gemini key, HA webhook) live only in Functions env, never on devices.

## Repo layout
```
public/
  index.html            kid picker (tap your photo)
  catalog/              Santa Catalog (browse, wish list)
  letter/               printable Santa letter
  print/                Print Shop (pick model + colors, spend tokens)
  admin/                parent mode (behind Cloudflare Access)
  pair/                 device pairing
  shared/               api.js, ui.css, components
  manifest.webmanifest, sw.js
functions/api/
  kid/...               device-token auth
  admin/...             Access auth
  hook/...              API-key auth (Home Assistant)
  pair.js
migrations/0001_init.sql
wrangler.toml
```

## Auth (three kinds of caller)
| Caller | How | Paths |
|---|---|---|
| Adults | Cloudflare Access (email one-time code). Function verifies `Cf-Access-Jwt-Assertion`, maps email → `adults` row | `/admin/*`, `/api/admin/*` |
| Kid devices | Adult creates a pairing code (10 min) → device POSTs to `/api/pair` → gets long-lived token (stored hashed server-side, localStorage on device) → `Authorization: Bearer` | `/api/kid/*` |
| Home Assistant | Per-integration API key (hashed), scoped | `/api/hook/*` |

Kids never log in; a paired device shows its household's kids.

## D1 schema (initial)
- `households(id, name)`
- `adults(email PK, name, role 'owner'|'adult')`
- `kids(id, household_id, name, birth_year, avatar_key, ui_mode, active)`
- `devices(id, household_id, name, token_hash, created_at, last_seen, revoked_at)`
- `pairing_codes(code PK, household_id, expires_at)`
- `api_keys(id, name, key_hash, scopes)`
- `kid_apps(kid_id, app, enabled)` — per-kid app switches; missing row = app default from `lib/apps.js`
- `ledger(id, kid_id, delta, kind 'award'|'spend'|'refund'|'adjust', reason, ref_type, ref_id, actor, created_at)` — **balance = SUM(delta)**; append-only, never edit rows
- `toys(id, title, source_url, source_key, stylized_key, coloring_key, category, age_min, status 'draft'|'approved'|'hidden', created_by, created_at)`
- `wishlist(kid_id, toy_id, added_at, PK(kid_id, toy_id))`
- `models(id, title, source_url, thumb_key, grams, print_minutes, slots 1–5, slot_labels JSON, base_cost, per_color_cost, cost_override, status)`
- `filaments(id, name, material, hex, in_stock, sort)`
- `print_requests(id, kid_id, model_id, slot_colors JSON, cost, status 'requested'|'printing'|'done'|'refunded', refund_reason, created_at, updated_at)`

## Apps on/off
- Registry in `lib/apps.js` (`santa`, `print`). Each kid has every app on by default; parent mode can switch apps per kid or for a whole household (e.g. Santa’s Catalog only for the younger ones, or off after Christmas).
- The hub only shows a kid’s enabled apps. Kid-facing app endpoints must call `requireKidApp(db, kidId, app)`.

## Tokens
- Adults award/adjust in parent mode (any adult, any kid). Each entry records `actor`.
- Print request: insert `print_requests` + `spend` ledger row in one D1 batch; reject if balance < cost.
- Refund: status → `refunded` + reversing `refund` ledger row with reason.
- Later: HA chores POST `/api/hook/award {kid_id, delta, reason}`.

## Santa Catalog — image pipeline
1. Admin pastes product URL → Function fetches page, parses `og:title` / `og:image`, stores source image in R2. Fallback: manual photo upload (some retailers block fetches).
2. **Stylized**: source image + fixed house-style prompt → Gemini image model → R2.
3. **Coloring**: stylized image + "bold black outlines, no shading, white background" prompt → R2. (Derived from stylized so the two match.)
4. Toy stays `draft` until an adult approves; regenerate either image from the review screen.
- Model string in env `GEMINI_IMAGE_MODEL` (start with `gemini-3.1-flash-image`, Nano Banana 2). ~US$0.05/image.

## Santa letter
- Kid's wish list → letter page: "Dear Santa", kid name, grid of coloring images (≤6), writing lines, drawing space.
- Print CSS (`@page` Letter, portrait), print via OS share/AirPrint. No storage needed initially.

## Print Shop
- Model has 1–5 color slots (MMU3). Kid picks a filament per slot from `in_stock` swatches.
- Cost = `cost_override` ?? `base_cost + per_color_cost × (distinct colors − 1)`.
- New request → POST to HA webhook (`HA_WEBHOOK_URL` secret) for a phone notification.
- Queue view for adults: Requested → Printing → Done, or Refund.

## Projects
1. **Foundation** ✅ — Pages project, wrangler config, D1 migration, R2, Access, pairing, kid picker, parent mode shell (kids, adults, tokens, devices).
2. **Santa Catalog** ✅ — import, Gemini pipeline, review/approve, browse, wish list (max 6), letter.
3. **Print Shop** — filaments, models, spending, queue, refunds, HA notify.
4. **Later** — HA chore integration, kid-facing token history, letter "send to Santa" view for adults.
