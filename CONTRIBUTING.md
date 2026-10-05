# 贡献指南 · Contributing

感谢你愿意为「技能仓库」出力!🎉

## 快速开始

1. Fork 本仓库
2. 创建分支:`git checkout -b feat/your-feature`
3. 提交:`git commit -m "feat: 你的改动"`
4. 推送并发起 Pull Request

## 开发约定

- **零外部依赖**:优先使用 Node 内置模块与 DSH 已提供的运行时包。新增依赖前请先说明理由。
- **不破坏现有安装**:插件以 `@local/skill-manager` 通过 `link:` 方式装入 DSH profile,改动需保持 `cordis.patch.yml`、profile 配置与 `package.json` 三者名称一致。
- **安全优先**:任何涉及文件写入 / 删除 / 命令执行的改动,都必须保持现有的路径穿越防护、命令注入防护、只读源保护与资源上限。
- **中英双语**:新增或修改用户可见文案时,同时更新 `client.js` 里的 `zh` 与 `en` 两份文案。
- **保持独立实现**:请勿直接复制 DSH 官方源码;基于公开 API 自行实现。

## 提交前必须运行

```bash
npm test          # 单元测试(零依赖,node --test)
node tools/check-inject.mjs   # 注入依赖守卫
```

`tools/check-inject.mjs` 校验:`client.js` 里 `inject` 的每个服务,是否都有对应包出现在
`package.json` 的 `dsh.client.inject` 里。**这个不一致曾让整个客户端半边停在 pending,
侧边栏入口整个消失且不报任何错**——CI 会拦截它。

CI(GitHub Actions)在每次 push / PR 上跑:单元测试、manifest 校验、注入守卫、全量语法检查。

### 领域逻辑放哪里

`lib/skill-model.js` 是**无 DSH 依赖**的纯逻辑(frontmatter 解析、技能发现、合并去重、分类)。
新增与这些相关的规则请放进这个文件,并在 `test/skill-model.test.js` 补测试——它能在**没有装
DSH 的环境**下直接跑。`index.js` 只负责 DSH 相关的事务(Cordis / Typert / 原子写 / 原生命令)。

## 提交信息

采用 Conventional Commits:

```
feat: 新增 Git 安装时记录 commit 的能力
fix: 修复删除后回收站索引未更新
docs: 补充配置说明
chore: 升级 peerDependencies 版本
```

## 需要帮助?

- 提问 → 提交 Issue
- 想法 → 提交 Discussion
- 觉得某个技能分类规则不合理 → 提 Issue 附上技能名和建议分类

再次感谢! 🙏
