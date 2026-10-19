import { getDatabasePool } from "../lib/db";
import { GitHubMetadataClient } from "./github-metadata";
import { collectTrendingSnapshot } from "./collect-trending";
import { readLanguageCatalog } from "../lib/language-catalog";
import { refreshLanguageDirectoryWithFallback } from "./language-directory";
import { claimNextJob, finishJob, renewJobLease, seedScheduledJobs } from "./job-scheduler";

const SCAN_MS = 60_000;
const DIRECTORY_MS = 60 * 60_000;
const LEASE_HEARTBEAT_MS = 2 * 60_000;

function activeLanguageHours(): number {
  const parsed = Number(process.env.ACTIVE_LANGUAGE_HOURS ?? "24");
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 168) {
    throw new Error("ACTIVE_LANGUAGE_HOURS must be an integer from 1 to 168");
  }
  return parsed;
}

async function main(): Promise<void> {
  const pool = getDatabasePool();
  const metadataClient = new GitHubMetadataClient({ token: process.env.GITHUB_TOKEN || undefined });
  const activeHours = activeLanguageHours();
  let stopping = false;
  let lastDirectoryAttempt = 0;
  process.once("SIGTERM", () => { stopping = true; });
  process.once("SIGINT", () => { stopping = true; });

  try {
    while (!stopping) {
      const scanStarted = Date.now();
      try {
        if (scanStarted - lastDirectoryAttempt >= DIRECTORY_MS) {
          lastDirectoryAttempt = scanStarted;
          const catalog = await refreshLanguageDirectoryWithFallback({ database: pool });
          console.info(JSON.stringify({
            task: "language_directory", status: catalog ? "available" : "unavailable",
            languageCount: catalog?.languages.length ?? 0
          }));
        }

        await seedScheduledJobs(pool, new Date(), activeHours);
        // Bound one pass even if thousands of languages remain due.
        let processed = 0;
        for (;;) {
          if (stopping || processed >= 10) break;
          const job = await claimNextJob(pool, new Date(), activeHours);
          if (!job) break;
          processed++;
          let leaseLost = false;
          const heartbeat = setInterval(() => {
            void renewJobLease(pool, job, new Date()).catch(() => { leaseLost = true; });
          }, LEASE_HEARTBEAT_MS);
          try {
            const catalog = job.languageSlug === "all" ? null : await readLanguageCatalog(pool);
            if (job.languageSlug !== "all" && !catalog?.languages.some(({ slug }) => slug === job.languageSlug)) {
              throw new Error("Language no longer available in directory");
            }
            const result = await collectTrendingSnapshot({
              period: job.period, languageSlug: job.languageSlug, pool, metadataClient,
              leaseToken: job.leaseToken
            });
            if (leaseLost) throw new Error("Collection lease lost");
            await finishJob(pool, job, new Date(), { success: true });
            console.info(JSON.stringify({
              period: job.period, language: job.languageSlug,
              status: result.published ? "published" : "unchanged",
              parsedCount: result.parsedCount, publishedCount: result.publishedCount,
              skippedCount: result.skippedCount, collectedAt: result.collectedAt
            }));
          } catch (error) {
            const failureCode = error instanceof Error && "code" in error
              ? String(error.code) : "COLLECTION_FAILED";
            try {
              await finishJob(pool, job, new Date(), { success: false, failureCode });
            } catch {
              console.error(JSON.stringify({ period: job.period, language: job.languageSlug, status: "lease_lost" }));
            }
            console.error(JSON.stringify({
              period: job.period, language: job.languageSlug, status: "failed", failureCode
            }));
          } finally {
            clearInterval(heartbeat);
          }
        }
      } catch {
        console.error(JSON.stringify({ task: "scheduler", status: "failed" }));
      }
      if (stopping) break;
      await new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, SCAN_MS - (Date.now() - scanStarted))));
    }
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  process.exitCode = 1;
  console.error(JSON.stringify({ status: "failed", failureCode: "WORKER_SETUP_FAILED" }));
});
