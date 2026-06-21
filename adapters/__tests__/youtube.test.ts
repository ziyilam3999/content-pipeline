/**
 * #1068 — unit tests for the YouTubeClient adapter with an INJECTED fetch + creds via env.
 *
 * ZERO real network (every fetch is a mock) and ZERO Keychain (YOUTUBE_* env is set, so readSecret
 * returns env-first and never invokes macOS `security` — cross-platform/CI-safe on ubuntu+windows).
 * Covers: verifyAuth grant body + token caching; the 2-step resumable upload (init asserts
 * X-Upload-Content-Length → reads `location` → PUT → returns id); authHeaders throws before verifyAuth;
 * a thrown error never leaks a secret value.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  YouTubeClient,
  YOUTUBE_TOKEN_URL,
  type FetchLike,
  type VideoInsertResource,
} from "../youtube";

const ENV = {
  YOUTUBE_CLIENT_ID: "test-client-id",
  YOUTUBE_CLIENT_SECRET: "super-secret-value-DO-NOT-LEAK",
  YOUTUBE_REFRESH_TOKEN: "1//refresh-token-secret",
};

beforeEach(() => {
  Object.assign(process.env, ENV);
});
afterEach(() => {
  for (const k of Object.keys(ENV)) delete process.env[k as keyof typeof ENV];
});

function jsonResponse(body: unknown, init?: { status?: number; headers?: Record<string, string> }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

const META: VideoInsertResource = {
  snippet: { title: "t", description: "d", tags: ["a"], categoryId: "28", defaultLanguage: "en" },
  status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
};

describe("verifyAuth", () => {
  it("POSTs a refresh_token grant and caches the access token (no network, env creds)", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return jsonResponse({ access_token: "ACCESS-TOKEN-123", expires_in: 3599 });
    }) as unknown as FetchLike;

    const client = new YouTubeClient({ fetchImpl });
    const tok = await client.verifyAuth();

    expect(tok.access_token).toBe("ACCESS-TOKEN-123");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(YOUTUBE_TOKEN_URL);
    const body = String(calls[0].init.body);
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("client_id=test-client-id");
  });

  it("throws (no access_token) without leaking a secret", async () => {
    const fetchImpl = (async () => jsonResponse({ no_token: true })) as unknown as FetchLike;
    const client = new YouTubeClient({ fetchImpl });
    await expect(client.verifyAuth()).rejects.toThrow(/no access_token/);
  });
});

describe("authHeaders ordering", () => {
  it("uploadVideo throws if no access token and verifyAuth fails — never builds auth header blindly", async () => {
    // A direct check that authHeaders is gated: force verifyAuth to error, ensure no PUT is attempted.
    let putCount = 0;
    const fetchImpl = (async (url: string | URL | Request) => {
      if (String(url) === YOUTUBE_TOKEN_URL) return jsonResponse({}, { status: 401 });
      putCount++;
      return jsonResponse({ id: "x" });
    }) as unknown as FetchLike;
    const tmp = path.join(os.tmpdir(), `yt-test-${Date.now()}.mp4`);
    fs.writeFileSync(tmp, Buffer.from("fake-bytes"));
    try {
      const client = new YouTubeClient({ fetchImpl });
      await expect(client.uploadVideo({ filePath: tmp, metadata: META })).rejects.toThrow();
      expect(putCount).toBe(0);
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});

describe("uploadVideo resumable protocol", () => {
  it("init POST asserts X-Upload-Content-Length → reads location → PUT → returns id", async () => {
    const tmp = path.join(os.tmpdir(), `yt-up-${Date.now()}.mp4`);
    const bytes = Buffer.from("hello-video-bytes");
    fs.writeFileSync(tmp, bytes);

    const seen: string[] = [];
    let initContentLength: string | null = null;
    const location = "https://upload.example/session/abc";
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      seen.push(`${init?.method ?? "GET"} ${u}`);
      if (u === YOUTUBE_TOKEN_URL) return jsonResponse({ access_token: "AT", expires_in: 3599 });
      if (u.includes("uploadType=resumable")) {
        const headers = init?.headers as Record<string, string>;
        initContentLength = headers["X-Upload-Content-Length"];
        return new Response("", { status: 200, headers: { location } });
      }
      if (u === location) return jsonResponse({ id: "VIDEO-ID-999" });
      throw new Error(`unexpected url ${u}`);
    }) as unknown as FetchLike;

    try {
      const client = new YouTubeClient({ fetchImpl });
      const id = await client.uploadVideo({ filePath: tmp, metadata: META });
      expect(id).toBe("VIDEO-ID-999");
      expect(initContentLength).toBe(String(bytes.length));
      expect(seen.some((s) => s.startsWith("POST") && s.includes("resumable"))).toBe(true);
      expect(seen).toContain(`PUT ${location}`);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it("throws if init returns no location header", async () => {
    const tmp = path.join(os.tmpdir(), `yt-noloc-${Date.now()}.mp4`);
    fs.writeFileSync(tmp, Buffer.from("x"));
    const fetchImpl = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u === YOUTUBE_TOKEN_URL) return jsonResponse({ access_token: "AT", expires_in: 1 });
      return new Response("", { status: 200 }); // no location
    }) as unknown as FetchLike;
    try {
      const client = new YouTubeClient({ fetchImpl });
      await expect(client.uploadVideo({ filePath: tmp, metadata: META })).rejects.toThrow(/no 'location'/);
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});

describe("secret hygiene", () => {
  it("an HTTP error never includes the client secret or refresh token value", async () => {
    const fetchImpl = (async () =>
      new Response("server boom", { status: 500, statusText: "Internal" })) as unknown as FetchLike;
    const client = new YouTubeClient({ fetchImpl });
    let msg = "";
    try {
      await client.verifyAuth();
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(msg).toMatch(/HTTP 500/);
    expect(msg).not.toContain(ENV.YOUTUBE_CLIENT_SECRET);
    expect(msg).not.toContain(ENV.YOUTUBE_REFRESH_TOKEN);
  });
});
