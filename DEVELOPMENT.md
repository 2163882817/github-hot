# GitHub 热报：开发文档（MVP）

- 版本：v1.1
- 日期：2026-10-19
- 依据：[PRD.md](./PRD.md)；视觉基线：[prototype-a/README.md](./prototype-a/README.md)
- 交付目标：将 A「清晰索引」静态原型实现为可上线的响应式 Web 应用

## 1. 范围与工程原则

用户看到的是 GitHub Trending 已收录仓库中的日榜、月榜，按页面显示的周期新增 Star 降序排序。全部语言与每种语言都是独立的上游榜单；月榜沿用 GitHub Trending 的 monthly 口径，不解释为自然月。每小时**尝试**同步不等于榜单每小时一定变化。服务端保存完整快照，前端只读取已发布数据；用户自带的 AI Key 仅在当前页面内存保留，翻译请求经服务端临时代理。

首版无账号、跨设备收藏、周榜、GitHub 全站搜索、README 翻译及任意历史日期查询。当前 prototype-a/ 是视觉与交互样本，仓库及 Star 数据均为演示值，不可用于生产。

## 2. 技术选型与功能映射

| 层 | 选型 | 对应功能与理由 |
| --- | --- | --- |
| 前端 | Next.js App Router、React、TypeScript、CSS Modules | 实现 A 版响应式列表、详情、筛选、搜索、空状态；与 API 共用类型，沿用现有 CSS 视觉变量。交互区作为 Client Components。 |
| API | Next.js Route Handlers，Node.js runtime | 提供榜单、语言目录及用户自带 Key 的按需简介翻译代理；在服务端访问 PostgreSQL、处理输入校验和错误状态。明确由数据库决定快照新旧，不依赖框架默认缓存。 |
| 采集器 | 独立 Node.js/TypeScript worker；内置 fetch + Cheerio | 按固定上游 URL 抓取 Trending HTML，解析每条仓库与周期涨星；HTML 解析与 API 隔离，便于应对页面结构变化。 |
| 元数据 | GitHub REST API 的 Get a repository 接口 | 通过 owner/name 获取稳定仓库 ID、规范链接、简介、主语言和累计 Star；使用服务端凭据、ETag 与限流退避。 |
| 持久化 | PostgreSQL + node-postgres（pg）+ SQL migrations | 保存不可变快照、当前快照指针、采集任务状态及仓库元数据；用事务原子发布，支持多个实例共享状态。用户 Key 和译文均不进服务器数据库。MVP 不引入 Redis。 |
| 调度 | 独立常驻 Node worker，每分钟扫描到期任务 | 全部语言日/月榜及近期活跃语言每小时尝试同步；Web 请求只登记刷新需求，worker 可及时消费。定时器不放在按请求伸缩的 Web 进程里。 |
| 翻译 | OpenAI Responses API，经服务端一次性代理调用 | 用户提供自己的 OpenAI API Key，主动点击“翻译简介”后调用；Key 只存页面内存，仅发送到本站 HTTPS 代理和供应商，代理不持久化；失败回退原文。模型在服务端配置，后续可扩展供应商适配层。 |
| 本地偏好 | 浏览器 localStorage + 页面内存 | localStorage 保存界面语言、以稳定 GitHub ID 为键的收藏快照及非敏感译文；Key 只在当前页面内存中。存储失败须显示提示。 |
| 验证 | Node.js 测试运行器 + Playwright | 校验解析器、排序、API、采集失败保留旧快照；在桌面与手机视口做端到端交互及可访问性检查。 |

技术选型是本项目实现方案，不要求使用竞品代码或其线上接口。依赖安装时锁定具体版本，升级前运行解析器夹具与端到端测试。Next.js Route Handlers 可定义 Web API；Cheerio 可解析已获取的 HTML；GitHub REST API 有主/次级限流，应使用有节制的服务端请求。参见第 11 节官方资料。

## 3. 架构与数据流

    浏览器（榜单、详情、收藏、i18n、页面内存中的用户 Key）
       │ GET 快照 / 用户主动 POST 翻译请求 / 每 5 分钟检查新快照
       ▼
    Next.js Web + Route Handlers ───────────► PostgreSQL
                                            ▲        │
    常驻 Node worker ───► GitHub Trending            │
                         │        GitHub REST API    │
                         └──────── 原子发布快照 ──────┘
    单次翻译请求（Key + 仓库 ID）─► 临时代理 ─► OpenAI Responses API
                                             └──── 译文返回浏览器本地缓存

1. worker 每小时检查到期的 period + language 组合。全部语言的 daily/monthly 固定入队；语言目录中最近 24 小时被请求的语言视为“活跃语言”，继续入队。24 小时为工程默认值，可配置。
2. 当某语言快照缺失或超过 1 小时，API 登记一次去重的采集需求并立即返回当前可用状态，不在 HTTP 请求中等待完整抓取。下一次 worker 扫描应及时处理此需求；部署时让 worker 持续运行并至少每分钟扫描队列。
3. worker 从对应 Trending 页面抓到候选集，解析 owner/name 和 periodStars；通过 GitHub REST API 补充元数据。独立语言页不能用全语言结果在本地过滤替代。
4. 通过验证后，在一个 PostgreSQL 事务里写入快照和条目，最后切换 current_snapshot 指针。读者要么读到整份旧快照，要么读到整份新快照。
5. 浏览器首次加载、切换周期或语言时取快照；保持打开时每 5 分钟重新验证。新 snapshotId 出现时替换列表，但保留语言及周期选择。切换周期或语言时清空搜索词。
6. 公共快照只返回原文。用户主动点击某条仓库的“翻译简介”时，先查当前浏览器的译文缓存；未命中且用户已输入 Key，才通过 HTTPS 代理调用 AI。未配置 Key 时打开翻译设置；请求超时或失败，保持原文可读。切换界面语言不自动批量翻译。

## 4. 上游采集与发布规则

### 4.1 URL 和解析

- daily/all：https://github.com/trending?since=daily；monthly/all：https://github.com/trending?since=monthly。单语言 URL 使用服务端语言目录中的 GitHub slug 组成 /trending/{slug}?since={period}，不接受客户端传任意 URL。
- 页面解析器输出 fullName、periodStars 和 originalIndex。数字仅接受明确的非负整数及页面所用千位分隔符；对无法识别的格式记录原文与解析错误，不猜值。
- 对有效条目以 periodStars 降序、originalIndex 升序排序。保留原上游位置，以保证同涨星数时稳定排序。
- 单条缺少 periodStars、无法确定仓库身份或无法取得稳定 ID 时跳过该条并记录原因；页面为空或关键字段大量缺失时按整体失败处理。阈值建议“解析有效率低于 80% 或有效条目为 0”，作为可配置的质量门槛，经真实页面夹具验证后固定。
- 仓库元数据按 ID 缓存。若 GitHub REST API 单条失败，可使用同一仓库此前有效的元数据，但本轮 periodStars 只能来自本轮 Trending 页面。没有稳定 ID 的条目不能发布。记录 metadataUpdatedAt，便于解释累计 Star 可能略旧。

### 4.2 同步、失败和限流

- 每个 period + language 至多一个运行中的任务。用 PostgreSQL 任务行租约或 advisory lock 防止多 worker 重复抓取；租约过期后可恢复，不依赖进程内锁。
- 设置上游请求超时、有限重试和指数退避。GitHub REST API 返回 403/429 时遵守 Retry-After、x-ratelimit-remaining 与 x-ratelimit-reset；优先使用认证请求、元数据缓存及条件请求，并限制并发。
- 新快照仅在整批校验成功后发布；失败写入 latestAttemptAt、latestAttemptStatus、failureCode，不改变 current_snapshot。不能发布空数组覆盖旧榜。
- API 的 stale=true 条件：最近一次到期采集失败，或最近成功快照超过 90 分钟。90 分钟是展示阈值，不改变每小时尝试同步的节奏。无快照时返回 pending 或 unavailable，不伪装成空榜。
- 采集器保存有限的上游 HTML 解析夹具供测试；生产日志只记录周期、语言、条目数、耗时和错误类别，不记录令牌与完整简介。

## 5. 数据模型

建议使用以下核心表；字段名可按团队命名规范调整，但语义应保持。

| 表 | 关键字段 | 作用 |
| --- | --- | --- |
| repositories | github_id（主键，文本）、full_name、html_url、description_original、primary_language、total_stars、metadata_updated_at | 稳定仓库元数据；重命名后用同一 ID 更新名称与链接。 |
| snapshots | id、period、language_slug、source_url、collected_at、item_count、created_at | 一次成功采集的不可变快照；collected_at 存 UTC。 |
| snapshot_items | snapshot_id、github_id、rank、original_index、period_stars、full_name_at_capture、url_at_capture、description_original_at_capture、primary_language_at_capture、total_stars_at_capture、metadata_updated_at | 展示快照所需的完整条目；主键为 snapshot_id + github_id，rank 唯一。 |
| current_snapshots | period + language_slug（联合主键）、snapshot_id | 指向各榜单最近成功发布的快照。 |
| collection_jobs | period + language_slug（联合主键）、requested_at、lease_until、latest_attempt_at、latest_attempt_status、failure_code、last_success_at、last_viewed_at | 调度、去重、状态和活跃语言判断。 |

快照条目存当时的元数据副本，避免仓库日后改名或简介修改改变旧快照的可解释性。MVP 可只对外暴露当前快照；内部快照保留时间建议 7 天并定期清理，不能删除仍被 current_snapshots 引用的记录。浏览器本地译文缓存键为 hash(descriptionOriginal) + targetLocale + modelVersion，可按容量上限淘汰；Key 不参与缓存键，也不写入本地持久存储。

## 6. HTTP API 契约

所有响应使用 JSON，时间为带 Z 的 UTC ISO 8601 字符串。API 返回最近成功时间；前端固定按 Asia/Shanghai 显示。前端不得使用抓取时间推算 GitHub Trending 周期边界。

### 6.1 GET /api/v1/trending?period=daily&language=all

- period：daily 或 monthly；language：all 或语言目录中已验证的 slug。无效参数返回 400。
- 有快照返回 200。查询发现过期时登记刷新需求并返回旧快照与 stale=true（如适用）。
- 没有快照、正在首次采集：202，body 为 {"status":"pending","retryAfterSeconds":15}。
- 没有快照且最近采集失败：503，body 为 {"status":"unavailable","retryAfterSeconds":60,"messageCode":"COLLECTION_FAILED"}。手动“重试”只触发有节流的重新登记，不能让客户端直接反复请求 GitHub。
- 200 示例：

        {
          "snapshotId": "snp_20261019_0800_daily_all",
          "period": "daily",
          "language": "all",
          "sourceUrl": "https://github.com/trending?since=daily",
          "collectedAt": "2026-10-19T08:00:00Z",
          "lastSuccessfulAt": "2026-10-19T08:00:00Z",
          "stale": false,
          "status": "ready",
          "repositories": [
            {
              "id": "123456",
              "rank": 1,
              "fullName": "example/project",
              "url": "https://github.com/example/project",
              "descriptionOriginal": "Example repository",
              "language": "TypeScript",
              "totalStars": 1200,
              "periodStars": 135,
              "period": "daily",
              "collectedAt": "2026-10-19T08:00:00Z",
              "metadataUpdatedAt": "2026-10-19T07:59:58Z"
            }
          ]
        }

上述数值仅是契约示例，并非真实榜单。snapshotId 可用不透明 UUID；客户端只做相等比较。repositories 已排序，搜索仅在客户端对当前列表执行。可用 ETag(snapshotId) 支持五分钟轮询；304 不改变当前 UI 状态。公共快照不包含其他用户的译文或 Key。动态 API 显式设置缓存头，不使用静态预渲染。

### 6.2 GET /api/v1/languages

返回 {"languages":[{"slug":"all","label":"全部语言"},{"slug":"typescript","label":"TypeScript"}],"collectedAt":"..."}。实际选项以已验证 GitHub Trending 语言目录为准；若目录采集失败，继续使用上一份有效目录。前端仅显示服务端给出的 slug，不自行拼接用户输入。

### 6.3 POST /api/v1/translations

请求 body：{"repositoryId":"123456","targetLocale":"zh"}；用户 Key 只放在发往本站 HTTPS 代理的专用请求头 `X-User-AI-Key` 中。服务端据 repositoryId 读取当前有效简介，不接收任意网页 URL 或任意待翻译长文本。代理使用服务端固定的 OpenAI 模型及翻译指令调用 Responses API，只取纯文本译文，限制输入长度与输出 token，忽略简介里任何试图改变翻译任务的指令。成功返回 {"descriptionTranslated":"示例仓库","descriptionOriginal":"Example repository","targetLocale":"zh","modelVersion":"v1"}；原文为空则返回 null。未提供 Key 返回 400；供应商鉴权失败返回 401、额度不足/限流返回 429、超时或服务故障返回 503，并将上游原始错误脱敏后映射成固定错误码。客户端始终可回退原文。

Key 仅在当前页面内存中，刷新即清空；不得存到 localStorage、sessionStorage、Cookie、URL、数据库、日志、追踪或分析工具。代理仅接受同源请求并校验 Origin/CSRF，限制请求体大小与 IP 频率，设置 `Cache-Control: no-store`；禁止中间层记录翻译请求头、请求正文及上游响应原文。上游请求完成后不保留 Key，不做服务器端跨用户缓存。用户清除 Key 后中止尚未发出的请求，已显示的本地译文可以继续查看。浏览器端缓存只存译文文本，以原文哈希、目标语言、模型版本区分；单次翻译可能按供应商计费，必须由用户主动触发。

## 7. 前端实现

- 复用 prototype-a/styles.css 的色彩、排版、窄侧栏、单行仓库索引及右侧新增 Star 数字轴；将静态数据源替换为类型化 API。对照原型的桌面/手机布局，保留排名、仓库名与涨星数的视觉优先级。
- 状态按 {view, period, language, query, locale, snapshot, detailId} 管理。切榜时清空 query；轮询成功替换 snapshot，但不改变 period、language、locale。只对当前榜单做 fullName、原文与当前显示译文的大小写不敏感匹配。
- 首次访问依据 navigator.language 选 zh/en；手动切换后保存 localStorage。React 初始化须避免先闪出错误语言，可在读完本地偏好后展示页面。仓库名称原样显示；全部界面文案、日期及异常提示进入双语字典。
- 收藏 localStorage 存数组对象：{id, fullName, url, descriptionOriginal, language, totalStars, savedAt}。译文放独立的本地缓存；Key 只在页面内存。读入时校验结构与去重；存储不可用时提示并保持未收藏状态。收藏详情优先关联当前快照；不在当前快照时显示本地副本、“当前榜单无此仓库”，periodStars 为 null/不显示。
- 顶栏增加“翻译设置”。弹窗包含 OpenAI Key 密码框、显示/隐藏、当前会话保存、清除、费用与内容传输说明。未配置时仓库行/详情的“翻译简介”打开此弹窗；保存后由用户再次点击翻译，不自动发起付费请求。
- 加载、首次失败、旧数据、无搜索匹配、无收藏、翻译中及翻译失败分别呈现可理解状态。列表占位保持高度；详情可键盘关闭并恢复焦点。长仓库名换行，移动端无横向滚动；图标按钮有可读名称及明显焦点样式。
- 外部链接只指向 GitHub 仓库或 Trending 来源，使用安全的新窗口属性；仓库简介作为纯文本渲染，不注入 HTML。

## 8. 项目目录建议

    app/
      page.tsx                         # 榜单与收藏视图
      api/v1/trending/route.ts         # 快照读取与刷新登记
      api/v1/languages/route.ts        # 语言目录
      api/v1/translations/route.ts     # 用户 Key 单次翻译代理
    components/                        # A 版列表、筛选、详情、状态组件
    lib/
      contracts.ts                     # 前后端共享 DTO 与校验
      i18n.ts                          # 中英字典
      favorites.ts                     # 本地收藏持久化
      translation-client.ts            # Key 内存状态与本地译文缓存
      db.ts                            # PostgreSQL 连接与事务
      github.ts                        # 仓库 REST 元数据适配层
      translator.ts                    # OpenAI Responses API 适配层
    worker/
      scheduler.ts                     # 到期扫描、租约与任务消费
      trending-parser.ts               # HTML 解析；独立于页面层
      collect.ts                       # 校验、补全、原子发布
    migrations/                        # SQL 建表与索引
    tests/                             # HTML 夹具、单元、API 与 E2E
    prototype-a/                       # 仅设计参考，正式构建不引入模拟数据

生产环境 Web 与常驻 worker 可使用同一代码镜像的不同启动命令。数据库需提供持久存储、备份和迁移步骤；上线应至少先完成首次全部语言日/月采集，再公开页面。

## 9. 配置、运行与安全

必要环境变量：DATABASE_URL、GITHUB_TOKEN、OPENAI_TRANSLATION_MODEL（部署者选择并验证可用模型；不是部署者 API Key）。可调配置：COLLECTION_INTERVAL_MINUTES=60、ACTIVE_LANGUAGE_HOURS=24、STALE_AFTER_MINUTES=90、UPSTREAM_TIMEOUT_MS、TRANSLATION_TIMEOUT_MS。开发用 .env.local，但不得提交真实密钥；浏览器环境变量不得包含任何服务端凭据。OpenAI API Key 由每位用户在页面会话中输入，部署者不代填。

本地开发准备 PostgreSQL，执行 migrations，分别启动 Web 和 worker；用 HTML 夹具验证解析器，再在获准的网络环境做真实上游冒烟测试。部署采用 HTTPS，限制翻译接口频率，出站只访问 GitHub 与 OpenAI API。日志按 requestId / jobId 串联；监控每个榜单最近成功时间、过期时长、解析有效率、GitHub 403/429、翻译错误类别和 worker 队列积压。原始 HTML 或用户收藏不发送给 AI 服务；只有用户主动翻译的简介原文会发送。托管平台如默认记录请求头或请求体，须先关闭相应日志再上线。

## 10. 开发顺序与验收映射

1. **数据层与采集器**：建表、Trending HTML 夹具、单语言独立抓取、periodStars 解析与排序、GitHub 元数据缓存、原子快照发布。验证日/月口径、同分顺序、解析为空和限流时不覆盖旧数据。对应 PRD 验收 1、2、6。
2. **API 与前端接入**：按第 6 节实现快照状态，替换 A 版演示数据；接入榜单切换、语言筛选、当前榜单搜索、详情和五分钟检查。验证状态切换与时间显示。对应验收 1、2、3。
3. **收藏与双语**：实现浏览器持久化、中英字典、用户 Key 的会话内配置、按需翻译与回退，确保收藏离榜后不显示旧 periodStars。对应验收 3、4、5。
4. **运行质量**：worker 调度与多实例去重、告警、部署、桌面/手机端到端测试。对应验收 6、7。

测试清单：解析器对 daily/monthly 与多种语言的真实 HTML 夹具；千位分隔符与字段缺失；相同涨星值；并发读写快照；无快照/旧快照/翻译失败/存储禁用；无 Key 时无 AI 请求，保存 Key 后只主动翻译一条；刷新后 Key 消失、译文可保留；清除 Key 后不再发请求；401/429/503 原文回退；中英切换后搜索本地译文；手机 320px 起及常见桌面宽度无溢出。发布前抽样核对 periodStars 和来源 URL，并确认 Key 不在 URL、响应、静态包、持久存储及日志中。

## 11. 官方资料与待确认项

- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)：服务端 API 路由与默认缓存行为。
- [GitHub REST 仓库接口](https://docs.github.com/en/rest/repos/repos)：仓库元数据字段与 Get a repository 端点。
- [GitHub REST 限流](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)及[最佳实践](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)：认证、条件请求和退避。
- [Cheerio 加载文档](https://cheerio.js.org/docs/basics/loading/)：服务端 HTML 解析。
- [PostgreSQL SELECT 锁定语义](https://www.postgresql.org/docs/current/sql-select.html)：任务并发控制的数据库依据。
- [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses/create)：按需简介翻译调用；[API Key 安全实践](https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety)：避免公开或持久泄露用户 Key。

**实施前需确认：** GitHub Trending 的当前 HTML 结构、可用语言 slug 与访问行为；选定 OpenAI 模型的可用性、费用及数据处理条款；部署平台可运行独立常驻 worker，且能关闭代理请求头/正文日志。Trending HTML 不是稳定的官方公开 API，选择器不应散落在业务代码中。此处仅规定实现和验证方式，不将任何页面结构当作长期保证。
