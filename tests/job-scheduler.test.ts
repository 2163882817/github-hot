import assert from "node:assert/strict";
import { test } from "node:test";
import { claimNextJob, finishJob, LeaseLostError, renewJobLease, seedScheduledJobs } from "../worker/job-scheduler";
import type { QueryDatabase } from "../lib/trending-read";

const at = new Date("2026-10-19T08:00:00.000Z");

test("seeds all-language jobs and recently viewed languages in both periods", async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const database: QueryDatabase = { async query(sql, values) { calls.push({ sql, values }); return { rows: [] }; } };
  await seedScheduledJobs(database, at, 24);
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /\('daily', 'all'\), \('monthly', 'all'\)/);
  assert.match(calls[1].sql, /last_viewed_at >=/);
  assert.match(calls[1].sql, /jsonb_array_elements\(c.languages\)/);
  assert.deepEqual(calls[1].values, [at.toISOString(), 24]);
});

test("claim uses one atomic skip-locked update with a lease token", async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const database: QueryDatabase = {
    async query(sql, values) { calls.push({ sql, values }); return { rows: [{ period: "monthly", language_slug: "typescript" }] }; }
  };
  const job = await claimNextJob(database, at);
  assert.ok(job);
  assert.equal(job.period, "monthly");
  assert.equal(job.languageSlug, "typescript");
  assert.match(job.leaseToken, /^[0-9a-f-]{36}$/);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /FOR UPDATE SKIP LOCKED LIMIT 1/);
  assert.match(calls[0].sql, /UPDATE collection_jobs AS j SET lease_token/);
  assert.match(calls[0].sql, /failure_count <= 1 THEN 60 WHEN failure_count = 2 THEN 300 ELSE 900/);
  assert.match(calls[0].sql, /requested_at IS NULL OR requested_at <= \$1::timestamptz/);
  assert.deepEqual(calls[0].values, [at.toISOString(), job.leaseToken, 600_000, 24]);
});

test("different workers see no duplicate job when the database has already leased it", async () => {
  let claims = 0;
  const database: QueryDatabase = {
    async query() {
      claims++;
      return { rows: claims === 1 ? [{ period: "daily", language_slug: "all" }] : [] };
    }
  };
  const [first, second] = await Promise.all([claimNextJob(database, at), claimNextJob(database, at)]);
  assert.ok(first);
  assert.equal(second, null);
});

test("heartbeat and completion require the active token, and failure keeps the last success", async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const database: QueryDatabase = {
    async query(sql, values) { calls.push({ sql, values }); return { rows: [{ "?column?": 1 }] }; }
  };
  const job = { period: "daily" as const, languageSlug: "all", leaseToken: "00000000-0000-4000-8000-000000000001" };
  await renewJobLease(database, job, at);
  await finishJob(database, job, at, { success: false, failureCode: "UPSTREAM_FAILED" });
  await finishJob(database, job, at, { success: true });
  assert.match(calls[0].sql, /lease_token = \$3::uuid/);
  assert.match(calls[1].sql, /failure_count = failure_count \+ 1/);
  assert.match(calls[1].sql, /requested_at = COALESCE\(requested_at, \$4::timestamptz \+ make_interval/);
  assert.doesNotMatch(calls[1].sql, /last_success_at =/);
  assert.match(calls[2].sql, /last_success_at = \$4::timestamptz/);
  assert.deepEqual(calls[1].values, ["daily", "all", job.leaseToken, at.toISOString(), "UPSTREAM_FAILED"]);
});

test("lost lease prevents an obsolete worker from finalizing its job", async () => {
  const database: QueryDatabase = { async query() { return { rows: [] }; } };
  const job = { period: "daily" as const, languageSlug: "all", leaseToken: "00000000-0000-4000-8000-000000000001" };
  await assert.rejects(renewJobLease(database, job, at), LeaseLostError);
  await assert.rejects(finishJob(database, job, at, { success: true }), LeaseLostError);
});
