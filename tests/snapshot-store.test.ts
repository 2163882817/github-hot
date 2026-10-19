import assert from "node:assert/strict";
import { test } from "node:test";
import { publishSnapshot, type SnapshotClient, type SnapshotPublication } from "../lib/snapshot-store";

const collectedAt = "2026-10-19T08:00:00.000Z";

function publication(count = 2): SnapshotPublication {
  return {
    period: "daily",
    languageSlug: "all",
    sourceUrl: "https://github.com/trending?since=daily",
    collectedAt,
    repositories: Array.from({ length: count }, (_, index) => ({
      fullName: "owner/repo" + index,
      originalIndex: index,
      periodStars: 20 - index,
      metadata: {
        id: String(100 + index),
        fullName: "owner/repo" + index,
        url: "https://github.com/owner/repo" + index,
        descriptionOriginal: "Description " + index,
        language: "TypeScript",
        totalStars: 1000 + index,
        metadataUpdatedAt: collectedAt
      }
    }))
  };
}

class FakeClient implements SnapshotClient {
  calls: Array<{ sql: string; values?: unknown[] }> = [];
  released = false;
  current: { id: string; collected_at: Date } | null = null;
  failAt: string | null = null;

  async query(sql: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }> {
    this.calls.push({ sql, values });
    if (this.failAt && sql.startsWith(this.failAt)) throw new Error("database failure");
    if (sql.startsWith("SELECT s.id")) return { rows: this.current ? [this.current] : [], rowCount: this.current ? 1 : 0 };
    return { rows: [], rowCount: 1 };
  }

  release() { this.released = true; }
}

function pool(client: FakeClient) {
  return { connect: async () => client };
}

test("publishes a complete ordered snapshot before switching the visible pointer", async () => {
  const client = new FakeClient();
  const result = await publishSnapshot(pool(client), publication());
  assert.equal(result.published, true);
  assert.match(result.snapshotId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(client.calls.map(({ sql }) => sql.split(" ")[0]),
    ["BEGIN", "SELECT", "SELECT", "INSERT", "INSERT", "INSERT", "INSERT", "INSERT", "INSERT", "COMMIT"]);
  const pointerIndex = client.calls.findIndex(({ sql }) => sql.startsWith("INSERT INTO current_snapshots"));
  assert.equal(pointerIndex, client.calls.length - 2);
  assert.deepEqual(client.calls.filter(({ sql }) => sql.startsWith("INSERT INTO snapshot_items")).map(({ values }) => values?.[2]), [1, 2]);
  assert.equal(client.calls[pointerIndex].values?.[2], result.snapshotId);
  assert.equal(client.released, true);
});

test("database failure rolls back and never commits or switches the pointer", async () => {
  const client = new FakeClient();
  client.failAt = "INSERT INTO snapshot_items";
  await assert.rejects(publishSnapshot(pool(client), publication()), /database failure/);
  assert.equal(client.calls.some(({ sql }) => sql.startsWith("INSERT INTO current_snapshots")), false);
  assert.deepEqual(client.calls.slice(-1).map(({ sql }) => sql), ["ROLLBACK"]);
  assert.equal(client.released, true);
});

test("pointer failure also rolls back the entire publication", async () => {
  const client = new FakeClient();
  client.failAt = "INSERT INTO current_snapshots";
  await assert.rejects(publishSnapshot(pool(client), publication()), /database failure/);
  assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
  assert.equal(client.calls.some(({ sql }) => sql === "COMMIT"), false);
  assert.equal(client.released, true);
});

test("older or same-time collections do not replace a newer published snapshot", async () => {
  const client = new FakeClient();
  client.current = { id: "existing", collected_at: new Date("2026-10-19T09:00:00Z") };
  assert.deepEqual(await publishSnapshot(pool(client), publication()), { published: false, snapshotId: "existing" });
  assert.equal(client.calls.filter(({ sql }) => sql.startsWith("INSERT")).length, 0);
  assert.equal(client.calls.at(-1)?.sql, "COMMIT");
  assert.equal(client.released, true);
});

test("invalid, empty, duplicated or unsorted results are rejected before opening a transaction", async () => {
  const client = new FakeClient();
  const invalid: SnapshotPublication[] = [
    publication(0),
    { ...publication(), repositories: publication().repositories.reverse() },
    { ...publication(), repositories: publication().repositories.map((item) => ({ ...item, metadata: { ...item.metadata, id: "100" } })) },
    { ...publication(), repositories: [{ ...publication().repositories[0], periodStars: -1 }] },
    { ...publication(), sourceUrl: "https://example.com/trending" }
  ];
  for (const input of invalid) await assert.rejects(publishSnapshot(pool(client), input));
  assert.equal(client.calls.length, 0);
  assert.equal(client.released, false);
});

test("an expired collection lease rolls back before changing the visible snapshot", async () => {
  const client = new FakeClient();
  const input = { ...publication(), leaseToken: "00000000-0000-4000-8000-000000000001" };
  await assert.rejects(publishSnapshot(pool(client), input), /lease lost/);
  assert.equal(client.calls.some(({ sql }) => sql.startsWith("INSERT INTO snapshots")), false);
  assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
});

test("a leased publication checks wall-clock expiry before the final pointer change", async () => {
  class LeaseClient extends FakeClient {
    checks = 0;
    override async query(sql: string, values?: unknown[]) {
      if (sql.startsWith("SELECT 1 FROM collection_jobs")) {
        this.calls.push({ sql, values });
        this.checks++;
        return { rows: this.checks === 1 ? [{ "?column?": 1 }] : [], rowCount: this.checks === 1 ? 1 : 0 };
      }
      return super.query(sql, values);
    }
  }
  const client = new LeaseClient();
  await assert.rejects(publishSnapshot(pool(client), {
    ...publication(), leaseToken: "00000000-0000-4000-8000-000000000001"
  }), /lease expired during publication/);
  assert.equal(client.checks, 2);
  assert.ok(client.calls.filter(({ sql }) => sql.startsWith("SELECT 1 FROM collection_jobs")).every(({ sql }) => sql.includes("clock_timestamp()")));
  assert.equal(client.calls.some(({ sql }) => sql.startsWith("INSERT INTO current_snapshots")), false);
  assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
});
