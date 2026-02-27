import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import * as http from 'http'
import { URL } from 'url'

export interface ReviewResult {
  status: 'error' | 'warning' | 'success'
  summary: string
  issues: Issue[]
}

export interface Issue {
  severity: 'error' | 'warning' | 'info'
  type: string
  file: string
  line?: string
  message: string
  suggestion?: string
  code?: string  // 代码片段（可选）
}

export async function reviewCodeWithCopilot(
  diff: string,
  context: vscode.ExtensionContext
): Promise<ReviewResult | null> {
  try {
    // 选择 Copilot 模型
    const config = vscode.workspace.getConfiguration('gitCopilotReview')
    const modelPreference = config.get<string>('copilotModel', 'auto')

    let modelSelector: vscode.LanguageModelChatSelector = { vendor: 'copilot' }

    if (modelPreference !== 'auto') {
      modelSelector = {
        vendor: 'copilot',
        family: modelPreference,
      }
    }

    const models = await vscode.lm.selectChatModels(modelSelector)

    if (models.length === 0) {
      vscode.window.showErrorMessage(
        '未找到可用的 Copilot 模型。请确保：\n1. 已登录 GitHub Copilot\n2. 订阅处于活跃状态\n3. 在设置中允许扩展使用语言模型'
      )
      return null
    }

    const [model] = models

    // 构造审查提示词
    const prompt = buildReviewPrompt(diff)

    // 发送请求
    const messages = [vscode.LanguageModelChatMessage.User(prompt)]

    const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token)

    // 收集响应
    let fullText = ''
    for await (const chunk of response.text) {
      fullText += chunk
    }

    // 解析 JSON 结果
    const result = parseReviewResult(fullText)
    return result
  } catch (error) {
    if (error instanceof vscode.LanguageModelError) {
      handleLanguageModelError(error)
    } else {
      console.error('审查失败:', error)
      vscode.window.showErrorMessage(`审查失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
    return null
  }
}

function buildReviewPrompt(diff: string): string {
  // 读取项目规范
  const guidelines = getProjectGuidelines()

  return `你是一个专业的代码审查助手。请分析以下 Git 提交的代码变更，检查是否存在问题。

## 必须检查的项目

### 1. 严重错误（🔴 必须修复）
- 语法错误
- 类型错误（TypeScript）
- 明显的运行时错误（如未定义的变量、函数调用错误）
- 空指针/undefined 访问风险
- 死循环或性能问题
- 敏感信息泄露（API key、密码等）
- 删除了重要的功能代码

### 2. 规范问题（🟡 建议修复）
- 违反项目编码规范
- 命名不规范
- 缺少类型定义
- 缺少必要的国际化翻译
- 样式使用不当（未使用 CSS Modules）
- 未遵循项目约定

### 3. 代码质量（🟢 优化建议）
- 代码重复
- 逻辑可优化
- 可读性问题
- 缺少注释

## 项目规范参考

${guidelines}

## 代码变更

\`\`\`diff
${diff}
\`\`\`

## 输出格式

请严格按照以下 JSON 格式输出分析结果（不要包含任何其他文本）：

\`\`\`json
{
  "status": "error | warning | success",
  "summary": "简短总结",
  "issues": [
    {
      "severity": "error | warning | info",
      "type": "语法错误 | 类型错误 | 规范问题 | 优化建议",
      "file": "文件路径",
      "line": "行号（如果能识别）",
      "message": "问题描述",
      "suggestion": "修复建议"
    }
  ]
}
\`\`\`

注意：
- 如果有严重错误（🔴），status 必须为 "error"
- 如果只有建议性问题（🟡🟢），status 为 "warning" 或 "success"
- 关注实际的代码问题，不要过度苛刻
- 如果代码变更看起来正常，可以返回 success，issues 为空数组
- 输出必须是有效的 JSON，不要包含任何注释或额外文本`
}

function getProjectGuidelines(): string {
  const guidelines: string[] = []

  try {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return ''
    }

    const rootPath = workspaceFolders[0].uri.fsPath

    // 读取核心规范
    const coreGuidePath = path.join(rootPath, '.vscode/CORE_GUIDELINES.md')
    if (fs.existsSync(coreGuidePath)) {
      guidelines.push('## 核心必读规范\n\n' + fs.readFileSync(coreGuidePath, 'utf-8'))
    }

    // 读取项目规范
    const projectGuidePath = path.join(rootPath, '.vscode/PROJECT_GUIDE.md')
    if (fs.existsSync(projectGuidePath)) {
      guidelines.push('## 项目开发规范\n\n' + fs.readFileSync(projectGuidePath, 'utf-8'))
    }

    // 读取 Copilot 指令
    const copilotPath = path.join(rootPath, '.github/copilot-instructions.md')
    if (fs.existsSync(copilotPath)) {
      guidelines.push('## Copilot 开发指引\n\n' + fs.readFileSync(copilotPath, 'utf-8'))
    }
  } catch (error) {
    console.error('读取项目规范失败:', error)
  }

  return guidelines.length > 0 ? guidelines.join('\n\n---\n\n') : '无特定项目规范'
}

function parseReviewResult(text: string): ReviewResult {
  try {
    // 尝试提取 JSON 代码块
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
    const jsonText = jsonMatch ? jsonMatch[1] : text

    const result = JSON.parse(jsonText.trim())

    // 验证结果格式
    if (!result.status || !result.summary) {
      throw new Error('Invalid result format')
    }

    return {
      status: result.status,
      summary: result.summary,
      issues: result.issues || [],
    }
  } catch (error) {
    console.error('解析审查结果失败:', error)
    console.log('原始响应:', text)

    // 返回默认结果
    return {
      status: 'success',
      summary: '解析审查结果失败，但代码可能没有明显问题',
      issues: [],
    }
  }
}

// ─────────────────────────────────────────────────────────────
// OpenAI / Qwen 兼容接口调用（供 Git Hook 路径使用）
// ─────────────────────────────────────────────────────────────

/**
 * 读取指定仓库目录中的项目规范文档
 * (.github/copilot-instructions.md + .github/skills/)
 */
function getProjectGuidelinesForRepo(repoPath: string): { main: string; skills: string } {
  let main = ''
  let skills = ''

  try {
    const copilotPath = path.join(repoPath, '.github/copilot-instructions.md')
    if (fs.existsSync(copilotPath)) {
      main = fs.readFileSync(copilotPath, 'utf-8')
    }
  } catch (_) { /* ignore */ }

  try {
    const skillDirs = [
      'i18n-bilingual', 'drawer-components', 'form-drawer-submit',
      'confirmation-modal', 'table-filter-config', 'api-integration',
    ]
    const skillDocs: string[] = []
    for (const dir of skillDirs) {
      const skillFile = path.join(repoPath, '.github/skills', dir, 'SKILL.md')
      if (fs.existsSync(skillFile)) {
        skillDocs.push(`### ${dir}\n${fs.readFileSync(skillFile, 'utf-8')}\n`)
      }
    }
    skills = skillDocs.join('\n---\n\n')
  } catch (_) { /* ignore */ }

  return { main, skills }
}

/**
 * 使用 Node.js 内置 https/http 模块发起 OpenAI 兼容 API POST 请求
 */
function httpPost(url: string, body: object, apiKey: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const isHttps = parsed.protocol === 'https:'
    const transport = isHttps ? https : http
    const bodyStr = JSON.stringify(body)

    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    }

    const req = transport.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data)
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`))
        }
      })
    })

    req.on('error', reject)
    req.setTimeout(90000, () => {
      req.destroy(new Error('Request timeout (90s)'))
    })
    req.write(bodyStr)
    req.end()
  })
}

/**
 * 使用 OpenAI / Qwen 兼容接口审查代码（供 Git Hook 路径调用）
 * @param diff      staged diff 内容
 * @param repoPath  仓库根目录，用于读取项目规范
 */
export async function reviewCodeWithOpenAI(
  diff: string,
  repoPath: string
): Promise<ReviewResult | null> {
  const config = vscode.workspace.getConfiguration('gitCopilotReview')

  // 从 VSCode 设置中读取 API 配置
  const apiKey = config.get<string>('openaiApiKey', '')
  const baseURL = (
    config.get<string>('openaiBaseUrl', 'https://dashscope.aliyuncs.com/compatible-mode/v1')
  ).replace(/\/$/, '')
  const model = config.get<string>('openaiModel', 'qwen3-coder-plus')

  if (!apiKey) {
    // API Key 未设置，由调用方（extension.ts）负责提示用户
    return null
  }

  // 读取仓库内的规范文档
  const { main: projectGuidelines, skills: skillsGuidelines } = getProjectGuidelinesForRepo(repoPath)

  const systemPrompt =
    '你是一个专业的代码审查助手，擅长发现代码中的错误和潜在问题。请严格以 JSON 格式输出，不要包含任何 markdown 代码块或额外文本。'

  const userPrompt = `你是一个专业的代码审查助手。请分析以下 Git 提交的代码变更，检查是否存在以下问题：

## 项目规范文档

${projectGuidelines || '（无项目规范文档）'}

## 项目开发技能规范

${skillsGuidelines || '（无技能规范文档）'}

## 必须检查的项目

### 1. 严重错误（🔴 必须修复）
- 语法错误 / 意外删除
- 未闭合的标签或括号 / 意外标签
- 类型错误（TypeScript）
- 明显的运行时错误（未定义变量、函数调用错误）
- 空指针/undefined 访问风险
- 死循环或性能问题
- 敏感信息泄露（API key、密码等）

### 2. 规范问题（🟡 建议修复）
- 违反项目编码规范
- 命名不规范
- 缺少类型定义（TypeScript interface/type）
- 缺少必要的国际化翻译
- 样式使用不当（未使用 CSS Modules）
- 未遵循 skills 中定义的最佳实践

### 3. 代码质量（🟢 优化建议）
- 代码重复 / 逻辑可优化 / 可读性问题 / 缺少注释

## 代码变更

\`\`\`diff
${diff}
\`\`\`

请严格输出以下 JSON 对象（不要包含 markdown 代码块）：

{
  "status": "error | warning | success",
  "summary": "简短总结",
  "issues": [
    {
      "severity": "error | warning | info",
      "type": "语法错误 | 类型错误 | 规范问题 | 优化建议",
      "file": "文件路径",
      "line": "行号（如可识别）",
      "message": "问题描述",
      "suggestion": "修复建议"
    }
  ]
}

注意：严重错误时 status 为 "error"；仅建议时为 "warning" 或 "success"；代码正常时返回 success + 空 issues 数组。`

  try {
    const requestBody = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }

    const responseText = await httpPost(`${baseURL}/chat/completions`, requestBody, apiKey)
    const responseJson = JSON.parse(responseText)
    const content: string = responseJson.choices?.[0]?.message?.content ?? ''

    return parseReviewResult(content)
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('[AI审查] OpenAI 调用失败:', errMsg)

    if (errMsg.includes('timeout')) {
      vscode.window.showErrorMessage('❌ AI 审查超时（90s），请检查网络后重试')
    } else if (errMsg.includes('401')) {
      vscode.window.showErrorMessage('❌ API Key 无效，请检查 gitCopilotReview.openaiApiKey 配置')
    } else {
      vscode.window.showErrorMessage(`❌ AI 审查失败: ${errMsg}`)
    }
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// Copilot 错误处理
// ─────────────────────────────────────────────────────────────

function handleLanguageModelError(error: vscode.LanguageModelError) {
  console.error('Language Model Error:', error.message, error.code)

  // 使用字符串比较错误代码
  if (error.code === 'NoPermissions') {
    vscode.window.showErrorMessage(
      '❌ 未授权使用 Copilot\n\n请在设置中允许扩展使用语言模型：\n设置 → 扩展 → GitHub Copilot → 允许扩展使用'
    )
  } else if (error.code === 'Blocked') {
    vscode.window.showErrorMessage('❌ 请求被阻止\n\n可能触发了内容过滤策略，请修改代码后重试')
  } else if (error.code === 'NotFound') {
    vscode.window.showErrorMessage(
      '❌ 未找到 Copilot 模型\n\n请确保：\n1. 已安装 GitHub Copilot 扩展\n2. 已登录 GitHub 账号\n3. 订阅处于活跃状态'
    )
  } else {
    vscode.window.showErrorMessage(`❌ Copilot 错误: ${error.message}`)
  }
}
