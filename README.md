# 技能仓库 · DSH Skill Manager

> **让 DSH 里"看不见、复用不了"的技能重新可见、可用。** 一个装进 DeepSeek Harness 的"全机器技能库管理器"——把散落在 Claude / Codex / Gemini / DSH 等各个 AI 工具里的技能**收拢到一处**,统一查看、分类、安装、删除。
>
> Make the skills you already downloaded **visible and reusable inside DSH**. A machine-wide skill library manager for the DeepSeek Harness — discover, de-duplicate, categorize, install, and remove skills across **every** AI tool on your machine.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.2.0--rc.2-6f42c1)](https://github.com/deepseek-ai)
[![零依赖](https://img.shields.io/badge/dependencies-0%20external-success)](package.json)

---

## 🔍 症状自查:**你在 DSH 里看不到、调不了技能吗?**

> **一句话:** 如果你的 DSH **技能列表是空的 / 侧边栏没有技能入口 / 对话里调用技能报错**,而你明明往 `~/.claude/skills`、`~/.agents/skills`、`~/.codex/skills`、`~/.gemini/skills` 里装过技能——**这个项目就是为修这个问题写的。**

| 你会看到的症状 | 常见报错 / 状态 | 根因 | 本项目 |
|---|---|---|---|
| 让 Agent 用技能,它说找不到 | `skill "xxx" is unknown or no longer available` | 技能没被注册进 `ctx.skills` | 注册技能提供者,把技能喂进注册表 |
| 侧边栏**没有技能入口**,看不到装了啥 | `dsh-client-ui-skill` 状态为 `absent` | 该界面插件不在你的 profile 里 | 自带完整管理面板(侧栏 + 列表 + 详情) |
| 打 `/` 不显示任何技能 | 技能来源为空 | 没有可用的 SkillProvider | 内置 `/` 技能选择器,按分类分组 |
| DSH 扫不到本地技能目录 | `dsh-skill-filesystem` 状态 `inactive` | 只扫部分目录,其余工具的技能看不见 | 扫描 Claude / Codex / Gemini / AGENTS / DSH 全部根 |
| 想知道"我到底装了几个技能" | 只能一个个文件夹翻 | 无统一视图 | 全机器扫描 + 按 `name` 合并去重 |
| 同一技能装了好几份,版本还不一致 | 重复目录 | 无去重 | 一条记录列出**全部安装位置** |

**可直接用来搜索的关键词:**
`DSH 看不到技能` · `DSH 技能列表为空` · `dsh skill not showing` · `DeepSeek Harness skills empty` · `skill unknown or no longer available` · `skill tool returns nothing` · `dsh-skill-filesystem inactive` · `dsh-client-ui-skill absent` · `SKILL.md 不生效` · `技能库不显示` · `AI 技能管理` · `machine-wide skill manager`

📖 **逐条排障手册 → [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)**(4 个断点分别判断、装完仍看不到的检查清单)

<details>
<summary><b>🇬🇧 English: symptoms &amp; troubleshooting (click to expand)</b></summary>

**If your DeepSeek Harness shows no skills, this project fixes that.**

| Symptom | Error / status you may see | Root cause | What this project does |
|---|---|---|---|
| Agent can't load a skill | `skill "xxx" is unknown or no longer available` | Skills never registered into `ctx.skills` | Registers a SkillProvider that feeds the registry |
| No skill entry in the sidebar | `dsh-client-ui-skill` is `absent` | That UI plugin is not in your profile | Ships its own management panel |
| Typing `/` lists no skills | empty skill source | No available SkillProvider | Adds a `/` picker grouped by category |
| DSH misses local skill dirs | `dsh-skill-filesystem` is `inactive` | Only some roots are scanned | Scans Claude / Codex / Gemini / AGENTS / DSH roots |
| Duplicate skills, mismatched versions | repeated directories | No de-duplication | Merges by `name`, lists every install location |

Search terms this page answers: `dsh skill not showing` · `deepseek harness skills empty` · `skill unknown or no longer available` · `dsh skill tool returns nothing` · `dsh-skill-filesystem inactive` · `dsh-client-ui-skill absent` · `SKILL.md not loaded` · `machine-wide AI skill manager` · `claude code codex gemini skills unified`

</details>

---

## 😩 你是不是也这样?

**痛点一:DSH 里看不到技能库**
你在别处下载了一大堆 skill,但装进 DSH 之后——**看不见**。不知道装了哪些、叫什么、干什么用。技能对 DSH 来说像是一个"黑盒目录"。

**痛点二:下载的 skill 复用不了**
明明已经下载到电脑上了,换一个工具就用不了;或者根本想不起来自己装过什么,于是又去下载一遍。**技能躺在硬盘上,却等于不存在。**

**痛点三:多个 Agent 的技能目录一片混乱**
你同时用 Claude、Codex、Gemini、DeepSeek Harness,于是:

- 技能散落在 `~/.claude/skills`、`~/.codex/skills`、`~/.gemini/skills`、`~/.agents/skills` 好几个地方
- **同一个技能装了好几份**,重复、占空间、版本还不一致
- 想知道"我到底装了多少"只能一个个文件夹翻
- 想清理某个技能,得手动去对应文件夹里删——**搞不好删错工具的那份**

**技能仓库**把这一切收进 DSH 侧边栏一个面板:**一次扫描,全机器技能尽收眼底**。

---

## 💡 它是怎么帮上忙的

| 你遇到的 | 技能仓库做的 |
|---|---|
| 技能看不见 | 侧边栏面板**列出全部技能**——名称、描述、分类、装在哪些工具里,一目了然 |
| 装了却用不上 | 技能**可见即可复用**:只要位于 DSH 加载的根目录,**在对话中就能直接调用** |
| 到处找技能 | **全机器扫描** `~/.claude`、`~/.codex`、`~/.gemini`、`~/.agents` 及 DSH 内置目录 |
| 重复/版本不一 | 按 `name` **合并去重**,一条记录列出**全部安装位置** |
| 清理混乱 | 统一面板删除(进回收站可恢复),**不用再去猜哪个目录对应哪个工具** |

> **关于"在对话中调用"**:调用本身由 **DSH 原生技能机制**完成——它会自动加载技能根目录。本插件负责让这些技能**可见、可管、装对位置**;一旦就位,你在对话里就能像平常一样使用它们。这不是"另一个调用入口",而是**把原本看不见、想不起、用不上的技能重新接回你的工作流**。

---

## ✨ 核心能力

| 能力 | 说明 |
|---|---|
| 🧲 **全机器扫描** | 自动发现各 AI 工具的技能目录,一次扫完 |
| 🧩 **合并去重** | 同一技能装在多个工具里 → 合并为一条,列出**全部安装位置** |
| 🏷 **自动分类** | 内置规则引擎(前缀 + 关键词)自动归类;可**自定义分类** |
| ➕ **添加** | 从**本地文件夹**或 **Git 仓库**一键安装 |
| 🗑 **安全删除** | 删除先进**回收站**,可恢复;只读源自动保护 |
| 📤 **导出清单** | 一键导出 Markdown / CSV / JSON 清单 |
| ⭐ **收藏与别名** | 给常用技能加星、改中文名 |
| 🌐 **中英双语** | 界面、导出清单均支持中英 |
| 🔒 **安全加固** | 路径穿越防护、命令注入防护、大小/深度限制 |

---

## 🖼️ 它长什么样

> 图(面板截图):左侧分类栏 + 中间技能列表 + 详情抽屉。

**支持的技能来源(默认自动扫描):**

| 工具 | 默认扫描路径 | 可编辑 |
|---|---|---|
| DSH / Claude | `~/.claude/skills` | ✅ |
| Codex | `~/.codex/skills`、`~/.codex/vendor_imports` | ✅ |
| Gemini | `~/.gemini/skills` | ✅ |
| AGENTS 通用标准 | `~/.agents/skills` | ✅ |
| DSH 内置办公技能 | `<安装目录>/resources/runtime/office-skills` | ❌ 只读 |

> 可在配置里**自定义扫描根**,也可开启扫描 Claude 插件市场缓存(默认只读)。

---

## 🚀 安装

> ⚠️ **前置条件:已安装 [DeepSeek Harness](https://github.com/deepseek-ai)(DSH)** `0.2.0-rc.2` 或更新版本。本插件是 DSH 的一个 Cordis 插件,依赖 DSH 提供的运行时。

### 方式一:链接本地源码(推荐,开发者)

1. 克隆本仓库:
   ```bash
   git clone https://github.com/971184676/dsh-skill-manager.git
   ```
2. 在你的 DSH profile(`~/.dsh/profiles/desktop/package.json`)里,把插件**链接**进去:
   ```json
   {
     "dsh": { "profile": { "bundles": [ "…", "@local/skill-manager" ] } },
     "dependencies": { "@local/skill-manager": "link:/abs/path/to/skill-manager" }
   }
   ```
   并在该 profile 的 `cordis.patch.yml` 里加入一行:
   ```yaml
   - insert:
       - id: skill-manager
         name: '@local/skill-manager'
         config: {}
   ```
3. 重启 DSH,左侧栏出现「技能」面板。

### 方式二:通过 DSH 的 plugin_manager

在 DSH 的创造模式里让它帮你安装并验证(见下方"让 Agent 帮你装")。

---

## 🤖 让 Agent 帮你装(创造模式)

在 DSH 里新建任务 → 选**创造模式**,然后说:

> 把这个技能仓库装进 DSH 并验证面板能打开

---

## ⚙️ 配置

在 `cordis.patch.yml` 的 `config` 里可调:

| 配置项 | 默认 | 说明 |
|---|---|---|
| `home` | DSH home 下 `skill-manager` | 清单 / 回收站 / 日志的存放目录 |
| `extraRoots` | `[]` | 额外的扫描根目录数组 |
| `includePluginCache` | `false` | 是否把 Claude 插件市场缓存也纳入扫描(只读) |
| `cacheTtlMs` | `15000` | 扫描缓存有效期 |

> 你的分类、别名、收藏等**个人数据**保存在 `home` 目录下的 `catalog.json`,不会污染技能文件夹。

---

## 🔐 安全设计

开源前经过一轮安全审查,关键防护:

- **路径穿越防护** —— 安装时校验目标路径不逃逸出选定根目录
- **命令注入防护** —— git 以**数组参数**调用,不经 shell 字符串拼接
- **删除进回收站** —— 移入 trash 而非硬删,支持恢复 / 彻底清除
- **只读源保护** —— 内置 / 市场等只读技能禁止删除
- **资源上限** —— 扫描深度、文件大小、安装体积、回收站条数均有限制,防 DoS
- **名称白名单** —— 技能名需匹配 `^[a-z0-9]+(?:-[a-z0-9]+)*$`
- **无硬编码路径** —— 全部基于 `homedir()` / DSH home 解析,不含任何个人信息
- **零外部依赖** —— 仅用 Node 内置模块 + DSH 官方 peerDependencies

> ℹ️ Git 安装支持 `https://`、`git@`、`ssh://` 以及 `file://`(本地仓库)。若不需要本地仓库能力,可自行移除该分支。

---

## 🧩 内置分类(可自定义)

`飞书办公` `Cloudflare/云平台` `视频与动画` `Office 文档` `技能管理` `前端与设计` `开发方法论` `未分类`

- 规则:前缀精确 > 关键词 > 兜底
- 分类可**增删改名**,单个技能也可**手动改分类**(手动优先于自动)

---

## 📁 项目结构

```
skill-manager/
├── index.js           # Host 服务:扫描 / 分类 / 安装 / 删除 / 导出(依赖 DSH 运行时)
├── client.js          # Client 面板:React 侧边栏 UI + `/` 选择器(中英双语)
├── remote.js          # Typert Remote 协议描述(20 个方法)
├── cordis.patch.yml   # 插件挂载行
├── lib/
│   ├── skill-model.js       # 纯领域逻辑:frontmatter / 发现 / 合并 / 分类(零依赖,可单测)
│   ├── remote-marker.js     # 手写 ESM 的 Remote 标记装配
│   └── yaml.js              # 轻量 YAML 读取
├── test/
│   └── skill-model.test.js  # 单元测试(node --test,零依赖)
├── tools/
│   └── check-inject.mjs     # 注入依赖守卫(拦截"侧边栏不显示"那类故障)
└── package.json
```

---

## 🛠️ 开发

```bash
# 无需安装依赖 —— 运行时全部由 DSH 提供

npm test                        # 单元测试(18 项,零依赖)
node tools/check-inject.mjs     # 校验注入依赖完整性
```

- **领域逻辑**(`lib/skill-model.js`)不依赖 DSH,可在任意 Node 环境直接测试。
- **Host 半边**(`index.js`)是 `TypertRemoteService`,提供 `ctx.remote.skillManager` 命名空间。
- **Client 半边**(`client.js`)由 Web 页面从同一个包的 `./client` 导出加载。
- 本包是手写 ESM,因此 `@Remote` 标记是**编程式装配**(`applyRemoteMarkers`),而非装饰器解析。
- CI 在每次 push / PR 上跑:单元测试 + manifest 校验 + 注入守卫 + 语法检查。

---

## 📄 License

[MIT](LICENSE) © 技能仓库 contributors

---

## ⭐ Star 一下

如果这个项目帮到你了,欢迎点个 ⭐ Star,并分享给同样被"技能散落各处"折磨的朋友!
