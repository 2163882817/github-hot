import type { TrendingPeriod, TrendingRepository } from "../lib/contracts";
import { formatBeijingTime } from "../lib/board-view";
import type { FavoriteRepository } from "../lib/favorites";
import { messages, type Locale } from "../lib/i18n";

type RepositoryDetailProps = {
  repository: TrendingRepository | FavoriteRepository;
  period: TrendingPeriod;
  periodStars: number | null;
  collectedAt: string | null;
  currentListAvailable: boolean;
  isFavorite: boolean;
  locale?: Locale;
  onToggleFavorite: () => void;
  onClose: () => void;
};

const number = (value: number, locale: Locale) => new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US").format(value);

export function RepositoryDetail({ repository, period, periodStars, collectedAt, currentListAvailable, isFavorite, locale = "zh", onToggleFavorite, onClose }: RepositoryDetailProps) {
  const t = messages[locale];
  const periodLabel = period === "daily" ? t.todayGain : t.monthlyGain;

  return <>
    <div className="dialog-top"><span>{t.detailTitle}</span><button className="icon-button" type="button" aria-label={t.closeDetail} title={t.closeDetail} onClick={onClose}>×</button></div>
    <div className="detail-body">
      <h2 id="detail-title">{repository.fullName}</h2>
      <p className="detail-description">{repository.descriptionOriginal || t.noDescription}</p>
      <div className="detail-stats">
        <div><span>{t.totalStars}</span><strong>{number(repository.totalStars, locale)}</strong></div>
        <div><span>{periodLabel}</span><strong className="accent">{periodStars === null ? "—" : "+" + number(periodStars, locale)}</strong></div>
      </div>
      {periodStars === null && <p className="detail-unavailable">{currentListAvailable ? t.savedInfoMissing : t.savedInfoUnavailable}</p>}
      <div className="detail-actions"><a className="primary-action" href={repository.url} target="_blank" rel="noopener noreferrer">{t.openGithub}</a><button type="button" className="secondary-action" onClick={onToggleFavorite}>{isFavorite ? t.unsave : t.saveRepository}</button></div>
      <div className="detail-foot">{t.languageLabel}{repository.language ?? t.unmarkedLanguage}<br />{collectedAt ? t.collectedAt + formatBeijingTime(collectedAt, locale) + " " + t.beijing : t.noCollection}</div>
    </div>
  </>;
}
