import { load } from "cheerio";
import type { TrendingCandidate, TrendingPeriod } from "../lib/contracts";

export interface ParseResult {
  candidates: TrendingCandidate[];
  invalidCount: number;
  totalCount: number;
}

export class TrendingParseError extends Error {}

const repositoryPath = /^\/([^/?#\s]+)\/([^/?#\s]+)\/?$/;

export function parsePeriodStars(text: string, period: TrendingPeriod): number | null {
  const unit = period === "daily" ? "today" : "this month";
  const expression = "^((?:[0-9]+|[1-9][0-9]{0,2}(?:,[0-9]{3})+)) stars? " + unit + "$";
  const match = text.trim().replace(/\s+/g, " ").match(new RegExp(expression, "i"));
  if (!match) return null;
  const value = Number(match[1].replaceAll(",", ""));
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function parseTrendingHtml(html: string, period: TrendingPeriod): ParseResult {
  const $ = load(html);
  const articles = $("article.Box-row");
  const candidates: TrendingCandidate[] = [];
  let invalidCount = 0;

  articles.each((originalIndex, article) => {
    const path = $(article).find("h2 a[href]").first().attr("href")?.trim() ?? "";
    const repoMatch = path.match(repositoryPath);
    const gainText = $(article).find("span.float-sm-right").last().text();
    const periodStars = parsePeriodStars(gainText, period);
    if (!repoMatch || periodStars === null) {
      invalidCount += 1;
      return;
    }
    candidates.push({ fullName: repoMatch[1] + "/" + repoMatch[2], periodStars, originalIndex });
  });

  if (articles.length === 0 || candidates.length / articles.length < 0.8) {
    throw new TrendingParseError("Invalid Trending page: " + candidates.length + "/" + articles.length + " usable entries");
  }

  candidates.sort((a, b) => b.periodStars - a.periodStars || a.originalIndex - b.originalIndex);
  return { candidates, invalidCount, totalCount: articles.length };
}
