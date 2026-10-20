import assert from "node:assert/strict";
import test from "node:test";
import { formatBeijingTime, searchCurrentSnapshot } from "../lib/board-view";
import type { TrendingRepository } from "../lib/contracts";

const first: TrendingRepository = {
  id: "1", rank: 1, fullName: "demo/Alpha", url: "https://github.com/demo/Alpha",
  descriptionOriginal: "Fast search", language: "TypeScript", totalStars: 200,
  periodStars: 20, period: "daily", collectedAt: "2026-10-19T00:00:00Z",
  metadataUpdatedAt: "2026-10-19T00:00:00Z"
};
const second: TrendingRepository = { ...first, id: "2", rank: 2, fullName: "demo/Beta", descriptionOriginal: "Search tools", periodStars: 10 };

test("search filters only the supplied snapshot and keeps upstream rank order", () => {
  assert.deepEqual(searchCurrentSnapshot([first, second], " SEARCH ").map((item) => item.id), ["1", "2"]);
  assert.deepEqual(searchCurrentSnapshot([first, second], "beta").map((item) => item.id), ["2"]);
  assert.deepEqual(searchCurrentSnapshot([first, second], "none"), []);
  assert.deepEqual(searchCurrentSnapshot([first, second], ""), [first, second]);
});

test("snapshot times display in Beijing time", () => {
  assert.equal(formatBeijingTime("2026-10-19T00:30:00Z"), "2026-10-19 08:30");
  assert.equal(formatBeijingTime("2026-10-19T16:30:00Z", "en"), "10/20/2026 00:30");
  assert.equal(formatBeijingTime("bad"), "—");
  assert.equal(formatBeijingTime("bad", "en"), "—");
});
