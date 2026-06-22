/**
 * #1068 — unit tests for the PURE OAuth helper logic (adapters/youtubeAuth.ts).
 *
 * Zero network: buildAuthUrl is pure; exchangeCodeForTokens uses an injected mock fetch. Both-ends:
 * buildAuthUrl requires a clientId + port/redirectUri (throws otherwise); exchangeCodeForTokens POSTs
 * an authorization_code grant and returns the mock refresh_token (and surfaces a missing access_token).
 */
import {
  buildAuthUrl,
  exchangeCodeForTokens,
  loopbackRedirectUri,
  GOOGLE_TOKEN_URL,
  YOUTUBE_UPLOAD_SCOPE,
  type AuthCodeTokenResponse,
} from "../youtubeAuth";
import type { FetchLike } from "../youtube";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("buildAuthUrl", () => {
  it("contains the youtube.force-ssl scope, access_type=offline, prompt=consent, and a 127.0.0.1 loopback redirect", () => {
    const url = buildAuthUrl({ clientId: "cid.apps.googleusercontent.com", port: 49321 });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("scope")).toBe(YOUTUBE_UPLOAD_SCOPE);
    // #1132: lock the BROADER scope — force-ssl covers upload + title/description/privacy
    // edits, pinned comments, and playlists. A revert to the upload-only scope trips this
    // (both-ends guard).
    expect(YOUTUBE_UPLOAD_SCOPE).toContain("youtube.force-ssl");
    expect(parsed.searchParams.get("access_type")).toBe("offline");
    expect(parsed.searchParams.get("prompt")).toBe("consent");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:49321");
    expect(parsed.searchParams.get("client_id")).toBe("cid.apps.googleusercontent.com");
  });

  it("honors an explicit redirectUri + state", () => {
    const url = buildAuthUrl({
      clientId: "cid",
      redirectUri: loopbackRedirectUri(8080),
      state: "xyz",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:8080");
    expect(parsed.searchParams.get("state")).toBe("xyz");
  });

  it("FAIL end: throws without a clientId", () => {
    expect(() => buildAuthUrl({ clientId: "", port: 1234 })).toThrow(/clientId/);
  });

  it("FAIL end: throws without a port or redirectUri", () => {
    expect(() => buildAuthUrl({ clientId: "cid" })).toThrow(/port/);
  });
});

describe("exchangeCodeForTokens", () => {
  it("POSTs grant_type=authorization_code and returns the mock refresh_token (no network)", async () => {
    let seenUrl = "";
    let seenBody = "";
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      seenUrl = String(url);
      seenBody = String(init?.body);
      return jsonResponse({
        access_token: "AT-1",
        refresh_token: "1//REFRESH-FROM-MOCK",
        expires_in: 3599,
      } satisfies AuthCodeTokenResponse);
    }) as unknown as FetchLike;

    const out = await exchangeCodeForTokens({
      code: "auth-code-123",
      creds: { clientId: "cid", clientSecret: "secret" },
      redirectUri: "http://127.0.0.1:49321",
      fetchImpl,
    });

    expect(out.refresh_token).toBe("1//REFRESH-FROM-MOCK");
    expect(seenUrl).toBe(GOOGLE_TOKEN_URL);
    expect(seenBody).toContain("grant_type=authorization_code");
    expect(seenBody).toContain("code=auth-code-123");
    expect(seenBody).toContain("redirect_uri=http");
  });

  it("FAIL end: throws on a non-OK response (without leaking the client secret)", async () => {
    const fetchImpl = (async () =>
      new Response("invalid_grant", { status: 400, statusText: "Bad Request" })) as unknown as FetchLike;
    let msg = "";
    try {
      await exchangeCodeForTokens({
        code: "c",
        creds: { clientId: "cid", clientSecret: "TOPSECRET" },
        redirectUri: "http://127.0.0.1:1",
        fetchImpl,
      });
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(msg).toMatch(/HTTP 400/);
    expect(msg).not.toContain("TOPSECRET");
  });

  it("FAIL end: throws when required args are missing", async () => {
    await expect(
      exchangeCodeForTokens({
        code: "",
        creds: { clientId: "cid", clientSecret: "s" },
        redirectUri: "http://127.0.0.1:1",
      }),
    ).rejects.toThrow(/code is required/);
  });
});
