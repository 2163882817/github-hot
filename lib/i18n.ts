export type Locale = "zh" | "en";
export const LOCALE_STORAGE_KEY = "github-hot-locale";

export const messages = {
  zh: {
    brand: "GitHub 热报", discover: "发现", trending: "热门榜单", favorites: "我的收藏",
    sourceFooter: "数据来源 GitHub Trending", syncFooter: "按小时尝试同步",
    tagline: "发现正在增长的开源项目", timedSnapshot: "GitHub Trending / 定时快照",
    trendingTitle: "热门仓库", favoritesTitle: "我的收藏", trendingSubtitle: "按本周期新增 Star 排序",
    favoritesSubtitle: "只保存在当前浏览器", lastUpdated: "最近成功更新：", beijing: "北京时间",
    filters: "榜单筛选", period: "榜单周期", daily: "日榜", monthly: "月榜",
    programmingLanguage: "编程语言", allLanguages: "全部语言", search: "搜索当前榜单",
    searchPlaceholder: "搜索当前榜单中的仓库", storageError: "浏览器存储不可用，收藏更改未保存。请检查浏览器存储设置后重试。",
    localeStorageError: "无法保存语言偏好；刷新后可能恢复默认语言。",
    catalogUnavailable: "语言目录暂不可用，当前可查看全部语言榜单。刷新页面后可重试。",
    stalePrefix: "榜单暂未成功刷新，正在展示上次成功结果（", staleSuffix: "）。",
    saved: "收藏", repositories: "个仓库", source: "来源：GitHub Trending ↗",
    rank: "排名", repository: "仓库", totalStars: "总 Star", todayGain: "今日新增",
    monthlyGain: "本月新增", noDescription: "暂无简介", unmarkedLanguage: "未标注语言",
    currentListMissing: "当前榜单无此仓库", currentListUnavailable: "当前榜单尚不可用",
    periodGain: "本周期新增", openGithubName: "在 GitHub 打开 ",
    viewDetailsPrefix: "查看 ", viewDetailsSuffix: " 的详情", unsavePrefix: "取消收藏 ", savePrefix: "收藏 ",
    unavailableTitle: "榜单暂不可用", pendingTitle: "正在采集榜单", loadingTitle: "正在加载榜单",
    unavailableBody: "尚无可用快照，请稍后重试。", pendingBody: "首份榜单正在准备，页面会自动重试。",
    loadingBody: "正在读取最新快照…", retry: "重试", noMatchTitle: "没有匹配的仓库",
    noRepositoriesTitle: "当前榜单暂无仓库", noMatchBody: "试试其他关键词，或清空搜索。",
    noRepositoriesBody: "这个榜单还没有条目，请稍后重试。", clearSearch: "清空搜索",
    noFavoritesTitle: "还没有收藏仓库", noFavoritesBody: "在热门榜单中点击星标，即可将仓库保存在此浏览器中。",
    goTrending: "去热门榜单", detailTitle: "仓库详情", closeDetail: "关闭详情",
    savedInfoMissing: "当前榜单无此仓库；上方展示最后保存的仓库信息。",
    savedInfoUnavailable: "当前榜单尚不可用；上方展示最后保存的仓库信息。",
    openGithub: "在 GitHub 打开 ↗", unsave: "取消收藏", saveRepository: "收藏仓库",
    languageLabel: "编程语言：", collectedAt: "榜单采集：", noCollection: "当前榜单暂无采集记录"
  },
  en: {
    brand: "GitHub Hot Report", discover: "Discover", trending: "Trending", favorites: "Saved",
    sourceFooter: "Source: GitHub Trending", syncFooter: "Sync attempted hourly",
    tagline: "Discover open source projects on the rise", timedSnapshot: "GitHub Trending / Scheduled snapshots",
    trendingTitle: "Trending repositories", favoritesTitle: "Saved repositories", trendingSubtitle: "Ranked by Stars gained this period",
    favoritesSubtitle: "Saved in this browser only", lastUpdated: "Last successful update: ", beijing: "Beijing time",
    filters: "Ranking filters", period: "Ranking period", daily: "Today", monthly: "This month",
    programmingLanguage: "Programming language", allLanguages: "All languages", search: "Search current ranking",
    searchPlaceholder: "Search repositories in this ranking", storageError: "Browser storage is unavailable. Your saved changes were not kept. Check storage settings and try again.",
    localeStorageError: "Could not save your language preference. It may reset after refresh.",
    catalogUnavailable: "Languages are temporarily unavailable. You can still browse the all-language ranking. Refresh to retry.",
    stalePrefix: "The ranking could not refresh. Showing the last successful snapshot (", staleSuffix: ").",
    saved: "Saved", repositories: "repositories", source: "Source: GitHub Trending ↗",
    rank: "Rank", repository: "Repository", totalStars: "Total Stars", todayGain: "Gained today",
    monthlyGain: "Gained this month", noDescription: "No description", unmarkedLanguage: "Language not specified",
    currentListMissing: "Not in the current ranking", currentListUnavailable: "Current ranking unavailable",
    periodGain: "Gained this period", openGithubName: "Open on GitHub: ",
    viewDetailsPrefix: "View details for ", viewDetailsSuffix: "", unsavePrefix: "Remove saved ", savePrefix: "Save ",
    unavailableTitle: "Ranking unavailable", pendingTitle: "Collecting ranking", loadingTitle: "Loading ranking",
    unavailableBody: "No snapshot is available yet. Please try again later.", pendingBody: "The first snapshot is being prepared. This page will retry automatically.",
    loadingBody: "Reading the latest snapshot…", retry: "Retry", noMatchTitle: "No matching repositories",
    noRepositoriesTitle: "No repositories in this ranking", noMatchBody: "Try another term or clear the search.",
    noRepositoriesBody: "There are no entries yet. Please try again later.", clearSearch: "Clear search",
    noFavoritesTitle: "No saved repositories yet", noFavoritesBody: "Use the star button in a trending ranking to save a repository here.",
    goTrending: "Browse trending", detailTitle: "Repository details", closeDetail: "Close details",
    savedInfoMissing: "This repository is not in the current ranking. Showing the last saved information.",
    savedInfoUnavailable: "The current ranking is unavailable. Showing the last saved information.",
    openGithub: "Open on GitHub ↗", unsave: "Remove saved", saveRepository: "Save repository",
    languageLabel: "Language: ", collectedAt: "Collected: ", noCollection: "No current ranking snapshot"
  }
} as const;

export function preferredLocale(stored: string | null, browserLanguage: string): Locale {
  if (stored === "zh" || stored === "en") return stored;
  return browserLanguage.toLowerCase().startsWith("zh") ? "zh" : "en";
}
