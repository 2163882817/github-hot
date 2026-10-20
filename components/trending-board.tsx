"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PendingSnapshot, TrendingPeriod, TrendingRepository, TrendingSnapshot } from "../lib/contracts";
import { formatBeijingTime, searchCurrentSnapshot } from "../lib/board-view";
import { FAVORITES_STORAGE_KEY, favoriteFromRepository, mergeFavoriteWithSnapshot, parseFavorites, saveFavorites, type FavoriteRepository } from "../lib/favorites";
import { LOCALE_STORAGE_KEY, messages, preferredLocale, type Locale } from "../lib/i18n";
import { RepositoryDetail } from "./repository-detail";

type BoardState = { key: string; snapshot: TrendingSnapshot | null; phase: "loading" | "ready" | "pending" | "unavailable" };
type LanguageOption = { slug: string; label: string };
const POLL_MS = 5 * 60_000;
const number = (value: number, locale: Locale) => new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US").format(value);

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
  const [locale, setLocale] = useState<Locale>("zh");
  const [localeReady, setLocaleReady] = useState(false);
  const [localeStorageError, setLocaleStorageError] = useState(false);
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
  const t = messages[locale];

  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(LOCALE_STORAGE_KEY); } catch { setLocaleStorageError(true); }
    const next = preferredLocale(saved, window.navigator.language);
    setLocale(next);
    document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
    document.title = messages[next].brand;
    setLocaleReady(true);
  }, []);

  function chooseLocale(next: Locale) {
    if (next === locale) return;
    setLocale(next);
    document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
    document.title = messages[next].brand;
    try { window.localStorage.setItem(LOCALE_STORAGE_KEY, next); setLocaleStorageError(false); }
    catch { setLocaleStorageError(true); }
  }

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
    <div className={"app-shell" + (localeReady ? "" : " locale-loading")}>
      <aside className="sidebar" aria-label={localeReady ? t.trending : undefined}>
        <div className="brand"><span className="brand-mark" aria-hidden="true">G</span><span>{t.brand}</span></div>
        <div className="nav-section-label">{t.discover}</div>
        <nav className="sidebar-nav" aria-label={t.discover}>
          <button className={"nav-item" + (view === "trending" ? " is-current" : "")} type="button" aria-current={view === "trending" ? "page" : undefined} onClick={() => chooseView("trending")}><span>{t.trending}</span><span className="nav-index">01</span></button>
          <button className={"nav-item" + (view === "favorites" ? " is-current" : "")} type="button" aria-current={view === "favorites" ? "page" : undefined} onClick={() => chooseView("favorites")}><span>{t.favorites}</span><span className="nav-index">{favoritesLoaded ? String(favorites.length).padStart(2, "0") : "—"}</span></button>
        </nav>
        <div className="sidebar-footer">{t.sourceFooter}<br />{t.syncFooter}</div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark" aria-hidden="true">G</span><span>{t.brand}</span></div>
          <span className="topbar-caption">{t.tagline}</span>
          <div className="topbar-actions"><span className="topbar-source">{t.timedSnapshot}</span><div className="locale-control" role="group" aria-label="Interface language / 界面语言"><button type="button" className={locale === "zh" ? "is-current" : ""} aria-pressed={locale === "zh"} onClick={() => chooseLocale("zh")}>中文</button><span aria-hidden="true">/</span><button type="button" className={locale === "en" ? "is-current" : ""} aria-pressed={locale === "en"} onClick={() => chooseLocale("en")}>English</button></div></div>
        </header>
        <nav className="mobile-nav" aria-label={t.discover}><button className={view === "trending" ? "is-current" : ""} type="button" aria-current={view === "trending" ? "page" : undefined} onClick={() => chooseView("trending")}>{t.trending}</button><button className={view === "favorites" ? "is-current" : ""} type="button" aria-current={view === "favorites" ? "page" : undefined} onClick={() => chooseView("favorites")}>{t.favorites}{favoritesLoaded && favorites.length > 0 ? " " + favorites.length : ""}</button></nav>
        <section className="page-heading" aria-labelledby="page-title">
          <div><h1 id="page-title">{view === "trending" ? t.trendingTitle : t.favoritesTitle}</h1><p>{view === "trending" ? t.trendingSubtitle : t.favoritesSubtitle}</p></div>
          {view === "trending" && snapshot && <div className="updated-at">{t.lastUpdated}{formatBeijingTime(snapshot.lastSuccessfulAt, locale)} {t.beijing}</div>}
        </section>

        {view === "trending" && <section className="controls" aria-label={t.filters}>
          <div className="period-control" role="group" aria-label={t.period}>
            <button type="button" className={period === "daily" ? "is-current" : ""} aria-pressed={period === "daily"} onClick={() => choosePeriod("daily")}>{t.daily}</button>
            <button type="button" className={period === "monthly" ? "is-current" : ""} aria-pressed={period === "monthly"} onClick={() => choosePeriod("monthly")}>{t.monthly}</button>
          </div>
          <label className="language-control"><span className="sr-only">{t.programmingLanguage}</span>
            <select value={language} onChange={(event) => chooseLanguage(event.target.value)}>
              <option value="all">{t.allLanguages}</option>
              {catalog.filter((option) => option.slug !== "all").map((option) => <option key={option.slug} value={option.slug}>{option.label}</option>)}
            </select>
          </label>
          <label className="search-control"><span className="sr-only">{t.search}</span>
            <input type="search" autoComplete="off" placeholder={t.searchPlaceholder} value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </section>}

        {storageError && <div className="notice" role="alert">{t.storageError}</div>}
        {localeStorageError && <div className="notice" role="status">{t.localeStorageError}</div>}
        {view === "trending" && catalogFailed && <div className="notice" role="status">{t.catalogUnavailable}</div>}
        {view === "trending" && snapshot && (snapshot.stale || phase === "unavailable") &&
          <div className="notice" role="status">{t.stalePrefix}{formatBeijingTime(snapshot.lastSuccessfulAt, locale)} {t.beijing}{t.staleSuffix}</div>}
        <section className="results" aria-live="polite" aria-busy={view === "trending" && (phase === "loading" || phase === "pending")}>
          <div className="result-summary"><span><strong>{view === "favorites" ? t.saved : period === "daily" ? t.daily : t.monthly}</strong>　{view === "favorites" ? (favoritesLoaded ? displayItems.length : "—") : snapshot ? displayItems.length : "—"} {t.repositories}</span>
            {view === "trending" && <a href={sourceUrl} target="_blank" rel="noopener noreferrer">{t.source}</a>}</div>
          <div className="column-head" aria-hidden="true"><span>{view === "trending" ? t.rank : ""}</span><span>{t.repository}</span><span>{t.totalStars}</span><span>{period === "daily" ? t.todayGain : t.monthlyGain}</span><span /></div>
          {(view === "favorites" && favoritesLoaded || view === "trending" && snapshot) ? <div className="repository-list">
            {displayItems.map(({ repository, rank, periodStars }) => {
              const [owner, ...nameParts] = repository.fullName.split("/");
              const isSaved = favorites.some((favorite) => favorite.id === repository.id);
              return <article className="repo-row" key={repository.id}>
                <div className={rank === 1 ? "rank is-first" : "rank"}>{rank === null ? "" : String(rank).padStart(2, "0")}</div>
                <div className="repo-main"><button className="repo-name" type="button" aria-label={t.viewDetailsPrefix + repository.fullName + t.viewDetailsSuffix} onClick={(event) => { detailTrigger.current = event.currentTarget; setSelectedId(repository.id); }}><span className="owner">{owner} / </span>{nameParts.join("/")}</button>
                  <p className="repo-description">{repository.descriptionOriginal || t.noDescription}</p>
                  <div className="repo-meta"><span className="language-dot" aria-hidden="true" /><span>{repository.language ?? t.unmarkedLanguage}</span><a className="repo-external" href={repository.url} target="_blank" rel="noopener noreferrer" aria-label={t.openGithubName + repository.fullName}>GitHub ↗</a></div></div>
                <div className="total-stars">{number(repository.totalStars, locale)}</div>
                <div className="period-stars" data-label={periodStars === null ? snapshot ? t.currentListMissing : t.currentListUnavailable : t.periodGain}>{periodStars === null ? "—" : "+" + number(periodStars, locale)}</div>
                <button className={"favorite-button" + (isSaved ? " is-saved" : "")} type="button" aria-label={(isSaved ? t.unsavePrefix : t.savePrefix) + repository.fullName} aria-pressed={isSaved} onClick={() => toggleFavorite(repository)}>{isSaved ? "★" : "☆"}</button>
              </article>;
            })}
          </div> : null}
          {view === "trending" && !snapshot && <div className="empty-state" role="status"><h2>{phase === "unavailable" ? t.unavailableTitle : phase === "pending" ? t.pendingTitle : t.loadingTitle}</h2>
            <p>{phase === "unavailable" ? t.unavailableBody : phase === "pending" ? t.pendingBody : t.loadingBody}</p>
            {phase === "unavailable" && <button className="plain-command" type="button" onClick={() => setRetry((value) => value + 1)}>{t.retry}</button>}
          </div>}
          {view === "trending" && snapshot && matches.length === 0 && <div className="empty-state"><h2>{query.trim() ? t.noMatchTitle : t.noRepositoriesTitle}</h2>
            <p>{query.trim() ? t.noMatchBody : t.noRepositoriesBody}</p>
            {query.trim() && <button className="plain-command" type="button" onClick={() => setQuery("")}>{t.clearSearch}</button>}
          </div>}
          {view === "favorites" && favoritesLoaded && favorites.length === 0 && <div className="empty-state"><h2>{t.noFavoritesTitle}</h2><p>{t.noFavoritesBody}</p><button className="plain-command" type="button" onClick={() => chooseView("trending")}>{t.goTrending}</button></div>}
        </section>
      </main>
      <dialog ref={detailDialog} className="repo-dialog" aria-labelledby="detail-title" onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }} onClose={() => { setSelectedId(null); detailTrigger.current?.focus(); }}>
        {selectedRepository && <RepositoryDetail repository={selectedRepository} period={period} periodStars={selectedPeriodStars} collectedAt={selectedCurrent && snapshot ? snapshot.collectedAt : null} currentListAvailable={Boolean(snapshot)} isFavorite={favorites.some((favorite) => favorite.id === selectedRepository.id)} locale={locale} onToggleFavorite={() => toggleFavorite(selectedRepository)} onClose={() => detailDialog.current?.close()} />}
      </dialog>
    </div>
  );
}
