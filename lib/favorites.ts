import type { TrendingRepository } from "./contracts";

export const FAVORITES_STORAGE_KEY = "github-hot-favorites-v1";

export interface FavoriteRepository {
  id: string;
  fullName: string;
  url: string;
  descriptionOriginal: string | null;
  language: string | null;
  totalStars: number;
  savedAt: string;
}

function isFavorite(value: unknown): value is FavoriteRepository {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<FavoriteRepository>;
  if (typeof item.id !== "string" || !/^[0-9]+$/.test(item.id) ||
    typeof item.fullName !== "string" || item.fullName.split("/").length !== 2 ||
    item.fullName.split("/").some((part) => part.length === 0) ||
    typeof item.url !== "string" || typeof item.savedAt !== "string" ||
    !Number.isFinite(Date.parse(item.savedAt)) ||
    (item.descriptionOriginal !== null && typeof item.descriptionOriginal !== "string") ||
    (item.language !== null && typeof item.language !== "string") ||
    typeof item.totalStars !== "number" || !Number.isSafeInteger(item.totalStars) || item.totalStars < 0) return false;
  try {
    const url = new URL(item.url);
    return url.protocol === "https:" && url.hostname === "github.com" &&
      url.pathname.toLowerCase() === "/" + item.fullName.toLowerCase();
  } catch { return false; }
}

export function parseFavorites(raw: string | null): FavoriteRepository[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.filter((item): item is FavoriteRepository => {
      if (!isFavorite(item) || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }).map((item) => ({
      id: item.id, fullName: item.fullName, url: item.url,
      descriptionOriginal: item.descriptionOriginal, language: item.language,
      totalStars: item.totalStars, savedAt: item.savedAt
    }));
  } catch { return []; }
}

export function saveFavorites(storage: Pick<Storage, "setItem">, favorites: FavoriteRepository[]): boolean {
  try {
    storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
    return true;
  } catch { return false; }
}

export function favoriteFromRepository(repository: TrendingRepository | FavoriteRepository, savedAt = new Date().toISOString()): FavoriteRepository {
  return {
    id: repository.id, fullName: repository.fullName, url: repository.url,
    descriptionOriginal: repository.descriptionOriginal, language: repository.language,
    totalStars: repository.totalStars, savedAt
  };
}

export function mergeFavoriteWithSnapshot(favorite: FavoriteRepository, current?: TrendingRepository):
  { repository: FavoriteRepository | TrendingRepository; periodStars: number | null } {
  return { repository: current ?? favorite, periodStars: current?.periodStars ?? null };
}
