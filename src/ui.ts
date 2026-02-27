import * as vscode from 'vscode'
import { ReviewResult, Issue } from './reviewer'

export async function showReviewResults(
  result: ReviewResult,
  config: vscode.WorkspaceConfiguration
): Promise<boolean> {
  // 数据验证
  if (!result || !result.issues) {
    console.error('Invalid review result:', result)
    vscode.window.showErrorMessage('审查结果数据异常')
    return false
  }

  const errors = result.issues.filter((i) => i.severity === 'error')
  const warnings = result.issues.filter((i) => i.severity === 'warning')
  const infos = result.issues.filter((i) => i.severity === 'info')

  // 如果没有问题，直接通过
  if (result.issues.length === 0) {
    vscode.window.showInformationMessage('✅ 代码审查通过，未发现明显问题！')
    return true
  }

  // 创建 Webview 面板显示详细结果
  const panel = vscode.window.createWebviewPanel(
    'codeReview',
    '🤖 AI 代码审查结果',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
    }
  )

  panel.webview.html = getReviewHtml(result, errors, warnings, infos)

  // 根据配置决定是否阻止提交
  const blockOnError = config.get<boolean>('blockOnError', true)
  const blockOnWarning = config.get<boolean>('blockOnWarning', false)

  let shouldBlock = false
  let message = ''
  let buttons: string[] = []

  if (errors.length > 0) {
    shouldBlock = blockOnError
    message = `🔴 发现 ${errors.length} 个严重错误`
    buttons = blockOnError ? ['查看详情', '取消提交'] : ['查看详情', '继续提交', '取消']
  } else if (warnings.length > 0) {
    shouldBlock = blockOnWarning
    message = `🟡 发现 ${warnings.length} 个规范问题`
    buttons = blockOnWarning ? ['查看详情', '取消提交'] : ['查看详情', '继续提交', '取消']
  } else {
    message = `📊 代码审查完成：${result.summary}`
    buttons = ['查看详情', '继续提交']
  }

  const choice = await vscode.window.showWarningMessage(message, { modal: true }, ...buttons)

  if (choice === '查看详情') {
    panel.reveal()
    // 再次询问
    const nextChoice = await vscode.window.showWarningMessage('是否继续提交？', { modal: true }, '继续', '取消')
    return nextChoice === '继续'
  }

  if (choice === '继续提交') {
    return true
  }

  // 取消提交或未选择
  return false
}

function getReviewHtml(result: ReviewResult, errors: Issue[], warnings: Issue[], infos: Issue[]): string {
  // 生成问题列表 HTML
  const renderIssue = (issue: Issue, index: number, className: string) => {
    const filePath = escapeHtml(issue.file || '')
    const lineInfo = issue.line ? ':' + issue.line : ''
    const issueType = escapeHtml(issue.type || '')
    const message = escapeHtml(issue.message || '')
    const suggestion = issue.suggestion ? escapeHtml(issue.suggestion) : ''
    
    return `
      <div class="issue ${className}">
        <div class="issue-header">
          ${index + 1}. ${filePath}${lineInfo}
          <span class="issue-type">${issueType}</span>
        </div>
        <div class="issue-message">${message}</div>
        ${suggestion ? `
          <div class="issue-suggestion">
            <span class="suggestion-label">💡 建议：</span>${suggestion}
          </div>
        ` : ''}
      </div>
    `
  }

  const errorsHtml = errors.map((issue, index) => renderIssue(issue, index, 'error')).join('')
  const warningsHtml = warnings.map((issue, index) => renderIssue(issue, index, 'warning')).join('')
  const infosHtml = infos.map((issue, index) => renderIssue(issue, index, 'info')).join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI 代码审查结果</title>
  <style>
    body {
      padding: 20px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    
    h1 {
      margin-top: 0;
      font-size: 24px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .summary {
      padding: 15px;
      background: var(--vscode-textBlockQuote-background);
      border-left: 4px solid var(--vscode-textLink-foreground);
      margin: 20px 0;
      border-radius: 4px;
    }
    
    .section {
      margin: 30px 0;
    }
    
    .section-title {
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .error-title { color: var(--vscode-errorForeground); }
    .warning-title { color: var(--vscode-warningForeground); }
    .info-title { color: var(--vscode-charts-blue); }
    
    .issue {
      margin: 10px 0;
      padding: 15px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 6px;
      border-left: 4px solid;
    }
    
    .issue.error { border-left-color: var(--vscode-errorForeground); }
    .issue.warning { border-left-color: var(--vscode-warningForeground); }
    .issue.info { border-left-color: var(--vscode-charts-blue); }
    
    .issue-header {
      font-weight: bold;
      margin-bottom: 8px;
      color: var(--vscode-textLink-foreground);
      font-family: var(--vscode-editor-font-family);
    }
    
    .issue-type {
      display: inline-block;
      padding: 2px 8px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 3px;
      font-size: 12px;
      margin-left: 8px;
    }
    
    .issue-message {
      margin: 8px 0;
      line-height: 1.6;
    }
    
    .issue-suggestion {
      margin-top: 10px;
      padding: 10px;
      background: var(--vscode-textBlockQuote-background);
      border-radius: 4px;
      font-style: italic;
    }
    
    .suggestion-label {
      color: var(--vscode-charts-green);
      font-weight: bold;
      margin-right: 5px;
    }
    
    .stats {
      display: flex;
      gap: 20px;
      margin: 20px 0;
    }
    
    .stat {
      padding: 10px 15px;
      background: var(--vscode-textBlockQuote-background);
      border-radius: 4px;
    }
    
    .stat-value {
      font-size: 24px;
      font-weight: bold;
      margin-right: 5px;
    }
    
    .empty-state {
      text-align: center;
      padding: 40px;
      color: var(--vscode-descriptionForeground);
    }
    
    code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
    }
  </style>
</head>
<body>
  <h1>🤖 AI 代码审查结果</h1>
  
  <div class="summary">
    <strong>总体评估：</strong>${result.summary}
  </div>
  
  <div class="stats">
    ${errors.length > 0 ? `<div class="stat"><span class="stat-value error-title">${errors.length}</span>严重错误</div>` : ''}
    ${warnings.length > 0 ? `<div class="stat"><span class="stat-value warning-title">${warnings.length}</span>规范问题</div>` : ''}
    ${infos.length > 0 ? `<div class="stat"><span class="stat-value info-title">${infos.length}</span>优化建议</div>` : ''}
  </div>
  
  ${errors.length > 0 ? `
    <div class="section">
      <div class="section-title error-title">🔴 严重错误（必须修复）</div>
      ${errorsHtml}
    </div>
  ` : ''}
  
  ${warnings.length > 0 ? `
    <div class="section">
      <div class="section-title warning-title">🟡 规范问题（建议修复）</div>
      ${warningsHtml}
    </div>
  ` : ''}
  
  ${infos.length > 0 ? `
    <div class="section">
      <div class="section-title info-title">🟢 优化建议</div>
      ${infosHtml}
    </div>
  ` : ''}
  
  ${result.issues.length === 0 ? `
    <div class="empty-state">
      <h2>✅ 太棒了！</h2>
      <p>未发现明显问题，代码看起来不错！</p>
    </div>
  ` : ''}
</body>
</html>`
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * 展示来自 Git Hook 的外部审查结果
 * @param results 审查结果数组
 * @param diff git diff 内容
 * @param commitMessage 提交信息
 * @returns true 表示强制提交，false 表示取消提交
 */
export async function showExternalReviewResults(
  results: any[],
  diff: string,
  commitMessage: string
): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      // 数据验证 - 支持单个对象或数组
      if (!results) {
        console.error('Invalid results: null or undefined')
        vscode.window.showErrorMessage('审查结果数据为空')
        resolve(false)
        return
      }

      // 创建 Webview 面板（使用 Active 确保显示在触发提交的当前窗口）
      const panel = vscode.window.createWebviewPanel(
        'gitHookReview',
        '🚫 代码审查未通过',
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
        }
      )

      // 构建问题列表（从 results 中解析）
      const issues: Issue[] = []
      
      // 支持单个对象或数组
      const resultsArray = Array.isArray(results) ? results : [results]
      
      resultsArray.forEach((result: any) => {
        if (result.issues && Array.isArray(result.issues)) {
          issues.push(...result.issues)
        }
      })

      const errors = issues.filter((i) => i.severity === 'error')
      const warnings = issues.filter((i) => i.severity === 'warning')
      const infos = issues.filter((i) => i.severity === 'info')

      // 生成 HTML 内容
      panel.webview.html = getExternalReviewHtml(
        issues,
        errors,
        warnings,
        infos,
        diff,
        commitMessage
      )

      // 监听 Webview 消息
      panel.webview.onDidReceiveMessage((message) => {
        switch (message.command) {
          case 'forceCommit':
            vscode.window.showWarningMessage(
              '⚠️ 确定要强制提交吗？这将跳过代码审查。',
              { modal: true },
              '确认强制提交',
            ).then((choice) => {
              if (choice === '确认强制提交') {
                panel.dispose()
                resolve(true)
              }
            })
            break
          case 'cancel':
            panel.dispose()
            resolve(false)
            break
        }
      })

    } catch (error) {
      console.error('showExternalReviewResults error:', error)
      vscode.window.showErrorMessage(`显示审查结果失败: ${error}`)
      resolve(false)
    }
  })
}

/**
 * 为外部调用生成 HTML 内容（带强制提交按钮）
 */
function getExternalReviewHtml(
  issues: Issue[],
  errors: Issue[],
  warnings: Issue[],
  infos: Issue[],
  diff: string,
  commitMessage: string
): string {
  // 生成问题列表 HTML
  const renderExternalIssue = (issue: Issue, className: string) => {
    const filePath = issue.file ? escapeHtml(issue.file) : ''
    const lineInfo = issue.line ? `:${issue.line}` : ''
    const message = escapeHtml(issue.message || '')
    const code = issue.code ? escapeHtml(issue.code) : ''
    const suggestion = issue.suggestion ? escapeHtml(issue.suggestion) : ''
    
    return `
      <div class="issue ${className}">
        <div class="issue-header">
          <span class="badge ${className}">${className.toUpperCase()}</span>
          ${filePath ? `<span class="file-location">${filePath}${lineInfo}</span>` : ''}
        </div>
        <div class="issue-message">${message}</div>
        ${code ? `<div class="code-snippet"><pre>${code}</pre></div>` : ''}
        ${suggestion ? `<div style="margin-top: 10px;"><strong>💡 建议：</strong> ${suggestion}</div>` : ''}
      </div>
    `
  }

  const errorsHtml = errors.map(issue => renderExternalIssue(issue, 'error')).join('')
  const warningsHtml = warnings.map(issue => renderExternalIssue(issue, 'warning')).join('')
  const infosHtml = infos.map(issue => renderExternalIssue(issue, 'info')).join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Git Hook - AI 代码审查</title>
  <style>
    body {
      padding: 20px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    
    h1 {
      margin-top: 0;
      font-size: 24px;
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--vscode-errorForeground);
    }
    
    .commit-info {
      padding: 15px;
      background: var(--vscode-textBlockQuote-background);
      border-left: 4px solid var(--vscode-textLink-foreground);
      margin: 20px 0;
      border-radius: 4px;
    }
    
    .commit-info h3 {
      margin-top: 0;
      font-size: 16px;
    }
    
    .summary {
      padding: 15px;
      background: var(--vscode-inputValidation-errorBackground);
      border-left: 4px solid var(--vscode-errorForeground);
      margin: 20px 0;
      border-radius: 4px;
    }
    
    .actions {
      position: sticky;
      top: 0;
      background: var(--vscode-editor-background);
      padding: 15px 0;
      margin-bottom: 20px;
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex;
      gap: 10px;
      z-index: 10;
    }
    
    button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    }
    
    .btn-force {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    
    .btn-force:hover {
      background: var(--vscode-button-hoverBackground);
    }
    
    .btn-cancel {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    
    .btn-cancel:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    
    .section {
      margin: 30px 0;
    }
    
    .section h2 {
      font-size: 18px;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .issue {
      padding: 15px;
      margin: 10px 0;
      border-radius: 4px;
      border-left: 4px solid;
    }
    
    .issue.error {
      background: var(--vscode-inputValidation-errorBackground);
      border-color: var(--vscode-errorForeground);
    }
    
    .issue.warning {
      background: var(--vscode-inputValidation-warningBackground);
      border-color: var(--vscode-editorWarning-foreground);
    }
    
    .issue.info {
      background: var(--vscode-inputValidation-infoBackground);
      border-color: var(--vscode-editorInfo-foreground);
    }
    
    .issue-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      font-weight: 600;
    }
    
    .badge {
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    
    .badge.error {
      background: var(--vscode-errorForeground);
      color: var(--vscode-editor-background);
    }
    
    .badge.warning {
      background: var(--vscode-editorWarning-foreground);
      color: var(--vscode-editor-background);
    }
    
    .badge.info {
      background: var(--vscode-editorInfo-foreground);
      color: var(--vscode-editor-background);
    }
    
    .file-location {
      color: var(--vscode-textLink-foreground);
      font-size: 12px;
      font-family: var(--vscode-editor-font-family);
    }
    
    .issue-message {
      margin: 8px 0;
      line-height: 1.6;
    }
    
    .code-snippet {
      margin-top: 10px;
      padding: 10px;
      background: var(--vscode-textCodeBlock-background);
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family);
      font-size: 13px;
      overflow-x: auto;
    }
    
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-all;
    }
    
    .diff-section {
      margin-top: 30px;
      padding: 15px;
      background: var(--vscode-textCodeBlock-background);
      border-radius: 4px;
      max-height: 400px;
      overflow-y: auto;
    }
    
    .diff-section h3 {
      margin-top: 0;
      font-size: 14px;
      color: var(--vscode-descriptionForeground);
    }
    
    .empty-state {
      text-align: center;
      padding: 40px;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <h1>🚫 代码审查未通过</h1>
  
  <div class="actions">
    <button class="btn-force" onclick="forceCommit()">⚠️ 强制提交 (跳过审查)</button>
    <button class="btn-cancel" onclick="cancel()">❌ 取消提交</button>
  </div>
  
  <div class="commit-info">
    <h3>📝 提交信息</h3>
    <pre>${escapeHtml(commitMessage || '(未提供提交信息)')}</pre>
  </div>
  
  <div class="summary">
    <strong>🔍 审查结果概览：</strong><br>
    共发现 ${issues.length} 个问题
    ${errors.length > 0 ? `<br>🔴 <strong>${errors.length}</strong> 个严重错误` : ''}
    ${warnings.length > 0 ? `<br>🟡 <strong>${warnings.length}</strong> 个规范问题` : ''}
    ${infos.length > 0 ? `<br>🔵 <strong>${infos.length}</strong> 个建议` : ''}
  </div>
  
  ${errors.length > 0 ? `
  <div class="section">
    <h2>🔴 严重错误 (${errors.length})</h2>
    ${errorsHtml}
  </div>
  ` : ''}
  
  ${warnings.length > 0 ? `
  <div class="section">
    <h2>🟡 规范问题 (${warnings.length})</h2>
    ${warningsHtml}
  </div>
  ` : ''}
  
  ${infos.length > 0 ? `
  <div class="section">
    <h2>🔵 优化建议 (${infos.length})</h2>
    ${infosHtml}
  </div>
  ` : ''}
  
  ${diff ? `
  <div class="diff-section">
    <h3>📊 代码变更</h3>
    <pre>${escapeHtml(diff)}</pre>
  </div>
  ` : ''}
  
  <script>
    const vscode = acquireVsCodeApi();
    
    function forceCommit() {
      vscode.postMessage({ command: 'forceCommit' });
    }
    
    function cancel() {
      vscode.postMessage({ command: 'cancel' });
    }
  </script>
</body>
</html>`
}
