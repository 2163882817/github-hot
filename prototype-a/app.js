const repositories = [
  { id: "937253475", fullName: "anthropics/claude-code", language: "TypeScript", totalStars: 61284, daily: 2846, monthly: 10984, en: "An agentic coding tool that lives in your terminal and helps you understand and change code." },
  { id: "896971115", fullName: "microsoft/markitdown", language: "Python", totalStars: 73915, daily: 1972, monthly: 8360, en: "Convert files and office documents to Markdown for analysis and processing." },
  { id: "953687331", fullName: "bytedance/deer-flow", language: "Python", totalStars: 18423, daily: 1438, monthly: 6821, en: "An open source deep research and workflow framework for complex tasks." },
  { id: "1024118326", fullName: "Tencent/WeKnora", language: "TypeScript", totalStars: 12769, daily: 986, monthly: 5146, en: "Build a searchable knowledge base for individuals and teams." },
  { id: "632282149", fullName: "astral-sh/ruff", language: "Rust", totalStars: 42508, daily: 753, monthly: 3914, en: "A fast Python linter and formatter written in Rust." },
  { id: "449703338", fullName: "ollama/ollama", language: "Go", totalStars: 151632, daily: 624, monthly: 7908, en: "Run and manage open models on your own machine." },
  { id: "418774769", fullName: "vitejs/vite", language: "TypeScript", totalStars: 73719, daily: 512, monthly: 2865, en: "A fast build tool for modern web projects." },
  { id: "984350267", fullName: "openai/codex", language: "Rust", totalStars: 38904, daily: 487, monthly: 4478, en: "An open source coding agent that runs in your terminal." },
  { id: "319404106", fullName: "charmbracelet/bubbletea", language: "Go", totalStars: 35382, daily: 291, monthly: 1234, en: "A framework for building terminal user interfaces in Go." }
];

// Language pages intentionally contain repositories absent from the all-language sample.
const snapshots = {
  daily: {
    all: [0, 1, 2, 3, 4, 5, 6],
    TypeScript: [0, 3, 6],
    Python: [1, 2],
    Rust: [4, 7],
    Go: [5, 8]
  },
  monthly: {
    all: [0, 1, 5, 2, 3, 7, 4],
    TypeScript: [0, 3, 6],
    Python: [1, 2],
    Rust: [7, 4],
    Go: [5, 8]
  }
};

const copy = {
  zh: {
    discover: "发现", trending: "热门榜单", favorites: "我的收藏", source: "数据来源 GitHub Trending", hourly: "按小时尝试同步", caption: "发现正在增长的开源项目",
    daily: "日榜", monthly: "月榜", programmingLanguage: "编程语言", search: "搜索当前榜单", sourceShort: "来源：GitHub Trending", rank: "排名", repository: "仓库", totalStars: "总 Star", repoDetails: "仓库详情",
    trendingTitle: "热门仓库", favoritesTitle: "我的收藏", trendingSubtitle: "按本周期新增 Star 排序", favoritesSubtitle: "保存在当前浏览器中的仓库",
    allLanguages: "全部语言", searchPlaceholder: "搜索当前榜单中的仓库", updated: "最近更新", beijing: "北京时间", count: "个仓库", todayGain: "今日新增", monthGain: "月榜新增", periodGain: "本周期新增",
    save: "收藏仓库", unsave: "取消收藏", saved: "已收藏", openGithub: "在 GitHub 打开", language: "编程语言", lastSync: "采集时间",
    noMatchTitle: "没有匹配的仓库", noMatchBody: "试试其他关键词，或清空当前搜索。", clearSearch: "清空搜索", noFavoritesTitle: "还没有收藏仓库", noFavoritesBody: "在榜单中点击星标，仓库就会保存在这里。",
    unavailable: "当前榜单无此仓库", stale: "数据暂未更新，正在显示上次成功同步的榜单。", failedTitle: "榜单暂时无法加载", failedBody: "目前没有可用的榜单数据，请稍后重试。", retry: "重试",
    storageError: "此浏览器无法保存收藏。", added: "已加入收藏", removed: "已取消收藏", missingGain: "当前榜单无数据", details: "查看详情", back: "关闭",
    translationSettings: "翻译设置", translationIntro: "使用自己的 OpenAI API Key，按需翻译仓库简介。", apiKey: "OpenAI API Key", showKey: "显示", hideKey: "隐藏", clearKey: "清除 Key", saveKey: "本次会话使用", translationDisclosure: "仅在当前页面会话使用；翻译可能产生费用，简介原文会发送给 AI 服务。此静态原型不调用服务，请勿输入真实 Key。", keyNotSet: "尚未配置 Key", keyReady: "已配置 Key，仅当前页面有效", keySaved: "Key 已设置，仅当前页面有效", keyCleared: "Key 已清除", keyRequired: "请输入 Key", translateDescription: "翻译简介", translationUnavailable: "原型未接入翻译服务", translationReady: "已配置，可发起翻译"
  },
  en: {
    discover: "Discover", trending: "Trending", favorites: "Saved", source: "Source: GitHub Trending", hourly: "Sync attempted hourly", caption: "Find open source projects on the rise",
    daily: "Daily", monthly: "Monthly", programmingLanguage: "Programming language", search: "Search this list", sourceShort: "Source: GitHub Trending", rank: "Rank", repository: "Repository", totalStars: "Total stars", repoDetails: "Repository details",
    trendingTitle: "Trending repositories", favoritesTitle: "Saved repositories", trendingSubtitle: "Ranked by stars gained in this period", favoritesSubtitle: "Repositories saved in this browser",
    allLanguages: "All languages", searchPlaceholder: "Search repositories in this list", updated: "Last updated", beijing: "Beijing time", count: "repositories", todayGain: "Gained today", monthGain: "Monthly gain", periodGain: "Gained this period",
    save: "Save repository", unsave: "Remove from saved", saved: "Saved", openGithub: "Open on GitHub", language: "Language", lastSync: "Collected at",
    noMatchTitle: "No matching repositories", noMatchBody: "Try another term or clear the search.", clearSearch: "Clear search", noFavoritesTitle: "No saved repositories yet", noFavoritesBody: "Use the star button on a repository to save it here.",
    unavailable: "Not in the current list", stale: "The list could not be refreshed. Showing the last successful snapshot.", failedTitle: "Unable to load the list", failedBody: "No snapshot is available yet. Please try again later.", retry: "Retry",
    storageError: "This browser cannot save repositories.", added: "Saved repository", removed: "Removed from saved", missingGain: "Unavailable in this list", details: "View details", back: "Close",
    translationSettings: "Translation settings", translationIntro: "Use your own OpenAI API key to translate descriptions on demand.", apiKey: "OpenAI API key", showKey: "Show", hideKey: "Hide", clearKey: "Clear key", saveKey: "Use for this session", translationDisclosure: "Used only for this page session. Translation may incur charges and sends the original description to the AI service. This static prototype does not call a service; do not enter a real key.", keyNotSet: "No key configured", keyReady: "Key configured for this page only", keySaved: "Key set for this page only", keyCleared: "Key cleared", keyRequired: "Enter a key", translateDescription: "Translate description", translationUnavailable: "Translation service is not connected in this prototype", translationReady: "Ready to translate"
  }
};

const byId = new Map(repositories.map((repository) => [repository.id, repository]));
let fixtureState = new URLSearchParams(location.search).get("state");
const state = {
  view: "trending",
  period: "daily",
  language: "all",
  query: "",
  locale: readPreference("hotreport-locale") || (navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en"),
  favorites: readFavorites(),
  detailId: null,
  hasKey: false
};
if (!copy[state.locale]) state.locale = "zh";

const $ = (selector) => document.querySelector(selector);
const list = $("#repository-list");
const dialog = $("#repo-dialog");
const translationDialog = $("#translation-dialog");
let userAiKey = null;
let toastTimeout;

function readPreference(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function readFavorites() {
  try {
    const value = JSON.parse(localStorage.getItem("hotreport-favorites") || "[]");
    return Array.isArray(value) ? value.filter((id) => typeof id === "string" && byId.has(id)) : [];
  } catch { return []; }
}

function savePreference(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function number(value) {
  return new Intl.NumberFormat(state.locale === "zh" ? "zh-CN" : "en-US").format(value);
}

function sourceUrl() {
  const languagePath = state.language === "all" ? "" : `/${state.language.toLowerCase()}`;
  return `https://github.com/trending${languagePath}?since=${state.period}`;
}

function currentItems() {
  const ids = snapshots[state.period][state.language];
  return ids.map((index) => repositories[index]).sort((a, b) => b[state.period] - a[state.period]);
}

function matchingItems() {
  const items = state.view === "favorites" ? state.favorites.map((id) => byId.get(id)).filter(Boolean) : currentItems();
  const query = state.query.trim().toLocaleLowerCase();
  if (!query) return items;
  return items.filter((repository) => [repository.fullName, repository.en].some((value) => value.toLocaleLowerCase().includes(query)));
}

function isInCurrentList(id) {
  return currentItems().some((repository) => repository.id === id);
}

function showToast(message) {
  const toast = $("#toast");
  clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.hidden = false;
  toastTimeout = setTimeout(() => { toast.hidden = true; }, 2800);
}

function renderRow(repository, index) {
  const t = copy[state.locale];
  const [owner, name] = repository.fullName.split("/");
  const saved = state.favorites.includes(repository.id);
  const current = state.view === "trending" || isInCurrentList(repository.id);
  const gain = current ? `+${number(repository[state.period])}` : "--";
  const rank = state.view === "trending" ? String(index + 1).padStart(2, "0") : "";
  const translation = `<span class="translation-controls"><button class="translation-command" type="button" data-translate="${repository.id}">${t.translateDescription}</button><span class="translation-label">${state.hasKey ? t.translationReady : t.keyNotSet}</span></span>`;
  return `<article class="repo-row">
    <div class="rank ${index === 0 && state.view === "trending" ? "is-first" : ""}">${rank}</div>
    <div class="repo-main"><button class="repo-name" type="button" data-detail="${repository.id}" title="${escapeHtml(t.details)}"><span class="owner">${escapeHtml(owner)} / </span>${escapeHtml(name)}</button>
      <p class="repo-description">${escapeHtml(repository.en)}</p><div class="repo-meta"><span class="language-dot ${repository.language.toLowerCase()}"></span><span>${escapeHtml(repository.language)}</span>${translation}</div></div>
    <div class="total-stars">${number(repository.totalStars)}</div>
    <div class="period-stars" data-label="${escapeHtml(current ? t.periodGain : t.missingGain)}">${gain}</div>
    <button class="favorite-button ${saved ? "is-saved" : ""}" type="button" data-favorite="${repository.id}" aria-label="${escapeHtml(saved ? t.unsave : t.save)}" title="${escapeHtml(saved ? t.unsave : t.save)}" aria-pressed="${saved}">${saved ? "★" : "☆"}</button>
  </article>`;
}

function renderEmpty(items) {
  const t = copy[state.locale];
  const empty = $("#empty-state");
  const failed = fixtureState === "error" && state.view === "trending";
  empty.hidden = items.length > 0;
  if (empty.hidden) return;
  const searched = Boolean(state.query.trim());
  $("#empty-title").textContent = failed ? t.failedTitle : searched ? t.noMatchTitle : t.noFavoritesTitle;
  $("#empty-message").textContent = failed ? t.failedBody : searched ? t.noMatchBody : t.noFavoritesBody;
  $("#clear-search").hidden = !searched && !failed;
  $("#clear-search").textContent = failed ? t.retry : t.clearSearch;
}

function render() {
  const t = copy[state.locale];
  document.documentElement.lang = state.locale === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((element) => { element.textContent = t[element.dataset.i18n]; });
  document.querySelectorAll("[data-view]").forEach((button) => { const active = button.dataset.view === state.view; button.classList.toggle("is-current", active); button.setAttribute("aria-current", active ? "page" : "false"); });
  document.querySelectorAll("[data-period]").forEach((button) => { const active = button.dataset.period === state.period; button.classList.toggle("is-current", active); button.setAttribute("aria-pressed", String(active)); });
  document.querySelectorAll("[data-locale]").forEach((button) => { const active = button.dataset.locale === state.locale; button.classList.toggle("is-current", active); button.setAttribute("aria-pressed", String(active)); });
  $("#favorite-count").textContent = String(state.favorites.length).padStart(2, "0");
  $("#page-title").textContent = state.view === "trending" ? t.trendingTitle : t.favoritesTitle;
  $("#page-subtitle").textContent = state.view === "trending" ? t.trendingSubtitle : t.favoritesSubtitle;
  $("#updated-at").textContent = `${t.updated} 2026-10-17 10:00 · ${t.beijing}`;
  $("#updated-at").hidden = state.view !== "trending";
  $("#trending-controls").hidden = state.view !== "trending";
  $("#language-filter option[value='all']").textContent = t.allLanguages;
  $("#language-filter").value = state.language;
  $("#search-input").placeholder = t.searchPlaceholder;
  if ($("#search-input").value !== state.query) $("#search-input").value = state.query;
  $("#period-column").textContent = state.period === "daily" ? t.todayGain : t.monthGain;
  $("#rank-column").textContent = state.view === "trending" ? t.rank : "";
  $("#source-link").href = sourceUrl();
  $("#source-link").hidden = state.view !== "trending";
  const notice = $("#stale-notice");
  notice.hidden = fixtureState !== "stale" || state.view !== "trending";
  notice.textContent = t.stale;

  const items = fixtureState === "error" && state.view === "trending" ? [] : matchingItems();
  $("#result-count").innerHTML = `<strong>${state.view === "trending" ? (state.period === "daily" ? t.daily : t.monthly) : t.favorites}</strong>　${items.length} ${t.count}`;
  list.innerHTML = items.map(renderRow).join("");
  renderEmpty(items);
  $("#close-dialog").setAttribute("aria-label", t.back);
  $("#close-dialog").title = t.back;
  $("#close-translation-dialog").setAttribute("aria-label", t.back);
  $("#close-translation-dialog").title = t.back;
  $("#toggle-key-visibility").textContent = $("#user-ai-key").type === "password" ? t.showKey : t.hideKey;
  $("#key-status").textContent = state.hasKey ? t.keyReady : t.keyNotSet;
  if (dialog.open && state.detailId) renderDetail();
}

function renderDetail() {
  const repository = byId.get(state.detailId);
  if (!repository) return;
  const t = copy[state.locale];
  const saved = state.favorites.includes(repository.id);
  const current = isInCurrentList(repository.id);
  const description = repository.en;
  const translationButton = `<div class="detail-translation"><button type="button" class="translation-command" data-translate="${repository.id}">${t.translateDescription}</button><span class="translation-label">${state.hasKey ? t.translationReady : t.keyNotSet}</span></div>`;
  $("#dialog-content").innerHTML = `<div class="detail-body"><h2 id="dialog-title">${escapeHtml(repository.fullName)}</h2><p>${escapeHtml(description)}</p>${translationButton}
    <div class="detail-stats"><div><span>${t.totalStars}</span><strong>${number(repository.totalStars)}</strong></div><div><span>${state.period === "daily" ? t.todayGain : t.monthGain}</span><strong class="accent">${current ? `+${number(repository[state.period])}` : "--"}</strong></div></div>
    <div class="detail-actions"><a class="primary-action" href="https://github.com/${encodeURI(repository.fullName)}" target="_blank" rel="noopener noreferrer">${t.openGithub} ↗</a><button class="secondary-action" type="button" id="detail-favorite">${saved ? t.unsave : t.save}</button></div>
    <div class="detail-foot">${t.language}: ${escapeHtml(repository.language)}<br>${current ? `${t.lastSync}: 2026-10-17 10:00 ${t.beijing}` : t.unavailable}</div></div>`;
}

function openDetail(id) {
  state.detailId = id;
  renderDetail();
  dialog.showModal();
}

function toggleFavorite(id) {
  const t = copy[state.locale];
  const saved = state.favorites.includes(id);
  const next = saved ? state.favorites.filter((favorite) => favorite !== id) : [id, ...state.favorites];
  if (!savePreference("hotreport-favorites", JSON.stringify(next))) { showToast(t.storageError); return; }
  state.favorites = next;
  render();
  showToast(saved ? t.removed : t.added);
}

document.addEventListener("click", (event) => {
  if (event.target.closest("#translation-settings-trigger")) { translationDialog.showModal(); return; }
  if (event.target.closest("[data-translate]")) {
    if (!userAiKey) { translationDialog.showModal(); $("#user-ai-key").focus(); }
    else showToast(copy[state.locale].translationUnavailable);
    return;
  }
  if (event.target.id === "save-user-key") {
    const input = $("#user-ai-key");
    if (!input.value.trim()) { $("#key-status").textContent = copy[state.locale].keyRequired; input.focus(); return; }
    // Clear input before leaving this synchronous handler; no real key is retained.
    input.value = "";
    // Static demo: represent configured state without retaining an actual secret.
    userAiKey = "configured";
    state.hasKey = true;
    translationDialog.close();
    render();
    showToast(copy[state.locale].keySaved);
    return;
  }
  if (event.target.id === "clear-user-key") { userAiKey = null; state.hasKey = false; $("#user-ai-key").value = ""; render(); showToast(copy[state.locale].keyCleared); return; }
  if (event.target.id === "toggle-key-visibility") { const input = $("#user-ai-key"); input.type = input.type === "password" ? "text" : "password"; event.target.textContent = copy[state.locale][input.type === "password" ? "showKey" : "hideKey"]; return; }
  if (event.target.id === "close-translation-dialog") { translationDialog.close(); return; }
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) { state.view = viewButton.dataset.view; state.query = ""; render(); return; }
  const periodButton = event.target.closest("[data-period]");
  if (periodButton) { state.period = periodButton.dataset.period; state.query = ""; render(); return; }
  const localeButton = event.target.closest("[data-locale]");
  if (localeButton) { state.locale = localeButton.dataset.locale; savePreference("hotreport-locale", state.locale); render(); return; }
  const favoriteButton = event.target.closest("[data-favorite]");
  if (favoriteButton) { toggleFavorite(favoriteButton.dataset.favorite); return; }
  const detailButton = event.target.closest("[data-detail]");
  if (detailButton) { openDetail(detailButton.dataset.detail); return; }
  if (event.target.id === "clear-search") {
    if (fixtureState === "error") { fixtureState = null; render(); return; }
    state.query = "";
    render();
    $("#search-input").focus();
    return;
  }
  if (event.target.id === "detail-favorite") { toggleFavorite(state.detailId); return; }
  if (event.target.id === "close-dialog") { dialog.close(); }
});

$("#language-filter").addEventListener("change", (event) => { state.language = event.target.value; state.query = ""; render(); });
$("#search-input").addEventListener("input", (event) => { state.query = event.target.value; render(); });
dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
dialog.addEventListener("close", () => { state.detailId = null; });
translationDialog.addEventListener("click", (event) => { if (event.target === translationDialog) translationDialog.close(); });
translationDialog.addEventListener("close", () => { $("#user-ai-key").value = ""; $("#user-ai-key").type = "password"; $("#toggle-key-visibility").textContent = copy[state.locale].showKey; });
render();
