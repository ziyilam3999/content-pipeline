/**
 * Unit tests for the REAL Typefully v2 client (#786) — fetch is MOCKED, zero real network.
 *
 * Proves: the 3-step presigned upload sequence (POST init → PUT raw bytes → poll until ready),
 * the createDraft body shape (platforms.x with 5 posts + media on post[0], platforms.threads
 * with 1 post + media, NO publish_at), the Authorization: Bearer header on auth'd calls, and
 * that the API key never leaks into a thrown error.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  TypefullyClient,
  TYPEFULLY_API_BASE,
  type FetchLike,
  type CreateDraftBody,
  type DraftPost,
} from "../typefully";

const KEY = "tf-secret-key-DO-NOT-LEAK-123";

/** A recorded fetch call (url + the init we passed). */
interface Call {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body?: unknown;
}

/** Build a Response-like object that the client's await res.json()/text()/ok use. */
function jsonResponse(obj: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "ERR",
    json: async () => obj,
    text: async () => JSON.stringify(obj),
  } as unknown as Response;
}

function headersToObject(h: RequestInit["headers"]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  if (Array.isArray(h)) for (const [k, v] of h) out[k] = v;
  else if (h instanceof Map) for (const [k, v] of h) out[k] = String(v);
  else for (const [k, v] of Object.entries(h as Record<string, string>)) out[k] = v;
  return out;
}

function tmpFile(name: string, bytes: Buffer): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lcp-tf-test-"));
  const p = path.join(dir, name);
  fs.writeFileSync(p, bytes);
  return p;
}

describe("TypefullyClient — auth", () => {
  it("verifyAuth GETs /v2/me with the Bearer header", async () => {
    const calls: Call[] = [];
    const fetchImpl: FetchLike = (async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method, headers: headersToObject(init.headers), body: init.body });
      return jsonResponse({ username: "anson3999" });
    }) as unknown as FetchLike;

    const client = new TypefullyClient({ fetchImpl, keySource: { envVar: "TF_TEST_KEY" } });
    process.env.TF_TEST_KEY = KEY;
    const me = await client.verifyAuth();

    expect(me).toMatchObject({ username: "anson3999" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${TYPEFULLY_API_BASE}/me`);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].headers.Authorization).toBe(`Bearer ${KEY}`);
  });
});

describe("TypefullyClient — getDraft / deleteDraft reuse the Bearer auth (no raw-fetch / X-API-KEY footgun)", () => {
  // Root cause this guards (#872): a one-off draft retire was hand-rolled as a raw fetch with a GUESSED
  // `X-API-KEY` header → 401. The fix is to go THROUGH the client so the correct `Authorization: Bearer`
  // (the auth SSOT) is reused. These tests prove BOTH ends: the client's calls carry Bearer, and NEVER
  // the wrong `X-API-KEY` scheme.
  it("getDraft GETs the draft URL with the Bearer header (never X-API-KEY)", async () => {
    process.env.TF_TEST_KEY = KEY;
    const calls: Call[] = [];
    const fetchImpl: FetchLike = (async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method, headers: headersToObject(init.headers), body: init.body });
      return jsonResponse({ id: "9490878", status: "draft" });
    }) as unknown as FetchLike;

    const client = new TypefullyClient({ fetchImpl, keySource: { envVar: "TF_TEST_KEY" } });
    const draft = await client.getDraft(312308, "9490878");

    expect(draft).toMatchObject({ id: "9490878", status: "draft" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${TYPEFULLY_API_BASE}/social-sets/312308/drafts/9490878`);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(calls[0].headers["X-API-KEY"]).toBeUndefined(); // the wrong scheme that caused the 401
  });

  it("deleteDraft DELETEs the draft URL with the Bearer header (never X-API-KEY)", async () => {
    process.env.TF_TEST_KEY = KEY;
    const calls: Call[] = [];
    const fetchImpl: FetchLike = (async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method, headers: headersToObject(init.headers), body: init.body });
      return jsonResponse({}, true, 204);
    }) as unknown as FetchLike;

    const client = new TypefullyClient({ fetchImpl, keySource: { envVar: "TF_TEST_KEY" } });
    await client.deleteDraft(312308, "9490878");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${TYPEFULLY_API_BASE}/social-sets/312308/drafts/9490878`);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(calls[0].headers["X-API-KEY"]).toBeUndefined();
  });

  it("deleteDraft surfaces a non-ok response as a thrown error (caller must confirm it's a draft first)", async () => {
    process.env.TF_TEST_KEY = KEY;
    const fetchImpl: FetchLike = (async () =>
      jsonResponse({ detail: "not found" }, false, 404)) as unknown as FetchLike;
    const client = new TypefullyClient({ fetchImpl, keySource: { envVar: "TF_TEST_KEY" } });
    await expect(client.deleteDraft(312308, "missing")).rejects.toThrow(/deleteDraft/);
  });
});

describe("TypefullyClient — uploadMedia 3-step presigned flow", () => {
  it("POST init → PUT raw bytes (no auth header) → poll until ready, returns media_id", async () => {
    process.env.TF_TEST_KEY = KEY;
    const fileBytes = Buffer.from("FAKEMP4BYTES", "utf8");
    const filePath = tmpFile("demo-1x1.mp4", fileBytes);
    const presignedUrl = "https://uploads.example.com/presigned/abc?sig=xyz";

    const calls: Call[] = [];
    let pollCount = 0;
    const fetchImpl: FetchLike = (async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method, headers: headersToObject(init.headers), body: init.body });
      if (url.endsWith("/media/upload")) {
        return jsonResponse({ media_id: "media_42", upload_url: presignedUrl });
      }
      if (url === presignedUrl) {
        return jsonResponse({}, true, 200); // PUT bytes accepted
      }
      // poll endpoint: "processing" first, then "ready"
      pollCount += 1;
      return jsonResponse({ status: pollCount >= 2 ? "ready" : "processing" });
    }) as unknown as FetchLike;

    const client = new TypefullyClient({
      fetchImpl,
      keySource: { envVar: "TF_TEST_KEY" },
      pollIntervalMs: 1,
      pollTimeoutMs: 5000,
    });
    const mediaId = await client.uploadMedia(312308, filePath);

    expect(mediaId).toBe("media_42");

    // Step 1 — POST init with file_name and Bearer.
    const init = calls[0];
    expect(init.url).toBe(`${TYPEFULLY_API_BASE}/social-sets/312308/media/upload`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(init.body as string)).toEqual({ file_name: "demo-1x1.mp4" });

    // Step 2 — PUT the raw bytes to the presigned URL, NO auth header.
    const put = calls[1];
    expect(put.url).toBe(presignedUrl);
    expect(put.method).toBe("PUT");
    expect(put.headers.Authorization).toBeUndefined();
    expect(Buffer.from(put.body as Buffer)).toEqual(fileBytes);

    // Step 3 — at least one poll on the media-status endpoint, ending "ready".
    const polls = calls.slice(2);
    expect(polls.length).toBeGreaterThanOrEqual(2);
    for (const p of polls) {
      expect(p.url).toBe(`${TYPEFULLY_API_BASE}/social-sets/312308/media/media_42`);
      expect(p.method).toBe("GET");
    }
  });

  it("throws when media processing reports failed", async () => {
    process.env.TF_TEST_KEY = KEY;
    const filePath = tmpFile("demo-4x5.mp4", Buffer.from("x"));
    const fetchImpl: FetchLike = (async (url: string) => {
      if (url.endsWith("/media/upload")) {
        return jsonResponse({ media_id: "m1", upload_url: "https://up.example/p" });
      }
      if (url === "https://up.example/p") return jsonResponse({}, true);
      return jsonResponse({ status: "failed" });
    }) as unknown as FetchLike;

    const client = new TypefullyClient({ fetchImpl, keySource: { envVar: "TF_TEST_KEY" }, pollIntervalMs: 1 });
    await expect(client.uploadMedia(312308, filePath)).rejects.toThrow(/failed/i);
  });
});

describe("TypefullyClient — createDraft body shape (DRAFT, not publish)", () => {
  function buildBody(): CreateDraftBody {
    const xThread = ["t1", "t2", "t3", "t4", "t5"];
    const xPosts: DraftPost[] = xThread.map((text, i) =>
      i === 0 ? { text, media_ids: ["media_1x1"] } : { text },
    );
    return {
      platforms: {
        x: { enabled: true, posts: xPosts },
        threads: { enabled: true, posts: [{ text: "threads body", media_ids: ["media_4x5"] }] },
      },
      draft_title: "lfah launch",
      share: false,
    };
  }

  it("POSTs the v2 draft body: x 5 posts (media on post0 only), threads 1 post w/ media, NO publish_at", async () => {
    process.env.TF_TEST_KEY = KEY;
    const calls: Call[] = [];
    const fetchImpl: FetchLike = (async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method, headers: headersToObject(init.headers), body: init.body });
      return jsonResponse({ id: "draft_99", status: "draft" });
    }) as unknown as FetchLike;

    const client = new TypefullyClient({ fetchImpl, keySource: { envVar: "TF_TEST_KEY" } });
    const res = await client.createDraft(312308, buildBody());

    expect(res).toMatchObject({ id: "draft_99", status: "draft" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${TYPEFULLY_API_BASE}/social-sets/312308/drafts`);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers.Authorization).toBe(`Bearer ${KEY}`);

    const sent = JSON.parse(calls[0].body as string);
    // X: exactly 5 posts; media only on post[0].
    expect(sent.platforms.x.enabled).toBe(true);
    expect(sent.platforms.x.posts).toHaveLength(5);
    expect(sent.platforms.x.posts[0].media_ids).toEqual(["media_1x1"]);
    for (let i = 1; i < 5; i++) {
      expect(sent.platforms.x.posts[i].media_ids).toBeUndefined();
    }
    // Threads: exactly 1 post, with media.
    expect(sent.platforms.threads.enabled).toBe(true);
    expect(sent.platforms.threads.posts).toHaveLength(1);
    expect(sent.platforms.threads.posts[0].media_ids).toEqual(["media_4x5"]);
    // DRAFT, not publish.
    expect("publish_at" in sent).toBe(false);
    expect(sent.share).toBe(false);
    expect(sent.draft_title).toBe("lfah launch");
  });

  it("refuses to send a body that carries publish_at (would schedule a publish)", async () => {
    process.env.TF_TEST_KEY = KEY;
    const fetchImpl: FetchLike = (async () => jsonResponse({ id: "x", status: "draft" })) as unknown as FetchLike;
    const client = new TypefullyClient({ fetchImpl, keySource: { envVar: "TF_TEST_KEY" } });
    const bad = { ...buildBody(), publish_at: "2030-01-01T00:00:00Z" } as unknown as CreateDraftBody;
    await expect(client.createDraft(312308, bad)).rejects.toThrow(/publish_at/);
  });
});

describe("TypefullyClient — key never leaks", () => {
  it("a network error message does NOT contain the API key", async () => {
    process.env.TF_TEST_KEY = KEY;
    const fetchImpl: FetchLike = (async () => {
      throw new Error("ECONNRESET to api.typefully.com");
    }) as unknown as FetchLike;
    const client = new TypefullyClient({ fetchImpl, keySource: { envVar: "TF_TEST_KEY" } });

    let thrown: unknown;
    try {
      await client.verifyAuth();
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).not.toContain(KEY);
  });

  it("an HTTP-error body surfacing does NOT echo the key", async () => {
    process.env.TF_TEST_KEY = KEY;
    const fetchImpl: FetchLike = (async () =>
      jsonResponse({ error: "unauthorized" }, false, 401)) as unknown as FetchLike;
    const client = new TypefullyClient({ fetchImpl, keySource: { envVar: "TF_TEST_KEY" } });

    let thrown: unknown;
    try {
      await client.verifyAuth();
    } catch (e) {
      thrown = e;
    }
    expect((thrown as Error).message).toContain("401");
    expect((thrown as Error).message).not.toContain(KEY);
  });
});
