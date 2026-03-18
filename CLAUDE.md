# Image Background Remover

## 项目概述

在线图片去背景工具。核心链路：Google 登录 → 上传 → 调用 PhotoRoom（primary）+ remove.bg（fallback） → 返回透明 PNG → 下载。支持用户认证、用量追踪和混合计费模型（免费 3 次/月 + 信用点包 + 订阅制）。

## 技术栈

- **框架**：Next.js 16 (App Router)
- **样式**：Tailwind CSS 4
- **语言**：TypeScript
- **第三方 API**：PhotoRoom（主力）+ remove.bg（备选）
- **认证**：Auth.js v5 (next-auth@beta) + Google OAuth, JWT session 策略
- **数据库**：Cloudflare D1（用户表 + 用量追踪表 + 信用点/交易/订阅表）
- **ORM**：Drizzle ORM + @auth/drizzle-adapter
- **部署目标**：Cloudflare Pages（通过 @opennextjs/cloudflare）

## 项目结构

```
image-background-remover/           # 项目根目录（也是 git 根目录）
├── auth.ts                          # Auth.js 配置（Google Provider, JWT, Drizzle Adapter）
├── middleware.ts                    # API 路由保护（JWT session 检查）
├── app/                             # Next.js App Router（必须在根级，不能在 src/ 下）
│   ├── layout.tsx                   # 根布局 + SEO metadata + AuthProvider
│   ├── page.tsx                     # 首页（客户端组件，认证状态条件渲染）
│   ├── globals.css                  # Tailwind 主题（--color-primary: #6366f1）
│   ├── api/auth/[...nextauth]/
│   │   └── route.ts                 # Auth.js 路由（登录/回调/登出）
│   ├── api/remove-background/
│   │   └── route.ts                 # 转发 PhotoRoom/remove.bg，含认证 + 用量/信用点检查
│   ├── api/usage/
│   │   └── route.ts                 # 用量查询端点
│   ├── api/account/
│   │   └── route.ts                 # 账户信息端点（plan、credits、usage、subscription）
│   ├── account/page.tsx             # 账户管理页（Overview / Plans / Billing 三标签）
│   └── privacy/page.tsx             # 隐私说明页
├── src/
│   ├── types.ts                     # 共享类型：FileItem, QualitySize, AppPhase, 常量
│   ├── env.d.ts                     # CloudflareEnv 类型声明（D1 binding）
│   ├── lib/
│   │   ├── db.ts                    # D1 数据库访问 helper
│   │   ├── usage.ts                 # 用量查询/记录函数
│   │   ├── credits.ts               # 信用点余额查询/扣减函数
│   │   ├── plans.ts                 # 套餐定义（Free/Basic/Pro）+ 信用点包 + 限额计算
│   │   └── photoroom.ts             # PhotoRoom API 调用封装
│   └── components/                  # UI 组件
│       ├── AuthProvider.tsx          # SessionProvider 包装
│       ├── LoginButton.tsx           # Google 登录按钮
│       ├── UserMenu.tsx              # 用户头像 + 下拉菜单（额度、登出）
│       ├── UsageBanner.tsx           # 额度用尽提示条
│       ├── Header.tsx / Footer.tsx
│       ├── Hero.tsx                  # CTA 区域（认证/未认证两种文案）
│       ├── UploadZone.tsx            # 拖拽/点击上传（支持多文件）
│       ├── QualitySelector.tsx       # 清晰度选择器（Preview/Standard/HD/Ultra HD）
│       ├── ResultView.tsx            # 单文件：原图 vs 结果对比
│       ├── BatchResultView.tsx       # 多文件：结果网格 + ZIP 下载
│       ├── FileCard.tsx              # 批量结果中的单张卡片
│       ├── HowItWorks.tsx            # 三步流程
│       ├── FAQ.tsx                   # 四分类标签 + 手风琴 FAQ
│       └── account/                 # 账户页子组件
│           ├── OverviewTab.tsx       # 概览标签（用量、信用点、套餐状态）
│           ├── PlansTab.tsx          # 套餐对比 + 信用点包购买
│           ├── PlanCard.tsx          # 单个套餐卡片
│           ├── CreditPackCard.tsx    # 单个信用点包卡片
│           ├── BillingTab.tsx        # 账单管理（取消订阅、删除账户）
│           └── TransactionHistory.tsx # 交易历史列表
├── migrations/
│   ├── 0001_initial_schema.sql      # D1 建表：users, accounts, usage
│   ├── 0002_fix_table_names.sql     # 修正表名以匹配 @auth/drizzle-adapter
│   ├── 0003_fix_schema.sql          # Schema 修正
│   └── 0004_billing.sql             # 计费相关表：credits, transactions, subscriptions
├── .github/workflows/deploy.yml     # GitHub Actions 自动部署（待 GitHub 账号解锁）
├── wrangler.jsonc                   # Cloudflare Pages 配置 + D1 binding
├── open-next.config.ts              # opennextjs-cloudflare 配置
├── next.config.ts                   # Next.js 配置 + initOpenNextCloudflareForDev
└── .env.local                       # 环境变量（不提交）
```

## 关键设计决策

- **app/ 必须在根级**：Next.js 16 Turbopack 在 WSL + 中文路径环境下不识别 `src/app/`，必须用根级 `app/`。`@/*` alias 仍指向 `src/*`。
- **API 返回 base64 JSON**：不直接返回二进制 PNG。原因：隧道/CDN 环境下二进制响应可能被截断，base64 JSON 格式更可靠。
- **FileItem 数组 + 派生 phase**：页面状态由 `FileItem[]` 数组驱动，phase（idle/selected/processing/done）通过 useMemo 派生。单文件是 `files.length === 1` 的特例。
- **批量并发度 2**：每次最多同时处理 2 张图片，平衡速度与 API 限流。单文件失败不阻塞其他。
- **清晰度四档**：Preview / Standard / HD / Ultra HD，对应 API 的 preview/auto/hd/full。统一计费：1 张图 = 1 credit（不区分清晰度）。
- **客户端 ZIP 打包**：批量下载使用 jszip 在浏览器端生成 ZIP，不依赖服务端。
- **fileInputRef 提升到父组件**：Hero 按钮和 UploadZone 共享同一个 file input ref，实现 CTA 按钮直接触发文件选择。
- **Auth.js JWT + Drizzle Adapter 混合模式**：JWT 管 session 传输（无需 session 表），Drizzle Adapter 管用户/账户持久化（首次登录写库）。Auth.js 配置使用 lazy initializer `NextAuth(() => {...})`，确保 D1 binding 在请求时才获取。
- **强制登录**：未登录用户只能看首页 + 登录按钮，不能上传处理。
- **混合计费模型**：免费用户 3 次/月；付费订阅 Basic ($9.99/mo, 40 次) / Pro ($24.99/mo, 100 次)；一次性信用点包 10/35/100 点。月度配额优先消耗，耗尽后自动使用信用点余额。只有 API 成功返回才扣次数。
- **不持久化用户图片**：图片仅在浏览器会话中存在，服务端不落盘。

## 开发命令

```bash
npm run dev                          # 开发模式（本地使用）
npm run build                        # 生产构建
npx next start                       # 生产模式运行（隧道测试用此模式）
npx opennextjs-cloudflare build      # Cloudflare 构建
```

## 环境变量

```
PHOTOROOM_API_KEY=xxx                # PhotoRoom API Key（主力去背景 API），仅服务端使用
REMOVE_BG_API_KEY=xxx                # remove.bg API Key（备选），仅服务端使用
AUTH_SECRET=xxx                      # Auth.js session 签名密钥
AUTH_GOOGLE_ID=xxx                   # Google OAuth Client ID
AUTH_GOOGLE_SECRET=xxx               # Google OAuth Client Secret
```

## GitHub 仓库

- **地址**：https://github.com/Kitlee0252/image-background-remover
- **认证**：token 已内嵌在 git remote URL 中，可直接 `git push origin main`
- **敏感凭证**：存储在 Claude Code 本地记忆中（不提交 git）

## Cloudflare 部署

- **Pages 项目名**：image-background-remover
- **Pages 默认域名**：https://image-background-remover-7ql.pages.dev
- **自定义域名**：imagebackgroundremover.live / www.imagebackgroundremover.live
- **敏感凭证**（Account ID、API Token、Zone ID）：存储在 Claude Code 本地记忆中（不提交 git）

### 部署流程

```bash
# 1. 构建
npx opennextjs-cloudflare build

# 2. 复制 worker 和依赖到 assets
cp .open-next/worker.js .open-next/assets/_worker.js
cp -r .open-next/cloudflare .open-next/assets/
cp -r .open-next/.build .open-next/assets/
cp -r .open-next/middleware .open-next/assets/
cp -r .open-next/server-functions .open-next/assets/

# 3. 部署（凭证从 Claude Code 记忆或环境变量获取）
npx wrangler pages deploy .open-next/assets \
  --project-name=image-background-remover --branch=main --commit-dirty=true
```

### GitHub Actions 自动部署

已配置 `.github/workflows/deploy.yml`，但 GitHub 账号因计费问题被锁定（Actions 分钟数耗尽）。需要去 https://github.com/settings/billing 解决。

## 注意事项

- 隧道测试必须用 production build（`npm run build && npx next start`），dev 模式 HMR WebSocket 会在隧道下失败
- PhotoRoom（主力）和 remove.bg（备选）均按调用计费，注意 API 用量
- 纯色/无前景的图片可能被 API 拒绝（400 unknown_foreground），这是正常行为
- Next.js 16 的 TypeScript 类型检查有 bug，已在 `next.config.ts` 中设置 `typescript.ignoreBuildErrors: true`
- opennextjs-cloudflare 官方警告不完全兼容 Windows，推荐使用 WSL
- `wrangler.jsonc` 中 `main` 和 `pages_build_output_dir` 不能同时存在
