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

## Cloudflare shared saving

This app uses a Cloudflare Pages Function at `functions/api/state.js` and a D1 database table named `movie_night_state`.

To enable shared editing for everyone who opens the link:

1. Create a D1 database in Cloudflare.
2. Apply the migration in `migrations/0001_init.sql`.
3. Add the D1 binding to your Pages project with the binding name `DB`.
4. Redeploy the site.

The dashboard will then load and save the shared state from the cloud instead of each visitor's browser.
