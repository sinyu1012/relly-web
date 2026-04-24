# AGENTS.md

给之后接手这个仓库的 AI / Codex 使用。开始工作前先读这里，再看代码。

## 项目概览

这是一个中文优先、移动端优先的 Next.js App Router 单页应用，产品名默认是“是真的吗”。

核心目标：用户上传图片后，在浏览器本地读取证据型元信息，辅助判断图片是否存在 AI 生成、AI 处理或来源链路风险。

当前线上地址：

https://really-web-sinyus-projects.vercel.app/

重要边界：

- 不上传原图，默认在浏览器本地处理。
- 不做“百分百真 / 假”裁决，只输出风险提示和证据项。
- 不接外部 AI 识图模型；当前依赖 EXIF / XMP / C2PA / SHA-256 / Canvas 感知哈希。
- 结果页支持生成 PNG 图片报告，不再导出 JSON 报告。
- 申诉抽屉仍保留，服务端申诉是可选能力。

## 技术栈

- Next.js 16 App Router
- React 19
- TypeScript
- CSS Modules + `app/globals.css`
- Vitest + Testing Library
- `exifr` 读取 EXIF / XMP / PNG 基础元信息
- `@contentauth/c2pa-web` 读取 Content Credentials / C2PA
- Web Crypto 计算 SHA-256
- Canvas 生成感知哈希和 PNG 图片报告

## 常用命令

```bash
npm test
npm run build
npm run dev
```

每次较大改动后至少跑：

```bash
npm test
npm run build
```

已知构建提示：

- `next build` 期间可能出现 `Couldn't load fs` / `Couldn't load zlib`。
- 这是 `@contentauth/c2pa-web` 在构建期的噪音；只要 build 最终成功即可。

## 关键文件

- `app/page.tsx`: 页面入口。
- `app/layout.tsx`: HTML lang、metadata。
- `lib/config.ts`: 应用名、文件大小、申诉环境变量等配置。
- `components/ForensicWorkbench.tsx`: 主流程状态管理，上传、扫描、图片报告、申诉。
- `components/UploadPanel.tsx`: 文件选择、拖拽、URL 输入。
- `components/ScanStatus.tsx`: 扫描进度。
- `components/ResultPanel.tsx`: 结果页、元信息展示、图片报告入口。
- `lib/reportImage.ts`: Canvas 生成 PNG 图片报告。
- `lib/scan/runQuickScan.ts`: 本地扫描流水线。
- `lib/scan/metadata.ts`: EXIF / XMP / PNG chunk 和 C2PA caBX 文本 hint 提取。
- `lib/scan/c2pa.ts`: C2PA manifest、actions、AI footprint 解析。
- `lib/scan/results.ts`: 风险分、风险带、证据项生成。
- `lib/types.ts`: 公共类型。

## 当前用户偏好

用户希望页面不要太复杂，但也不能太简陋。

保留的方向：

- 顶部标题是“是真的吗”。
- 主标题是“上传图片，判断真伪”。
- 主流程是 `Step 01 上传或读取图片` -> `Step 02 开始判断 / 判断进度` -> `Step 03 结果页`。
- 已删除原来的“显式同意设置”UI，不要无故加回来。
- 按钮文案使用“开始判断”，不要再写“开始本地快扫”。
- 导出报告使用 PNG 图片报告，不使用 JSON 报告作为主入口。
- 视觉风格是克制取证风：黑底、高对比、硬边界、少装饰。

## 扫描原理

本地判断流程在 `lib/scan/runQuickScan.ts`：

1. 校验文件格式和大小。
2. 读取 EXIF / XMP / PNG 基础信息。
3. 检查 C2PA / Content Credentials。
4. 计算 SHA-256。
5. 生成基础图像感知哈希。
6. 汇总证据项并生成风险分。

风险结果来自规则，不是 AI 模型判断。

需要重点维护的 AI 元信息判断逻辑：

- 结构化 C2PA：`lib/scan/c2pa.ts`
- PNG `caBX` 可读线索兜底：`lib/scan/metadata.ts`
- 风险分加权：`lib/scan/results.ts`

典型可识别线索包括：

- `OpenAI`
- `GPT-4o`
- `trainedAlgorithmicMedia`
- `Digital Source Type`
- `c2pa.created`
- `c2pa.converted`

## 图片报告注意事项

图片报告由 `lib/reportImage.ts` 在浏览器本地生成。

要求：

- 不调用服务端。
- 不上传原图。
- 自动下载 PNG。
- 页面中显示 PNG 预览，并提供“保存图片”链接。
- 避免固定高度区域互相覆盖；修改模板时注意长文案、长 hash、长 C2PA 字段。
- 图片应完整适配，不要硬裁掉主要内容。

如果用户反馈报告排版问题，优先检查：

- `REPORT_HEIGHT`
- `drawWrappedText`
- 证据项区域高度和 `evidenceBottom`
- 说明区 `noteTop`
- 底部 Case ID / Generated 坐标

## Vercel 部署说明

项目已经绑定 Vercel：

- Vercel project name: `really-web`
- Stable production alias: `https://really-web-sinyus-projects.vercel.app/`
- Local linked config: `.vercel/project.json`

不要提交 `.vercel/` 目录。它是本机 Vercel 链接信息。

部署命令：

```bash
vercel deploy --prod --yes
```

部署后，Vercel 会输出一个新的 immutable production URL，例如：

```text
https://really-xxxxxxxxx-sinyus-projects.vercel.app
```

但用户通常应访问稳定地址：

```text
https://really-web-sinyus-projects.vercel.app/
```

部署后建议验证：

```bash
curl -L --silent https://really-web-sinyus-projects.vercel.app | rg -n "是真的吗|上传图片，判断真伪"
```

如果要确认客户端 bundle 是否包含新文案：

```bash
chunk=$(curl -L --silent https://really-web-sinyus-projects.vercel.app | rg -o '/_next/static/chunks/[^" ]+\.js' | tail -1)
curl -L --silent "https://really-web-sinyus-projects.vercel.app$chunk" | rg -n "生成图片报告|AI 元信息线索"
```

### Vercel 登录

如果 Vercel CLI 未登录：

```bash
vercel login
```

如果提示 device auth，把链接给用户打开授权，用户确认后继续部署。

### Deployment Protection

这个项目之前遇到过 Vercel Deployment Protection 导致公开访问返回 `401`。

现在稳定生产域名应为公开访问。如果又出现登录拦截：

- 先确认访问的是 stable production alias。
- 再检查 Vercel Project Settings 里的 Deployment Protection。
- 目标状态是公开可访问，不需要登录验证。

## Git 约定

当前主要分支是 `main`。

已知提交：

- `0980ef7` `Add initial really-web MVP`
- `37c6fa1` `Simplify scan flow UI`
- `06d5aa6` `Add rich metadata and image report export`

用户明确说 `commit` 时再提交。普通改动完成后可以说明工作区状态，不要擅自提交，除非用户要求。

## 工作方式

- 改代码前先快速读相关文件，不要凭记忆改。
- 保持用户已有改动，不要用 destructive git 命令。
- 手动编辑文件用 `apply_patch`。
- 搜索文件优先用 `rg`。
- 大改后跑 `npm test` 和 `npm run build`。
- 部署前确认本地测试和构建通过。
- 部署后用 `curl` 检查线上稳定域名。

