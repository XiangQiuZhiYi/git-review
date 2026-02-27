#!/usr/bin/env node
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve, join } from 'path'
import { tmpdir } from 'os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 临时文件路径
const TEMP_REQUEST_FILE = join(tmpdir(), 'ai-review-request.json')
const TEMP_DECISION_FILE = join(tmpdir(), 'ai-review-decision.json')


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

// 获取当前提交信息（从 COMMIT_EDITMSG 文件读取）
function getCommitMessage() {
  try {
    const msgFile = resolve(__dirname, '../.git/COMMIT_EDITMSG')
    if (existsSync(msgFile)) {
      return readFileSync(msgFile, 'utf-8').split('\n')[0].trim()
    }
    return ''
  } catch (_) {
    return ''
  }
}

// 将代码变更请求发送给 VSCode 插件处理
async function sendToVSCodePlugin(diff, commitMessage) {
  try {
    // 清理旧的决策文件
    if (existsSync(TEMP_DECISION_FILE)) {
      unlinkSync(TEMP_DECISION_FILE)
    }

    // 写入请求数据（仅包含原始数据，AI 调用由插件完成）
    const repositoryPath = resolve(__dirname, '..')
    writeFileSync(TEMP_REQUEST_FILE, JSON.stringify({
      diff,
      commitMessage,
      repositoryPath,
      timestamp: Date.now(),
    }))

    console.log('📤 已将代码变更发送给 VSCode 插件进行 AI 审查')
    console.log(`   请求文件: ${TEMP_REQUEST_FILE}`)
    console.log('⏳ 等待插件审查结果（最长 10 分钟）...')
    console.log('💡 请在 VSCode 中查看审查结果并做出决定')
    console.log('')

    // 等待插件写入决策文件（最多 10 分钟）
    const maxWaitTime = 10 * 60 * 1000
    const checkInterval = 500
    let waitedTime = 0

    while (waitedTime < maxWaitTime) {
      if (existsSync(TEMP_DECISION_FILE)) {
        const decision = JSON.parse(readFileSync(TEMP_DECISION_FILE, 'utf-8'))
        if (decision.action === 'forceCommit') {
          console.log('✅ 用户选择强制提交')
          return 0
        } else {
          console.log('❌ 用户取消提交')
          return 1
        }
      }

      await new Promise(r => setTimeout(r, checkInterval))
      waitedTime += checkInterval
    }

    // 超时
    console.log('⏱️  等待超时（10分钟），已自动取消提交')
    console.log('💡 请使用 git commit --no-verify 强制提交')
    if (existsSync(TEMP_REQUEST_FILE)) unlinkSync(TEMP_REQUEST_FILE)
    return 1
  } catch (error) {
    console.error('❌ 发送请求给 VSCode 插件失败:', error.message)
    if (existsSync(TEMP_REQUEST_FILE)) unlinkSync(TEMP_REQUEST_FILE)
    return 1
  }
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

  // 检查是否只是删除文件
  const lines = diff.split('\n')
  const addedLines = lines.filter(line => line.startsWith('+')).length
  const deletedLines = lines.filter(line => line.startsWith('-')).length

  if (addedLines === 0 && deletedLines > 0) {
    console.log('ℹ️  仅删除文件，跳过 AI 审查')
    process.exit(0)
  }

  console.log(`📝 检测到 ${addedLines} 行新增，${deletedLines} 行删除`)
  console.log('')
  console.log('🔍 正在将代码交由 VSCode 插件进行 AI 审查...')
  console.log('💡 请确保已在 VSCode 设置中配置 gitCopilotReview.openaiApiKey')
  const commitMessage = getCommitMessage()
  const exitCode = await sendToVSCodePlugin(diff, commitMessage)
  process.exit(exitCode)
}

main().catch(error => {
  console.error('发生未知错误:', error)
  process.exit(1)
})

