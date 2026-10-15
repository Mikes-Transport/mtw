# GitHub file publisher

This Worker has one job: receive a saved wheel configuration, create its
generated JavaScript file, and commit that file to the MTW GitHub repository.

Firebase stays in the dashboard. The Worker does not connect to Firebase, read
Firebase data, or receive Firebase credentials or sign-in tokens. The GitHub
token stays in Cloudflare and is never sent to the browser.

## Cloudflare setup

1. Push `apps/custom-element-publisher/` to the GitHub repository.
2. In Cloudflare, open **Workers & Pages** and create a Worker connected to the
   GitHub repository.
3. Set the Worker root directory to `apps/custom-element-publisher`, leave the
   build command blank, and use `npx wrangler deploy` as the deploy command.
4. Create a GitHub fine-grained token for the `mtw` repository. Grant
   **Contents: Read and write** only.
5. In the Cloudflare Worker settings, add the token as a secret named
   `GITHUB_TOKEN`.
6. Set `DASHBOARD_ORIGIN` to the dashboard's full website origin, with no
   trailing slash. Example: `https://dashboard.example.com`.
7. Deploy the Worker and copy its `.workers.dev` URL.

The repository owner, name, and branch are set in `wrangler.toml`:
`Mikes-Transport/mtw`, branch `main`.

## Connect the dashboard

The editor needs the Worker URL set in `window.MTW` before its script loads:

```js
window.MTW.customElementPublisherUrl = 'https://YOUR-WORKER.YOUR-ACCOUNT.workers.dev';
```

Send me the Worker URL after you create it and I can connect this setting in
the dashboard. No Firebase configuration is needed for the Worker.

## What happens when you save

The dashboard continues to save the editable wheel settings in Firebase, as it
does now. Separately, it sends the wheel configuration to this Worker. The
Worker generates and commits
`apps/website/custom-elements/custom-element-<element-id>.js` to the `main`
branch. Saving edits updates that same file, so its embed URL stays the same.

## Important endpoint note

The publishing endpoint accepts requests from the configured dashboard origin
and only writes validated generated wheel files to the custom-elements folder.
Browser-origin checks are not authentication: a determined person can call a
public Worker directly. If the dashboard is on the public internet, protect the
Worker with a Cloudflare security rule or Access policy before using it for
real publishing. This is separate from Firebase and does not change Firebase
login or database behavior.
