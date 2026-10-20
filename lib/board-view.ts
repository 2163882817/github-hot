import type { TrendingRepository } from "./contracts";
import type { Locale } from "./i18n";

export function searchCurrentSnapshot(repositories: TrendingRepository[], query: string): TrendingRepository[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return repositories;
  return repositories.filter((repository) =>
    [repository.fullName, repository.descriptionOriginal ?? ""].some((value) => value.toLocaleLowerCase().includes(term))
  );
}

export function formatBeijingTime(iso: string, locale: Locale = "zh"): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const datePart = locale === "en" ? [value("month"), value("day"), value("year")].join("/") :
    [value("year"), value("month"), value("day")].join("-");
  return datePart + " " + value("hour") + ":" + value("minute");
}
