# GitHub file publisher

This Worker publishes the checkout spin wheel and provides an experimental AI
draft endpoint for the Custom Web Element Builder.

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
6. Set `DASHBOARD_ORIGIN` to the published dashboard's full origin and
   `DASHBOARD_ORIGINS` to any additional exact origins that need API access,
   separated by commas. Do not use wildcards. The checked-in config includes
   the published Webflow site and its Designer canvas.
7. Deploy the Worker and copy its `.workers.dev` URL.

The repository owner, name, and branch are set in `wrangler.toml`:
`Mikes-Transport/mtw`, branch `main`.
The `[ai]` binding in that file enables Workers AI for `/ai/draft`. The AI route
does not require a GitHub token; wheel publishing still does.

## Connect the dashboard

The deployed Worker URL is already the dashboard editor's default:

`https://mtw.mtwaustin.workers.dev/`

No extra Firebase configuration is needed for the Worker. If you later change
the Worker URL, update `PUBLISHER_URL` in
`apps/dashboard/js/custom-elements/editor.js`.

## What happens when you save

The dashboard continues to save the editable wheel settings in Firebase, as it
does now. Separately, it sends the wheel configuration to this Worker. The
Worker generates and commits
`apps/website/custom-elements/custom-element-<element-id>.js` to the `main`
branch. Saving edits updates that same file, so its embed URL stays the same.

## Experimental AI draft builder

Choosing **Create with AI** sends the chat to `POST /ai/draft`. The Worker uses
`@cf/meta/llama-3.3-70b-instruct-fp8-fast` through the Workers AI binding and
returns a validated HTML/CSS/JavaScript draft with typed editable fields. The
dashboard renders that draft only inside a sandboxed iframe. Saving an AI
template stores its source and editable values in the dashboard's existing
Firestore collection; it does not publish the code or connect it to checkout.
The AI is explicitly instructed to make simulated prototypes, not real order,
payment, account, or rewards integrations.

Workers AI includes **10,000 Neurons per day at no charge**. On the Workers Free
plan, requests stop when the free allocation is exceeded; using more requires
Workers Paid and is billed. Stay on Workers Free to avoid AI overage charges.
Neuron use varies with prompt and generated code size; this prototype does not
measure or guarantee a fixed number of requests per day.

## Important endpoint note

Both endpoints check the configured dashboard origin, but browser-origin
checks are not authentication: a determined person can call a public Worker
directly. The AI endpoint can consume the account's daily free allocation, so
use a Cloudflare security rule, Access policy, or rate limit before exposing it
for general use. This prototype does not change Firebase login or database
behavior. The AI-created source is not published to checkout.
