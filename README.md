# GitHub 热报

当前交付：**阶段 0 已完成；阶段 1 已实现仓库元数据、快照事务发布、一次性采集和榜单读取 API**。首页仍只显示阶段状态，不展示模拟榜单。后续阶段将接入小时级调度与正式界面。A 版设计参考仍在 [prototype-a](./prototype-a/README.md)，其数据不可用于生产。

## 本地运行

要求 Node.js 20.9 或更高版本、npm；后续数据阶段需要 PostgreSQL。依次执行：

1. `npm ci`
2. `Copy-Item .env.example .env.local`
3. `npm run dev`

打开 http://localhost:3000 。当前页面只确认 Next.js 工程可启动。生产构建：`npm run build`；类型检查：`npm run typecheck`；解析测试：`npm test`；查看四个真实夹具的提取摘要：`npm run fixtures:check`。

独立 worker 入口为 `npm run worker`，从 `.env.local` 读取配置，执行一次全部语言的日榜和月榜采集后退出；尚无小时级调度。运行前需先启动 PostgreSQL、设置真实的 `DATABASE_URL`，并用 `psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/001_core.sql` 执行迁移。建议配置 `GITHUB_TOKEN`，减少 GitHub API 限流。数据库迁移尚未在本机运行，因为本机没有 `psql`/数据库实例。

## 夹具与限制

`tests/fixtures/trending/` 保存 2026-10-19 抓取的四个 GitHub Trending 公共页面：日/月各一份全部语言和 TypeScript 页面。解析器位于 `worker/trending-parser.ts`，只提取仓库名称、本周期新增 Star 和上游顺序；不将这些静态 HTML 当作实时榜单。详情元数据与稳定 GitHub ID 要在阶段 1 使用 GitHub REST API 补齐。

用户自己的 AI Key、翻译代理和本地收藏均未进入当前正式工程；它们属于后续阶段。需求和顺序见 [PRD.md](./PRD.md)、[DEVELOPMENT.md](./DEVELOPMENT.md)、[DEVELOPMENT_ORDER.md](./DEVELOPMENT_ORDER.md)。

## 阶段 1 进度：仓库元数据模块

`worker/github-metadata.ts` 已实现 GitHub REST 仓库元数据读取：稳定 ID、规范仓库链接、原文简介、主语言、累计 Star 和元数据获取时间。它提供内存缓存、ETag 条件请求、同仓库并发去重、有限重试、超时、限流后的等待时间及旧有效元数据回退。批量补全默认最多并发 2 条，失败条目被标记并跳过，不更改从 Trending 页面解析的 `periodStars`。

该模块已接入一次性采集流程，尚未接入小时级 worker 调度或首页。测试使用模拟响应；另用 GitHub 公共仓库 REST 响应确认字段存在。

## 阶段 1 进度：快照事务发布

`lib/snapshot-store.ts` 在数据库事务中写入仓库、快照及有序条目，最后才切换 `current_snapshots` 指针。输入为空、重复、无序或字段无效时拒绝发布；任一步失败回滚，旧榜指针保留。相同榜单组合的并发发布通过 PostgreSQL 事务级 advisory lock 串行化，较旧采集不能覆盖较新快照。`lib/db.ts` 提供基于 `DATABASE_URL` 的服务端连接池，供后续采集流程调用。

该模块已连入一次性 worker，尚未接入 API；本机没有 PostgreSQL 实例，事务测试用模拟数据库客户端验证调用顺序、回滚和指针保护，尚未运行真实数据库集成测试。

## 阶段 1 进度：一次性真实采集流程

`worker/collect-trending.ts` 从对应的 GitHub Trending 日/月或单语言页面抓取 HTML，限制响应体大小并校验页面结构，再通过 GitHub REST 补齐仓库元数据，最后调用事务发布。单条元数据不可用时跳过该条；整页无有效条目、上游失败或页面异常时不调用发布。`worker/index.ts` 目前每次运行仅顺序尝试 daily/all 和 monthly/all，输出不含仓库简介或凭据的条目数及错误类别；其中一个失败也继续尝试另一个，最后以失败退出码报告问题。

该流程已有模拟上游与发布端的测试，但本机缺少 PostgreSQL，尚未完成真实数据库与实时 GitHub 的整链路验证。榜单读取 API 已在下一节实现。

## 阶段 1 进度：榜单读取 API

`GET /api/v1/trending?period=daily&language=all` 只读取当前已发布的完整快照，输出排名、周期新增 Star、原文简介与 UTC 时间，不返回用户翻译或密钥。已有快照返回 200；首次等待采集返回 202；首次采集失败返回 503；参数无效或尚未登记的语言返回 400。成功快照超过 90 分钟，或最近采集失败时，标记 `stale=true` 并保留旧榜。到期请求会登记数据库刷新需求，但实际消费要等下一阶段的调度器；查询不会直接抓取 GitHub。一次性 worker 现会写入采集开始、成功或失败状态，供 API 区分首次等待与失败。

当前没有语言目录服务；单语言参数只接受数据库中已有记录的组合。API 测试使用模拟数据库响应，本机尚未做真实 PostgreSQL 联调。下一小块应实现语言目录和持续采集调度。
