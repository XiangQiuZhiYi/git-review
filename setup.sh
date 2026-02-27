#!/bin/bash

# Git Copilot Review 扩展快速初始化脚本

echo "🚀 开始初始化 Git Copilot Review 扩展..."
echo ""

# 切换到扩展目录
cd "$(dirname "$0")"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未找到 Node.js，请先安装 Node.js"
    exit 1
fi

echo "✓ Node.js 版本: $(node -v)"
echo "✓ npm 版本: $(npm -v)"
echo ""

# 安装依赖
echo "📦 安装依赖..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ 依赖安装失败"
    exit 1
fi

echo "✓ 依赖安装成功"
echo ""

# 编译 TypeScript
echo "🔨 编译 TypeScript..."
npm run compile

if [ $? -ne 0 ]; then
    echo "❌ 编译失败"
    exit 1
fi

echo "✓ 编译成功"
echo ""

# 检查输出文件
if [ -f "out/extension.js" ]; then
    echo "✓ out/extension.js 已生成"
else
    echo "❌ out/extension.js 未找到"
    exit 1
fi

echo ""
echo "🎉 初始化完成！"
echo ""
echo "下一步："
echo "1. 在 VS Code 中打开此文件夹"
echo "2. 按 F5 启动调试"
echo "3. 在新窗口中测试扩展功能"
echo ""
