import * as vscode from 'vscode'
import { GitExtension, Repository } from './git'
import { reviewCodeWithCopilot, ReviewResult } from './reviewer'
import { showReviewResults, showExternalReviewResults } from './ui'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let statusBarItem: vscode.StatusBarItem
let isReviewInProgress = false

export function activate(context: vscode.ExtensionContext) {
  console.log('Git Copilot Review 扩展已激活')

  // 创建状态栏项
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  statusBarItem.text = '$(search-fuzzy) AI 审查'
  statusBarItem.tooltip = '点击进行 AI 代码审查'
  statusBarItem.command = 'git-copilot-review.reviewChanges'
  statusBarItem.show()
  context.subscriptions.push(statusBarItem)

  // 启动临时文件监听（用于 Git Hook 调用）
  startFileWatcher(context)

  // 注册手动审查命令
  const reviewCommand = vscode.commands.registerCommand(
    'git-copilot-review.reviewChanges',
    async () => {
      await performReview(context, false)
    }
  )

  // 注册带审查的提交命令（拦截 Git 提交）
  const commitWithReviewCommand = vscode.commands.registerCommand(
    'git-copilot-review.commitWithReview',
    async (sourceControl: any) => {
      await handleCommitWithReview(context, sourceControl)
    }
  )

  // 注册启用/禁用命令
  const enableCommand = vscode.commands.registerCommand(
    'git-copilot-review.enableAutoReview',
    () => {
      vscode.workspace.getConfiguration('gitCopilotReview').update('enabled', true, true)
      vscode.window.showInformationMessage('✅ AI 代码审查已启用')
    }
  )

  const disableCommand = vscode.commands.registerCommand(
    'git-copilot-review.disableAutoReview',
    () => {
      vscode.workspace.getConfiguration('gitCopilotReview').update('enabled', false, true)
      vscode.window.showInformationMessage('⏸️ AI 代码审查已禁用')
    }
  )

  // 注册外部调用命令（从 Git Hook 调用）
  const showExternalReviewCommand = vscode.commands.registerCommand(
    'git-copilot-review.showExternalReview',
    async () => {
      await handleExternalReview(context)
    }
  )

  context.subscriptions.push(reviewCommand, commitWithReviewCommand, enableCommand, disableCommand, showExternalReviewCommand)

  // 监听 Git 仓库变化并设置自动审查
  setupGitIntegration(context)
}

function setupGitIntegration(context: vscode.ExtensionContext) {
  const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')?.exports
  if (!gitExtension) {
    console.warn('Git 扩展未找到')
    return
  }

  const git = gitExtension.getAPI(1)

  // 为现有仓库设置钩子
  git.repositories.forEach((repo) => {
    setupRepositoryHook(context, repo)
  })

  // 为新打开的仓库设置钩子
  git.onDidOpenRepository((repo) => {
    setupRepositoryHook(context, repo)
  })
}

function setupRepositoryHook(context: vscode.ExtensionContext, repo: Repository) {
  console.log('为仓库设置自动审查钩子:', repo.rootUri.fsPath)
  
  // 拦截默认的提交命令
  // 注意：这里我们通过快捷键拦截提交操作
  // 用户按 Ctrl/Cmd+Enter 时会触发我们的审查流程
}

async function handleCommitWithReview(context: vscode.ExtensionContext, sourceControl?: any) {
  const config = vscode.workspace.getConfiguration('gitCopilotReview')
  const enabled = config.get<boolean>('enabled', true)
  const autoReview = config.get<boolean>('autoReviewOnCommit', true)

  // 如果禁用了自动审查，直接执行提交
  if (!enabled || !autoReview) {
    await vscode.commands.executeCommand('git.commit', sourceControl)
    return
  }

  // 先进行 AI 审查
  const shouldContinue = await performReview(context, true)

  // 如果审查通过或用户选择继续，执行提交
  if (shouldContinue) {
    await vscode.commands.executeCommand('git.commit', sourceControl)
  }
}

async function performReview(context: vscode.ExtensionContext, isAutomatic: boolean = false): Promise<boolean> {
  if (isReviewInProgress) {
    vscode.window.showWarningMessage('审查正在进行中，请稍候...')
    return false
  }

  const config = vscode.workspace.getConfiguration('gitCopilotReview')
  const enabled = config.get<boolean>('enabled', true)

  if (!enabled) {
    vscode.window.showInformationMessage('AI 代码审查已禁用，请在设置中启用')
    return false
  }

  isReviewInProgress = true
  updateStatusBar('reviewing')

  try {
    // 获取 Git diff
    const diff = await getGitDiff()

    if (!diff || diff.trim().length === 0) {
      vscode.window.showInformationMessage('ℹ️  没有检测到代码变更')
      updateStatusBar('ready')
      return false
    }

    // 检查 diff 大小
    const maxSize = config.get<number>('maxDiffSize', 500000)
    if (diff.length > maxSize) {
      vscode.window.showWarningMessage(
        `⚠️  代码变更过大 (${(diff.length / 1024).toFixed(1)}KB)，跳过审查`
      )
      updateStatusBar('ready')
      return false
    }

    // 调用 Copilot 审查
    vscode.window.showInformationMessage('🤖 正在使用 Copilot 进行代码审查...')

    const result = await reviewCodeWithCopilot(diff, context)

    if (!result) {
      vscode.window.showErrorMessage('❌ AI 审查失败，请稍后重试')
      updateStatusBar('error')
      return false
    }

    // 显示结果
    const shouldContinue = await showReviewResults(result, config)

    updateStatusBar('ready')
    return shouldContinue
  } catch (error) {
    console.error('审查过程出错:', error)
    vscode.window.showErrorMessage(`审查失败: ${error instanceof Error ? error.message : '未知错误'}`)
    updateStatusBar('error')
    return false
  } finally {
    isReviewInProgress = false
  }
}

async function getGitDiff(): Promise<string | null> {
  const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')?.exports
  if (!gitExtension) {
    return null
  }

  const git = gitExtension.getAPI(1)
  const repo = git.repositories[0]

  if (!repo) {
    return null
  }

  try {
    // 获取暂存区的 diff
    const diff = await repo.diff(true)
    return diff
  } catch (error) {
    console.error('获取 diff 失败:', error)
    return null
  }
}

function updateStatusBar(state: 'ready' | 'reviewing' | 'error') {
  switch (state) {
    case 'ready':
      statusBarItem.text = '$(search-fuzzy) AI 审查'
      statusBarItem.tooltip = '点击进行 AI 代码审查'
      statusBarItem.backgroundColor = undefined
      break
    case 'reviewing':
      statusBarItem.text = '$(loading~spin) 审查中...'
      statusBarItem.tooltip = 'AI 正在审查代码'
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
      break
    case 'error':
      statusBarItem.text = '$(error) 审查失败'
      statusBarItem.tooltip = '审查过程中发生错误'
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')
      break
  }
}

/**
 * 检查给定的仓库路径是否属于当前 VSCode 窗口的工作区
 */
function isCurrentWorkspace(repositoryPath: string): boolean {
  const workspaceFolders = vscode.workspace.workspaceFolders
  console.log('[AI审查][isCurrentWorkspace] 待匹配仓库路径:', repositoryPath)
  if (!workspaceFolders || workspaceFolders.length === 0) {
    console.log('[AI审查][isCurrentWorkspace] 当前窗口无工作区文件夹，返回 false')
    return false
  }
  const folderPaths = workspaceFolders.map((f) => f.uri.fsPath)
  console.log('[AI审查][isCurrentWorkspace] 当前窗口工作区文件夹:', folderPaths)
  const matched = workspaceFolders.some((folder) => {
    const folderPath = folder.uri.fsPath
    const match =
      repositoryPath === folderPath ||
      repositoryPath.startsWith(folderPath + '/') ||
      folderPath.startsWith(repositoryPath + '/')
    console.log(`[AI审查][isCurrentWorkspace]   比较 "${repositoryPath}" vs "${folderPath}" => ${match}`)
    return match
  })
  console.log('[AI审查][isCurrentWorkspace] 最终匹配结果:', matched)
  return matched
}

// 处理来自 Git Hook 的外部调用
async function handleExternalReview(context: vscode.ExtensionContext) {
  const TEMP_RESULT_FILE = join(tmpdir(), 'ai-review-result.json')
  const TEMP_DECISION_FILE = join(tmpdir(), 'ai-review-decision.json')

  try {
    // 读取临时文件中的审查结果
    if (!existsSync(TEMP_RESULT_FILE)) {
      console.log('[AI审查][handleExternalReview] 未找到审查结果文件')
      vscode.window.showErrorMessage('❌ 未找到审查结果文件')
      return
    }

    const data = JSON.parse(readFileSync(TEMP_RESULT_FILE, 'utf-8'))
    const { results, diff, commitMessage, repositoryPath } = data
    console.log('[AI审查][handleExternalReview] repositoryPath：', repositoryPath)

    // 验证仓库路径是否匹配当前窗口的工作区
    if (repositoryPath && !isCurrentWorkspace(repositoryPath)) {
      console.log(`[AI审查][handleExternalReview] 审查结果属于其他工作区 (${repositoryPath})，当前窗口跳过处理`)
      return  // 不删除文件，让正确的窗口来处理
    }

    // 确认属于当前工作区，立即删除临时结果文件，避免重复处理
    const fs = require('fs')
    fs.unlinkSync(TEMP_RESULT_FILE)
    console.log('[AI审查][handleExternalReview] 已删除临时结果文件，开始展示 Webview')

    // 使用 Webview 展示结果
    const decision = await showExternalReviewResults(results, diff, commitMessage)
    console.log('[AI审查][handleExternalReview] 用户决策:', decision)

    // 将用户决定写入临时文件
    writeFileSync(TEMP_DECISION_FILE, JSON.stringify({
      action: decision ? 'forceCommit' : 'cancel',
      timestamp: Date.now()
    }))
  } catch (error) {
    vscode.window.showErrorMessage(`处理审查结果失败: ${error}`)
    // 写入取消决定
    writeFileSync(TEMP_DECISION_FILE, JSON.stringify({
      action: 'cancel',
      timestamp: Date.now()
    }))
  }
}

// 启动文件监听器，检测 Git Hook 创建的临时文件
function startFileWatcher(context: vscode.ExtensionContext) {
  const TEMP_RESULT_FILE = join(tmpdir(), 'ai-review-result.json')
  let isProcessing = false
  
  // 每秒检查一次临时文件
  const interval = setInterval(async () => {
    if (existsSync(TEMP_RESULT_FILE) && !isProcessing) {
      try {
        // 先读取文件，检查是否属于当前工作区窗口（不设置 isProcessing，允许其他窗口也检查）
        const rawContent = readFileSync(TEMP_RESULT_FILE, 'utf-8')
        console.log('[AI审查][watcher] 检测到临时文件，内容前 200 字符:', rawContent.slice(0, 200))
        const data = JSON.parse(rawContent)
        const { repositoryPath } = data
        console.log('[AI审查][watcher] 文件中 repositoryPath:', repositoryPath)

        if (repositoryPath && !isCurrentWorkspace(repositoryPath)) {
          // 不属于当前窗口，静默跳过，让正确的窗口处理
          console.log('[AI审查][watcher] 不属于当前窗口，跳过')
          return
        }

        // 属于当前窗口，标记处理中，避免同一窗口重复触发
        console.log('[AI审查][watcher] 检测到审查结果文件，准备展示...')
        isProcessing = true
        try {
          await handleExternalReview(context)
        } finally {
          isProcessing = false
        }
      } catch (e) {
        // 文件可能正在写入中，忽略此次检查，等待下一次
        console.log('[AI审查][watcher] 读取审查结果文件出错，等待下次检查:', e)
      }
    }
  }, 1000)
  
  // 注册清理函数
  context.subscriptions.push({
    dispose: () => clearInterval(interval)
  })
  
  console.log('文件监听器已启动，等待 Git Hook 调用...')
}

export function deactivate() {
  statusBarItem?.dispose()
}

