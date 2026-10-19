import type { TrendingPeriod } from "./contracts";
import type { QueryDatabase } from "./trending-read";

export async function recordCollectionStart(
  database: QueryDatabase,
  period: TrendingPeriod,
  language: string,
  at: string
): Promise<void> {
  await database.query(
    "INSERT INTO collection_jobs (period, language_slug, requested_at, latest_attempt_at, latest_attempt_status, failure_code) " +
    "VALUES ($1, $2, NULL, $3, 'running', NULL) " +
    "ON CONFLICT (period, language_slug) DO UPDATE SET requested_at = NULL, " +
    "latest_attempt_at = EXCLUDED.latest_attempt_at, latest_attempt_status = 'running', failure_code = NULL",
    [period, language, at]
  );
}

export async function recordCollectionSuccess(
  database: QueryDatabase,
  period: TrendingPeriod,
  language: string,
  at: string
): Promise<void> {
  await database.query(
    "INSERT INTO collection_jobs (period, language_slug, requested_at, latest_attempt_at, latest_attempt_status, failure_code, last_success_at) " +
    "VALUES ($1, $2, NULL, $3, 'success', NULL, $3) " +
    "ON CONFLICT (period, language_slug) DO UPDATE SET requested_at = NULL, " +
    "latest_attempt_at = EXCLUDED.latest_attempt_at, latest_attempt_status = 'success', " +
    "failure_code = NULL, last_success_at = EXCLUDED.last_success_at",
    [period, language, at]
  );
}

export async function recordCollectionFailure(
  database: QueryDatabase,
  period: TrendingPeriod,
  language: string,
  at: string,
  code: string
): Promise<void> {
  await database.query(
    "INSERT INTO collection_jobs (period, language_slug, requested_at, latest_attempt_at, latest_attempt_status, failure_code) " +
    "VALUES ($1, $2, NULL, $3, 'failed', $4) " +
    "ON CONFLICT (period, language_slug) DO UPDATE SET requested_at = NULL, " +
    "latest_attempt_at = EXCLUDED.latest_attempt_at, latest_attempt_status = 'failed', " +
    "failure_code = EXCLUDED.failure_code",
    [period, language, at, code]
  );
}
