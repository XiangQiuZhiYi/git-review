# Git Copilot Review

使用 GitHub Copilot 进行 Git 提交前的智能代码审查。

## ✨ 功能特性

- 🤖 **AI 驱动**：使用 GitHub Copilot 进行智能代码审查
- 🎯 **自动检测**：提交前自动分析代码变更
- 📊 **可视化结果**：清晰展示审查结果，包含问题详情和修复建议
- ⚙️ **灵活配置**：可自定义审查规则和阻止策略
- 🔄 **项目规范集成**：自动读取项目的开发规范文档

## 📦 安装

### 方式一：从 VSIX 安装（开发版）

1. 编译扩展：
   ```bash
   cd vscode-extensions/git-copilot-review
   npm install
   npm run compile
   npm run package
   ```

2. 在 VS Code 中安装：
   - 打开 VS Code
   - 按 `Cmd+Shift+P` (macOS) 或 `Ctrl+Shift+P` (Windows/Linux)
   - 输入"Extensions: Install from VSIX..."
   - 选择生成的 `.vsix` 文件

### 方式二：开发模式

1. 克隆或复制扩展代码到本地
2. 在扩展目录运行：
   ```bash
   npm install
   npm run compile
   ```
3. 在 VS Code 中打开扩展目录
4. 按 `F5` 启动扩展开发窗口

## 🚀 使用方法

### 自动审查（推荐，默认启用）

当启用自动审查时，扩展会在你提交代码时自动触发 AI 审查：

1. 像往常一样在 Source Control 面板暂存文件
2. 输入提交消息
3. 按 `Ctrl+Enter` (Windows/Linux) 或 `Cmd+Enter` (macOS) 提交
4. 扩展会自动进行 AI 审查，并显示审查结果
5. 根据审查结果选择是否继续提交

**或者**点击 SCM 标题栏的 "AI 审查并提交" 按钮

### 手动审查

如果你想在提交前单独进行审查，可以：

1. **方式一**：点击状态栏的 "$(search-fuzzy) AI 审查" 按钮
2. **方式二**：在 Source Control 面板点击工具栏的 "$(search-fuzzy)" 审查图标
3. **方式三**：命令面板 (`Cmd+Shift+P`) 执行 "AI 代码审查"

### 禁用自动审查

如果你只想手动触发审查：

当你准备提交代码时（输入提交消息后），扩展会自动提示进行审查。

### 查看结果

审查完成后会：
1. 弹出通知显示问题数量
2. 打开 Webview 面板展示详细结果
3. 询问是否继续提交

## ⚙️ 配置

在 VS Code 设置中搜索 "Git Copilot Review"：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `gitCopilotReview.enabled` | 是否启用 AI 代码审查 | `true` |
| `gitCopilotReview.autoReviewOnCommit` | 提交前自动审查 | `true` |
| `gitCopilotReview.blockOnError` | 发现严重错误时阻止提交 | `true` |
| `gitCopilotReview.blockOnWarning` | 发现规范问题时阻止提交 | `false` |
| `gitCopilotReview.copilotModel` | Copilot 模型选择 | `auto` |
| `gitCopilotReview.maxDiffSize` | 最大 diff 大小（字节） | `500000` |

## 📋 审查项目

### 🔴 严重错误（会阻止提交）

- 语法错误
- 类型错误（TypeScript）
- 运行时错误风险
- 空指针访问
- 敏感信息泄露

### 🟡 规范问题（建议修复）

- 违反项目编码规范
- 命名不规范
- 缺少类型定义
- 缺少国际化翻译
- 样式使用不当

### 🟢 优化建议（参考）

- 代码重复
- 逻辑可优化
- 可读性问题

## 📁 项目规范集成

扩展会自动读取以下项目规范文件（如果存在）：

- `.vscode/CORE_GUIDELINES.md` - 核心必读规范
- `.vscode/PROJECT_GUIDE.md` - 项目开发规范
- `.github/copilot-instructions.md` - Copilot 开发指引

AI 会根据这些规范进行更精准的审查。

## 🛠️ 故障排除

### 未找到 Copilot 模型

确保：
1. 已安装 GitHub Copilot 扩展
2. 已登录 GitHub 账号
3. Copilot 订阅处于活跃状态

### 未授权使用 Copilot

在设置中允许扩展使用语言模型：
- 设置 → 扩展 → GitHub Copilot → 允许扩展使用

### 审查结果不准确

可以调整以下配置：
- 切换不同的 Copilot 模型（gpt-4o 或 gpt-3.5-turbo）
- 完善项目规范文档
- 提供更具体的开发指引

## 📝 开发指南

### 项目结构

```
git-copilot-review/
├── src/
│   ├── extension.ts      # 扩展入口
│   ├── reviewer.ts       # Copilot 审查逻辑
│   ├── ui.ts            # UI 展示
│   └── git.d.ts         # Git 类型定义
├── package.json         # 扩展配置
└── tsconfig.json       # TypeScript 配置
```

### 本地开发

```bash
# 安装依赖
npm install

# 编译
npm run compile

# 监听模式
npm run watch

# 打包
npm run package
```

### 调试

1. 在 VS Code 中打开扩展目录
2. 按 `F5` 启动调试
3. 在新窗口中测试扩展

## 📄 许可证

MIT

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 🔗 相关链接

- [VS Code Language Model API](https://code.visualstudio.com/api/extension-guides/language-model)
- [GitHub Copilot](https://github.com/features/copilot)
- [Git 扩展 API](https://github.com/microsoft/vscode/tree/main/extensions/git)
