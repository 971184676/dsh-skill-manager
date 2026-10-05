# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.0] — 2026-10-05

首个可用版本:把散落在各个 AI 工具里的技能收拢进 DSH,重新变得**可见且可用**。

### 新增

- **全机器扫描** — 自动发现 `~/.claude/skills`、`~/.codex/skills`、`~/.codex/vendor_imports`、
  `~/.gemini/skills`、`~/.agents/skills` 以及 DSH 内置办公技能;支持自定义扫描根与只读插件缓存。
- **合并去重** — 按 frontmatter `name` 合并同名技能,一条记录列出**全部安装位置**;
  不同来源描述不一致时标记为冲突。
- **技能提供者注册** — 向 `ctx.skills` 注册一个 provider,把扫描到的技能喂进技能注册表,
  让原本"装了却调不了"的技能**在对话中重新可调用**。
- **composer `/` 技能选择器** — 在输入框打 `/` 列出全部技能,**按分类分组**;
  选中后在草稿中插入 `@技能名` 引用。支持按名称、别名与分类搜索。
- **侧边栏管理面板** — 分类侧栏 + 技能列表 + 详情抽屉;搜索、筛选、收藏、别名。
- **自动分类** — 内置规则引擎(前缀优先于关键词),分类可增删改名,单个技能可手动改分类。
- **安全删除** — 删除先进回收站、可恢复、可彻底清除;只读源自动禁止删除。
- **安装** — 从本地文件夹或 Git 仓库(`https://` / `git@` / `ssh://` / `file://`)安装。
- **导出清单** — Markdown / CSV / JSON。
- **中英双语** — 界面与导出清单均支持。

### 修复

- **客户端插件无法激活** — `dsh.client.inject` 缺少 `dsh-client-ui-input-trigger` 与
  `dsh-client-ui-conversation`,导致 `inputTriggers` / `sessions` 服务解析失败,整个客户端半边
  停在 pending,侧边栏入口与 `/` 选择器都不出现,且**没有任何报错**。
- **潜在崩溃** — `/` 触发器来源名原为 `skill`,与 DSH 内置技能选择器的 `('/', 'skill')` 身份冲突;
  `registerSource` 对重名的 `(trigger, name)` 会抛错,可能导致页面启动失败。现改为 `skillLibrary`,
  并对该注册加 `try/catch` 兜底,使注册失败不再连累插件激活。
- **并发全盘扫描** — `ctx.skills.list()` 每轮对话都会调用,原先并发请求各自发起一次全盘扫描
  (缓存在扫描结束后才写入,存在竞态)。现改为 single-flight 合并,多个并发调用共享一次扫描。

### 工程

- 抽出无依赖的领域逻辑模块 `lib/skill-model.js`(frontmatter 解析、发现、合并、分类),
  使其可在**任意环境**下被单元测试。
- 新增 `npm test`(`node --test`,零依赖)与 18 项单元测试。
- 新增 CI:单元测试 + manifest 校验 + **注入依赖守卫** `tools/check-inject.mjs`
  (专门拦截导致侧边栏消失的那类依赖缺失)+ 全量语法检查。
- 新增 Issue 模板:症状模板(收集"看不见技能"的原始报错字符串)、Bug 模板。

[1.0.0]: https://github.com/971184676/dsh-skill-manager/releases/tag/v1.0.0