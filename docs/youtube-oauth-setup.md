# YouTube publishing — one-time OAuth setup

You do this **once, at your desk**. It produces three secrets that the publish path reads at runtime
from the macOS Keychain (env vars override). The secrets **never go through chat and never get
committed** — you type them straight into the Keychain.

Target channel: **@ansonlam9488**. Format: **Shorts** (9:16, ≤3 min — YouTube auto-classifies; no flag).

---

## Why OAuth (not an API key)

`videos.insert` (uploading) **requires OAuth 2.0** — an API key cannot upload. We use the long-lived
**refresh-token** flow: a refresh token is exchanged for a short-lived access token on each run.

> **Critical:** the refresh token only stays long-lived if the OAuth app's publishing status is
> **"In production"**. An app left in **"Testing"** hands out refresh tokens that **expire after 7
> days** — you'd have to redo this every week. Step 3 below sets it to Production.

You already have **Standard + Intermediate** channel features (phone-verified) — that's all uploads
need. **Advanced features are NOT required.**

---

## Step 1 — Google Cloud project + enable the API

1. Go to <https://console.cloud.google.com/> → create a project (e.g. `content-pipeline-youtube`).
2. **APIs & Services → Library** → search **"YouTube Data API v3"** → **Enable**.

## Step 2 — OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User type: **External** → Create.
3. App name (e.g. `content-pipeline`), your support email, developer email. Save & continue.
4. **Scopes** → Add → search and add **`.../auth/youtube.upload`** → Update → Save & continue.
5. **Test users** → add your own Google account (the one that owns @ansonlam9488). Save.

## Step 3 — PUBLISH the app to Production (the 7-day-token fix)

1. Back on **OAuth consent screen**, click **PUBLISH APP** → confirm → status becomes **"In production"**.
2. Google may show a verification banner. For a **single-user personal app you can ignore it** — you'll
   just see an "unverified app" warning at authorize time (Step 5); click **Advanced → Go to {app}
   (unsafe)**. Refresh tokens from a *Production* app stay long-lived even while unverified. (The 7-day
   expiry is tied to *Testing* status, which we've left.)

## Step 4 — Create the OAuth Client ID

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Desktop app** → name it → **Create**.
3. Copy the **Client ID** and **Client secret** (you'll store both in Step 6).

## Step 5 — Get a refresh token (PRIMARY: the code helper)

Run our login helper — it handles the loopback redirect, the token exchange, and (optionally) stores
the refresh token straight into the Keychain for you:

```sh
# Optionally export the two values first so it doesn't prompt (they never hit history if you paste):
#   export YOUTUBE_CLIENT_ID=... ; export YOUTUBE_CLIENT_SECRET=...
npm run youtube:auth
```

1. It reads the Client ID + Client secret (env-first → Keychain → it prompts you to paste — masked, so
   nothing is saved to shell history).
2. It binds a temporary `http://127.0.0.1:<port>` loopback (Desktop OAuth clients accept any loopback
   port — no pre-registration), prints + opens the consent URL.
3. Sign in as the **@ansonlam9488 owner account**, click through the unverified-app warning
   (**Advanced → Go to {app}**), and approve.
4. It captures the code, exchanges it (with `access_type=offline` + `prompt=consent`, so a
   `refresh_token` is guaranteed), then **offers to store ALL THREE secrets into the Keychain in one
   go** — `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, and `YOUTUBE_REFRESH_TOKEN` (or, if you decline,
   it prints the refresh token ONCE for you to store manually — never to a file/commit). It prints only
   the **service names**, never any secret value.

> If it reports **no refresh_token** (only an access token), Google already consented once. Revoke at
> <https://myaccount.google.com/permissions> and re-run `npm run youtube:auth`.

If you answer **`y`**, all three Keychain entries are created in that single run and you can **skip Step
6 entirely**. (If you answer `N`, store them yourself via Step 6.)

### Fallback — OAuth Playground (no code)

If you can't run the helper:

1. Go to <https://developers.google.com/oauthplayground/>.
2. Top-right **⚙ (gear) → "Use your own OAuth credentials"** → paste the Client ID + Client secret
   from Step 4.
3. **Step 1 (left panel):** in the "Input your own scopes" box enter
   `https://www.googleapis.com/auth/youtube.upload` → **Authorize APIs**.
4. Sign in as the **@ansonlam9488 owner account**, accept (click through the unverified-app warning).
5. **Step 2:** click **"Exchange authorization code for tokens"**.
6. Copy the **`refresh_token`** value (a long string starting `1//…`). **This is the secret you store.**

> If Step 2 shows no `refresh_token` (only an access token), revoke access at
> <https://myaccount.google.com/permissions> and redo — Google only returns the refresh token on the
> first consent.

## Step 6 — Store the secrets in the macOS Keychain (only if you didn't use the helper's `y`)

> **Skip this whole step if you answered `y` in Step 5** — the helper already stored all three
> (`YOUTUBE_CLIENT_ID` + `YOUTUBE_CLIENT_SECRET` + `YOUTUBE_REFRESH_TOKEN`) in that single run. This step
> is the manual fallback (you ran the OAuth Playground, or answered `N`).

The code reads each secret env-first, then a single Keychain lookup keyed on **the env-var name as the
service** (`-s`). Run these three commands; each `-w` with **no value prompts you interactively** so the
secret is **never echoed and never saved to shell history**:

```sh
security add-generic-password -a "$USER" -s YOUTUBE_CLIENT_ID     -w
security add-generic-password -a "$USER" -s YOUTUBE_CLIENT_SECRET -w
security add-generic-password -a "$USER" -s YOUTUBE_REFRESH_TOKEN -w
```

Paste the matching value at each `password:` prompt (Client ID, Client secret, refresh token). To
replace a wrong value later, add `-U` to update in place.

Verify they're stored (prints the **service names only**, no secrets):

```sh
for s in YOUTUBE_CLIENT_ID YOUTUBE_CLIENT_SECRET YOUTUBE_REFRESH_TOKEN; do
  security find-generic-password -s "$s" >/dev/null 2>&1 && echo "$s: stored" || echo "$s: MISSING"
done
```

---

## Step 7 — Hand back to the orchestrator (incremental, per the per-upload-go rule)

Once the three secrets are stored, tell me **"OAuth done, go"** and I'll run these in order, each as a
separate explicit step:

1. **Auth check only — zero uploads** (proves the refresh token works):
   ```sh
   YOUTUBE_VERIFY_ONLY=1 npm run smoke:publish-youtube:live
   ```
2. **One video** (a single Short, to eyeball the live result before the batch):
   ```sh
   YOUTUBE_ONLY=lfah-post1 npm run smoke:publish-youtube:live
   ```
3. **The remaining videos**, spaced if the channel throttles:
   ```sh
   YOUTUBE_UPLOAD_DELAY_MS=15000 npm run smoke:publish-youtube:live
   ```

Privacy defaults to **public** (`$YOUTUBE_PRIVACY` overrides → `unlisted` or `private` for a private
first test). `selfDeclaredMadeForKids` is always `false`. ui-evolve uploads the **safe-band** cut.

> Shorts descriptions are **not clickable** — the GitHub/X/Threads links live in the description as
> plain text and on your channel's **Links** section. LinkedIn is intentionally omitted (held).
