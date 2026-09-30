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
