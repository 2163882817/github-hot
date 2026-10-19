import { readFile } from "node:fs/promises";
import { parseTrendingHtml } from "../worker/trending-parser";
import { trendingSourceUrl, type TrendingPeriod } from "../lib/contracts";

const cases: Array<{ file: string; period: TrendingPeriod; language: string }> = [
  { file: "daily-all", period: "daily", language: "all" },
  { file: "monthly-all", period: "monthly", language: "all" },
  { file: "daily-typescript", period: "daily", language: "typescript" },
  { file: "monthly-typescript", period: "monthly", language: "typescript" }
];

for (const item of cases) {
  const html = await readFile(new URL("../tests/fixtures/trending/" + item.file + ".html", import.meta.url), "utf8");
  const result = parseTrendingHtml(html, item.period);
  console.log(JSON.stringify({
    fixture: item.file,
    sourceUrl: trendingSourceUrl(item.period, item.language),
    total: result.totalCount,
    valid: result.candidates.length,
    invalid: result.invalidCount,
    first: result.candidates[0]
  }));
}
