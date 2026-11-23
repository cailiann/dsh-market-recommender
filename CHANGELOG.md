# Changelog

## 1.1.1

- Fix: the panel's three host routes are now mounted through `ctx.inject(['webServer'], …)`
  instead of a one-shot `ctx.get('webServer')` at apply time.
  A live bundle reload (install/remove while the app is running) mounts services in a
  different order, so the old call could resolve to nothing and register no routes at all:
  the `recommend_plugin` tool kept working while the Recommend tab got `405 Method Not Allowed`
  from the SPA fallback. Registration failures now also emit a warning instead of failing silently.
- Fix: routes are disposed with the plugin fiber, so reloading the bundle twice no longer
  collides with an already registered `(kind, path)`.

## 1.1.0

- Split into a host half (`recommend_plugin` tool, three candidate sources) and a web client
  half (`推荐` / `Recommend` tab inside the Plugins page: search box, result cards with
  install/enable, today's picks).
- Renamed the package from `@local/dsh-market-recommender` to `dsh-market-recommender`,
  dropped `private`, added MIT license, repository field and `engines.dsh`.

## 1.0.0

- First working version: natural-language need → ranked existing plugins from the profile's
  configured market indexes, the community dshmarket catalog, and the optional plugins that
  ship with this DSH installation.
