# Kids Hub

Tablet web apps for the kids: **Santa’s Catalog** (browse toys, build a printable letter to Santa) and **Print Shop** (spend earned tokens on 3D prints). Runs at `kids.jackrayers.com` on Cloudflare Pages + D1 + R2. See [ARCHITECTURE.md](ARCHITECTURE.md).

## Status
- ✅ **Foundation** — households, kids (photo/emoji avatars), token ledger, tablet pairing, parent mode, Home Assistant award hook
- ✅ **Santa’s Catalog** — add toys by link or photo, Gemini storybook + coloring-page pictures, kid browsing with hearts (6 max), printable letter to Santa, wish lists for grown-ups
- ⏳ Print Shop

## One-time Cloudflare setup
1. **D1:** `npx wrangler d1 create kids-hub` → paste the `database_id` into `wrangler.toml`.
2. **R2:** `npx wrangler r2 bucket create kids-hub-images`.
3. **Pages project:** `npx wrangler pages project create kids-hub` (production branch `main`), or connect this repo in the dashboard with build command *none* and output directory `public`.
4. **Migrate:** `npm run db:migrate:remote`.
5. **Custom domain:** Pages → kids-hub → Custom domains → `kids.jackrayers.com`.
6. **Cloudflare Access** (Zero Trust → Access → Applications → Self-hosted):
   - Application domain `kids.jackrayers.com`, paths `admin` and `api/admin`.
   - Policy: *Allow* → Emails → you plus any other grown-ups. Login method: One-time PIN.
   - Copy the **Application Audience (AUD) tag**.
7. **Settings:** because `wrangler.toml` is the Pages config, plain variables live there, not in the dashboard.
   - In `wrangler.toml` `[vars]`: `ACCESS_TEAM_DOMAIN` = `<your-team>.cloudflareaccess.com`, `ACCESS_AUD` = the AUD tag. Commit.
   - Owner email as a secret: `npx wrangler pages secret put OWNER_EMAIL --project-name kids-hub` (you become owner on first sign-in).
8. Deploy: `npm run deploy` (or push to `main` if connected to Git).

## Santa’s Catalog setup
1. `npm run db:migrate:remote` (adds the toys and wish-list tables).
2. `npx wrangler pages secret put GEMINI_API_KEY --project-name kids-hub`, then retry the latest deployment.
3. Optional: set `GEMINI_IMAGE_MODEL` in `wrangler.toml` `[vars]` (default `gemini-3.1-flash-image`).

## Using it
1. Open `kids.jackrayers.com/admin`, sign in, create a household, add kids.
2. **Tablets → Get a code**, then on the kid’s tablet open `kids.jackrayers.com/pair` and type the code.
3. On iPad: Share → *Add to Home Screen*. On Android Chrome: menu → *Install app*.
4. **Kids → app switches:** tap an app under a kid to turn it on/off, or use *for everyone* per household.
5. Other grown-ups: add them under **Grown-ups** *and* to the Access policy.

## Home Assistant (later)
Create a key under **Grown-ups → Integration keys**, then e.g.:
```yaml
rest_command:
  kids_hub_award:
    url: https://kids.jackrayers.com/api/hook/award
    method: POST
    headers:
      X-Api-Key: !secret kids_hub_key
    content_type: application/json
    payload: '{"kid_id":"{{ kid_id }}","delta":{{ delta }},"reason":"{{ reason }}"}'
```

## Local development
```
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev    # http://localhost:8788
```
