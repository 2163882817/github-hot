import assert from "node:assert/strict";
import test from "node:test";
import { FAVORITES_STORAGE_KEY, favoriteFromRepository, mergeFavoriteWithSnapshot, parseFavorites, saveFavorites } from "../lib/favorites";
import type { TrendingRepository } from "../lib/contracts";

const repository: TrendingRepository = {
  id: "42", rank: 1, fullName: "owner/project", url: "https://github.com/owner/project",
  descriptionOriginal: "An open source project", language: "Go", totalStars: 120,
  periodStars: 15, period: "daily", collectedAt: "2026-10-19T01:00:00Z",
  metadataUpdatedAt: "2026-10-19T01:00:00Z"
};

test("favorites persist the stable ID and display snapshot without period stars", () => {
  const saved = favoriteFromRepository(repository, "2026-10-19T02:00:00Z");
  assert.deepEqual(parseFavorites(JSON.stringify([saved])), [saved]);
  assert.ok(!JSON.stringify(saved).includes("periodStars"));
  assert.equal(mergeFavoriteWithSnapshot(saved).periodStars, null);
  assert.equal(mergeFavoriteWithSnapshot(saved, { ...repository, periodStars: 21 }).periodStars, 21);
});

test("invalid, duplicate and unsafe stored entries are ignored", () => {
  const saved = favoriteFromRepository(repository);
  assert.deepEqual(parseFavorites(JSON.stringify([saved, saved, { ...saved, url: "https://evil.example/owner/project" }, { ...saved, id: "bad" }])), [saved]);
  assert.deepEqual(parseFavorites("broken JSON"), []);
  assert.deepEqual(parseFavorites(null), []);
});

test("write failure reports false and never implies successful persistence", () => {
  const saved = favoriteFromRepository(repository);
  assert.equal(saveFavorites({ setItem: () => { throw new Error("Storage disabled"); } }, [saved]), false);
  let written = "";
  assert.equal(saveFavorites({ setItem: (key, value) => { assert.equal(key, FAVORITES_STORAGE_KEY); written = value; } }, [saved]), true);
  assert.deepEqual(parseFavorites(written), [saved]);
});
