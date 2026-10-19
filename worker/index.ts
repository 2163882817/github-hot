import { getDatabasePool } from "../lib/db";
import { GitHubMetadataClient } from "./github-metadata";
import { collectTrendingSnapshot } from "./collect-trending";
import type { TrendingPeriod } from "../lib/contracts";
import { recordCollectionFailure, recordCollectionStart, recordCollectionSuccess } from "../lib/collection-status";

// One explicit collection pass. Scheduling and language job leases come later.
async function main(): Promise<void> {
  const pool = getDatabasePool();
  const metadataClient = new GitHubMetadataClient({ token: process.env.GITHUB_TOKEN || undefined });
  const periods: TrendingPeriod[] = ["daily", "monthly"];
  let failed = false;
  try {
    for (const period of periods) {
      let published = false;
      try {
        await recordCollectionStart(pool, period, "all", new Date().toISOString());
        const result = await collectTrendingSnapshot({
          period,
          languageSlug: "all",
          pool,
          metadataClient
        });
        published = true;
        await recordCollectionSuccess(pool, period, "all", new Date().toISOString());
        console.info(JSON.stringify({
          period, language: "all", status: result.published ? "published" : "unchanged",
          parsedCount: result.parsedCount, publishedCount: result.publishedCount,
          skippedCount: result.skippedCount, collectedAt: result.collectedAt
        }));
      } catch (error) {
        failed = true;
        const failureCode = error instanceof Error && "code" in error ? String(error.code) : "COLLECTION_FAILED";
        if (!published) {
          try {
            await recordCollectionFailure(pool, period, "all", new Date().toISOString(), failureCode);
          } catch {
            console.error(JSON.stringify({ period, language: "all", status: "status_record_failed" }));
          }
        }
        console.error(JSON.stringify({
          period, language: "all", status: "failed",
          failureCode: published ? "STATUS_RECORD_FAILED" : failureCode
        }));
      }
    }
  } finally {
    await pool.end();
  }
  if (failed) process.exitCode = 1;
}

main().catch(() => {
  process.exitCode = 1;
  console.error(JSON.stringify({ status: "failed", failureCode: "WORKER_SETUP_FAILED" }));
});
