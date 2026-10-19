import { isTrendingPeriod, normalizeLanguageSlug, type TrendingResponse, type TrendingRepository } from "./contracts";
import { readLanguageCatalog } from "./language-catalog";

export interface QueryDatabase {
  query(sql: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export type TrendingReadResult =
  | { status: 200; body: Extract<TrendingResponse, { status: "ready" }> }
  | { status: 202; body: Extract<TrendingResponse, { status: "pending" }> }
  | { status: 503; body: Extract<TrendingResponse, { status: "unavailable" }> }
  | { status: 400; body: { error: "INVALID_QUERY" } };

const REFRESH_AFTER_MS = 60 * 60_000;
const STALE_AFTER_MS = 90 * 60_000;
const RETRY_AFTER_FAILURE_MS = 60_000;

function iso(value: unknown): string {
  const time = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(time.getTime())) throw new Error("Invalid database timestamp");
  return time.toISOString();
}

function optionalTime(value: unknown): number | null {
  return value === null || value === undefined ? null : Date.parse(iso(value));
}

function queryParameters(url: URL): { period: "daily" | "monthly"; language: string } | null {
  if (url.searchParams.getAll("period").length > 1 || url.searchParams.getAll("language").length > 1) return null;
  const period = url.searchParams.get("period") ?? "daily";
  const rawLanguage = url.searchParams.get("language") ?? "all";
  if (!isTrendingPeriod(period)) return null;
  try {
    const language = normalizeLanguageSlug(rawLanguage);
    if (language !== rawLanguage || language.length > 64) return null;
    return { period, language };
  } catch {
    return null;
  }
}

export async function readTrending(
  database: QueryDatabase,
  requestUrl: string,
  now = new Date()
): Promise<TrendingReadResult> {
  const params = queryParameters(new URL(requestUrl));
  if (!params) return { status: 400, body: { error: "INVALID_QUERY" } };

  const { period, language } = params;
  if (language !== "all") {
    const catalog = await readLanguageCatalog(database);
    if (!catalog?.languages.some((option) => option.slug === language)) {
      return { status: 400, body: { error: "INVALID_QUERY" } };
    }
  }
  const headerResult = await database.query(
    "SELECT s.id, s.source_url, s.collected_at, s.created_at, s.item_count, " +
    "j.latest_attempt_at, j.latest_attempt_status, j.last_success_at, j.requested_at " +
    "FROM (SELECT 1) anchor " +
    "LEFT JOIN current_snapshots c ON c.period = $1 AND c.language_slug = $2 " +
    "LEFT JOIN snapshots s ON s.id = c.snapshot_id " +
    "LEFT JOIN collection_jobs j ON j.period = $1 AND j.language_slug = $2",
    [period, language]
  );
  const row = headerResult.rows[0];
  if (!row) throw new Error("Snapshot header query returned no row");

  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new Error("Invalid current time");
  const successMs = optionalTime(row.last_success_at) ?? optionalTime(row.created_at);
  const attemptMs = optionalTime(row.latest_attempt_at);
  const failedSinceSuccess = row.latest_attempt_status === "failed" &&
    attemptMs !== null && (successMs === null || attemptMs > successMs);
  const needsRefresh = !row.id || successMs === null || nowMs - successMs >= REFRESH_AFTER_MS;
  const retryAllowed = !failedSinceSuccess || attemptMs === null || nowMs - attemptMs >= RETRY_AFTER_FAILURE_MS;

  if (needsRefresh || language !== "all") {
    await database.query(
      "INSERT INTO collection_jobs (period, language_slug, requested_at, last_viewed_at) VALUES ($1, $2, $3, $4) " +
      "ON CONFLICT (period, language_slug) DO UPDATE SET " +
      "requested_at = CASE WHEN EXCLUDED.requested_at IS NOT NULL AND " +
      "(collection_jobs.lease_until IS NULL OR collection_jobs.lease_until <= EXCLUDED.last_viewed_at) " +
      "THEN COALESCE(collection_jobs.requested_at, EXCLUDED.requested_at) " +
      "ELSE collection_jobs.requested_at END, " +
      "last_viewed_at = EXCLUDED.last_viewed_at",
      [period, language, needsRefresh && retryAllowed ? now.toISOString() : null, now.toISOString()]
    );
  }

  if (!row.id) {
    if (failedSinceSuccess) {
      return { status: 503, body: { status: "unavailable", retryAfterSeconds: 60, messageCode: "COLLECTION_FAILED" } };
    }
    return { status: 202, body: { status: "pending", retryAfterSeconds: 15 } };
  }

  const snapshotId = String(row.id);
  const collectedAt = iso(row.collected_at);
  const lastSuccessfulAt = iso(row.created_at);
  const items = await database.query(
    "SELECT github_id, rank, full_name_at_capture, url_at_capture, description_original_at_capture, " +
    "primary_language_at_capture, total_stars_at_capture, period_stars, metadata_updated_at " +
    "FROM snapshot_items WHERE snapshot_id = $1 ORDER BY rank ASC",
    [snapshotId]
  );
  if (items.rows.length !== Number(row.item_count)) throw new Error("Incomplete stored snapshot");
  const repositories: TrendingRepository[] = items.rows.map((item, index) => {
    if (Number(item.rank) !== index + 1) throw new Error("Invalid stored snapshot order");
    return {
      id: String(item.github_id),
      rank: Number(item.rank),
      fullName: String(item.full_name_at_capture),
      url: String(item.url_at_capture),
      descriptionOriginal: item.description_original_at_capture as string | null,
      language: item.primary_language_at_capture as string | null,
      totalStars: Number(item.total_stars_at_capture),
      periodStars: Number(item.period_stars),
      period,
      collectedAt,
      metadataUpdatedAt: iso(item.metadata_updated_at)
    };
  });

  return {
    status: 200,
    body: {
      status: "ready",
      snapshotId,
      period,
      language,
      sourceUrl: String(row.source_url),
      collectedAt,
      lastSuccessfulAt,
      stale: failedSinceSuccess || nowMs - (successMs ?? Date.parse(lastSuccessfulAt)) >= STALE_AFTER_MS,
      repositories
    }
  };
}
