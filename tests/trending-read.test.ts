import assert from "node:assert/strict";
import { test } from "node:test";
import { readTrending, type QueryDatabase } from "../lib/trending-read";

const updated = new Date("2026-10-19T08:00:00Z");
const now = new Date("2026-10-19T08:30:00Z");
const url = "http://localhost:3000/api/v1/trending";

function fakeDatabase(header: Record<string, unknown>, items: Array<Record<string, unknown>> = []) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const database: QueryDatabase = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.startsWith("SELECT s.id")) return { rows: [header] };
      if (sql.startsWith("SELECT github_id")) return { rows: items };
      return { rows: [] };
    }
  };
  return { database, calls };
}

const header = {
  id: "b9cbfc94-a26f-4efa-ad01-78e6e45ccf99",
  source_url: "https://github.com/trending?since=daily",
  collected_at: updated,
  created_at: updated,
  item_count: 1,
  latest_attempt_at: null,
  latest_attempt_status: null,
  last_success_at: updated,
  requested_at: null
};

const item = {
  github_id: "123456", rank: 1,
  full_name_at_capture: "demo/repo",
  url_at_capture: "https://github.com/demo/repo",
  description_original_at_capture: "Original description",
  primary_language_at_capture: "TypeScript",
  total_stars_at_capture: 310,
  period_stars: 21,
  metadata_updated_at: updated
};

test("serves the complete stored snapshot with UTC timestamps and no extra fields", async () => {
  const { database, calls } = fakeDatabase(header, [item]);
  const result = await readTrending(database, url, now);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    status: "ready",
    snapshotId: header.id,
    period: "daily",
    language: "all",
    sourceUrl: header.source_url,
    collectedAt: "2026-10-19T08:00:00.000Z",
    lastSuccessfulAt: "2026-10-19T08:00:00.000Z",
    stale: false,
    repositories: [{
      id: "123456", rank: 1, fullName: "demo/repo", url: item.url_at_capture,
      descriptionOriginal: "Original description", language: "TypeScript",
      totalStars: 310, periodStars: 21, period: "daily",
      collectedAt: "2026-10-19T08:00:00.000Z",
      metadataUpdatedAt: "2026-10-19T08:00:00.000Z"
    }]
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].values, ["daily", "all"]);
});

test("missing first snapshot queues a refresh and returns pending", async () => {
  const { database, calls } = fakeDatabase({ id: null, last_success_at: null, latest_attempt_at: null, latest_attempt_status: null });
  const result = await readTrending(database, url, now);
  assert.deepEqual(result, { status: 202, body: { status: "pending", retryAfterSeconds: 15 } });
  assert.equal(calls[1].sql.startsWith("INSERT INTO collection_jobs"), true);
  assert.deepEqual(calls[1].values, ["daily", "all", now.toISOString(), now.toISOString()]);
  assert.equal(calls.length, 2);
});

test("failed first collection returns unavailable and throttles immediate requeue", async () => {
  const { database, calls } = fakeDatabase({
    id: null, last_success_at: null, latest_attempt_at: new Date("2026-10-19T08:29:30Z"),
    latest_attempt_status: "failed", requested_at: null
  });
  const result = await readTrending(database, url, now);
  assert.deepEqual(result, {
    status: 503,
    body: { status: "unavailable", retryAfterSeconds: 60, messageCode: "COLLECTION_FAILED" }
  });
  assert.equal(calls[1].values?.[2], null);
  assert.equal(calls.length, 2);
});

test("expired successful snapshot remains readable, is stale, and requests refresh", async () => {
  const { database, calls } = fakeDatabase(header, [item]);
  const late = new Date("2026-10-19T09:31:00Z");
  const result = await readTrending(database, url, late);
  assert.equal(result.status, 200);
  assert.equal(result.body.status, "ready");
  if (result.body.status !== "ready") return;
  assert.equal(result.body.stale, true);
  assert.equal(result.body.repositories.length, 1);
  assert.equal(calls[1].sql.startsWith("INSERT INTO collection_jobs"), true);
  assert.equal(calls[1].values?.[2], late.toISOString());
});

test("failed refresh marks the existing snapshot stale even before 90 minutes", async () => {
  const { database } = fakeDatabase({
    ...header, latest_attempt_at: new Date("2026-10-19T08:20:00Z"), latest_attempt_status: "failed"
  }, [item]);
  const result = await readTrending(database, url, now);
  assert.equal(result.status, 200);
  assert.equal(result.body.status, "ready");
  if (result.body.status === "ready") assert.equal(result.body.stale, true);
});

test("rejects malformed parameters and unregistered language slugs", async () => {
  const { database, calls } = fakeDatabase({ id: null, last_success_at: null, latest_attempt_at: null, requested_at: null });
  for (const query of ["?period=weekly", "?period=daily&period=monthly", "?language=TypeScript", "?language=invalid/path"]) {
    assert.deepEqual(await readTrending(database, url + query, now), { status: 400, body: { error: "INVALID_QUERY" } });
  }
  assert.deepEqual(await readTrending(database, url + "?language=typescript", now), { status: 400, body: { error: "INVALID_QUERY" } });
  assert.equal(calls.length, 1);
});

test("registered single-language snapshot is scoped to that language and period", async () => {
  const { database, calls } = fakeDatabase({ ...header, source_url: "https://github.com/trending/typescript?since=monthly" }, [item]);
  const result = await readTrending(database, url + "?period=monthly&language=typescript", now);
  assert.equal(result.status, 200);
  assert.equal(result.body.status, "ready");
  if (result.body.status === "ready") {
    assert.equal(result.body.period, "monthly");
    assert.equal(result.body.language, "typescript");
    assert.equal(result.body.repositories[0].period, "monthly");
  }
  assert.deepEqual(calls[0].values, ["monthly", "typescript"]);
});

test("incomplete snapshot is never returned as a partial ranking", async () => {
  const { database } = fakeDatabase({ ...header, item_count: 2 }, [item]);
  await assert.rejects(readTrending(database, url, now), /Incomplete stored snapshot/);
});
