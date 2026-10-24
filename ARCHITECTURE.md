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

Kids never log in; a paired device shows its household's kids. A tablet can instead be locked to one kid (`devices.kid_id`): it skips the picker, and kid endpoints refuse any other kid.

## D1 schema (initial)
- `households(id, name)`
- `adults(email PK, name, role 'owner'|'adult')`
- `kids(id, household_id, name, birth_year, avatar_key, ui_mode, active)`
- `devices(id, household_id, kid_id?, name, token_hash, created_at, last_seen, revoked_at)`
- `pairing_codes(code PK, household_id, expires_at)`
- `api_keys(id, name, key_hash, scopes)`
- `kid_apps(kid_id, app, enabled)` — per-kid app switches; missing row = app default from `lib/apps.js`
- `ledger(id, kid_id, delta, kind 'award'|'spend'|'refund'|'adjust', reason, ref_type, ref_id, actor, created_at)` — **balance = SUM(delta)**; append-only, never edit rows
- `toys(id, title, source_url, source_key, stylized_key, cutout_key, coloring_key, category, age_min, status 'draft'|'approved'|'hidden', created_by, created_at)`
- `wishlist(kid_id, toy_id, added_at, bought_by?, bought_at?, removed_at?, PK(kid_id, toy_id))` — bought fields are grown-up only; a bought wish the kid removes is kept with `removed_at`
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
4. **Cutout** (in parent mode’s browser, `public/shared/cutout.js`): flood-fills the white background from the edges, feathers the edge, trims, and stands the toy at the bottom of a 768px square PNG → `toys.cutout_key`. A sanity check (background not white, too little/too much removed) holds the cutout for a look instead of using it.
5. **Trim**: Gemini coloring pages are cropped to their lines and centered (`public/shared/trim.js`) so they fill the letter. *Fit all pictures* re-runs cutout + trim for every toy.
6. Toy stays `draft` until an adult approves; redo the picture, cutout or coloring page from the review row.
- **When Gemini refuses** (well-known characters and brands): *Use the product photo instead* copies the photo in as the picture, cuts it out, and draws a simple coloring page in the browser (`public/shared/lineart.js`). *Simple coloring* does just the coloring page for any toy.
- Kids see the cutout standing on wooden shelves; toys without one sit in a white display box.
- Model string in env `GEMINI_IMAGE_MODEL` (start with `gemini-3.1-flash-image`, Nano Banana 2). ~US$0.05/image.

## Shopping list
- Parent mode → Shopping: each kid's wishes with Buy links (the product page, or a link added later), **Mark bought** shared across all grown-ups, filter to still-to-buy. Kid endpoints never return bought status.

## Santa letter
- Kid’s wish list → letter page: "Dear Santa", traced name, grid of coloring pictures only (≤6, no titles), holly corners.
- **Print my letter** draws the letter on a 200 dpi canvas and saves it as a true US Letter PDF (`public/letter/pdf.js`, jsPDF vendored in `public/vendor/`), then opens the share sheet → Print. Browsers scale printed web pages unpredictably; PDFs print true to size. The on-screen page is just the preview.

## Print Shop
- Model has 1–5 color slots (MMU3). Kid picks a filament per slot from `in_stock` swatches.
- Cost = `cost_override` ?? `base_cost + per_color_cost × (distinct colors − 1)`.
- New request → POST to HA webhook (`HA_WEBHOOK_URL` secret) for a phone notification.
- Queue view for adults: Requested → Printing → Done, or Refund.

## Print Shop — design (agreed, not built yet)
- **Input:** a PrusaSlicer project `.3mf` (Jack verifies/paints it in PrusaSlicer; Bambu-painted MakerWorld files go through OrcaSlicer first). Always printed manually.
- **Slots = extruders 1–5.** Unpainted triangles use the object's extruder (default 1). Painted triangles carry `slic3rpe:mmu_segmentation` — PrusaSlicer's TriangleSelector bitstream: hex chars read from the *end*, LSB-first nibbles; each node's first nibble = low 2 bits split sides (0 = leaf), high 2 bits = state (leaf; if 3, state = next nibble + 3) or special side (split → sides+1 children). State 0 = default extruder, N = extruder N. Default slot colors from `extruder_colour` in `Metadata/Slic3r_PE.config`.
- **Proven on pikachu-v2.3mf (2026-10-24):** 125k triangles / 10.5 MB XML; parse 0.25 s + decode in JS; per-slot simplification with meshoptimizer (`LockBorder`) to 40k triangles in 0.12 s; quantized positions + uint16 indices = 361 KB raw, **~280 KB gzipped**, visually indistinguishable at tablet size.
- **Pipeline:** parent mode (desktop browser) unzips (fflate), decodes, simplifies, uploads the tiny preview + thumbnail; original 3MF stored in R2 for download. Kids get a small WebGL viewer that recolors slots live from in-stock filaments.
- **Pricing:** per model, `price_single` (all slots one filament) and `price_multi` (2+ filaments), set by Jack.

## Projects
1. **Foundation** ✅ — Pages project, wrangler config, D1 migration, R2, Access, pairing, kid picker, parent mode shell (kids, adults, tokens, devices).
2. **Santa Catalog** ✅ — import, Gemini pipeline, review/approve, browse, wish list (max 6), letter.
3. **Print Shop** — filaments, models, spending, queue, refunds, HA notify.
4. **Later** — HA chore integration, kid-facing token history, letter "send to Santa" view for adults.
