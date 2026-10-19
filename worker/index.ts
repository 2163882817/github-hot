import { getDatabasePool } from "../lib/db";
import { GitHubMetadataClient } from "./github-metadata";
import { collectTrendingSnapshot } from "./collect-trending";
import type { TrendingPeriod } from "../lib/contracts";

// One explicit collection pass. Scheduling and language job leases come later.
async function main(): Promise<void> {
  const pool = getDatabasePool();
  const metadataClient = new GitHubMetadataClient({ token: process.env.GITHUB_TOKEN || undefined });
  const periods: TrendingPeriod[] = ["daily", "monthly"];
  let failed = false;
  try {
    for (const period of periods) {
      try {
        const result = await collectTrendingSnapshot({
          period,
          languageSlug: "all",
          pool,
          metadataClient
        });
        console.info(JSON.stringify({
          period, language: "all", status: result.published ? "published" : "unchanged",
          parsedCount: result.parsedCount, publishedCount: result.publishedCount,
          skippedCount: result.skippedCount, collectedAt: result.collectedAt
        }));
      } catch (error) {
        failed = true;
        console.error(JSON.stringify({
          period, language: "all", status: "failed",
          failureCode: error instanceof Error && "code" in error ? String(error.code) : "COLLECTION_FAILED"
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
