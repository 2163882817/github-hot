import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parsePeriodStars, parseTrendingHtml, TrendingParseError } from "../worker/trending-parser";
import { trendingSourceUrl, type TrendingPeriod } from "../lib/contracts";

const cases: Array<{ file: string; period: TrendingPeriod; language: string }> = [
  { file: "daily-all", period: "daily", language: "all" },
  { file: "monthly-all", period: "monthly", language: "all" },
  { file: "daily-typescript", period: "daily", language: "typescript" },
  { file: "monthly-typescript", period: "monthly", language: "typescript" }
];

for (const item of cases) {
  test("real fixture: " + item.file, async () => {
    const html = await readFile(new URL("./fixtures/trending/" + item.file + ".html", import.meta.url), "utf8");
    const result = parseTrendingHtml(html, item.period);
    assert.ok(result.totalCount > 0);
    assert.ok(result.candidates.length / result.totalCount >= 0.8);
    assert.match(trendingSourceUrl(item.period, item.language), /github\.com\/trending/);
    for (let i = 1; i < result.candidates.length; i++) {
      assert.ok(result.candidates[i - 1].periodStars >= result.candidates[i].periodStars);
    }
  });
}

test("period field is not interchangeable", () => {
  assert.equal(parsePeriodStars("2,232 stars today", "daily"), 2232);
  assert.equal(parsePeriodStars("2,232 stars this month", "monthly"), 2232);
  assert.equal(parsePeriodStars("2,232 stars today", "monthly"), null);
  assert.equal(parsePeriodStars("2,23 stars today", "daily"), null);
  assert.equal(parsePeriodStars("unknown", "daily"), null);
});

test("ties retain GitHub page order", () => {
  const row = (name: string, stars: number) => '<article class="Box-row"><h2><a href="/demo/' + name + '">' + name + '</a></h2><span class="float-sm-right">' + stars + ' stars today</span></article>';
  const html = row("first", 10) + row("second", 20) + row("third", 10);
  assert.deepEqual(parseTrendingHtml(html, "daily").candidates.map((candidate) => candidate.fullName), ["demo/second", "demo/first", "demo/third"]);
});

test("empty or malformed page fails instead of publishing an empty ranking", () => {
  assert.throws(() => parseTrendingHtml("<html></html>", "daily"), TrendingParseError);
  assert.throws(() => parseTrendingHtml('<article class="Box-row"><h2><a href="/x/y">x/y</a></h2></article>', "daily"), TrendingParseError);
});
