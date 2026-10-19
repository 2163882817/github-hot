import assert from "node:assert/strict";
import { test } from "node:test";
import { recordCollectionFailure, recordCollectionStart, recordCollectionSuccess } from "../lib/collection-status";
import type { QueryDatabase } from "../lib/trending-read";

test("collection state records start, success and failure without touching snapshot pointers", async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const db: QueryDatabase = {
    async query(sql, values) { calls.push({ sql, values }); return { rows: [] }; }
  };
  const at = "2026-10-19T08:00:00.000Z";
  await recordCollectionStart(db, "daily", "all", at);
  await recordCollectionSuccess(db, "daily", "all", at);
  await recordCollectionFailure(db, "monthly", "all", at, "UPSTREAM_FAILED");
  assert.equal(calls.length, 3);
  assert.match(calls[0].sql, /latest_attempt_status = 'running'/);
  assert.match(calls[1].sql, /last_success_at = EXCLUDED.last_success_at/);
  assert.match(calls[2].sql, /latest_attempt_status = 'failed'/);
  assert.deepEqual(calls[2].values, ["monthly", "all", at, "UPSTREAM_FAILED"]);
  assert.ok(calls.every(({ sql }) => !sql.includes("current_snapshots")));
});
