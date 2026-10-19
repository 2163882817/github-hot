import { load } from "cheerio";
import { readLanguageCatalog, saveLanguageCatalog, type LanguageCatalog, type LanguageOption } from "../lib/language-catalog";
import type { QueryDatabase } from "../lib/trending-read";
import { normalizeLanguageSlug } from "../lib/contracts";

const sourceUrl = "https://github.com/trending?since=daily";
const maximumHtmlBytes = 2_000_000;
const languageHref = /^\/trending\/([^/?#]+)\?since=daily$/;

export function parseLanguageDirectory(html: string): LanguageOption[] {
  const $ = load(html);
  const menu = $("#select-menu-language #languages-menuitems [data-filter-list]").first();
  const links = menu.find('a[role="menuitemradio"][href]');
  if (links.length < 10) throw new Error("GitHub language menu is missing or incomplete");
  const languages: LanguageOption[] = [{ slug: "all", label: "全部语言" }];
  const seen = new Set<string>(["all"]);
  for (const link of links.toArray()) {
    const match = ($(link).attr("href") ?? "").match(languageHref);
    const label = $(link).find("[data-menu-button-text]").first().text().trim().replace(/\s+/g, " ");
    if (!match || !label || label.length > 100) throw new Error("Invalid GitHub language menu entry");
    let slug: string;
    try {
      slug = decodeURIComponent(match[1]);
      if (slug !== normalizeLanguageSlug(slug) || slug.length > 64) throw new Error("Invalid slug");
    } catch {
      throw new Error("Invalid GitHub language menu entry: " + match[1]);
    }
    // GitHub's menu can repeat a language entry; keep the first occurrence.
    if (seen.has(slug)) continue;
    languages.push({ slug, label });
    seen.add(slug);
  }
  if (languages.length < 11 || languages.length > 2_000) throw new Error("Unexpected GitHub language menu size");
  return languages;
}

export interface RefreshLanguageOptions {
  database: QueryDatabase;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

// Failure leaves the previously saved catalog intact; callers can continue to serve it.
export async function refreshLanguageDirectory(options: RefreshLanguageOptions): Promise<LanguageCatalog> {
  const timeoutMs = options.timeoutMs ?? 12_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new RangeError("Invalid directory timeout");
  const response = await (options.fetchImpl ?? fetch)(sourceUrl, {
    headers: { Accept: "text/html", "User-Agent": "github-hot-report" },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
    throw new Error("GitHub language directory unavailable");
  }
  const length = response.headers.get("content-length");
  if (length !== null && Number(length) > maximumHtmlBytes) throw new Error("GitHub language directory too large");
  const html = await response.text();
  if (Buffer.byteLength(html, "utf8") > maximumHtmlBytes) throw new Error("GitHub language directory too large");
  const catalog: LanguageCatalog = {
    languages: parseLanguageDirectory(html),
    collectedAt: new Date((options.now ?? Date.now)()).toISOString()
  };
  await saveLanguageCatalog(options.database, catalog);
  return catalog;
}

export async function refreshLanguageDirectoryWithFallback(options: RefreshLanguageOptions): Promise<LanguageCatalog | null> {
  try {
    return await refreshLanguageDirectory(options);
  } catch {
    return readLanguageCatalog(options.database);
  }
}
