# Plugin market recommender

Answers one question — *has someone already built this?* — before a new plugin is written. It turns a one-line need into a ranked list of plugin candidates with their install spec and whether they are already installed or enabled.

Adds one model-facing tool, `recommend_plugin`, to this DSH profile. It reads catalogs and changes nothing: it never installs, enables, or restarts anything.

## What it searches

| Source | Detail |
|---|---|
| Plugin indexes configured in this profile | Goes through the host's own `pluginMarket` service, so every index added under Plugins → Discover → Index sources is searched |
| The community dshmarket catalog | The same format 1 catalog the dshmarket bundle uses, tried over a CDN copy and then the origin sites |
| Optional plugins built into this installation | Read from the plugin manager, including official bundles that are on disk but not enabled |
| Already installed plugins | Used to say whether a candidate is missing, installed-but-disabled, or already on |

Configured indexes are asked first. The community catalog is only fetched when the indexes produced fewer than three candidates, or when no index is configured at all.

## How to use

Two entry points, one answer:

**The Recommend tab in the Plugins page.** Open **Plugins** and pick the **推荐 / Recommend** tab. Type one sentence about what you want, press Enter, and read the cards: plugin name, description, category, the terms that matched, the install spec, and one button — **Install** for a community plugin, **Enable** for one already built into this installation. Nothing is installed until you press it, and installing hands the spec to the page's own install dialog.

Below the search box, **今日推荐 / Today's picks** shows three community plugins chosen by the date, one category each, skipping what you already have; the pick is stable for the day and changes daily.

The tab talks to three routes this bundle registers on the local web server — `/market-recommender/search` and `/market-recommender/act` (POST), and `/market-recommender/daily` (GET, behind today's picks). They refuse a cross-site request (`Host` must be loopback, and an `Origin`, when sent, must match it), and they exist only while the bundle is enabled.

**The `recommend_plugin` tool.** The same search, for an agent: describe the outcome in natural language and the assistant checks the market before building anything.

- “I want a terminal inside DSH to run commands.”
- “Can the assistant remember my long-term preferences?”
- “Translate the thinking process into Chinese.”

The tool returns candidates with an install spec (or a source URL) and current status. The assistant is expected to recommend the best one and ask before installing or enabling it.

## How matching works

A need is split into words and Chinese bigrams, then expanded through a bilingual synonym table (终端 / terminal / shell, 语音 / voice / speech, and about twenty more concepts), and scored against each candidate's name, title, keywords, labels, description, and category with different weights.

A candidate only counts as a real match when it clears the score threshold **and** shows evidence either in a strong field (name, title, or keywords) or across at least half of the need's own words. Two incidental words in a description are not a match. When nothing clears that bar, the result says so and recommends writing a small new plugin, rather than dressing up the nearest weak hit as an answer.

## Network and cache

- The community catalog is about 5 MB. It is fetched once per process and cached for 15 minutes (`cacheTtlMs`); later calls do not hit the network.
- Every catalog URL has its own timeout (`catalogTimeoutMs`, 12 s), and a failure is reported in the *Sources searched* block before the next URL is tried.
- The last URL that worked is remembered and tried first.

## Configuration

Override the row in the profile's `cordis.patch.yml`:

```yaml
- id: dsh-market-recommender
  name: dsh-market-recommender
  config:
    defaultLimit: 5
    maxLimit: 10
    minScore: 7
    catalogFallback: true
    catalogTimeoutMs: 12000
    cacheTtlMs: 900000
    catalogUrls:
      - https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json
      - https://awesome-dsh-plugin.com/index.json
    synonyms:
      - 仪表盘, dashboard, panel
```

| Field | Default | Meaning |
|---|---|---|
| `defaultLimit` | `5` | Candidates returned when the call omits `limit` |
| `maxLimit` | `10` | Hard cap on one call |
| `minScore` | `7` | Score a candidate must clear to count as a match |
| `catalogFallback` | `true` | Whether to read the community catalog when the indexes are thin |
| `catalogUrls` | three URLs | Community catalogs, tried in order |
| `catalogTimeoutMs` | `12000` | Timeout for one catalog read |
| `cacheTtlMs` | `900000` | Catalog cache lifetime; `0` re-reads every call |
| `synonyms` | `[]` | Extra bilingual concept groups, comma-separated |

## Troubleshooting

**The Recommend tab answers `405 Method Not Allowed` (or `404`) while `recommend_plugin` still works.**
The tool and the tab live in the same bundle: the tool is registered directly from `apply`, the tab's routes are mounted on the host web server. Up to 1.1.0 the routes were registered once, at apply time, through `ctx.get('webServer')`. When the bundle was installed or reloaded while the app was already running, that service could not be reached yet, so no route was registered and the request fell through to the SPA fallback — which answers `405`. The tool kept working, which is why the plugin looked healthy.

From 1.1.1 the routes are mounted with `ctx.inject(['webServer'], …)`, so they are registered whenever the service becomes available, and a failure is logged as a warning instead of being silent. If you still see `405` on 1.1.1 or later, reload the bundle (disable it, then enable it) and check the app log for a `[dsh-market-recommender]` warning.

From 1.1.2 every route first asks the host's request gate (`ctx.get('connection').requestRejection`) — the same fence the core `/api` runs on DSH 0.2.3 and later — so a page open in your browser cannot drive the routes where that service exists. On 0.2.2 and older there is no gate service, and the same-origin check is the guard instead. A refused call answers `401` (needs the DSH session) or `403` (untrusted origin).

**Nothing is found for a need you are sure exists.**
Recall is lexical: add the missing wording to `synonyms` rather than lowering `minScore`, since a lower threshold is what produces confident-looking nonsense.

## Limits

- Recall is lexical plus synonyms, not semantic search. The assistant, not the tool, decides which candidate is truly the best fit and explains why.
- It can only see what this profile can install from. With no index configured and no network, only the built-in and installed plugins remain.
- Whether a community plugin is compatible with this DSH version is whatever the catalog declares in `engines.dsh`; this tool neither rewrites nor verifies that.
- Turning the bundle off removes the tool and nothing else changes.

## 中文说明

写新插件之前先问一句「市场里是不是已经有人做过了」。插件提供两个入口：

**插件页里的「推荐」页签** —— 打开**插件**页，选「推荐」，输入一句话，回车。每张卡片给出插件名、描述、分类、命中的词、安装来源，和一个按钮：社区插件是**安装**，内置插件是**启用**。你不点，它什么都不装；点了之后结果直接显示在页面上。这个页签走本插件在本地 web 服务上注册的三个路由（`/market-recommender/search`、`/market-recommender/act`、`/market-recommender/daily`），每个请求先过宿主的请求栅栏（0.2.3 及以上存在），再做同源校验，且只在 bundle 启用时存在。

**`recommend_plugin` 工具** —— 同样的搜索，给助手用：你在对话里说需求，它先查一遍市场，再给出候选和安装来源。

**搜索来源：** 本 profile 配置的插件市场索引（走宿主自己的 `pluginMarket` 服务）→ 社区 dshmarket 目录（约 5 MB，进程内缓存 15 分钟）→ 本安装内置的可选插件与已装插件。配了索引就先问索引；索引给出的候选少于 3 个时才去读社区目录。

**匹配方式：** 中文断成二元组、英文断成词，再用一张中英同义词表扩展，然后按名称、标题、关键词、标签、描述、分类分别加权打分。**只有当分数过线、并且在名称/标题/关键词里命中、或者覆盖了至少一半的原始需求词时，才算真匹配** —— 描述里碰巧出现的两个词不算。都不达标时会直说「没有合适的，建议另写一个小插件」，而不是把最像的凑一个推荐给你。

**页签报 405 / 404 怎么办：** 1.1.1 之前，三条路由只在插件加载那一刻注册一次；如果插件是在应用已经跑起来之后才安装/热重载的，那一刻还取不到 web 服务器，路由就一条都没注册上，请求落到网页兜底层变成 405 —— 而工具是单独注册的，所以「工具还能用」并不代表插件没坏。1.1.1 改成等服务就绪后再挂载，失败也会写日志。1.1.2 起每个路由先问宿主「这个请求准不准进」（`connection.requestRejection`，0.2.3+ 的同一道栅栏），被拒时回 401（需要 DSH 登录）或 403（来源不可信）。若仍然 405，把插件禁用再启用一次，然后看应用日志里的 `[dsh-market-recommender]` 警告。

**配置与限制**见上方英文表格；关键词、超时、缓存时长、额外同义词组都可以在 `cordis.patch.yml` 里改。召回是词面 + 同义词，不做语义向量，最终「哪个最合适」由你或助手判断。
