/**
 * OPERATOR-RUN YouTube OAuth login helper (#1069) — `npm run youtube:auth`.
 *
 * The operator runs this ONCE at their desk to mint + store the long-lived refresh token. It is the
 * code helper the doc's Step 5 points at (the OAuth-Playground path is the labelled fallback). It makes
 * a real outward Google call ONLY when the operator runs it — it is NEVER invoked by `npm test`,
 * `npm run typecheck`, or the dry-run smoke, and the pure logic it leans on (adapters/youtubeAuth.ts)
 * is unit-tested with an injected fetch + zero network.
 *
 * Flow (Desktop-app loopback):
 *   1. Read YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET (env-first → Keychain → interactive prompt — a
 *      pasted value never hits shell history).
 *   2. Bind an ephemeral 127.0.0.1:<port> loopback server (Desktop clients accept any loopback port).
 *   3. Print + best-effort open the consent URL (scope youtube.upload, access_type=offline,
 *      prompt=consent → guarantees a refresh token). The operator signs in as the @ansonlam9488 owner
 *      and clicks through the unverified-app warning.
 *   4. Capture the ?code= on the loopback redirect, close the server, exchange the code for tokens.
 *   5. OFFER to store ALL THREE secrets (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN)
 *      into the macOS Keychain in one go (security add-generic-password -U …) so the upload adapter finds
 *      a COMPLETE set after a single login — OR print the refresh token ONCE for manual storage.
 *
 * SECRET DISCIPLINE: no secret is ever written to a file, committed, or logged — only the SERVICE NAMES
 * are printed on store. The one exception is the single deliberate one-time refresh-token print the
 * operator explicitly opts into (the [N] branch). Each value passed to `security` rides the `-w` argv
 * slot (no shell → no history; briefly visible to a local `ps` during the sub-second call — accepted for
 * a one-time local operator run). Client id/secret are read at runtime only.
 */

import { execFileSync } from "child_process";
import * as http from "http";
import * as readline from "readline";
import { URL } from "url";

import { readSecret } from "../adapters/youtube";
import {
  buildAuthUrl,
  exchangeCodeForTokens,
  loopbackRedirectUri,
} from "../adapters/youtubeAuth";

/** Prompt the operator on the terminal. `hidden` masks the input (for pasted secrets). */
function prompt(question: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    if (hidden) {
      // Mute echo while the operator pastes a secret.
      const orig = (rl as unknown as { _writeToOutput?: (s: string) => void })._writeToOutput;
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = function (s: string) {
        if (s.includes(question)) process.stdout.write(s);
        // else: swallow the echoed keystrokes
      };
      rl.question(question, (ans) => {
        (rl as unknown as { _writeToOutput?: (s: string) => void })._writeToOutput = orig;
        process.stdout.write("\n");
        rl.close();
        resolve(ans.trim());
      });
    } else {
      rl.question(question, (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    }
  });
}

/** Read a credential env-first → Keychain → interactive prompt (so it never hits shell history). */
async function readCred(envVar: string, label: string): Promise<string> {
  try {
    return readSecret(envVar);
  } catch {
    return prompt(`Paste your ${label} (${envVar}): `, true);
  }
}

/** Best-effort open the URL in the operator's default browser (macOS `open`). Non-fatal on failure. */
function tryOpenBrowser(url: string): void {
  try {
    execFileSync("open", [url], { stdio: "ignore" });
  } catch {
    // ignore — the URL is printed for manual paste
  }
}

/**
 * Bind 127.0.0.1:0 (ephemeral), resolve once the OAuth redirect arrives with a `?code=`. Resolves with
 * { port, waitForCode } so the caller can build the redirect_uri from the chosen port BEFORE the user
 * consents.
 */
function startLoopbackServer(): Promise<{
  port: number;
  waitForCode: () => Promise<string>;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    let resolveCode: (code: string) => void;
    let rejectCode: (err: Error) => void;
    const codePromise = new Promise<string>((res, rej) => {
      resolveCode = res;
      rejectCode = rej;
    });

    const server = http.createServer((req, res) => {
      try {
        const u = new URL(req.url ?? "/", `http://127.0.0.1`);
        const code = u.searchParams.get("code");
        const err = u.searchParams.get("error");
        if (err) {
          res.writeHead(400, { "content-type": "text/plain" });
          res.end(`OAuth error: ${err}. You can close this tab.`);
          rejectCode(new Error(`OAuth consent returned error="${err}"`));
          return;
        }
        if (code) {
          res.writeHead(200, { "content-type": "text/html" });
          res.end(
            "<html><body><h2>Authorized ✓</h2><p>You can close this tab and return to the terminal.</p></body></html>",
          );
          resolveCode(code);
          return;
        }
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("waiting for the OAuth redirect…");
      } catch (e) {
        rejectCode(e instanceof Error ? e : new Error(String(e)));
      }
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("failed to bind an ephemeral loopback port"));
        return;
      }
      resolve({
        port: addr.port,
        waitForCode: () => codePromise,
        close: () => server.close(),
      });
    });
  });
}

async function main(): Promise<void> {
  console.log("YouTube OAuth login helper (#1069) — Desktop-app loopback flow\n");
  console.log(
    "Pre-req: GCP project + YouTube Data API v3 enabled + consent screen PUBLISHED TO PRODUCTION + a\n" +
      "Desktop OAuth client. See docs/youtube-oauth-setup.md.\n",
  );

  const clientId = await readCred("YOUTUBE_CLIENT_ID", "OAuth Client ID");
  const clientSecret = await readCred("YOUTUBE_CLIENT_SECRET", "OAuth Client secret");

  const { port, waitForCode, close } = await startLoopbackServer();
  const redirectUri = loopbackRedirectUri(port);
  const authUrl = buildAuthUrl({ clientId, redirectUri });

  console.log(`\nLoopback listening on ${redirectUri}\n`);
  console.log("Open this URL, sign in as the @ansonlam9488 owner, and click through the");
  console.log("'unverified app' warning (Advanced → Go to …), then approve:\n");
  console.log(`  ${authUrl}\n`);
  tryOpenBrowser(authUrl);

  let code: string;
  try {
    code = await waitForCode();
  } finally {
    close();
  }
  console.log("\n✓ Authorization code received. Exchanging for tokens…");

  const tokens = await exchangeCodeForTokens({
    code,
    creds: { clientId, clientSecret },
    redirectUri,
  });

  if (!tokens.refresh_token) {
    console.error(
      "\n⚠️  No refresh_token in the response (only an access token). Google already consented once.\n" +
        "   Revoke access at https://myaccount.google.com/permissions and re-run this helper\n" +
        "   (Google only returns a refresh token on FIRST consent or with prompt=consent).",
    );
    process.exit(2);
  }

  console.log("\n✓ Refresh token minted. It is long-lived (app is in production).\n");
  const store = (
    await prompt(
      "Store all three secrets (CLIENT_ID + CLIENT_SECRET + REFRESH_TOKEN) into the macOS Keychain now? [y/N]: ",
    )
  )
    .toLowerCase()
    .startsWith("y");

  if (store) {
    // Store all THREE secrets in one run so the upload adapter (which reads CLIENT_ID, CLIENT_SECRET,
    // and REFRESH_TOKEN env-first→Keychain) finds a complete set after a single login.
    //
    // SECRET-PASSING NOTE: each value is passed to `security` as an execFileSync arg (the `-w <value>`
    // argv slot), NOT via stdin. Because execFileSync runs `security` directly (NO shell), the value
    // never touches shell history; it is briefly visible to a local `ps` during the sub-second call —
    // an accepted tradeoff for a one-time local operator run. `-U` updates in place (idempotent if a
    // secret was already stored), so re-running with 'y' is safe. Values are NEVER printed — only names.
    const user = process.env.USER ?? "";
    try {
      // YOUTUBE_CLIENT_ID
      execFileSync(
        "security",
        ["add-generic-password", "-U", "-a", user, "-s", "YOUTUBE_CLIENT_ID", "-w", clientId],
        { stdio: ["ignore", "ignore", "inherit"] },
      );
      console.log("✓ Stored in Keychain as service 'YOUTUBE_CLIENT_ID'. (value not printed)");
      // YOUTUBE_CLIENT_SECRET
      execFileSync(
        "security",
        ["add-generic-password", "-U", "-a", user, "-s", "YOUTUBE_CLIENT_SECRET", "-w", clientSecret],
        { stdio: ["ignore", "ignore", "inherit"] },
      );
      console.log("✓ Stored in Keychain as service 'YOUTUBE_CLIENT_SECRET'. (value not printed)");
      // YOUTUBE_REFRESH_TOKEN
      execFileSync(
        "security",
        ["add-generic-password", "-U", "-a", user, "-s", "YOUTUBE_REFRESH_TOKEN", "-w", tokens.refresh_token],
        { stdio: ["ignore", "ignore", "inherit"] },
      );
      console.log("✓ Stored in Keychain as service 'YOUTUBE_REFRESH_TOKEN'. (value not printed)");
      console.log("\n✓ All three Keychain entries are in place. Nothing was printed.");
    } catch (e) {
      console.error("Keychain store failed:", e instanceof Error ? e.message : String(e));
      console.error(
        "Store the rest manually (each -w with no value prompts you):\n" +
          "  security add-generic-password -U -a \"$USER\" -s YOUTUBE_CLIENT_ID     -w\n" +
          "  security add-generic-password -U -a \"$USER\" -s YOUTUBE_CLIENT_SECRET -w\n" +
          "  security add-generic-password -U -a \"$USER\" -s YOUTUBE_REFRESH_TOKEN -w",
      );
      process.exit(1);
    }
  } else {
    console.log(
      "\nNot stored. Printing the refresh token ONCE — copy it into the Keychain yourself, then clear\n" +
        "your terminal scrollback. Do NOT paste it into chat or commit it:\n",
    );
    console.log(tokens.refresh_token);
    console.log(
      "\nStore the refresh token with (then clear scrollback):\n" +
        "  security add-generic-password -U -a \"$USER\" -s YOUTUBE_REFRESH_TOKEN -w",
    );
    console.log(
      "\nYou ALSO still need the Client ID + secret in the Keychain for uploads — either re-run this\n" +
        "helper and answer 'y', or store them manually:\n" +
        "  security add-generic-password -U -a \"$USER\" -s YOUTUBE_CLIENT_ID     -w\n" +
        "  security add-generic-password -U -a \"$USER\" -s YOUTUBE_CLIENT_SECRET -w",
    );
  }

  console.log(
    "\nDone. A single 'y' run stores all three (CLIENT_ID + CLIENT_SECRET + REFRESH_TOKEN); confirm\n" +
      "they exist, then tell the orchestrator 'OAuth done, go'.",
  );
}

main().catch((err) => {
  console.error("youtube-auth FAILED:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
