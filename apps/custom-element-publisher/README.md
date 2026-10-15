# Publish custom elements to GitHub

This is the bit that lets the dashboard's **Save changes** button publish a
wheel file to GitHub for you.

You do not need to do this setup right now. The setup needs:

- Access to the Cloudflare account that will host the Worker.
- A GitHub token that can write to the `mtw` repository.
- The dashboard's website address.
- The Firebase project ID and the Firebase user IDs allowed to publish.

The GitHub token goes into Cloudflare as a secret. It must never be put in the
dashboard code or sent to the browser.

## The setup, in plain steps

### 1. Put this Worker folder in GitHub

The `mtw` repository needs to contain this folder:

`apps/custom-element-publisher/`

If this project has not been pushed to GitHub yet, stop here. The Worker cannot
connect to files that are only on your computer.

### 2. Create the Worker in Cloudflare

1. Sign in to Cloudflare and open **Workers & Pages**.
2. Choose **Create application**, then choose the option to connect a Git
   repository.
3. Connect the GitHub account and select the repository that contains `mtw`.
4. Set the Worker directory/root directory to
   `apps/custom-element-publisher`.
5. Use `npx wrangler deploy` as the deploy command. Leave the build command
   blank.
6. Create/deploy the Worker. Cloudflare will show you a URL ending in
   `.workers.dev`. Keep that URL; the dashboard needs it later.

If Cloudflare shows different setup choices, don't guess—send me a screenshot
or tell me what the page says.

### 3. Add the GitHub connection secret

The Worker needs permission to add or update files in the `mtw` repository.

1. In GitHub, create a **fine-grained personal access token** for the `mtw`
   repository.
2. Give it **Contents: Read and write** permission, and no broader repository
   access than needed.
3. In Cloudflare, open the new Worker's **Settings → Variables and Secrets**.
4. Add a **secret** named `GITHUB_TOKEN`, and paste the token as its value.

Do not paste the token into chat, the dashboard, or a file in this repository.

### 4. Tell the Worker which dashboard users may publish

In Cloudflare's Worker **Settings → Variables and Secrets**, add these values:

- `FIREBASE_PROJECT_ID` — the project ID used by dashboard sign-in.
- `DASHBOARD_ORIGIN` — the dashboard's exact website address, for example
  `https://dashboard.example.com` (no trailing slash).

Then add a **secret** named `ALLOWED_FIREBASE_UIDS`. Its value is the Firebase
UID of each person allowed to publish. Separate multiple UIDs with commas.
This is how the Worker checks that the person saving is an approved, signed-in
dashboard user.

These GitHub destination values are already set in the Worker's
`wrangler.toml`:

- Owner: `Mikes-Transport`
- Repository: `mtw`
- Branch: `main`

### 5. Connect the dashboard to the Worker

This part is a small dashboard configuration change. The dashboard must provide
the Worker URL and its existing Firebase Auth instance to the editor. The
Worker URL is the `.workers.dev` address from step 2.

**Don't paste the example code from older instructions as-is.** The dashboard's
Firebase setup is not in this repository, so the correct place to add these
values needs to be identified in the live dashboard before changing it.

Once the Worker is deployed, send me its `.workers.dev` URL and the dashboard's
website address. Do not send the GitHub token. I can then help connect the
dashboard safely.

## After setup

When connected, saving a wheel will:

1. Save its editable settings in Firebase.
2. Ask the Worker to publish the generated JavaScript file to
   `apps/website/custom-elements/` in the `mtw` repository.
3. Keep the same file and embed URL when that wheel is edited and saved again.

Until the dashboard is connected, you can still use **Download JS file** and
upload the file manually.
