import { normalizeLanguageSlug } from "./contracts";
import type { QueryDatabase } from "./trending-read";

export interface LanguageOption {
  slug: string;
  label: string;
}

export interface LanguageCatalog {
  languages: LanguageOption[];
  collectedAt: string;
}

export function validateLanguageOptions(value: unknown): LanguageOption[] {
  if (!Array.isArray(value) || value.length < 11 || value.length > 2_000) {
    throw new Error("Invalid language catalog size");
  }
  const slugs = new Set<string>();
  return value.map((item, index) => {
    if (!item || typeof item !== "object" ||
        typeof item.slug !== "string" || typeof item.label !== "string" ||
        item.slug !== normalizeLanguageSlug(item.slug) || item.slug.length > 64 ||
        item.label.trim() !== item.label || item.label.length < 1 || item.label.length > 100 ||
        slugs.has(item.slug) || (index === 0) !== (item.slug === "all")) {
      throw new Error("Invalid language catalog entry");
    }
    slugs.add(item.slug);
    return { slug: item.slug, label: item.label };
  });
}

export async function readLanguageCatalog(database: QueryDatabase): Promise<LanguageCatalog | null> {
  const result = await database.query("SELECT languages, collected_at FROM language_catalog WHERE id = true");
  const row = result.rows[0];
  if (!row) return null;
  const collectedAt = row.collected_at instanceof Date ? row.collected_at : new Date(String(row.collected_at));
  if (!Number.isFinite(collectedAt.getTime())) throw new Error("Invalid language catalog timestamp");
  const languages = validateLanguageOptions(row.languages);
  return { languages, collectedAt: collectedAt.toISOString() };
}

export async function saveLanguageCatalog(database: QueryDatabase, catalog: LanguageCatalog): Promise<void> {
  const languages = validateLanguageOptions(catalog.languages);
  const collectedAt = new Date(catalog.collectedAt);
  if (!Number.isFinite(collectedAt.getTime()) || collectedAt.toISOString() !== catalog.collectedAt) {
    throw new Error("Invalid language catalog timestamp");
  }
  await database.query(
    "INSERT INTO language_catalog (id, languages, collected_at) VALUES (true, $1::jsonb, $2) " +
    "ON CONFLICT (id) DO UPDATE SET languages = EXCLUDED.languages, collected_at = EXCLUDED.collected_at " +
    "WHERE language_catalog.collected_at <= EXCLUDED.collected_at",
    [JSON.stringify(languages), catalog.collectedAt]
  );
}
