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

## Catalog book view
- `public/catalog/book/`: the same catalog as a picture book — cover ("Made for <kid>"), contents (tap to jump), then each category on themed pages (8 background themes, banner on its first page) with 1–4 toys per page in varied layouts, and an end page with the letter button. Two-page spreads when there's room (iPad landscape), single pages otherwise. Pages turn by dragging, tapping the outer edge, arrows or keyboard (CSS 3D leaf). Hearts, tray and big view work as on the shelves. The last view used (book or shelves) is remembered per tablet (`kh.catalogView`).

## Santa letter
- Kid’s wish list → letter page: "Dear Santa", traced name, grid of coloring pictures only (≤6, no titles), holly corners.
- **Print my letter** draws the letter on a 200 dpi canvas and saves it as a true US Letter PDF (`public/letter/pdf.js`, jsPDF vendored in `public/vendor/`), then opens the share sheet → Print. Browsers scale printed web pages unpredictably; PDFs print true to size. The on-screen page is just the preview.

## Visibility (toys and models)
- `item_audience` rows restrict a toy or model; **no rows = everyone**. Rows name households and/or individual kids; a kid sees the item if either matches (`lib/audience.js`, `visibleSql`). Jack uploads once and shares across families. Set from the 👪 chip in parent mode.

## Print Shop ✅
- **Input:** a PrusaSlicer project `.3mf` (Jack verifies/paints it in PrusaSlicer; Bambu-painted MakerWorld files go through OrcaSlicer first). No printability checks. Always printed manually; the original 3MF is stored in R2 and downloadable from the queue.
- **Slots = extruders 1–5.** Unpainted triangles use the volume's/object's extruder (default 1). Painted triangles carry `slic3rpe:mmu_segmentation` — PrusaSlicer's TriangleSelector bitstream: hex chars read from the *end*, LSB-first nibbles; each node's first nibble = low 2 bits split sides (0 = leaf), high 2 bits = state (leaf; if 3, state = next nibble + 3) or special side (split → sides+1 children). State 0 = default extruder, N = extruder N. Default slot colors from `extruder_colour` in `Metadata/Slic3r_PE.config`.
- **Intake (parent mode, `public/shared/threemf.js`):** unzip (fflate) → decode → per-slot simplify with meshoptimizer (`LockBorder`) to ~40k triangles → **KHM1** preview (JSON header + Int16 quantized positions + 16/32-bit indices, groups per extruder) + 640px transparent WebP thumbnail. Pikachu: 10.5 MB XML → 361 KB preview. Changing a slot's preview color re-takes the thumbnail.
- **Kid page (`public/print/`):** shelf of thumbnails with ⭐ prices → workbench with a WebGL viewer (`public/shared/model-viewer.js`, no libraries; drag to spin) and a swatch row per slot from in-stock filaments, 🎲 Surprise me, live price, confirm, confetti, "My prints" with statuses.
- **Finishes (`public/shared/finishes.js`):** each filament has a `finish` (plain, matte, silk/dual silk, marble, sparkle/galaxy, rainbow, wood, glow) and optional `hex2` (veins, flecks, grain, 2nd silk color). Swatches are CSS gradients; the viewer's fragment shader draws the pattern procedurally in model space (mm), so it's roughly real scale and sticks to the model while spinning.
- **Pricing:** per model, `price_single` (every slot the same filament) and `price_multi` (2+ filaments).
- **Spend:** one guarded batch — insert the request only if balance ≥ cost, then the ledger spend `WHERE changes() = 1`. Refund = status `refunded` + positive ledger row.
- **Alerts:** new request → Web Push to every grown-up device that turned alerts on (`lib/webpush.js`: VAPID + RFC 8291 aes128gcm with WebCrypto only; VAPID keys generated on first use and stored in `settings`; dead subscriptions removed on 404/410). The service worker shows the notification and opens `/admin/#print`. Parent mode has its own manifest (`/admin-manifest.webmanifest`, scope `/admin/`) so it can be installed on iPhone, which iOS requires for web push. The `HA_WEBHOOK_URL` webhook still works if set, but isn't needed.
- Queue: Waiting → Printing → Done, or Refund (with a reason).

## Projects
1. **Foundation** ✅ — Pages project, wrangler config, D1 migration, R2, Access, pairing, kid picker, parent mode shell (kids, adults, tokens, devices).
2. **Santa Catalog** ✅ — import, Gemini pipeline, review/approve, browse, wish list (max 6), letter.
3. **Print Shop** ✅ — filaments, models, spending, queue, refunds, HA notify.
4. **Later** — HA chore integration, kid-facing token history, letter "send to Santa" view for adults.
