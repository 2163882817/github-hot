# GitHub 热报

当前交付：**阶段 0 已完成；阶段 1 已实现仓库元数据和 PostgreSQL 快照事务发布模块**。首页仅显示阶段状态，不展示模拟榜单。后续小块将接入真实采集流程与榜单 API。A 版设计参考仍在 [prototype-a](./prototype-a/README.md)，其数据不可用于生产。

## 本地运行

要求 Node.js 20.9 或更高版本、npm；后续数据阶段需要 PostgreSQL。依次执行：

1. `npm ci`
2. `Copy-Item .env.example .env.local`
3. `npm run dev`

打开 http://localhost:3000 。当前页面只确认 Next.js 工程可启动。生产构建：`npm run build`；类型检查：`npm run typecheck`；解析测试：`npm test`；查看四个真实夹具的提取摘要：`npm run fixtures:check`。

独立 worker 入口为 `npm run worker`，当前只输出阶段提示，不会抓取或发布数据。`migrations/001_core.sql` 是阶段 0 的数据库结构；准备 PostgreSQL 后用 `psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/001_core.sql` 执行。数据库迁移尚未在本机运行，因为本机没有 `psql`/数据库实例。

## 夹具与限制

`tests/fixtures/trending/` 保存 2026-10-19 抓取的四个 GitHub Trending 公共页面：日/月各一份全部语言和 TypeScript 页面。解析器位于 `worker/trending-parser.ts`，只提取仓库名称、本周期新增 Star 和上游顺序；不将这些静态 HTML 当作实时榜单。详情元数据与稳定 GitHub ID 要在阶段 1 使用 GitHub REST API 补齐。

用户自己的 AI Key、翻译代理和本地收藏均未进入当前正式工程；它们属于后续阶段。需求和顺序见 [PRD.md](./PRD.md)、[DEVELOPMENT.md](./DEVELOPMENT.md)、[DEVELOPMENT_ORDER.md](./DEVELOPMENT_ORDER.md)。

## 阶段 1 进度：仓库元数据模块

`worker/github-metadata.ts` 已实现 GitHub REST 仓库元数据读取：稳定 ID、规范仓库链接、原文简介、主语言、累计 Star 和元数据获取时间。它提供内存缓存、ETag 条件请求、同仓库并发去重、有限重试、超时、限流后的等待时间及旧有效元数据回退。批量补全默认最多并发 2 条，失败条目被标记并跳过，不更改从 Trending 页面解析的 `periodStars`。

该模块当前仍是独立能力，尚未接入快照发布、worker 调度或首页。测试使用模拟响应；另用 GitHub 公共仓库 REST 响应确认字段存在。

## 阶段 1 进度：快照事务发布

`lib/snapshot-store.ts` 在数据库事务中写入仓库、快照及有序条目，最后才切换 `current_snapshots` 指针。输入为空、重复、无序或字段无效时拒绝发布；任一步失败回滚，旧榜指针保留。相同榜单组合的并发发布通过 PostgreSQL 事务级 advisory lock 串行化，较旧采集不能覆盖较新快照。`lib/db.ts` 提供基于 `DATABASE_URL` 的服务端连接池，供后续采集流程调用。

该模块尚未连入 worker 或 API；本机没有 PostgreSQL 实例，事务测试用模拟数据库客户端验证调用顺序、回滚和指针保护，尚未运行真实数据库集成测试。下一小块应连接真实采集流程。
