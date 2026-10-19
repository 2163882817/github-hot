# GitHub 热报

当前交付：**阶段 0，工程骨架与 GitHub Trending 数据风险验证**。首页仅显示阶段状态，不展示模拟榜单。下一阶段才接入 GitHub 仓库元数据、数据库快照与榜单 API。A 版设计参考仍在 [prototype-a](./prototype-a/README.md)，其数据不可用于生产。

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
