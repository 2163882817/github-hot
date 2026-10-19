export type TrendingPeriod = "daily" | "monthly";

export interface TrendingRepository {
  id: string;
  rank: number;
  fullName: string;
  url: string;
  descriptionOriginal: string | null;
  language: string | null;
  totalStars: number;
  periodStars: number;
  period: TrendingPeriod;
  collectedAt: string;
  metadataUpdatedAt: string;
}

export interface TrendingSnapshot {
  snapshotId: string;
  period: TrendingPeriod;
  language: string;
  sourceUrl: string;
  collectedAt: string;
  lastSuccessfulAt: string;
  stale: boolean;
  status: "ready";
  repositories: TrendingRepository[];
}

export interface PendingSnapshot {
  status: "pending";
  retryAfterSeconds: number;
}

export interface UnavailableSnapshot {
  status: "unavailable";
  retryAfterSeconds: number;
  messageCode: "COLLECTION_FAILED";
}

export type TrendingResponse = TrendingSnapshot | PendingSnapshot | UnavailableSnapshot;

export interface TrendingCandidate {
  fullName: string;
  periodStars: number;
  originalIndex: number;
}

const languageSlugPattern = /^[a-z0-9][a-z0-9+#.'*()-]*$/;

export function isTrendingPeriod(value: string): value is TrendingPeriod {
  return value === "daily" || value === "monthly";
}

export function normalizeLanguageSlug(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized !== "all" && !languageSlugPattern.test(normalized)) {
    throw new Error("Invalid language slug");
  }
  return normalized;
}

export function trendingSourceUrl(period: TrendingPeriod, languageSlug: string): string {
  const slug = normalizeLanguageSlug(languageSlug);
  const path = slug === "all" ? "/".slice(0, 0) : "/" + encodeURIComponent(slug);
  return "https://github.com/trending" + path + "?since=" + period;
}
