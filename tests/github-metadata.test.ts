import assert from "node:assert/strict";
import { test } from "node:test";
import {
  enrichTrendingCandidates,
  GitHubMetadataCache,
  GitHubMetadataClient,
  GitHubRateLimitError
} from "../worker/github-metadata";

const responseBody = {
  id: 123456,
  full_name: "example/project",
  html_url: "https://github.com/example/project",
  description: "An example",
  language: "TypeScript",
  stargazers_count: 1500
};

function jsonResponse(body: unknown = responseBody, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers });
}

test("loads stable repository ID and metadata without hardcoding period stars", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new GitHubMetadataClient({
    token: "test-token",
    now: () => Date.parse("2026-10-19T08:00:00Z"),
    fetchImpl: async (url, init) => { requests.push({ url: String(url), init }); return jsonResponse(); }
  });
  const enriched = await enrichTrendingCandidates([{ fullName: "example/project", periodStars: 85, originalIndex: 3 }], client);
  assert.equal(enriched.repositories[0].metadata.id, "123456");
  assert.equal(enriched.repositories[0].metadata.totalStars, 1500);
  assert.equal(enriched.repositories[0].periodStars, 85);
  assert.equal(enriched.repositories[0].metadata.metadataUpdatedAt, "2026-10-19T08:00:00.000Z");
  assert.equal(requests[0].url, "https://api.github.com/repos/example/project");
  const headers = new Headers(requests[0].init?.headers);
  assert.equal(headers.get("authorization"), "Bearer test-token");
  assert.equal(headers.get("x-github-api-version"), "2026-03-10");
  assert.equal((await client.get("example/project")).id, "123456");
  assert.equal(requests.length, 1);
});

test("concurrent lookup is deduplicated and stale metadata is revalidated with ETag", async () => {
  let now = 1000;
  let calls = 0;
  const client = new GitHubMetadataClient({
    cache: new GitHubMetadataCache(), cacheTtlMs: 500,
    now: () => now,
    fetchImpl: async (_url, init) => {
      calls++;
      if (calls === 1) return jsonResponse(responseBody, { ETag: '"abc"' });
      assert.equal(new Headers(init?.headers).get("if-none-match"), '"abc"');
      return new Response(null, { status: 304 });
    }
  });
  const [left, right] = await Promise.all([client.get("example/project"), client.get("example/project")]);
  assert.deepEqual(left, right);
  assert.equal(calls, 1);
  now += 1000;
  assert.deepEqual(await client.get("example/project"), left);
  assert.equal(calls, 2);
});

test("rate limit records retry time and falls back only to previously valid metadata", async () => {
  let now = 1000;
  let calls = 0;
  const client = new GitHubMetadataClient({
    now: () => now, cacheTtlMs: 100, maxStaleMs: 60_000,
    fetchImpl: async () => {
      calls++;
      return calls === 1 ? jsonResponse() : new Response(null, { status: 429, headers: { "Retry-After": "2" } });
    }
  });
  const previous = await client.get("example/project");
  now += 1000;
  assert.deepEqual(await client.get("example/project"), previous);
  now += 1000;
  assert.deepEqual(await client.get("example/project"), previous);
  assert.equal(calls, 2);

  const withoutCache = new GitHubMetadataClient({
    now: () => now,
    fetchImpl: async () => new Response(null, { status: 403, headers: { "Retry-After": "5" } })
  });
  await assert.rejects(withoutCache.get("new/repository"), (error: unknown) => error instanceof GitHubRateLimitError && error.retryAt === now + 5000);
});

test("invalid metadata and unavailable uncached repositories are skipped", async () => {
  const client = new GitHubMetadataClient({
    fetchImpl: async () => jsonResponse({ ...responseBody, id: null })
  });
  const result = await enrichTrendingCandidates([
    { fullName: "example/project", periodStars: 100, originalIndex: 0 }
  ], client);
  assert.equal(result.repositories.length, 0);
  assert.deepEqual(result.skipped, [{ fullName: "example/project", reason: "metadata_unavailable" }]);
});

test("enrichment limits concurrency and keeps candidate ordering", async () => {
  let active = 0;
  let peak = 0;
  const candidates = Array.from({ length: 5 }, (_, originalIndex) => ({ fullName: "owner/repo" + originalIndex, periodStars: 5 - originalIndex, originalIndex }));
  const result = await enrichTrendingCandidates(candidates, {
    get: async (fullName) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, fullName.endsWith("0") ? 10 : 1));
      active--;
      return { id: fullName, fullName, url: "https://github.com/" + fullName, descriptionOriginal: null, language: null, totalStars: 0, metadataUpdatedAt: "2026-10-19T08:00:00Z" };
    }
  }, 2);
  assert.equal(peak, 2);
  assert.deepEqual(result.repositories.map((item) => item.fullName), candidates.map((item) => item.fullName));
});
