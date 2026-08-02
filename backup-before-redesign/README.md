# movienight

React + TypeScript app for planning movie night with shared cloud state on Cloudflare Workers.

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

If you have already created the D1 database, the binding in [wrangler.jsonc](wrangler.jsonc) is already wired to `DB`. Run:

```powershell
npm.cmd run deploy
```

If you want to preview locally with Wrangler instead of Vite, run:

```powershell
npx wrangler dev
```

## Cloudflare shared saving

This app uses a Cloudflare Worker entrypoint at `src/worker.js`, a D1 database table named `movie_night_state`, and the binding declared in `wrangler.jsonc`.

To enable shared editing for everyone who opens the link:

### Option A: Wrangler / CLI

1. Create a D1 database in Cloudflare.
2. Apply the migration in `migrations/0001_init.sql`.
3. Keep the `DB` binding in [wrangler.jsonc](wrangler.jsonc) pointed at your D1 database ID.
4. Run `npm.cmd run deploy`.

### Option B: Cloudflare dashboard

1. Create a D1 database in Cloudflare.
2. Add a D1 binding named `DB` in your Worker/Pages project settings.
3. Redeploy the site.

The dashboard will then load and save the shared state from the cloud instead of each visitor's browser.
