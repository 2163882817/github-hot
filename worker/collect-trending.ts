import { normalizeLanguageSlug, trendingSourceUrl, type TrendingPeriod } from "../lib/contracts";
import { publishSnapshot, type PublishResult, type SnapshotPool, type SnapshotPublication } from "../lib/snapshot-store";
import { enrichTrendingCandidates, type GitHubMetadataClient } from "./github-metadata";
import { parseTrendingHtml } from "./trending-parser";

const maximumHtmlBytes = 2_000_000;

export class TrendingCollectionError extends Error {
  constructor(readonly code: "UPSTREAM_FAILED" | "INVALID_RESPONSE" | "NO_VALID_REPOSITORIES") {
    super(code);
    this.name = "TrendingCollectionError";
  }
}

export interface CollectionOptions {
  period: TrendingPeriod;
  languageSlug: string;
  pool: SnapshotPool;
  metadataClient: Pick<GitHubMetadataClient, "get">;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  publish?: (pool: SnapshotPool, input: SnapshotPublication) => Promise<PublishResult>;
}

export interface CollectionResult extends PublishResult {
  period: TrendingPeriod;
  languageSlug: string;
  sourceUrl: string;
  collectedAt: string;
  parsedCount: number;
  publishedCount: number;
  skippedCount: number;
}

async function readLimitedHtml(response: Response): Promise<string> {
  const length = response.headers.get("content-length");
  if (length !== null && Number(length) > maximumHtmlBytes) throw new TrendingCollectionError("INVALID_RESPONSE");
  if (!response.body) throw new TrendingCollectionError("INVALID_RESPONSE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumHtmlBytes) throw new TrendingCollectionError("INVALID_RESPONSE");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
}

export async function collectTrendingSnapshot(options: CollectionOptions): Promise<CollectionResult> {
  const languageSlug = normalizeLanguageSlug(options.languageSlug);
  const sourceUrl = trendingSourceUrl(options.period, languageSlug);
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 12_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new RangeError("Invalid upstream timeout");

  let response: Response | undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let html: string;
  try {
    response = await fetchImpl(sourceUrl, {
      headers: { Accept: "text/html", "User-Agent": "github-hot-report" },
      signal: controller.signal
    });
    if (!response.ok) throw new TrendingCollectionError("UPSTREAM_FAILED");
    if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
      throw new TrendingCollectionError("INVALID_RESPONSE");
    }
    html = await readLimitedHtml(response);
  } catch (error) {
    if (error instanceof TrendingCollectionError) throw error;
    throw new TrendingCollectionError(controller.signal.aborted || !response ? "UPSTREAM_FAILED" : "INVALID_RESPONSE");
  } finally {
    clearTimeout(timer);
  }
  const collectedAt = new Date(now()).toISOString();
  const parsed = parseTrendingHtml(html, options.period);
  const enriched = await enrichTrendingCandidates(parsed.candidates, options.metadataClient);
  if (enriched.repositories.length === 0) throw new TrendingCollectionError("NO_VALID_REPOSITORIES");

  const publication: SnapshotPublication = {
    period: options.period,
    languageSlug,
    sourceUrl,
    collectedAt,
    repositories: enriched.repositories
  };
  const result = await (options.publish ?? publishSnapshot)(options.pool, publication);
  return {
    ...result,
    period: options.period,
    languageSlug,
    sourceUrl,
    collectedAt,
    parsedCount: parsed.candidates.length,
    publishedCount: enriched.repositories.length,
    skippedCount: enriched.skipped.length
  };
}
