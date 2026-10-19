import { randomUUID } from "node:crypto";
import { isTrendingPeriod, normalizeLanguageSlug, trendingSourceUrl, type TrendingPeriod } from "./contracts";
import type { EnrichedTrendingCandidate } from "../worker/github-metadata";

// A pool and its checked-out client are deliberately small interfaces so transaction
// behavior can be verified without a running PostgreSQL server.
export interface SnapshotClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
  release(): void;
}

export interface SnapshotPool {
  connect(): Promise<SnapshotClient>;
}

export interface SnapshotPublication {
  period: TrendingPeriod;
  languageSlug: string;
  sourceUrl: string;
  collectedAt: string;
  repositories: EnrichedTrendingCandidate[];
  leaseToken?: string;
}

export interface PublishResult {
  published: boolean;
  snapshotId: string;
}

const pgIntegerMax = 2_147_483_647;

function validTimestamp(value: string): boolean {
  return typeof value === "string" && /Z$/.test(value) && Number.isFinite(Date.parse(value));
}

function validInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= pgIntegerMax;
}

function validate(input: SnapshotPublication): void {
  if (!isTrendingPeriod(input.period) ||
      input.languageSlug !== normalizeLanguageSlug(input.languageSlug) ||
      input.sourceUrl !== trendingSourceUrl(input.period, input.languageSlug) ||
      !validTimestamp(input.collectedAt) ||
      !Array.isArray(input.repositories) || input.repositories.length === 0 ||
      input.repositories.length > pgIntegerMax) {
    throw new Error("Invalid or empty Trending snapshot");
  }

  const ids = new Set<string>();
  const indices = new Set<number>();
  for (const [index, item] of input.repositories.entries()) {
    const repo = item?.metadata;
    if (!repo || !/^[0-9]+$/.test(repo.id) || repo.id === "0" ||
        !/^[^/\s]+\/[^/\s]+$/.test(repo.fullName) ||
        !/^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/?$/.test(repo.url) ||
        (repo.descriptionOriginal !== null && typeof repo.descriptionOriginal !== "string") ||
        (repo.language !== null && typeof repo.language !== "string") ||
        !validInteger(repo.totalStars) || !validInteger(item.periodStars) ||
        !validInteger(item.originalIndex) || !validTimestamp(repo.metadataUpdatedAt) ||
        ids.has(repo.id) || indices.has(item.originalIndex)) {
      throw new Error("Invalid or duplicate Trending repository");
    }
    ids.add(repo.id);
    indices.add(item.originalIndex);
    if (index > 0) {
      const previous = input.repositories[index - 1];
      if (previous.periodStars < item.periodStars ||
          (previous.periodStars === item.periodStars && previous.originalIndex >= item.originalIndex)) {
        throw new Error("Trending repositories are not ordered by period Stars");
      }
    }
  }
}

// The advisory transaction lock serializes publishers for a period/language pair,
// including the first publication when current_snapshots has no row to lock.
// A late, older collection cannot replace a newer successful snapshot.
export async function publishSnapshot(pool: SnapshotPool, input: SnapshotPublication): Promise<PublishResult> {
  validate(input);
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [input.period + ":" + input.languageSlug]);
    if (input.leaseToken) {
      const lease = await client.query(
        "SELECT 1 FROM collection_jobs WHERE period = $1 AND language_slug = $2 " +
        "AND lease_token = $3::uuid AND lease_until > clock_timestamp() AND latest_attempt_status = 'running' FOR UPDATE",
        [input.period, input.languageSlug, input.leaseToken]
      );
      if (lease.rows.length !== 1) throw new Error("Collection lease lost before publication");
    }
    const current = await client.query(
      "SELECT s.id, s.collected_at FROM current_snapshots c JOIN snapshots s ON s.id = c.snapshot_id WHERE c.period = $1 AND c.language_slug = $2",
      [input.period, input.languageSlug]
    );
    const existing = current.rows[0];
    if (existing) {
      const existingTime = existing.collected_at instanceof Date
        ? existing.collected_at.getTime() : Date.parse(String(existing.collected_at));
      if (!Number.isFinite(existingTime)) throw new Error("Invalid current snapshot timestamp");
      if (existingTime >= Date.parse(input.collectedAt)) {
        await client.query("COMMIT");
        transactionStarted = false;
        return { published: false, snapshotId: String(existing.id) };
      }
    }

    const snapshotId = randomUUID();
    await client.query(
      "INSERT INTO snapshots (id, period, language_slug, source_url, collected_at, item_count) VALUES ($1, $2, $3, $4, $5, $6)",
      [snapshotId, input.period, input.languageSlug, input.sourceUrl, input.collectedAt, input.repositories.length]
    );

    for (const [index, item] of input.repositories.entries()) {
      const repo = item.metadata;
      await client.query(
        "INSERT INTO repositories (github_id, full_name, html_url, description_original, primary_language, total_stars, metadata_updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7) " +
        "ON CONFLICT (github_id) DO UPDATE SET full_name = EXCLUDED.full_name, html_url = EXCLUDED.html_url, description_original = EXCLUDED.description_original, primary_language = EXCLUDED.primary_language, total_stars = EXCLUDED.total_stars, metadata_updated_at = EXCLUDED.metadata_updated_at " +
        "WHERE repositories.metadata_updated_at <= EXCLUDED.metadata_updated_at",
        [repo.id, repo.fullName, repo.url, repo.descriptionOriginal, repo.language, repo.totalStars, repo.metadataUpdatedAt]
      );
      await client.query(
        "INSERT INTO snapshot_items (snapshot_id, github_id, rank, original_index, period_stars, full_name_at_capture, url_at_capture, description_original_at_capture, primary_language_at_capture, total_stars_at_capture, metadata_updated_at) " +
        "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        [snapshotId, repo.id, index + 1, item.originalIndex, item.periodStars, repo.fullName, repo.url, repo.descriptionOriginal, repo.language, repo.totalStars, repo.metadataUpdatedAt]
      );
    }

    if (input.leaseToken) {
      const lease = await client.query(
        "SELECT 1 FROM collection_jobs WHERE period = $1 AND language_slug = $2 " +
        "AND lease_token = $3::uuid AND lease_until > clock_timestamp() AND latest_attempt_status = 'running'",
        [input.period, input.languageSlug, input.leaseToken]
      );
      if (lease.rows.length !== 1) throw new Error("Collection lease expired during publication");
    }
    // This pointer is changed only after every item has been inserted successfully.
    await client.query(
      "INSERT INTO current_snapshots (period, language_slug, snapshot_id) VALUES ($1, $2, $3) ON CONFLICT (period, language_slug) DO UPDATE SET snapshot_id = EXCLUDED.snapshot_id",
      [input.period, input.languageSlug, snapshotId]
    );
    await client.query("COMMIT");
    transactionStarted = false;
    return { published: true, snapshotId };
  } catch (error) {
    if (transactionStarted) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve the original publication failure. */ }
    }
    throw error;
  } finally {
    client.release();
  }
}
