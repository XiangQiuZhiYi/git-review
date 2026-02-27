#!/usr/bin/env node
import { execSync } from 'child_process'
import OpenAI from 'openai'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve, join } from 'path'
import { tmpdir } from 'os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 临时文件路径
const TEMP_RESULT_FILE = join(tmpdir(), 'ai-review-result.json')
const TEMP_DECISION_FILE = join(tmpdir(), 'ai-review-decision.json')

// 检测是否在 VSCode 中运行
function isInVSCode() {
  return !!(process.env.TERM_PROGRAM === 'vscode' || process.env.VSCODE_GIT_IPC_HANDLE)
}

// // 从项目根目录的 .env.local 加载环境变量
// try {
//   const envPath = resolve(__dirname, '../.env.local')
//   const envContent = readFileSync(envPath, 'utf-8')
//   envContent.split('\n').forEach(line => {
//     const trimmedLine = line.trim()
//     if (trimmedLine && !trimmedLine.startsWith('#')) {
//       const equalIndex = trimmedLine.indexOf('=')
//       if (equalIndex > 0) {
//         const key = trimmedLine.substring(0, equalIndex).trim()
//         const value = trimmedLine.substring(equalIndex + 1).trim().replace(/^["']|["']$/g, '')
//         process.env[key] = value
//       }
//     }
//   })
// } catch (error) {
//   // .env.local 不存在，继续执行
// }

console.log('🖥️  命令行环境，使用 OpenAI/DeepSeek API 进行审查')
console.log('')

// 读取项目规范文档
function getProjectGuidelines() {
  try {
    const guidelinesPath = resolve(__dirname, '../.github/copilot-instructions.md')
    const guidelines = readFileSync(guidelinesPath, 'utf-8')
    return guidelines
  } catch (error) {
    console.log('⚠️  无法读取项目规范文档')
    return ''
  }
}

// 读取 skills 目录的规范文档
function getSkillsGuidelines() {
  try {
    const skillsPath = resolve(__dirname, '../.github/skills')
    const skillDocs = []
    
    // 读取每个 skill 的 SKILL.md 文件
    const skillDirs = ['i18n-bilingual', 'drawer-components', 'form-drawer-submit', 'confirmation-modal', 'table-filter-config', 'api-integration']
    
    for (const skillDir of skillDirs) {
      try {
        const skillFile = resolve(skillsPath, skillDir, 'SKILL.md')
        if (existsSync(skillFile)) {
          const content = readFileSync(skillFile, 'utf-8')
          skillDocs.push(`### ${skillDir}\n${content}\n`)
        }
      } catch (err) {
        // 跳过无法读取的 skill
      }
    }
    
    return skillDocs.join('\n---\n\n')
  } catch (error) {
    console.log('⚠️  无法读取 skills 规范文档')
    return ''
  }
}

// 获取 staged 文件的 diff
function getStagedDiff() {
  try {
    const diff = execSync('git diff --cached --diff-filter=d', {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB
    })
    return diff
  } catch (error) {
    console.error('获取 git diff 失败:', error.message)
    return ''
  }
}

// 调用 AI 分析代码
async function analyzeCode(diff) {
  // 读取项目规范
  const projectGuidelines = getProjectGuidelines()
  const skillsGuidelines = getSkillsGuidelines()

  const prompt = `
你是一个专业的代码审查助手。请分析以下 Git 提交的代码变更，检查是否存在以下问题：

## 项目规范文档

以下是本项目的编码规范和最佳实践，请严格按照这些规范进行审查：

${projectGuidelines}

## 项目开发技能规范

以下是具体功能的开发规范，请重点关注：

${skillsGuidelines}

## 必须检查的项目

### 1. 严重错误（🔴 必须修复）
- 语法错误
- 意外的错误删除或添加
- 类型错误（TypeScript）
- 明显的运行时错误（如未定义的变量、函数调用错误）
- 空指针/undefined 访问风险
- 死循环或性能问题
- 敏感信息泄露（API key、密码等）
- 删除了重要的功能代码

### 2. 规范问题（🟡 建议修复）
**请特别参考上方的项目规范文档和技能规范进行检查：**
- 违反项目编码规范（参考 copilot-instructions.md）
- 命名不规范（组件、变量、CSS 类名等）
- 缺少类型定义（TypeScript interface/type）
- 缺少必要的国际化翻译（未使用 useLanguage、langValue）
- 样式使用不当（未使用 CSS Modules 的 .module.less）
- 未遵循 SISDrawer、Form 等组件的标准用法
- 违反 skills 中定义的最佳实践

### 3. 代码质量（🟢 优化建议）
- 代码重复
- 逻辑可优化
- 可读性问题
- 缺少注释

## 代码变更

\`\`\`diff
${diff}
\`\`\`

## 输出格式

请按以下 JSON 格式输出分析结果：

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
- 如果代码变更看起来正常，可以返回 success
`

  // 配置 AI 服务（使用环境变量）
  const openai = new OpenAI({
    apiKey: process.env.XB_OPENAI_API_KEY,
    baseURL: process.env.XB_OPENAI_BASE_URL,
  })

  try {

    const response = await openai.chat.completions.create({
      model: 'qwen3-coder-plus',
      messages: [
        {
          role: 'system',
          content: '你是一个专业的代码审查助手，擅长发现代码中的错误和潜在问题。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
      timeout: 60000, // 60 秒超时
    })

    const content = response.choices[0].message.content
    return JSON.parse(content)
  } catch (error) {
    console.error('AI 分析失败:', error.message)
    if (error.message.includes('timeout') || error.message.includes('timed out')) {
      console.log('💡 提示: 请求超时，为确保代码质量，已阻止提交')
      console.log('📝 请检查网络连接或稍后重试')
      console.log('🚀 如需紧急提交，请使用: git commit --no-verify')
    } else if (error.message.includes('API key')) {
      console.log('💡 提示: API Key 配置错误')
      console.log('📝 请检查 .env.local 中的 XB_OPENAI_API_KEY 配置')
    } else {
      console.log('💡 提示: AI 服务请求失败')
      console.log('📝 请检查网络连接和 API 配置')
    }
    return null
  }
}

// 显示审查结果
function displayResults(results) {
  console.log('\n')
  console.log('='.repeat(60))
  console.log('🤖 AI 代码审查结果')
  console.log('='.repeat(60))
  console.log('')

  if (!results) {
    console.log('❌ AI 服务请求失败，已阻止提交')
    console.log('💡 这可能是由于网络问题或 API 配置错误')
    console.log('📝 如果确认要强制提交，请使用: git commit --no-verify')
    console.log('')
    return false
  }

  console.log(`📊 总体评估: ${results.summary}`)
  console.log('')

  if (!results.issues || results.issues.length === 0) {
    console.log('✅ 未发现明显问题，代码看起来不错！')
    console.log('')
    return true
  }

  // 分类显示问题
  const errors = results.issues.filter(i => i.severity === 'error')
  const warnings = results.issues.filter(i => i.severity === 'warning')
  const infos = results.issues.filter(i => i.severity === 'info')

  if (errors.length > 0) {
    console.log('🔴 严重错误（必须修复）:')
    errors.forEach((issue, index) => {
      console.log(`  ${index + 1}. [${issue.file}${issue.line ? `:${issue.line}` : ''}]`)
      console.log(`     ${issue.message}`)
      if (issue.suggestion) {
        console.log(`     💡 建议: ${issue.suggestion}`)
      }
      console.log('')
    })
  }

  if (warnings.length > 0) {
    console.log('🟡 规范问题（建议修复）:')
    warnings.forEach((issue, index) => {
      console.log(`  ${index + 1}. [${issue.file}${issue.line ? `:${issue.line}` : ''}]`)
      console.log(`     ${issue.message}`)
      if (issue.suggestion) {
        console.log(`     💡 建议: ${issue.suggestion}`)
      }
      console.log('')
    })
  }

  if (infos.length > 0) {
    console.log('🟢 优化建议:')
    infos.forEach((issue, index) => {
      console.log(`  ${index + 1}. [${issue.file}${issue.line ? `:${issue.line}` : ''}]`)
      console.log(`     ${issue.message}`)
      console.log('')
    })
  }

  console.log('='.repeat(60))
  console.log('')

  // 如果有错误，阻止提交
  if (results.status === 'error' || errors.length > 0) {
    console.log('❌ 发现严重问题，已阻止提交')
    console.log('💡 请修复上述问题后重新提交')
    console.log('📝 如果确认要强制提交，请使用: git commit --no-verify')
    console.log('')
    return false
  }

  if (warnings.length > 0) {
    console.log('⚠️  发现一些规范问题，建议修复后再提交')
    console.log('💡 如果确认要继续提交，请使用: git commit --no-verify')
    console.log('')
    return false
  }

  console.log('✅ 代码审查通过，可以提交')
  console.log('')
  return true
}

// 主函数
async function main() {
  console.log('🔍 正在获取代码变更...')

  const diff = getStagedDiff()

  if (!diff || diff.trim().length === 0) {
    console.log('ℹ️  没有检测到代码变更')
    process.exit(0)
  }

  // 检查文件大小，如果太大则跳过
  if (diff.length > 500000) {
    console.log('⚠️  代码变更过大，跳过 AI 审查')
    process.exit(0)
  }

  // 检查是否只是删除或移动文件
  const lines = diff.split('\n')
  const addedLines = lines.filter(line => line.startsWith('+')).length
  const deletedLines = lines.filter(line => line.startsWith('-')).length

  if (addedLines === 0 && deletedLines > 0) {
    console.log('ℹ️  仅删除文件，跳过 AI 审查')
    process.exit(0)
  }

  console.log(`📝 检测到 ${addedLines} 行新增，${deletedLines} 行删除`)
  console.log('🤖 正在调用 AI 进行代码审查...')
  console.log('')

  const results = await analyzeCode(diff)
  const passed = displayResults(results)

  // 如果审查未通过
  if (!passed) {
    // 检测是否在 VSCode 中
    if (isInVSCode()) {
      console.log('\n')
      console.log('🔍 检测到 VSCode 环境，使用插件展示审查结果')
      const commitMessage = getCommitMessage()
      const exitCode = await showResultsInVSCode(results, diff, commitMessage)
      process.exit(exitCode)
    } else {
      console.log('\n')
      console.log('💡 提示：在 VSCode 中提交可获得更好的审查体验')
      console.log('')
      process.exit(1)
    }
  } else {
    process.exit(0)
  }
}

// 通过 VSCode 插件展示审查结果
async function showResultsInVSCode(results, diff, commitMessage) {
  try {
    console.log('\n')
    console.log('🌐 正在 VSCode 中打开审查结果...')
    console.log('💡 提示：需要先在 VSCode 中启动插件（按 F5 调试）')
    console.log('')
    
    // 清理旧文件
    if (existsSync(TEMP_DECISION_FILE)) {
      unlinkSync(TEMP_DECISION_FILE)
    }
    
    // 写入审查结果到临时文件
    const repositoryPath = resolve(__dirname, '..')
    writeFileSync(TEMP_RESULT_FILE, JSON.stringify({
      results,
      diff,
      commitMessage,
      repositoryPath,
      timestamp: Date.now()
    }))
    
    console.log('📝 已写入审查结果到临时文件')
    console.log(`   文件位置: ${TEMP_RESULT_FILE}`)
    console.log('')
    
    
    // 等待用户决定（最多等待 5 分钟）
    const maxWaitTime = 5 * 60 * 1000 // 5分钟
    const checkInterval = 500 // 500ms
    let waitedTime = 0
    
    console.log('⏳ 等待用户操作...')
    console.log('💡 请在 VSCode 中查看审查结果并做出决定')
    console.log('')
    
    while (waitedTime < maxWaitTime) {
      if (existsSync(TEMP_DECISION_FILE)) {
        const decision = JSON.parse(readFileSync(TEMP_DECISION_FILE, 'utf-8'))
        console.log('decision :>> ', decision);
        
        if (decision.action === 'forceCommit') {
          console.log('✅ 用户选择强制提交')
          return 0
        } else {
          console.log('❌ 用户取消提交')
          return 1
        }
      }
      
      // 等待一段时间后重试
      await new Promise(resolve => setTimeout(resolve, checkInterval))
      waitedTime += checkInterval
    }
    
    // 超时
    console.log('\n')
    console.log('⏱️  等待超时（5分钟），已自动取消提交')
    console.log('💡 请使用 git commit --no-verify 强制提交')
    console.log('')
    
    // 清理临时文件
    if (existsSync(TEMP_RESULT_FILE)) unlinkSync(TEMP_RESULT_FILE)
    if (existsSync(TEMP_DECISION_FILE)) unlinkSync(TEMP_DECISION_FILE)
    
    return 1
  } catch (error) {
    console.error('\n')
    console.error('❌ 调用 VSCode 插件失败:', error.message)
    console.log('💡 请确保：')
    console.log('  1. 已安装 git-copilot-review 插件')
    console.log('  2. VSCode 正在运行')
    console.log('  3. 或使用 git commit --no-verify 跳过审查')
    console.log('')
    
    // 清理临时文件
    if (existsSync(TEMP_RESULT_FILE)) unlinkSync(TEMP_RESULT_FILE)
    if (existsSync(TEMP_DECISION_FILE)) unlinkSync(TEMP_DECISION_FILE)
    
    return 1
  }
}

// 获取当前提交信息
function getCommitMessage() {
  try {
    // 从 git 参数中获取提交信息
    const args = process.argv.slice(2)
    const msgIndex = args.indexOf('-m')
    if (msgIndex !== -1 && args[msgIndex + 1]) {
      return args[msgIndex + 1]
    }
    return ''
  } catch (error) {
    return ''
  }
}

// 检查环境变量
if (!process.env.OPENAI_API_KEY) {
  console.log('\n')
  console.log('⚠️  未设置 OPENAI_API_KEY 环境变量')
  console.log('')
  console.log('配置方法：')
  console.log('  1. 在 ~/.zshrc 中添加以下内容：')
  console.log('     OPENAI_API_KEY=sk-你的密钥')
  console.log('     OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1/')
  console.log('')

  // 检查是否允许未配置时跳过（用于团队协作）
  if (process.env.AI_REVIEW_ALLOW_SKIP === 'true') {
    console.log('ℹ️  AI_REVIEW_ALLOW_SKIP=true，允许跳过审查')
    console.log('')
    process.exit(0)
  }

  console.log('❌ 已阻止提交（确保代码质量）')
  console.log('📝 如需跳过，请使用: git commit --no-verify')
  console.log('🔧 或在 .env.local 中设置: AI_REVIEW_ALLOW_SKIP=true')
  console.log('')
  process.exit(1)
}

main().catch(error => {
  console.error('发生错误:', error)
  console.log('\n')
  console.log('❌ AI 审查过程发生异常，已阻止提交')
  console.log('💡 这是为了确保代码质量和安全性')
  console.log('📝 如果确认要强制提交，请使用: git commit --no-verify')
  console.log('')
  process.exit(1) // 失败时阻止提交
})
