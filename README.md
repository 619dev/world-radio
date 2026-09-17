# World Radio｜声音地球

一个以 3D 地球为核心交互的全球互联网电台 Web 应用。旋转地球、选择国家或搜索关键词，即可发现并收听世界各地公开的网络电台。

项目前端为静态 Vue 应用；可选的 Cloudflare Worker 音频中继用于兼容只提供 HTTP 地址的公开电台，无需付费 API Key。

## 功能特性

- 交互式 3D 地球：支持鼠标与触摸旋转、缩放、国家点击和镜头平滑定位
- 全球电台探索：按国家查看电台，并展示当地时间及可靠地理点位
- 多语言搜索：支持国家、主要城市、电台名称及常见中英文名称
- 电台筛选与排序：支持流行、爵士、古典、摇滚、电子、新闻等类型，以及推荐、热门、名称和码率排序
- 完整播放器：支持播放、暂停、上一台、下一台、音量、静音和播放失败提示
- 多格式播放：使用 HTML5 Audio 播放常见音频流，并通过 hls.js 支持 HLS
- 随机旅行：随机前往一个有电台数据的国家继续探索
- 收藏与历史：使用 IndexedDB 在浏览器本地保存收藏和最近收听
- 睡眠定时器：支持 15、30、60 分钟定时停止播放
- 个性化设置：支持自动旋转、减少动画、地球画质、省流模式和随机旅行自动播放
- 响应式设计：适配桌面和移动设备，移动端使用底部抽屉展示电台列表
- 异常降级：处理目录服务不可用、离线、失效流、HTTP 混合内容和格式不兼容等情况

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 前端框架 | Vue 3 |
| 开发语言 | TypeScript |
| 构建工具 | Vite |
| 状态管理 | Pinia |
| 3D 地球 | Globe.GL / Three.js |
| 音频播放 | HTML5 Audio / hls.js |
| 本地存储 | IndexedDB / idb |
| 电台目录 | Radio Browser API |
| 国家边界 | Natural Earth / world-atlas |
| 图标 | Lucide Vue Next |

## 环境要求

- Node.js 20 或更高版本
- npm 10 或更高版本
- 支持 WebGL、HTML5 Audio 和 IndexedDB 的现代浏览器

## 本地开发

克隆项目：

```bash
git clone https://github.com/ns2250225/world-radio.git
cd world-radio
```

使用国内镜像安装依赖：

```bash
npm install --registry=https://registry.npmmirror.com
```

启动开发服务器：

```bash
npm run dev
```

浏览器访问终端中显示的本地地址，通常为 `http://localhost:5173/`。

## 构建与预览

执行类型检查并生成生产构建：

```bash
npm run build
```

本地预览生产构建：

```bash
npm run preview
```

单独执行 TypeScript 类型检查：

```bash
npm run typecheck
```

## HTTP 电台中继

HTTPS 页面不能直接播放只提供 HTTP 地址的电台。本项目通过独立的 Cloudflare Worker 将这类音频安全地流式转发为 HTTPS；原生 HTTPS 电台仍由浏览器直接连接。

快速部署步骤：

1. 先将前端部署到 Vercel，取得正式 HTTPS 域名。
2. 将该域名填入 `worker/wrangler.toml` 的 `ALLOWED_ORIGINS`。
3. 设置签名密钥并部署 Worker：

```bash
npx wrangler secret put STREAM_PROXY_SECRET --config worker/wrangler.toml
npm run worker:deploy
```

4. 在 Vercel 项目环境变量中设置：

```text
VITE_STREAM_PROXY_URL=https://world-radio-proxy.<你的账号>.workers.dev
```

5. 重新部署 Vercel 前端。

完整的首次部署、域名配置、上线验收、更新、回滚和故障排查步骤请阅读 [完整部署指南](docs/deployment.md)。

## 项目结构

```text
world-radio/
├── docs/
│   └── deployment.md     # Vercel 与 Cloudflare 完整部署指南
├── worker/
│   ├── src/              # Cloudflare Worker 音频中继
│   ├── test/             # 中继安全与 HLS 测试
│   └── wrangler.toml     # Worker 部署配置
├── src/
│   ├── components/       # 3D 地球等界面组件
│   ├── services/         # 电台 API、音频引擎和本地存储
│   ├── App.vue           # 主应用与业务交互
│   ├── data.ts           # 国家、城市别名和类型索引
│   ├── styles.css        # 全局及响应式样式
│   └── types.ts          # TypeScript 数据模型
├── index.html
├── prd.md                # 产品需求文档
├── package.json
└── vite.config.ts
```

## 数据与隐私

- 电台目录来自开放项目 [Radio Browser](https://www.radio-browser.info/)。
- 国家边界数据来自 Natural Earth，并通过 `world-atlas` 提供。
- 本项目只连接电台公开直播地址，不录制、下载、转码或重新分发音频。
- 收藏、最近收听和设置仅保存在用户当前浏览器中。
- 项目不要求定位权限，也不主动收集个人身份信息。

## 使用限制

网络电台由第三方独立维护，可能因流地址失效、编码格式、地区限制或源站策略而无法播放。音频中继仅用于解决浏览器 HTTP/HTTPS 混合内容限制，不绕过电台的认证、安全策略或地区限制，也无法保证全部电台始终可用。

## 许可证

项目当前未指定开源许可证。如需公开分发、二次开发或商业使用，请先联系项目所有者确认授权。
