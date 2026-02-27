# Git Copilot Review 扩展 - 快速开始

## 🚀 立即使用（3 步）

### 第 1 步：安装依赖并编译

```bash
cd vscode-extensions/git-copilot-review
npm install
npm run compile
```

### 第 2 步：启动调试

在 VS Code 中：
1. 打开 `vscode-extensions/git-copilot-review` 文件夹
2. 按 `F5` 键

会自动打开一个新的 VS Code 窗口（扩展开发主机）

### 第 3 步：测试扩展

在新打开的窗口中：

1. **打开你的项目**（如 sisreact 项目）
2. **修改一些代码**
3. **暂存更改**（`git add`）
4. **点击状态栏的 "AI 审查" 按钮**

会看到 Copilot 正在审查代码！

## 📖 详细操作步骤

### 方法 1：使用状态栏按钮（推荐）

```
1. 修改代码
2. git add .
3. 点击左下角状态栏的 "🔍 AI 审查" 按钮
4. 查看审查结果
5. 决定是否提交
```

### 方法 2：使用命令面板

```
1. 修改代码
2. git add .
3. Cmd+Shift+P (macOS) 或 Ctrl+Shift+P (Windows)
4. 输入 "AI 代码审查"
5. 查看审查结果
```

### 方法 3：使用 Source Control 工具栏

```
1. 打开 Source Control 面板（左侧边栏）
2. 暂存更改
3. 点击工具栏的审查图标（🔍）
4. 查看结果
```

## 🎯 审查结果示例

### 通过审查 ✅

```
✅ 代码审查通过，未发现明显问题！
```

### 发现问题 ⚠️

会打开一个 Webview 面板，显示：

```
🤖 AI 代码审查结果
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

总体评估：发现一些规范问题需要注意

🔴 严重错误（必须修复）
1. src/components/UserCard/index.tsx:25
   [类型错误]
   变量 'user' 可能为 undefined
   💡 建议: 添加可选链：user?.name

🟡 规范问题（建议修复）
2. src/components/UserCard/lang.ts:10
   [国际化]
   缺少英文翻译
   💡 建议: 补充对应的英文翻译
```

## ⚙️ 配置选项

### 必需配置

**1. GitHub Copilot 订阅**
- 确保已安装 GitHub Copilot 扩展
- 已登录 GitHub 账号
- 订阅处于活跃状态

**2. 授权扩展使用语言模型**
```
设置 → 扩展 → GitHub Copilot 
→ ✅ 允许扩展使用语言模型
```

### 可选配置

在 VS Code 设置（`Cmd+,`）中搜索 "Git Copilot Review"：

```json
{
  // 启用/禁用扩展
  "gitCopilotReview.enabled": true,
  
  // 自动审查（输入提交消息时提示）
  "gitCopilotReview.autoReviewOnCommit": true,
  
  // 发现严重错误时阻止提交
  "gitCopilotReview.blockOnError": true,
  
  // 发现规范问题时阻止提交（默认 false）
  "gitCopilotReview.blockOnWarning": false,
  
  // Copilot 模型选择
  "gitCopilotReview.copilotModel": "auto", // "gpt-4o" | "gpt-3.5-turbo" | "auto"
  
  // 最大 diff 大小（超过则跳过）
  "gitCopilotReview.maxDiffSize": 500000
}
```

## 🐛 故障排除

### 问题 1：未找到 Copilot 模型

**错误信息**：
```
❌ 未找到可用的 Copilot 模型
```

**解决方法**：
1. 检查 GitHub Copilot 扩展是否已安装
2. 检查是否已登录 GitHub 账号
3. 检查订阅状态：https://github.com/settings/copilot

### 问题 2：未授权使用

**错误信息**：
```
❌ 未授权使用 Copilot
```

**解决方法**：
1. 打开设置 → 扩展 → GitHub Copilot
2. 找到 "GitHub Copilot: Enable Auto Completions"
3. 确保允许扩展使用语言模型

### 问题 3：编译错误

**解决方法**：
```bash
# 清理重新安装
rm -rf node_modules out
npm install
npm run compile
```

### 问题 4：扩展未激活

**解决方法**：
```bash
# 查看扩展输出日志
1. 打开输出面板（View → Output）
2. 选择 "Git Copilot Review"
3. 查看错误信息
```

## 📦 打包安装（可选）

如果要在主 VS Code 中使用（不是调试模式）：

```bash
# 1. 安装打包工具
npm install -g @vscode/vsce

# 2. 打包扩展
cd vscode-extensions/git-copilot-review
npm run package

# 3. 安装 VSIX
# 会生成 git-copilot-review-1.0.0.vsix 文件
# 在 VS Code 中：Extensions → ... → Install from VSIX
```

## 🎯 使用场景示例

### 场景 1：日常开发

```bash
# 1. 开发功能
vim src/components/UserList/index.tsx

# 2. 暂存更改
git add .

# 3. 点击状态栏 "AI 审查"
# → 查看审查结果
# → 修复问题
# → 再次审查

# 4. 提交
git commit -m "feat: 添加用户列表"
```

### 场景 2：代码重构

```bash
# 1. 重构代码
# 修改多个文件

# 2. 分批审查
git add src/utils/
# 点击审查 → 查看结果

git add src/components/
# 再次审查 → 确认无问题

# 3. 提交
git commit -m "refactor: 优化工具函数"
```

### 场景 3：团队协作

```bash
# 1. 拉取最新代码
git pull

# 2. 修改并审查
git add .
# 点击审查 → 确保符合团队规范

# 3. 提交并推送
git commit -m "fix: 修复bug"
git push
```

## 🎨 UI 预览

### 状态栏

```
┌──────────────────────────────────┐
│ $(search-fuzzy) AI 审查          │ ← 点击触发审查
└──────────────────────────────────┘
```

审查中：
```
┌──────────────────────────────────┐
│ $(loading~spin) 审查中...        │
└──────────────────────────────────┘
```

### 审查结果面板

```
┌─────────────────────────────────────┐
│ 🤖 AI 代码审查结果                    │
├─────────────────────────────────────┤
│                                     │
│ 总体评估：发现一些规范问题需要注意     │
│                                     │
│ 📊 统计                             │
│ 2 严重错误  3 规范问题  1 优化建议   │
│                                     │
│ 🔴 严重错误（必须修复）               │
│ ┌─────────────────────────────┐   │
│ │ 1. src/utils/api.ts:45      │   │
│ │    [类型错误]               │   │
│ │    response.data 可能为空   │   │
│ │    💡 添加空值检查          │   │
│ └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

## 📚 下一步

- 📖 阅读完整 [README.md](./README.md)
- 🔧 自定义配置选项
- 📝 完善项目规范文档
- 🚀 在实际项目中使用

## 💡 小贴士

1. **首次使用**：建议先用小的代码变更测试
2. **性能优化**：大型提交可能需要较长时间
3. **准确性**：结合项目规范文档效果更好
4. **灵活性**：可以随时禁用自动审查

现在开始使用 Copilot 进行智能代码审查吧！🎉
