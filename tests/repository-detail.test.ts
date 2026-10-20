import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RepositoryDetail } from "../components/repository-detail";
import type { TrendingRepository, TrendingSnapshot } from "../lib/contracts";

const repository: TrendingRepository = {
  id: "100", rank: 2, fullName: "sample/project", url: "https://github.com/sample/project",
  descriptionOriginal: "A useful project", language: "TypeScript", totalStars: 1234,
  periodStars: 56, period: "daily", collectedAt: "2026-10-19T02:30:00Z",
  metadataUpdatedAt: "2026-10-19T02:30:00Z"
};

const snapshot: TrendingSnapshot = {
  status: "ready", snapshotId: "snapshot-1", period: "daily", language: "all",
  sourceUrl: "https://github.com/trending?since=daily", collectedAt: repository.collectedAt,
  lastSuccessfulAt: repository.collectedAt, stale: false, repositories: [repository]
};

test("detail uses exactly the current list repository fields and source link", () => {
  const html = renderToStaticMarkup(createElement(RepositoryDetail, { repository, period: "daily", periodStars: 56, collectedAt: snapshot.collectedAt, currentListAvailable: true, isFavorite: false, onToggleFavorite: () => {}, onClose: () => {} }));
  assert.ok(html.includes("sample/project"));
  assert.match(html, /A useful project/);
  assert.match(html, /TypeScript/);
  assert.match(html, /1,234/);
  assert.ok(html.includes("+56"));
  assert.ok(html.includes('href="https://github.com/sample/project"'));
  assert.match(html, /2026-10-19 10:30 北京时间/);
  assert.match(html, /今日新增/);
});

test("monthly detail changes the gain label and missing descriptions stay readable", () => {
  const monthly = { ...repository, period: "monthly" as const, periodStars: 800, descriptionOriginal: null };
  const html = renderToStaticMarkup(createElement(RepositoryDetail, { repository: monthly, period: "monthly", periodStars: 800, collectedAt: snapshot.collectedAt, currentListAvailable: true, isFavorite: false, onToggleFavorite: () => {}, onClose: () => {} }));
  assert.match(html, /本月新增/);
  assert.ok(html.includes("+800"));
  assert.match(html, /暂无简介/);
});

test("saved repository absent from current ranking has no old period star count", () => {
  const html = renderToStaticMarkup(createElement(RepositoryDetail, { repository, period: "monthly", periodStars: null, collectedAt: null, currentListAvailable: true, isFavorite: true, onToggleFavorite: () => {}, onClose: () => {} }));
  assert.match(html, /当前榜单无此仓库/);
  assert.ok(!html.includes("+56"));
  assert.match(html, /取消收藏/);
});

test("unavailable current list does not claim a saved repository left the ranking", () => {
  const html = renderToStaticMarkup(createElement(RepositoryDetail, { repository, period: "daily", periodStars: null, collectedAt: null, currentListAvailable: false, isFavorite: true, onToggleFavorite: () => {}, onClose: () => {} }));
  assert.match(html, /当前榜单尚不可用/);
  assert.ok(!html.includes("当前榜单无此仓库"));
});
