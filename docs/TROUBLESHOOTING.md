# 排障:DSH 里看不到 / 调不了技能

> **Troubleshooting: skills not showing or not callable in DeepSeek Harness (DSH)**
>
> 本文覆盖这些症状 / This page covers these symptoms:
> `DSH 看不到技能` · `技能列表为空` · `侧边栏没有技能入口` · `打 / 不显示技能` ·
> `skill "xxx" is unknown or no longer available` · `skill tool returns nothing` ·
> `dsh-skill-filesystem inactive` · `dsh-client-ui-skill absent` ·
> `DSH skill list empty` · `DeepSeek Harness skills not showing`

---

## 一、先确认你遇到的是哪一种

DSH 的"技能看不见/调不了"通常有 **4 个独立的断点**。它们的表现很像,但原因完全不同,要对症下药。

| # | 断点 | 典型表现 | 判断方法 |
|---|---|---|---|
| 1 | **技能源没启用** | 技能列表为空,打 `/` 什么都没有 | 检查 `dsh-skill-filesystem` 是否为 `inactive` |
| 2 | **界面插件缺失** | 侧边栏**根本没有**技能入口 | 检查 `dsh-client-ui-skill` 是否为 `absent` |
| 3 | **注册表为空** | 界面在,但列表空;Agent 说找不到技能 | `ctx.skills.list()` 返回 0 条 |
| 4 | **技能在非扫描目录** | 有的技能能看到,有的看不到 | 技能装在 Codex / Gemini 目录下 |

---

## 二、症状 1:Agent 报 `skill "xxx" is unknown or no longer available`

**含义:** 技能没有进入 DSH 的技能注册表(`ctx.skills`)。Agent 想加载,但查不到。

**常见原因:**

- `dsh-skill-filesystem`(DSH 自带的本地技能提供者)在你的 profile 里是 `inactive`
- 技能装在 DSH **不扫描**的目录里(例如只在 `~/.codex/skills` 或 `~/.gemini/skills`)
- 技能的 `SKILL.md` frontmatter 缺 `name` 或 `description`,被判为无效

**本项目如何解决:**
[技能仓库](https://github.com/971184676/dsh-skill-manager) 会**自己注册一个 SkillProvider**,把扫描到的技能直接喂进 `ctx.skills`——不依赖 `dsh-skill-filesystem` 是否启用,并且覆盖 Claude / Codex / Gemini / AGENTS 全部根目录。

---

## 三、症状 2:侧边栏没有技能入口

**含义:** DSH 自带的技能界面插件 `dsh-client-ui-skill` 不在你的 profile 里(状态为 `absent`)。

**怎么确认:** 在 DSH 里查询插件清单,找 `dsh-client-ui-skill`,看状态:

- `absent` → 该插件根本没装进这个 profile
- `inactive` → 装了但没激活

**本项目如何解决:**
技能仓库自带**完整的侧边栏管理面板**,不依赖那个插件。装上就有:分类侧栏 + 技能列表 + 详情抽屉 + 删除/安装/导出。

---

## 四、症状 3:打 `/` 不显示技能

**含义:** composer 里的 `/` 触发器没有任何技能来源。

**本项目如何解决:**
技能仓库注册一个 `/` 触发器来源,列出全部技能并**按分类分组**;选中后会在输入框插入 `@技能名` 引用。

> 注:技能仓库用独立来源名 `skillLibrary`,与 DSH 内置的 `skill` 来源**不冲突**,两者可共存。

---

## 五、症状 4:技能散落多个工具,重复 / 版本不一致

**含义:** 同一技能在 `~/.claude/skills`、`~/.agents/skills` 各有一份,是**独立副本**而非软链。

**本项目如何解决:**
按 frontmatter 的 `name` **合并去重**:同名技能合并为一条记录,下挂**全部安装位置**;删除时按安装位置操作,并提示"该技能在 N 个工具里都有,这里只删这一个"。

---

## 六、装完之后仍然看不到?

按顺序检查:

1. **重启 DSH。** 新装的 bundle 需要重启才会被模块解析器接纳——这是 DSH 的既定行为,不是插件问题。
2. **确认 profile 里真的有这一行。** `~/.dsh/profiles/<profile>/cordis.patch.yml`:
   ```yaml
   - insert:
       - id: skill-manager
         name: '@local/skill-manager'
         config: {}
   ```
3. **确认 `package.json` 的 bundles 里有它。**
4. **看插件状态。** 若是 `inactive` / `pending`,说明依赖没解析到,把状态贴出来提 issue。
5. **刷新页面。** 客户端半边(callback 面板)需要页面重载。

---

## 七、仍然解决不了?

到 [Issues](https://github.com/971184676/dsh-skill-manager/issues) 提一个,附上:

- 你的 DSH 版本
- 插件那一行的状态(`active` / `inactive` / `pending`)
- 具体现象(侧边栏没有?列表空?报错原文?)
- 你的技能装在哪几个目录

---

**相关:** [README](../README.md) · [安全设计](../README.md#-安全设计) · [配置说明](../README.md#️-配置)
