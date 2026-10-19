import type { TrendingCandidate } from "../lib/contracts";

export interface RepositoryMetadata {
  id: string;
  fullName: string;
  url: string;
  descriptionOriginal: string | null;
  language: string | null;
  totalStars: number;
  metadataUpdatedAt: string;
}

interface CacheEntry {
  metadata: RepositoryMetadata;
  etag: string | null;
  checkedAt: number;
}

export class GitHubMetadataCache {
  private entries = new Map<string, CacheEntry>();

  get(fullName: string): CacheEntry | undefined {
    return this.entries.get(fullName.toLowerCase());
  }

  set(fullName: string, entry: CacheEntry): void {
    this.entries.set(fullName.toLowerCase(), entry);
  }
}

export class GitHubMetadataError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "GitHubMetadataError";
  }
}

export class GitHubRateLimitError extends GitHubMetadataError {
  constructor(status: number, readonly retryAt: number) {
    super("GitHub API rate limited", status);
    this.name = "GitHubRateLimitError";
  }
}

export interface GitHubMetadataClientOptions {
  token?: string;
  cache?: GitHubMetadataCache;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
  cacheTtlMs?: number;
  maxStaleMs?: number;
  maxTransientRetries?: number;
}

const fullNamePattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const API_VERSION = "2026-03-10";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validatedMetadata(value: unknown, observedAt: number): RepositoryMetadata {
  if (!isRecord(value)) throw new GitHubMetadataError("Invalid repository response");
  const { id, full_name: fullName, html_url: rawUrl, description, language, stargazers_count: totalStars } = value;
  if (!Number.isSafeInteger(id) || typeof id !== "number" || id < 0 ||
      typeof fullName !== "string" || !fullNamePattern.test(fullName) ||
      typeof rawUrl !== "string" ||
      !(description === null || typeof description === "string") ||
      !(language === null || typeof language === "string") ||
      !Number.isSafeInteger(totalStars) || typeof totalStars !== "number" || totalStars < 0) {
    throw new GitHubMetadataError("Invalid repository response");
  }

  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new GitHubMetadataError("Invalid repository URL"); }
  if (url.protocol !== "https:" || url.hostname !== "github.com" ||
      url.pathname.toLowerCase() !== ("/" + fullName).toLowerCase() || url.search || url.hash) {
    throw new GitHubMetadataError("Invalid repository URL");
  }

  return {
    id: String(id), fullName, url: url.toString(),
    descriptionOriginal: description, language, totalStars,
    metadataUpdatedAt: new Date(observedAt).toISOString()
  };
}

function retryAtFromHeaders(headers: Headers, now: number): number {
  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const value = Number.isFinite(seconds) ? now + Math.max(0, seconds) * 1000 : Date.parse(retryAfter);
    if (Number.isFinite(value)) return Math.max(now, value);
  }
  if (headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(headers.get("x-ratelimit-reset"));
    if (Number.isFinite(reset) && reset > 0) return Math.max(now, reset * 1000);
  }
  return now + 60_000;
}

export class GitHubMetadataClient {
  private readonly cache: GitHubMetadataCache;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly maxStaleMs: number;
  private readonly maxTransientRetries: number;
  private readonly token?: string;
  private blockedUntil = 0;
  private readonly pending = new Map<string, Promise<RepositoryMetadata>>();

  constructor(options: GitHubMetadataClientOptions = {}) {
    this.cache = options.cache ?? new GitHubMetadataCache();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.timeoutMs = options.timeoutMs ?? 12_000;
    this.cacheTtlMs = options.cacheTtlMs ?? 10 * 60_000;
    this.maxStaleMs = options.maxStaleMs ?? 24 * 60 * 60_000;
    this.maxTransientRetries = options.maxTransientRetries ?? 1;
    this.token = options.token;
  }

  get(fullName: string): Promise<RepositoryMetadata> {
    if (!fullNamePattern.test(fullName)) {
      return Promise.reject(new GitHubMetadataError("Invalid repository name"));
    }
    const key = fullName.toLowerCase();
    const cached = this.cache.get(key);
    if (cached && this.now() - cached.checkedAt < this.cacheTtlMs) return Promise.resolve(cached.metadata);
    const pending = this.pending.get(key);
    if (pending) return pending;
    const task = this.refresh(fullName, cached).finally(() => this.pending.delete(key));
    this.pending.set(key, task);
    return task;
  }

  private async refresh(fullName: string, cached?: CacheEntry): Promise<RepositoryMetadata> {
    try {
      if (this.now() < this.blockedUntil) throw new GitHubRateLimitError(429, this.blockedUntil);
      for (let attempt = 0; ; attempt++) {
        let response: Response;
        try {
          const headers = new Headers({
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": API_VERSION,
            "User-Agent": "github-hot-report"
          });
          if (this.token) headers.set("Authorization", "Bearer " + this.token);
          if (cached?.etag) headers.set("If-None-Match", cached.etag);
          response = await this.fetchImpl(
            "https://api.github.com/repos/" + fullName.split("/").map(encodeURIComponent).join("/"),
            { headers, signal: AbortSignal.timeout(this.timeoutMs) }
          );
        } catch (error) {
          if (attempt < this.maxTransientRetries) { await this.sleep(250 * 2 ** attempt); continue; }
          throw new GitHubMetadataError(error instanceof Error && error.name === "TimeoutError" ? "GitHub API timed out" : "GitHub API request failed");
        }

        if (response.status === 304 && cached) {
          this.cache.set(fullName, { ...cached, checkedAt: this.now() });
          return cached.metadata;
        }
        if (response.status === 403 || response.status === 429) {
          this.blockedUntil = retryAtFromHeaders(response.headers, this.now());
          throw new GitHubRateLimitError(response.status, this.blockedUntil);
        }
        if (response.status >= 500 && attempt < this.maxTransientRetries) {
          await this.sleep(250 * 2 ** attempt);
          continue;
        }
        if (!response.ok) throw new GitHubMetadataError("GitHub API returned HTTP " + response.status, response.status);

        let body: unknown;
        try { body = await response.json(); } catch { throw new GitHubMetadataError("Invalid repository JSON"); }
        const metadata = validatedMetadata(body, this.now());
        this.cache.set(fullName, { metadata, etag: response.headers.get("etag"), checkedAt: this.now() });
        return metadata;
      }
    } catch (error) {
      if (cached && this.now() - cached.checkedAt <= this.maxStaleMs) return cached.metadata;
      throw error;
    }
  }
}

export interface EnrichedTrendingCandidate extends TrendingCandidate {
  metadata: RepositoryMetadata;
}

export interface EnrichmentResult {
  repositories: EnrichedTrendingCandidate[];
  skipped: Array<{ fullName: string; reason: string }>;
}

export async function enrichTrendingCandidates(
  candidates: TrendingCandidate[],
  client: Pick<GitHubMetadataClient, "get">,
  concurrency = 2
): Promise<EnrichmentResult> {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10) throw new RangeError("Invalid concurrency");
  const results: Array<EnrichedTrendingCandidate | null> = Array(candidates.length).fill(null);
  const skipped: EnrichmentResult["skipped"] = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= candidates.length) return;
      const candidate = candidates[index];
      try {
        results[index] = { ...candidate, metadata: await client.get(candidate.fullName) };
      } catch (error) {
        skipped.push({ fullName: candidate.fullName, reason: error instanceof GitHubRateLimitError ? "rate_limited" : "metadata_unavailable" });
      }
    }
  }));
  return { repositories: results.filter((item): item is EnrichedTrendingCandidate => item !== null), skipped };
}
