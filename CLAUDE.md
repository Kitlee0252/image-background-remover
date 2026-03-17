# Image Background Remover

## 项目概述

在线图片去背景工具，MVP 阶段。核心链路：上传 → 调用 remove.bg → 返回透明 PNG → 下载。

## 技术栈

- **框架**：Next.js 16 (App Router)
- **样式**：Tailwind CSS 4
- **语言**：TypeScript
- **第三方 API**：remove.bg
- **部署目标**：Cloudflare Pages（通过 @opennextjs/cloudflare）

## 项目结构

```
image-background-remover/           # 项目根目录（也是 git 根目录）
├── app/                             # Next.js App Router（必须在根级，不能在 src/ 下）
│   ├── layout.tsx                   # 根布局 + SEO metadata
│   ├── page.tsx                     # 首页（客户端组件，FileItem[] 状态驱动）
│   ├── globals.css                  # Tailwind 主题（--color-primary: #6366f1）
│   ├── api/remove-background/
│   │   └── route.ts                 # 转发 remove.bg，支持 size 参数，返回 base64 JSON
│   └── privacy/page.tsx             # 隐私说明页
├── src/
│   ├── types.ts                     # 共享类型：FileItem, QualitySize, AppPhase, 常量
│   └── components/                  # UI 组件
│       ├── Header.tsx / Footer.tsx
│       ├── Hero.tsx                  # CTA 区域
│       ├── UploadZone.tsx            # 拖拽/点击上传（支持多文件）
│       ├── QualitySelector.tsx       # 清晰度选择器（Preview/Standard/HD/Ultra HD）
│       ├── ResultView.tsx            # 单文件：原图 vs 结果对比
│       ├── BatchResultView.tsx       # 多文件：结果网格 + ZIP 下载
│       ├── FileCard.tsx              # 批量结果中的单张卡片
│       ├── HowItWorks.tsx            # 三步流程
│       └── FAQ.tsx                   # 手风琴 FAQ
├── .github/workflows/deploy.yml     # GitHub Actions 自动部署（待 GitHub 账号解锁）
├── wrangler.jsonc                   # Cloudflare Pages 配置
├── open-next.config.ts              # opennextjs-cloudflare 配置
├── next.config.ts                   # Next.js 配置
└── .env.local                       # REMOVE_BG_API_KEY（不提交）
```

## 关键设计决策

- **app/ 必须在根级**：Next.js 16 Turbopack 在 WSL + 中文路径环境下不识别 `src/app/`，必须用根级 `app/`。`@/*` alias 仍指向 `src/*`。
- **API 返回 base64 JSON**：不直接返回二进制 PNG。原因：隧道/CDN 环境下二进制响应可能被截断，base64 JSON 格式更可靠。
- **FileItem 数组 + 派生 phase**：页面状态由 `FileItem[]` 数组驱动，phase（idle/selected/processing/done）通过 useMemo 派生。单文件是 `files.length === 1` 的特例。
- **批量并发度 2**：每次最多同时处理 2 张图片，平衡速度与 API 限流。单文件失败不阻塞其他。
- **清晰度四档**：Preview (0.25 credit) / Standard (auto) / HD (1 credit) / Ultra HD (1 credit)，对应 remove.bg 的 preview/auto/hd/full。
- **客户端 ZIP 打包**：批量下载使用 jszip 在浏览器端生成 ZIP，不依赖服务端。
- **fileInputRef 提升到父组件**：Hero 按钮和 UploadZone 共享同一个 file input ref，实现 CTA 按钮直接触发文件选择。
- **无存储架构**：不使用数据库、不落盘、不持久化用户图片。

## 开发命令

```bash
npm run dev                          # 开发模式（本地使用）
npm run build                        # 生产构建
npx next start                       # 生产模式运行（隧道测试用此模式）
npx opennextjs-cloudflare build      # Cloudflare 构建
```

## 环境变量

```
REMOVE_BG_API_KEY=xxx                # remove.bg API Key，仅服务端使用
```

## GitHub 仓库

- **地址**：https://github.com/Kitlee0252/image-background-remover
- **GitHub Token**：已内嵌在 git remote URL 中，不在文件中明文存储
- **remote 已内嵌 token**，可直接 `git push origin main`

## Cloudflare 部署

### 账号信息

- **Account ID**：ac80c5ab13ff6d8d923cb9abffc4f1f9
- **API Token（Zone+DNS+Pages）**：GvkFXEE1oBCg4DSXcMJmv1ejmMwjjb7LSIf7YEov
- **旧 API Token（已失效）**：~~ZHqLYWGGk7WjX6OZ6GcQAAe09T85Oez9p1tpf7lR~~
- **Pages 项目名**：image-background-remover
- **Pages 默认域名**：https://image-background-remover-7ql.pages.dev

### 自定义域名

- **域名**：imagebackgroundremover.live
- **注册商**：GoDaddy
- **Zone ID**：cbc0e0ba9a886f8e1a4111b5cf5b8b71
- **Cloudflare Nameservers**（需在 GoDaddy 设置）：
  - `harlan.ns.cloudflare.com`
  - `paislee.ns.cloudflare.com`
- **DNS 记录**：
  - `imagebackgroundremover.live` → CNAME → `image-background-remover-7ql.pages.dev`（Proxied）
  - `www.imagebackgroundremover.live` → CNAME → `image-background-remover-7ql.pages.dev`（Proxied）
- **Pages 自定义域名**：已绑定 `imagebackgroundremover.live` + `www.imagebackgroundremover.live`，SSL 证书自动签发中
- **状态**：✅ DNS 已传播至 Cloudflare IP（104.21.2.69 / 172.67.128.220），SSL 证书签发中（2026-03-16）

### 当前部署状态：🔴 未完成

Pages 项目已重建，环境变量已设置（NODE_VERSION=18, REMOVE_BG_API_KEY），但网站返回 500。

### 核心问题：Pages 部署 Next.js SSR worker 不生效

**问题本质**：`wrangler pages deploy` 只上传静态文件。Next.js 需要 SSR worker 处理动态路由。opennextjs-cloudflare 构建生成的 `worker.js` 需要被包含在部署中。

**已验证的关键发现**：

1. **`_worker.js` 机制可行**：将 `_worker.js` 放入 `.open-next/assets/` 目录，`wrangler pages deploy` 会编译并上传 worker bundle
2. **最小 worker 正常**：纯 `return new Response("Hello")` 的 `_worker.js` → 200 OK ✅
3. **单个 import 正常**：`import("./cloudflare/init.js")` → 成功返回 ✅
4. **完整 worker 崩溃**：使用原始 `worker.js`（含所有 import）→ 500 Internal Server Error ❌
5. **try-catch 无法捕获**：错误发生在模块初始化阶段，非 fetch handler 内

### 下一步排查方向

**逐步 import 二分法**——当前已验证 `cloudflare/init.js` 可 import，继续测试：

```
1. import("./cloudflare/skew-protection.js")   → ?
2. import("./cloudflare/images.js")             → ?
3. import("./middleware/handler.mjs")            → ?
4. import("./server-functions/default/handler.mjs") → ? （最可能出问题，体积最大）
```

找到出问题的 import 后，再深入排查该模块的具体错误。

**部署命令**（本地部署）：

```bash
cd "F:/home/memory-work/01 项目/image-background-remover"

# 1. 构建
npx opennextjs-cloudflare build

# 2. 复制 worker 和依赖到 assets
cp .open-next/worker.js .open-next/assets/_worker.js
cp -r .open-next/cloudflare .open-next/assets/
cp -r .open-next/.build .open-next/assets/
cp -r .open-next/middleware .open-next/assets/
cp -r .open-next/server-functions .open-next/assets/

# 3. 部署
CLOUDFLARE_API_TOKEN="GvkFXEE1oBCg4DSXcMJmv1ejmMwjjb7LSIf7YEov" \
CLOUDFLARE_ACCOUNT_ID="ac80c5ab13ff6d8d923cb9abffc4f1f9" \
npx wrangler pages deploy .open-next/assets \
  --project-name=image-background-remover --branch=main --commit-dirty=true
```

### GitHub Actions 自动部署

已配置 `.github/workflows/deploy.yml`，但 **GitHub 账号因计费问题被锁定**（Actions 分钟数耗尽），workflow 无法执行。

需要用户去 https://github.com/settings/billing 解决后，push 到 main 即可自动触发部署。

## 注意事项

- 隧道测试必须用 production build（`npm run build && npx next start`），dev 模式 HMR WebSocket 会在隧道下失败
- remove.bg 按调用计费，注意 API 用量
- 纯色/无前景的图片会被 remove.bg 拒绝（400 unknown_foreground），这是正常行为
- Next.js 16 的 TypeScript 类型检查有 bug，已在 `next.config.ts` 中设置 `typescript.ignoreBuildErrors: true`
- opennextjs-cloudflare 官方警告不完全兼容 Windows，推荐使用 WSL
- `wrangler.jsonc` 中 `main` 和 `pages_build_output_dir` 不能同时存在
