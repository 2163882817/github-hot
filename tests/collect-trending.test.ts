import assert from "node:assert/strict";
import { test } from "node:test";
import { collectTrendingSnapshot, TrendingCollectionError } from "../worker/collect-trending";
import type { SnapshotPublication, SnapshotPool } from "../lib/snapshot-store";

function page(period: "daily" | "monthly", rows: Array<[string, number]> = [["first", 10], ["second", 20]]): string {
  const unit = period === "daily" ? "today" : "this month";
  return rows.map(([name, stars]) =>
    '<article class="Box-row"><h2><a href="/demo/' + name + '">' + name + '</a></h2><span class="float-sm-right">' + stars + ' stars ' + unit + '</span></article>'
  ).join("");
}

const pool = {} as SnapshotPool;
const at = "2026-10-19T08:00:00.000Z";
const metadataClient = {
  get: async (fullName: string) => ({
    id: fullName === "demo/first" ? "101" : "102",
    fullName,
    url: "https://github.com/" + fullName,
    descriptionOriginal: null,
    language: "TypeScript",
    totalStars: 100,
    metadataUpdatedAt: at
  })
};

test("collects a language page and publishes ordered fresh period stars", async () => {
  let published: SnapshotPublication | undefined;
  let requestUrl = "";
  const result = await collectTrendingSnapshot({
    period: "monthly", languageSlug: "TypeScript", pool, metadataClient,
    now: () => Date.parse(at),
    fetchImpl: async (url, init) => {
      requestUrl = String(url);
      assert.equal(new Headers(init?.headers).get("accept"), "text/html");
      return new Response(page("monthly"), { headers: { "content-type": "text/html; charset=utf-8" } });
    },
    publish: async (_pool, input) => { published = input; return { published: true, snapshotId: "snapshot-1" }; }
  });
  assert.equal(requestUrl, "https://github.com/trending/typescript?since=monthly");
  assert.equal(result.sourceUrl, requestUrl);
  assert.equal(result.publishedCount, 2);
  assert.equal(result.skippedCount, 0);
  assert.equal(result.collectedAt, at);
  assert.equal(published?.collectedAt, at);
  assert.deepEqual(published?.repositories.map((item) => [item.fullName, item.periodStars, item.originalIndex]), [
    ["demo/second", 20, 1], ["demo/first", 10, 0]
  ]);
});

test("skips one unavailable metadata record without inventing an ID", async () => {
  let published: SnapshotPublication | undefined;
  const result = await collectTrendingSnapshot({
    period: "daily", languageSlug: "all", pool,
    metadataClient: {
      get: async (name) => {
        if (name === "demo/second") throw new Error("not found");
        return metadataClient.get(name);
      }
    },
    fetchImpl: async () => new Response(page("daily"), { headers: { "content-type": "text/html" } }),
    publish: async (_pool, input) => { published = input; return { published: true, snapshotId: "snapshot-2" }; }
  });
  assert.equal(result.parsedCount, 2);
  assert.equal(result.publishedCount, 1);
  assert.equal(result.skippedCount, 1);
  assert.deepEqual(published?.repositories.map((item) => item.fullName), ["demo/first"]);
});

test("an empty or broken page and zero valid repositories never reach publication", async () => {
  let publishCalls = 0;
  const publish = async () => { publishCalls++; return { published: true, snapshotId: "bad" }; };
  const common = { period: "daily" as const, languageSlug: "all", pool, publish };
  await assert.rejects(collectTrendingSnapshot({
    ...common, metadataClient,
    fetchImpl: async () => new Response("<html></html>", { headers: { "content-type": "text/html" } })
  }));
  await assert.rejects(collectTrendingSnapshot({
    ...common, metadataClient: { get: async () => { throw new Error("rate limited"); } },
    fetchImpl: async () => new Response(page("daily"), { headers: { "content-type": "text/html" } })
  }), (error: unknown) => error instanceof TrendingCollectionError && error.code === "NO_VALID_REPOSITORIES");
  assert.equal(publishCalls, 0);
});

test("upstream errors, incorrect content types and oversized pages preserve the old snapshot", async () => {
  let publishCalls = 0;
  const publish = async () => { publishCalls++; return { published: true, snapshotId: "bad" }; };
  const common = { period: "daily" as const, languageSlug: "all", pool, metadataClient, publish };
  const failures: Array<{ fetchImpl: typeof fetch; code: string }> = [
    { fetchImpl: async () => { throw new Error("network down"); }, code: "UPSTREAM_FAILED" },
    { fetchImpl: async () => new Response("bad", { status: 503 }), code: "UPSTREAM_FAILED" },
    { fetchImpl: async () => new Response("{}", { headers: { "content-type": "application/json" } }), code: "INVALID_RESPONSE" },
    { fetchImpl: async () => new Response("x".repeat(2_000_001), { headers: { "content-type": "text/html" } }), code: "INVALID_RESPONSE" }
  ];
  for (const failure of failures) {
    await assert.rejects(collectTrendingSnapshot({ ...common, fetchImpl: failure.fetchImpl }),
      (error: unknown) => error instanceof TrendingCollectionError && error.code === failure.code);
  }
  assert.equal(publishCalls, 0);
});
