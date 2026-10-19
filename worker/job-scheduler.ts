import { randomUUID } from "node:crypto";
import { isTrendingPeriod, normalizeLanguageSlug, type TrendingPeriod } from "../lib/contracts";
import type { QueryDatabase } from "../lib/trending-read";

export interface ClaimedJob {
  period: TrendingPeriod;
  languageSlug: string;
  leaseToken: string;
}

export class LeaseLostError extends Error {
  constructor() {
    super("Collection lease is no longer held");
    this.name = "LeaseLostError";
  }
}

const LEASE_MS = 10 * 60_000;

function validDate(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new RangeError("Invalid scheduler time");
  return value.toISOString();
}

export async function seedScheduledJobs(database: QueryDatabase, at: Date, activeHours = 24): Promise<void> {
  if (!Number.isSafeInteger(activeHours) || activeHours < 1 || activeHours > 168) throw new RangeError("Invalid active-language window");
  await database.query(
    "INSERT INTO collection_jobs (period, language_slug) VALUES ('daily', 'all'), ('monthly', 'all') " +
    "ON CONFLICT (period, language_slug) DO NOTHING"
  );
  await database.query(
    "INSERT INTO collection_jobs (period, language_slug) " +
    "SELECT p.period, active.language_slug FROM (VALUES ('daily'), ('monthly')) AS p(period) " +
    "CROSS JOIN (SELECT DISTINCT j.language_slug FROM collection_jobs j " +
    "JOIN language_catalog c ON c.id = true " +
    "WHERE j.language_slug <> 'all' AND j.last_viewed_at >= $1::timestamptz - make_interval(hours => $2::int) " +
    "AND EXISTS (SELECT 1 FROM jsonb_array_elements(c.languages) AS language " +
    "WHERE language->>'slug' = j.language_slug)) AS active " +
    "ON CONFLICT (period, language_slug) DO NOTHING",
    [validDate(at), activeHours]
  );
}

export async function claimNextJob(database: QueryDatabase, at: Date, activeHours = 24): Promise<ClaimedJob | null> {
  if (!Number.isSafeInteger(activeHours) || activeHours < 1 || activeHours > 168) throw new RangeError("Invalid active-language window");
  const token = randomUUID();
  const result = await database.query(
    "WITH candidate AS (SELECT period, language_slug FROM collection_jobs " +
    "WHERE (language_slug = 'all' OR last_viewed_at >= $1::timestamptz - make_interval(hours => $4::int) OR requested_at IS NOT NULL) " +
    "AND (language_slug = 'all' OR EXISTS (SELECT 1 FROM language_catalog c " +
    "CROSS JOIN jsonb_array_elements(c.languages) AS language " +
    "WHERE c.id = true AND language->>'slug' = collection_jobs.language_slug)) " +
    "AND (lease_until IS NULL OR lease_until <= $1::timestamptz) " +
    "AND (requested_at IS NULL OR requested_at <= $1::timestamptz) " +
    "AND (latest_attempt_status IS DISTINCT FROM 'failed' OR " +
    "latest_attempt_at <= $1::timestamptz - interval '1 hour' OR " +
    "(requested_at IS NOT NULL AND latest_attempt_at <= $1::timestamptz - " +
    "make_interval(secs => CASE WHEN failure_count <= 1 THEN 60 WHEN failure_count = 2 THEN 300 ELSE 900 END))) " +
    "AND (latest_attempt_at IS NULL OR (latest_attempt_status = 'running' AND lease_until <= $1::timestamptz) " +
    "OR (latest_attempt_status IS DISTINCT FROM 'failed' AND latest_attempt_at <= $1::timestamptz - interval '1 hour') " +
    "OR (requested_at IS NOT NULL AND latest_attempt_at <= $1::timestamptz - " +
    "make_interval(secs => CASE WHEN latest_attempt_status = 'failed' THEN " +
    "CASE WHEN failure_count <= 1 THEN 60 WHEN failure_count = 2 THEN 300 ELSE 900 END ELSE 0 END))) " +
    "OR (latest_attempt_status = 'failed' AND latest_attempt_at <= $1::timestamptz - interval '1 hour')) " +
    "ORDER BY CASE WHEN requested_at IS NOT NULL THEN 0 WHEN language_slug = 'all' THEN 1 ELSE 2 END, " +
    "COALESCE(requested_at, latest_attempt_at, 'epoch'::timestamptz), period " +
    "FOR UPDATE SKIP LOCKED LIMIT 1) " +
    "UPDATE collection_jobs AS j SET lease_token = $2::uuid, " +
    "lease_until = $1::timestamptz + make_interval(secs => $3::int / 1000), " +
    "latest_attempt_at = $1::timestamptz, latest_attempt_status = 'running', " +
    "requested_at = NULL " +
    "FROM candidate WHERE j.period = candidate.period AND j.language_slug = candidate.language_slug " +
    "RETURNING j.period, j.language_slug",
    [validDate(at), token, LEASE_MS, activeHours]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (!isTrendingPeriod(String(row.period))) throw new Error("Invalid claimed period");
  const languageSlug = normalizeLanguageSlug(String(row.language_slug));
  return { period: row.period as TrendingPeriod, languageSlug, leaseToken: token };
}

export async function renewJobLease(database: QueryDatabase, job: ClaimedJob, at: Date): Promise<void> {
  const result = await database.query(
    "UPDATE collection_jobs SET lease_until = $4::timestamptz + interval '10 minutes' " +
    "WHERE period = $1 AND language_slug = $2 AND lease_token = $3::uuid " +
    "AND lease_until > $4::timestamptz AND latest_attempt_status = 'running' RETURNING 1",
    [job.period, job.languageSlug, job.leaseToken, validDate(at)]
  );
  if (result.rows.length !== 1) throw new LeaseLostError();
}

export async function finishJob(
  database: QueryDatabase,
  job: ClaimedJob,
  at: Date,
  outcome: { success: true } | { success: false; failureCode: string }
): Promise<void> {
  const result = outcome.success
    ? await database.query(
      "UPDATE collection_jobs SET lease_token = NULL, lease_until = NULL, " +
      "latest_attempt_status = 'success', failure_code = NULL, failure_count = 0, " +
      "last_success_at = $4::timestamptz, " +
      "requested_at = CASE WHEN requested_at IS NULL OR requested_at <= latest_attempt_at THEN NULL ELSE requested_at END " +
      "WHERE period = $1 AND language_slug = $2 AND lease_token = $3::uuid " +
      "AND lease_until > $4::timestamptz RETURNING 1",
      [job.period, job.languageSlug, job.leaseToken, validDate(at)]
    )
    : await database.query(
      "UPDATE collection_jobs SET lease_token = NULL, lease_until = NULL, " +
      "latest_attempt_status = 'failed', failure_code = $5, failure_count = failure_count + 1, " +
      "requested_at = COALESCE(requested_at, $4::timestamptz + make_interval(secs => " +
      "CASE WHEN failure_count = 0 THEN 60 WHEN failure_count = 1 THEN 300 ELSE 900 END)) " +
      "WHERE period = $1 AND language_slug = $2 AND lease_token = $3::uuid " +
      "AND lease_until > $4::timestamptz RETURNING 1",
      [job.period, job.languageSlug, job.leaseToken, validDate(at), outcome.failureCode]
    );
  if (result.rows.length !== 1) throw new LeaseLostError();
}
