"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PendingSnapshot, TrendingPeriod, TrendingRepository, TrendingSnapshot } from "../lib/contracts";
import { formatBeijingTime, searchCurrentSnapshot } from "../lib/board-view";
import { FAVORITES_STORAGE_KEY, favoriteFromRepository, mergeFavoriteWithSnapshot, parseFavorites, saveFavorites, type FavoriteRepository } from "../lib/favorites";
import { RepositoryDetail } from "./repository-detail";

type BoardState = { key: string; snapshot: TrendingSnapshot | null; phase: "loading" | "ready" | "pending" | "unavailable" };
type LanguageOption = { slug: string; label: string };
const POLL_MS = 5 * 60_000;
const number = (value: number) => new Intl.NumberFormat("zh-CN").format(value);

function isSnapshot(value: unknown): value is TrendingSnapshot {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<TrendingSnapshot>;
  return item.status === "ready" && typeof item.snapshotId === "string" &&
    typeof item.collectedAt === "string" && typeof item.sourceUrl === "string" &&
    typeof item.lastSuccessfulAt === "string" && Array.isArray(item.repositories);
}

export default function TrendingBoard() {
  const [period, setPeriod] = useState<TrendingPeriod>("daily");
  const [view, setView] = useState<"trending" | "favorites">("trending");
  const [language, setLanguage] = useState("all");
  const [query, setQuery] = useState("");
  const [retry, setRetry] = useState(0);
  const [catalog, setCatalog] = useState<LanguageOption[]>([]);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [board, setBoard] = useState<BoardState | null>(null);
  const [favorites, setFavorites] = useState<FavoriteRepository[]>([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailDialog = useRef<HTMLDialogElement>(null);
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  const key = period + ":" + language;
  const visibleBoard = board?.key === key ? board : null;
  const snapshot = visibleBoard?.snapshot ?? null;
  const currentById = useMemo(() => new Map(snapshot?.repositories.map((repository) => [repository.id, repository]) ?? []), [snapshot]);
  const selectedFavorite = favorites.find((favorite) => favorite.id === selectedId);
  const selectedCurrent = selectedId ? currentById.get(selectedId) : undefined;
  const selectedRepository = view === "trending" ? selectedCurrent ?? null : selectedCurrent ?? selectedFavorite ?? null;
  const selectedPeriodStars = selectedCurrent?.periodStars ?? null;

  useEffect(() => {
    try { setFavorites(parseFavorites(window.localStorage.getItem(FAVORITES_STORAGE_KEY))); }
    catch { setStorageError(true); }
    setFavoritesLoaded(true);
    function onStorage(event: StorageEvent) {
      if (event.key === FAVORITES_STORAGE_KEY || event.key === null) {
        try { setFavorites(parseFavorites(window.localStorage.getItem(FAVORITES_STORAGE_KEY))); setStorageError(false); }
        catch { setStorageError(true); }
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const dialog = detailDialog.current;
    if (!dialog) return;
    if (selectedRepository && !dialog.open) dialog.showModal();
    else if (!selectedRepository && dialog.open) dialog.close();
  }, [selectedRepository]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadCatalog() {
      try {
        const response = await fetch("/api/v1/languages", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Language catalog unavailable");
        const body: unknown = await response.json();
        if (!body || typeof body !== "object" || !Array.isArray((body as { languages?: unknown }).languages)) {
          throw new Error("Invalid language catalog");
        }
        const options = (body as { languages: LanguageOption[] }).languages.filter((option) =>
          option && typeof option.slug === "string" && typeof option.label === "string"
        );
        setCatalog(options);
        setCatalogFailed(false);
      } catch {
        if (!controller.signal.aborted) setCatalogFailed(true);
      }
    }
    void loadCatalog();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let activeController: AbortController | null = null;
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    setBoard((previous) => ({ key, snapshot: previous?.key === key ? previous.snapshot : null, phase: "loading" }));

    async function load() {
      if (cancelled || inFlight) return;
      inFlight = true;
      const controller = new AbortController();
      activeController = controller;
      try {
        const params = new URLSearchParams({ period, language });
        const response = await fetch("/api/v1/trending?" + params, { cache: "no-store", signal: controller.signal });
        const body: unknown = await response.json();
        if (cancelled) return;
        if (response.ok && isSnapshot(body) && body.period === period && body.language === language) {
          setBoard({ key, snapshot: body, phase: "ready" });
        } else if (response.status === 202 && (body as Partial<PendingSnapshot>)?.status === "pending") {
          setBoard((previous) => ({ key, snapshot: previous?.key === key ? previous.snapshot : null, phase: "pending" }));
          const seconds = (body as PendingSnapshot).retryAfterSeconds;
          pendingTimer = setTimeout(() => void load(), Math.max(5, Math.min(60, Number(seconds) || 15)) * 1000);
        } else {
          setBoard((previous) => ({ key, snapshot: previous?.key === key ? previous.snapshot : null, phase: "unavailable" }));
        }
      } catch {
        if (!cancelled && !controller.signal.aborted) {
          setBoard((previous) => ({ key, snapshot: previous?.key === key ? previous.snapshot : null, phase: "unavailable" }));
        }
      } finally {
        inFlight = false;
        if (activeController === controller) activeController = null;
      }
    }

    void load();
    const pollTimer = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      activeController?.abort();
      if (pendingTimer) clearTimeout(pendingTimer);
      clearInterval(pollTimer);
    };
  }, [key, period, language, retry]);

  const matches = useMemo(() => searchCurrentSnapshot(snapshot?.repositories ?? [], query), [snapshot, query]);
  const displayItems = view === "trending"
    ? matches.map((repository) => ({ repository, rank: repository.rank, periodStars: repository.periodStars }))
    : favorites.map((favorite) => ({ ...mergeFavoriteWithSnapshot(favorite, currentById.get(favorite.id)), rank: null }));
  const phase = visibleBoard?.phase ?? "loading";
  const sourceUrl = snapshot?.sourceUrl ?? "https://github.com/trending" +
    (language === "all" ? "" : "/" + encodeURIComponent(language)) + "?since=" + period;

  function choosePeriod(next: TrendingPeriod) {
    if (next === period) return;
    setQuery("");
    setPeriod(next);
  }

  function chooseLanguage(next: string) {
    if (next === language) return;
    setQuery("");
    setLanguage(next);
  }

  function chooseView(next: "trending" | "favorites") {
    if (next === view) return;
    setSelectedId(null);
    setQuery("");
    setView(next);
  }

  function toggleFavorite(repository: FavoriteRepository | TrendingRepository) {
    const saved = favorites.some((favorite) => favorite.id === repository.id);
    const next = saved ? favorites.filter((favorite) => favorite.id !== repository.id) :
      [favoriteFromRepository(repository), ...favorites];
    try {
      if (!saveFavorites(window.localStorage, next)) throw new Error("Storage unavailable");
      setFavorites(next);
      setStorageError(false);
    } catch { setStorageError(true); }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="主导航">
        <div className="brand"><span className="brand-mark" aria-hidden="true">G</span><span>GitHub 热报</span></div>
        <div className="nav-section-label">发现</div>
        <nav className="sidebar-nav" aria-label="页面">
          <button className={"nav-item" + (view === "trending" ? " is-current" : "")} type="button" aria-current={view === "trending" ? "page" : undefined} onClick={() => chooseView("trending")}><span>热门榜单</span><span className="nav-index">01</span></button>
          <button className={"nav-item" + (view === "favorites" ? " is-current" : "")} type="button" aria-current={view === "favorites" ? "page" : undefined} onClick={() => chooseView("favorites")}><span>我的收藏</span><span className="nav-index">{favoritesLoaded ? String(favorites.length).padStart(2, "0") : "—"}</span></button>
        </nav>
        <div className="sidebar-footer">数据来源 GitHub Trending<br />按小时尝试同步</div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark" aria-hidden="true">G</span><span>GitHub 热报</span></div>
          <span className="topbar-caption">发现正在增长的开源项目</span>
          <span className="topbar-source">GitHub Trending / 定时快照</span>
        </header>
        <nav className="mobile-nav" aria-label="页面"><button className={view === "trending" ? "is-current" : ""} type="button" aria-current={view === "trending" ? "page" : undefined} onClick={() => chooseView("trending")}>热门榜单</button><button className={view === "favorites" ? "is-current" : ""} type="button" aria-current={view === "favorites" ? "page" : undefined} onClick={() => chooseView("favorites")}>我的收藏{favoritesLoaded && favorites.length > 0 ? " " + favorites.length : ""}</button></nav>
        <section className="page-heading" aria-labelledby="page-title">
          <div><h1 id="page-title">{view === "trending" ? "热门仓库" : "我的收藏"}</h1><p>{view === "trending" ? "按本周期新增 Star 排序" : "只保存在当前浏览器"}</p></div>
          {view === "trending" && snapshot && <div className="updated-at">最近成功更新：{formatBeijingTime(snapshot.lastSuccessfulAt)} 北京时间</div>}
        </section>

        {view === "trending" && <section className="controls" aria-label="榜单筛选">
          <div className="period-control" role="group" aria-label="榜单周期">
            <button type="button" className={period === "daily" ? "is-current" : ""} aria-pressed={period === "daily"} onClick={() => choosePeriod("daily")}>日榜</button>
            <button type="button" className={period === "monthly" ? "is-current" : ""} aria-pressed={period === "monthly"} onClick={() => choosePeriod("monthly")}>月榜</button>
          </div>
          <label className="language-control"><span className="sr-only">编程语言</span>
            <select value={language} onChange={(event) => chooseLanguage(event.target.value)}>
              <option value="all">全部语言</option>
              {catalog.filter((option) => option.slug !== "all").map((option) => <option key={option.slug} value={option.slug}>{option.label}</option>)}
            </select>
          </label>
          <label className="search-control"><span className="sr-only">搜索当前榜单</span>
            <input type="search" autoComplete="off" placeholder="搜索当前榜单中的仓库" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </section>}

        {storageError && <div className="notice" role="alert">浏览器存储不可用，收藏更改未保存。请检查浏览器存储设置后重试。</div>}
        {view === "trending" && catalogFailed && <div className="notice" role="status">语言目录暂不可用，当前可查看全部语言榜单。刷新页面后可重试。</div>}
        {view === "trending" && snapshot && (snapshot.stale || phase === "unavailable") &&
          <div className="notice" role="status">榜单暂未成功刷新，正在展示上次成功结果（{formatBeijingTime(snapshot.lastSuccessfulAt)} 北京时间）。</div>}
        <section className="results" aria-live="polite" aria-busy={view === "trending" && (phase === "loading" || phase === "pending")}>
          <div className="result-summary"><span><strong>{view === "favorites" ? "收藏" : period === "daily" ? "日榜" : "月榜"}</strong>　{view === "favorites" ? (favoritesLoaded ? displayItems.length : "—") : snapshot ? displayItems.length : "—"} 个仓库</span>
            {view === "trending" && <a href={sourceUrl} target="_blank" rel="noopener noreferrer">来源：GitHub Trending ↗</a>}</div>
          <div className="column-head" aria-hidden="true"><span>{view === "trending" ? "排名" : ""}</span><span>仓库</span><span>总 Star</span><span>{period === "daily" ? "今日新增" : "本月新增"}</span><span /></div>
          {(view === "favorites" && favoritesLoaded || view === "trending" && snapshot) ? <div className="repository-list">
            {displayItems.map(({ repository, rank, periodStars }) => {
              const [owner, ...nameParts] = repository.fullName.split("/");
              const isSaved = favorites.some((favorite) => favorite.id === repository.id);
              return <article className="repo-row" key={repository.id}>
                <div className={rank === 1 ? "rank is-first" : "rank"}>{rank === null ? "" : String(rank).padStart(2, "0")}</div>
                <div className="repo-main"><button className="repo-name" type="button" aria-label={"查看 " + repository.fullName + " 的详情"} onClick={(event) => { detailTrigger.current = event.currentTarget; setSelectedId(repository.id); }}><span className="owner">{owner} / </span>{nameParts.join("/")}</button>
                  <p className="repo-description">{repository.descriptionOriginal || "暂无简介"}</p>
                  <div className="repo-meta"><span className="language-dot" aria-hidden="true" /><span>{repository.language ?? "未标注语言"}</span><a className="repo-external" href={repository.url} target="_blank" rel="noopener noreferrer" aria-label={"在 GitHub 打开 " + repository.fullName}>GitHub ↗</a></div></div>
                <div className="total-stars">{number(repository.totalStars)}</div>
                <div className="period-stars" data-label={periodStars === null ? snapshot ? "当前榜单无此仓库" : "当前榜单尚不可用" : "本周期新增"}>{periodStars === null ? "—" : "+" + number(periodStars)}</div>
                <button className={"favorite-button" + (isSaved ? " is-saved" : "")} type="button" aria-label={(isSaved ? "取消收藏 " : "收藏 ") + repository.fullName} aria-pressed={isSaved} onClick={() => toggleFavorite(repository)}>{isSaved ? "★" : "☆"}</button>
              </article>;
            })}
          </div> : null}
          {view === "trending" && !snapshot && <div className="empty-state" role="status"><h2>{phase === "unavailable" ? "榜单暂不可用" : phase === "pending" ? "正在采集榜单" : "正在加载榜单"}</h2>
            <p>{phase === "unavailable" ? "尚无可用快照，请稍后重试。" : phase === "pending" ? "首份榜单正在准备，页面会自动重试。" : "正在读取最新快照…"}</p>
            {phase === "unavailable" && <button className="plain-command" type="button" onClick={() => setRetry((value) => value + 1)}>重试</button>}
          </div>}
          {view === "trending" && snapshot && matches.length === 0 && <div className="empty-state"><h2>{query.trim() ? "没有匹配的仓库" : "当前榜单暂无仓库"}</h2>
            <p>{query.trim() ? "试试其他关键词，或清空搜索。" : "这个榜单还没有条目，请稍后重试。"}</p>
            {query.trim() && <button className="plain-command" type="button" onClick={() => setQuery("")}>清空搜索</button>}
          </div>}
          {view === "favorites" && favoritesLoaded && favorites.length === 0 && <div className="empty-state"><h2>还没有收藏仓库</h2><p>在热门榜单中点击星标，即可将仓库保存在此浏览器中。</p><button className="plain-command" type="button" onClick={() => chooseView("trending")}>去热门榜单</button></div>}
        </section>
      </main>
      <dialog ref={detailDialog} className="repo-dialog" aria-labelledby="detail-title" onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }} onClose={() => { setSelectedId(null); detailTrigger.current?.focus(); }}>
        {selectedRepository && <RepositoryDetail repository={selectedRepository} period={period} periodStars={selectedPeriodStars} collectedAt={selectedCurrent && snapshot ? snapshot.collectedAt : null} currentListAvailable={Boolean(snapshot)} isFavorite={favorites.some((favorite) => favorite.id === selectedRepository.id)} onToggleFavorite={() => toggleFavorite(selectedRepository)} onClose={() => detailDialog.current?.close()} />}
      </dialog>
    </div>
  );
}
