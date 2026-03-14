# Image Background Remover

## 项目概述

在线图片去背景工具，MVP 阶段。核心链路：上传 → 调用 remove.bg → 返回透明 PNG → 下载。

## 技术栈

- **框架**：Next.js 16 (App Router)
- **样式**：Tailwind CSS 4
- **语言**：TypeScript
- **第三方 API**：remove.bg
- **部署目标**：Cloudflare

## 项目结构

```
app/
├── src/app/
│   ├── layout.tsx              # 根布局 + SEO metadata
│   ├── page.tsx                # 首页（客户端组件，状态机驱动）
│   ├── globals.css             # Tailwind 主题（--color-primary: #6366f1）
│   ├── api/remove-background/  # 服务端 API route
│   │   └── route.ts            # 转发 remove.bg，返回 base64 JSON
│   └── privacy/page.tsx        # 隐私说明页
├── src/components/             # UI 组件
│   ├── Header.tsx / Footer.tsx
│   ├── Hero.tsx                # CTA 区域
│   ├── UploadZone.tsx          # 拖拽/点击上传
│   ├── ResultView.tsx          # 原图 vs 结果对比
│   ├── HowItWorks.tsx          # 三步流程
│   └── FAQ.tsx                 # 手风琴 FAQ
└── .env.local                  # REMOVE_BG_API_KEY（不提交）
```

## 关键设计决策

- **API 返回 base64 JSON**：不直接返回二进制 PNG。原因：隧道/CDN 环境下二进制响应可能被截断，base64 JSON 格式更可靠。
- **状态机驱动**：页面有 5 个状态（idle → selected → processing → success → error），所有 UI 切换基于状态。
- **fileInputRef 提升到父组件**：Hero 按钮和 UploadZone 共享同一个 file input ref，实现 CTA 按钮直接触发文件选择。
- **无存储架构**：不使用数据库、不落盘、不持久化用户图片。

## 开发命令

```bash
npm run dev          # 开发模式（本地使用）
npm run build        # 生产构建
npx next start       # 生产模式运行（隧道测试用此模式）
```

## 环境变量

```
REMOVE_BG_API_KEY=xxx    # remove.bg API Key，仅服务端使用
```

## 注意事项

- 隧道测试必须用 production build（`npm run build && npx next start`），dev 模式 HMR WebSocket 会在隧道下失败
- remove.bg 按调用计费，注意 API 用量
- 纯色/无前景的图片会被 remove.bg 拒绝（400 unknown_foreground），这是正常行为
