import type { TrendingPeriod, TrendingRepository } from "../lib/contracts";
import { formatBeijingTime } from "../lib/board-view";
import type { FavoriteRepository } from "../lib/favorites";

type RepositoryDetailProps = {
  repository: TrendingRepository | FavoriteRepository;
  period: TrendingPeriod;
  periodStars: number | null;
  collectedAt: string | null;
  currentListAvailable: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onClose: () => void;
};

const number = (value: number) => new Intl.NumberFormat("zh-CN").format(value);

export function RepositoryDetail({ repository, period, periodStars, collectedAt, currentListAvailable, isFavorite, onToggleFavorite, onClose }: RepositoryDetailProps) {
  const periodLabel = period === "daily" ? "今日新增" : "本月新增";

  return <>
    <div className="dialog-top"><span>仓库详情</span><button className="icon-button" type="button" aria-label="关闭详情" title="关闭详情" onClick={onClose}>×</button></div>
    <div className="detail-body">
      <h2 id="detail-title">{repository.fullName}</h2>
      <p className="detail-description">{repository.descriptionOriginal || "暂无简介"}</p>
      <div className="detail-stats">
        <div><span>总 Star</span><strong>{number(repository.totalStars)}</strong></div>
        <div><span>{periodLabel}</span><strong className="accent">{periodStars === null ? "—" : "+" + number(periodStars)}</strong></div>
      </div>
      {periodStars === null && <p className="detail-unavailable">{currentListAvailable ? "当前榜单无此仓库；上方展示最后保存的仓库信息。" : "当前榜单尚不可用；上方展示最后保存的仓库信息。"}</p>}
      <div className="detail-actions"><a className="primary-action" href={repository.url} target="_blank" rel="noopener noreferrer">在 GitHub 打开 ↗</a><button type="button" className="secondary-action" onClick={onToggleFavorite}>{isFavorite ? "取消收藏" : "收藏仓库"}</button></div>
      <div className="detail-foot">编程语言：{repository.language ?? "未标注语言"}<br />{collectedAt ? "榜单采集：" + formatBeijingTime(collectedAt) + " 北京时间" : "当前榜单暂无采集记录"}</div>
    </div>
  </>;
}
