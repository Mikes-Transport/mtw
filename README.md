# mtw

MTW's all-in-one source workspace. Each app has its own entry points and
dependencies; shared code is not bundled into one script.

## Apps

- `apps/dashboard/js/` — dashboard scripts grouped by feature. The barcode
  font they load is in `apps/dashboard/assets/fonts/`.
- `apps/website/` — website overrides and the model lookup feature. Its CSV
  and trailer drawings are runtime data/assets, not disposable build output.
- `apps/workplace/` — standalone app with separate `html/`, `js/`, and `css/`
  folders.
- `apps/custom-element-publisher/` — Cloudflare Worker source and setup guide
  for publishing generated web elements to GitHub.

The original repositories remain untouched outside this workspace. Existing
live integrations still use those original repositories; update deployment
paths before switching them to this reorganized copy. workspace for the MTW projects.

## Projects

- `apps/dashboard` — dashboard ([contents and live-path notes](apps/dashboard/README.md))
- `apps/website` — external website ([contents and development tools](apps/website/README.md))
- `apps/workplace` — workplace ([contents and entry points](apps/workplace/README.md))

Each project is currently kept as its own Git repository. The original repositories remain separate from these copies.
