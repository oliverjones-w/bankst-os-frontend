# CSS Cache Busting

## The problem

The browser (and potentially Cloudflare CDN) caches CSS files aggressively. A hard refresh (`Cmd+Shift+R`) is not always enough — the server may respond with `304 Not Modified` and serve the stale cached version.

Symptom: CSS changes have no effect in the browser, but the file on disk is correct.

## The fix

All CSS `<link>` tags in `index.html` include a `?v=N` query string. Bump the version number across all of them when CSS changes aren't showing up.

In `index.html`, find:
```
?v=2
```
Replace all with:
```
?v=3
```

That changes the URL for every stylesheet, forcing the browser to treat them as new resources and fetch fresh copies.

## When to do this

- CSS changes are in the file but not visible in the browser
- Hard refresh (`Cmd+Shift+R`) had no effect
- You've confirmed the file is correct but the browser computed styles show old values (check via DevTools → Elements → Computed tab)

## Diagnosis steps

1. DevTools → Elements → select `<html>` → Computed tab → check the relevant CSS custom property (e.g. `--bg-deep`)
2. If it shows the old value, the browser has a stale CSS file
3. Bump `?v=N` in `index.html` and hard reload
