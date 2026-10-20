# GitHub 热报

当前交付：**阶段 0 已完成；阶段 1 的元数据、快照事务、采集和榜单读取已实现；阶段 2 已实现语言目录与小时级调度；阶段 3 已接入 A 版正式榜单首页与仓库详情；阶段 4 已实现本地收藏首块**。首页只读取真实榜单 API，不展示模拟仓库。A 版设计参考仍在 [prototype-a](./prototype-a/README.md)，其数据不可用于生产。

## 本地运行

要求 Node.js 20.9 或更高版本、npm；后续数据阶段需要 PostgreSQL。依次执行：

1. `npm ci`
2. `Copy-Item .env.example .env.local`
3. `npm run dev`

打开 http://localhost:3000 。首页默认请求日榜/全部语言；没有数据库与成功采集快照时显示等待或不可用状态，不会生成演示仓库。生产构建：`npm run build`；类型检查：`npm run typecheck`；解析测试：`npm test`；查看四个真实夹具的提取摘要：`npm run fixtures:check`。

独立 worker 入口为 `npm run worker`，从 `.env.local` 读取配置，每分钟扫描一次任务，按小时刷新语言目录与到期榜单；作为常驻进程运行。运行前需先启动 PostgreSQL、设置真实的 `DATABASE_URL`，按顺序执行 `migrations/001_core.sql`、`002_language_catalog.sql`、`003_collection_leases.sql`；例如 `psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/003_collection_leases.sql`。建议配置 `GITHUB_TOKEN`，减少 GitHub API 限流。数据库迁移尚未在本机运行，因为本机没有 `psql`/数据库实例。

## 夹具与限制

`tests/fixtures/trending/` 保存 2026-10-19 抓取的四个 GitHub Trending 公共页面：日/月各一份全部语言和 TypeScript 页面。解析器位于 `worker/trending-parser.ts`，只提取仓库名称、本周期新增 Star 和上游顺序；不将这些静态 HTML 当作实时榜单。详情元数据与稳定 GitHub ID 要在阶段 1 使用 GitHub REST API 补齐。

用户自己的 AI Key、翻译代理和本地收藏均未进入当前正式工程；它们属于后续阶段。需求和顺序见 [PRD.md](./PRD.md)、[DEVELOPMENT.md](./DEVELOPMENT.md)、[DEVELOPMENT_ORDER.md](./DEVELOPMENT_ORDER.md)。

## 阶段 1 进度：仓库元数据模块

`worker/github-metadata.ts` 已实现 GitHub REST 仓库元数据读取：稳定 ID、规范仓库链接、原文简介、主语言、累计 Star 和元数据获取时间。它提供内存缓存、ETag 条件请求、同仓库并发去重、有限重试、超时、限流后的等待时间及旧有效元数据回退。批量补全默认最多并发 2 条，失败条目被标记并跳过，不更改从 Trending 页面解析的 `periodStars`。

该模块已接入采集和小时级 worker 调度；首页经榜单 API 使用其发布结果。测试使用模拟响应；另用 GitHub 公共仓库 REST 响应确认字段存在。

## 阶段 1 进度：快照事务发布

`lib/snapshot-store.ts` 在数据库事务中写入仓库、快照及有序条目，最后才切换 `current_snapshots` 指针。输入为空、重复、无序或字段无效时拒绝发布；任一步失败回滚，旧榜指针保留。相同榜单组合的并发发布通过 PostgreSQL 事务级 advisory lock 串行化，较旧采集不能覆盖较新快照。`lib/db.ts` 提供基于 `DATABASE_URL` 的服务端连接池，供后续采集流程调用。

该模块已连入一次性 worker 和榜单 API；本机没有 PostgreSQL 实例，事务测试用模拟数据库客户端验证调用顺序、回滚和指针保护，尚未运行真实数据库集成测试。

## 阶段 1 进度：真实采集流程

`worker/collect-trending.ts` 从对应的 GitHub Trending 日/月或单语言页面抓取 HTML，限制响应体大小并校验页面结构，再通过 GitHub REST 补齐仓库元数据，最后调用事务发布。单条元数据不可用时跳过该条；整页无有效条目、上游失败或页面异常时不调用发布。常驻 worker 输出不含仓库简介或凭据的条目数及错误类别。

该流程已有模拟上游与发布端的测试，但本机缺少 PostgreSQL，尚未完成真实数据库与实时 GitHub 的整链路验证。榜单读取 API 已在下一节实现。

## 阶段 1 进度：榜单读取 API

`GET /api/v1/trending?period=daily&language=all` 只读取当前已发布的完整快照，输出排名、周期新增 Star、原文简介与 UTC 时间，不返回用户翻译或密钥。已有快照返回 200；首次等待采集返回 202；首次采集失败返回 503；参数无效或不在服务端语言目录中的语言返回 400。成功快照超过 90 分钟，或最近采集失败时，标记 `stale=true` 并保留旧榜。到期请求会登记数据库刷新需求，由常驻 worker 消费；查询不会直接抓取 GitHub。worker 写入采集开始、成功或失败状态，供 API 区分首次等待与失败。

API 测试使用模拟数据库响应，本机尚未做真实 PostgreSQL 联调。

## 阶段 2 进度：服务端语言目录

`worker/language-directory.ts` 从 GitHub Trending 日榜的语言菜单读取实际 slug 和显示名称，经过校验后将完整目录写入 `language_catalog`；菜单解析失败或上游请求失败时，不覆盖上次成功目录。`GET /api/v1/languages` 返回已保存目录及 UTC 采集时间，尚无成功目录时返回 503。榜单 API 只接受此目录中的单语言 slug；首次请求该语言的日榜或月榜会分别登记独立采集需求并返回 202，不用全语言结果代替。

目录解析已由真实 GitHub 页面夹具验证，包括 URL 编码、重复条目和标点符号的 slug。

## 阶段 2 进度：小时级采集调度

`worker/index.ts` 每分钟扫描数据库任务表；`daily/all` 与 `monthly/all` 固定每小时尝试更新，最近 24 小时访问过的语言日/月榜也按小时尝试。榜单 API 登记的首次或到期请求优先消费。`worker/job-scheduler.ts` 使用 PostgreSQL `FOR UPDATE SKIP LOCKED` 原子认领任务，十分钟租约并定期续租，避免多 worker 对同一组合重复采集。租约过期可重领；失败以 1、5、15 分钟退避，保留最近成功快照。任务完成写回成功或失败时间及错误类别。`migrations/003_collection_leases.sql` 增加租约令牌和失败次数。

本机无 PostgreSQL，调度 SQL 和多 worker 去重通过模拟数据库测试，真实数据库并发与长时间运行仍待联调。

## 阶段 3 进度：正式榜单首页与仓库详情

首页沿用 A「清晰索引」的侧栏、列表、色彩和手机布局，通过现有 API 显示真实快照。支持日榜/月榜、服务端语言目录选择、当前快照内仓库名或原文简介搜索；切换周期或语言清空搜索。页面每五分钟检查一次快照，显示北京时间的最近成功更新时间，并区分采集中、首次不可用、无匹配、空榜及旧数据提示。点击仓库名称可打开站内详情，查看同一快照中的名称、原文简介、语言、总 Star、周期新增 Star、采集时间与 GitHub 外链；仓库行内亦可直接打开 GitHub。

## 阶段 4 进度：本地收藏

榜单行与详情均可收藏或取消收藏；桌面侧栏及手机导航提供“我的收藏”列表。浏览器 localStorage 以稳定 GitHub ID 保存必要的展示信息，刷新后仍可查看，其他浏览器和设备不会同步。收藏详情优先使用当前榜单快照；仓库离榜时只显示保存的信息，当前周期新增 Star 显示为“—”并给出提示；当前榜单不可用时单独提示，不推断仓库已离榜。存储写入失败时收藏状态保持不变并显示错误。界面双语及翻译仍按后续小功能逐项实现。
