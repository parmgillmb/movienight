# Movie Night

React + TypeScript app for planning movie night with shared cloud state on Cloudflare Pages.

## Local development

```powershell
npm.cmd install
npm.cmd run dev
```

## Production build

```powershell
npm.cmd run build
```

## Cloudflare local dev

If you have already created the D1 database, replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` in [wrangler.jsonc](wrangler.jsonc) and then run:

```powershell
npx wrangler pages dev dist --d1 DB=REPLACE_WITH_YOUR_D1_DATABASE_ID
```

If you prefer the Cloudflare dashboard, you can also add the `DB` binding there and deploy without using Wrangler.

## Cloudflare shared saving

This app uses a Cloudflare Pages Function at `functions/api/state.js`, a D1 database table named `movie_night_state`, and the binding declared in `wrangler.jsonc`.

To enable shared editing for everyone who opens the link:

### Option A: Cloudflare dashboard

1. Create a D1 database in Cloudflare.
2. Apply the migration in `migrations/0001_init.sql`.
3. Add a D1 binding named `DB` in your Pages project settings.
4. Redeploy the site.

### Option B: Wrangler / CLI

1. Create a D1 database in Cloudflare.
2. Apply the migration in `migrations/0001_init.sql`.
3. Replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` in [wrangler.jsonc](wrangler.jsonc).
4. Run the local Pages dev command or deploy with Wrangler.

The dashboard will then load and save the shared state from the cloud instead of each visitor's browser.
