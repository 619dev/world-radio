# World Radio 完整部署指南

本文说明如何将 World Radio 部署为以下架构：

```text
用户浏览器
├── HTTPS 电台 ────────────────> 电台源站
└── HTTP 电台 ──HTTPS──> Cloudflare Worker ──HTTP──> 电台源站
                         ↑
Vercel 托管 Vue 前端 ────┘
```

Vercel 负责静态前端，Cloudflare Worker 只中继浏览器无法直接访问的 HTTP 音频。原生 HTTPS 电台不会经过 Worker。

## 1. 部署前准备

需要准备：

- GitHub、GitLab 或 Bitbucket 仓库
- Vercel 账号
- Cloudflare 账号
- Node.js 20 或更高版本
- npm 10 或更高版本

克隆并验证项目：

```bash
git clone https://github.com/ns2250225/world-radio.git
cd world-radio
npm install
npm run test:proxy
npm run build
```

`npm run build` 会同时执行 TypeScript 类型检查和 Vite 生产构建。构建产物位于 `dist/`。

## 2. 首次部署 Vercel 前端

由于 Worker 的来源白名单需要真实前端域名，建议先部署一次前端以取得稳定的 Vercel 地址。

1. 登录 Vercel，选择 **Add New → Project**。
2. 导入项目仓库。
3. Vercel 通常会自动识别 Vite；如果没有，请填写：

| 配置项 | 值 |
| --- | --- |
| Framework Preset | Vite |
| Install Command | `npm install` 或 `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js Version | 20 或更高 |

4. 暂时不设置 `VITE_STREAM_PROXY_URL`，执行第一次部署。
5. 记录生产地址，例如 `https://world-radio.vercel.app`。

第一次部署期间，HTTPS 电台可以正常播放；HTTP 电台会提示尚未配置音频中继。这是预期行为。

如果使用自定义域名，请先在 Vercel 的 **Settings → Domains** 中绑定域名，后续优先把最终自定义域名加入 Worker 白名单。

## 3. 配置 Cloudflare Worker

Worker 配置文件位于 `worker/wrangler.toml`。至少需要修改 `ALLOWED_ORIGINS`：

```toml
[vars]
ALLOWED_ORIGINS = "https://world-radio.vercel.app,https://radio.example.com,http://localhost:5173"
RADIO_BROWSER_API = "https://de1.api.radio-browser.info"
ALLOWED_STREAM_PORTS = "80,443,8000,8001,8080,8081,8443,8888"
```

配置说明：

| 变量 | 用途 |
| --- | --- |
| `ALLOWED_ORIGINS` | 允许调用 Worker 的前端来源，多个地址用英文逗号分隔 |
| `RADIO_BROWSER_API` | Worker 用于按电台 ID 查询真实流地址的 Radio Browser 镜像 |
| `ALLOWED_STREAM_PORTS` | 允许连接的公开音频端口列表 |

生产环境不要把 `ALLOWED_ORIGINS` 设置为 `*`。协议、域名和端口都属于来源的一部分，因此 `https://radio.example.com` 和 `https://www.radio.example.com` 需要分别加入。

Vercel 的 Preview Deployment 域名通常会变化。不要为了覆盖所有预览地址而开放 `*`；如需测试，建议只加入当前预览地址，测试完再移除。

## 4. 登录 Cloudflare 并设置签名密钥

登录 Wrangler：

```bash
npx wrangler login
```

浏览器会打开 Cloudflare 授权页面。授权成功后，为 HLS 分片地址配置签名密钥：

```bash
npx wrangler secret put STREAM_PROXY_SECRET --config worker/wrangler.toml
```

命令提示输入密钥时，粘贴一个足够长的随机字符串。可以使用以下命令生成：

```bash
openssl rand -base64 32
```

不要把密钥写进 `wrangler.toml`、`.env`、Git 提交或 Vercel 环境变量。它只应保存在 Cloudflare Worker 的 Secret 中。

## 5. 部署和验证 Worker

部署：

```bash
npm run worker:deploy
```

部署成功后，Wrangler 会输出类似下面的 HTTPS 地址：

```text
https://world-radio-proxy.<你的 Cloudflare 子域>.workers.dev
```

检查健康接口：

```bash
curl https://world-radio-proxy.<你的 Cloudflare 子域>.workers.dev/health
```

预期响应：

```json
{"ok":true}
```

健康接口返回成功只代表 Worker 已运行。音频请求还会检查前端来源、电台 ID、目标地址和目标端口。

### 可选：绑定 Worker 自定义域名

可以在 Cloudflare Dashboard 的 Worker 设置中添加 Custom Domain，例如：

```text
https://radio-proxy.example.com
```

绑定后，后续使用这个地址作为 `VITE_STREAM_PROXY_URL`。自定义域名更稳定，也方便未来替换 Worker 服务。

## 6. 连接 Vercel 与 Worker

进入 Vercel 项目的 **Settings → Environment Variables**，添加：

| 名称 | 值 | 环境 |
| --- | --- | --- |
| `VITE_STREAM_PROXY_URL` | Worker 的 HTTPS 地址，不带末尾 `/` | Production |

示例：

```text
VITE_STREAM_PROXY_URL=https://world-radio-proxy.example.workers.dev
```

如需在 Vercel 预览部署中测试，可以同时为 Preview 环境设置变量，但对应预览域名也必须加入 Worker 的 `ALLOWED_ORIGINS`。

Vite 会在构建阶段写入 `VITE_` 环境变量，因此保存变量后必须重新部署：

1. 打开 Vercel 项目的 **Deployments**。
2. 找到最近一次生产部署。
3. 选择 **Redeploy**。

仅修改环境变量但不重新构建，已部署的前端不会得到新地址。

## 7. 上线验收

建议在桌面 Chrome/Safari 和手机浏览器各验证一次：

1. 打开生产站点，确认页面通过 HTTPS 加载。
2. 播放一个原生 HTTPS 电台。
3. 播放一个只支持 HTTP 的 MP3/AAC 电台。
4. 播放一个 HTTP HLS 电台。
5. 测试暂停、恢复、上一台、下一台和音量控制。
6. 在浏览器开发者工具的 Network 面板中检查：
   - HTTPS 电台应直接请求原电台域名。
   - HTTP 电台应请求 Worker 的 `/station/<电台 ID>`。
   - HLS 分片应请求 Worker 的 `/resource?...&sig=...`。
   - 页面不应出现 Mixed Content 错误。

Worker 健康检查不会测试某个具体电台；第三方电台仍可能因下线、地区限制或编码不兼容而无法播放。

## 8. 本地联调

复制环境变量示例：

```bash
cp .env.example .env.local
```

填写已部署的 Worker 地址：

```text
VITE_STREAM_PROXY_URL=https://world-radio-proxy.example.workers.dev
```

确认 `worker/wrangler.toml` 的 `ALLOWED_ORIGINS` 包含：

```text
http://localhost:5173
```

启动前端：

```bash
npm run dev
```

由于本地开发页面本身使用 HTTP，浏览器可以直接请求 HTTP 电台；只有通过 HTTPS 访问页面时才会自动使用 Worker。若要完整验证中继逻辑，应使用 Vercel 预览或生产地址。

Worker 本地调试命令：

```bash
npm run worker:dev
```

本地 Worker 仍需要 `STREAM_PROXY_SECRET`。可按 Wrangler 的本地 Secret 机制配置，且不要提交该文件。

## 9. 更新部署

### 更新前端

推送代码到 Vercel 关联分支后，Vercel 会自动重新构建。手动部署前建议执行：

```bash
npm run test:proxy
npm run build
```

### 更新 Worker

修改 `worker/src/index.js` 或 `worker/wrangler.toml` 后执行：

```bash
npm run test:proxy
npm run worker:deploy
```

前端和 Worker 是两个独立部署单元。只推送 Git 仓库不会自动发布 Worker，除非另行配置 Cloudflare Workers Builds。

### 轮换签名密钥

重新执行：

```bash
npx wrangler secret put STREAM_PROXY_SECRET --config worker/wrangler.toml
```

轮换后，旧 HLS 分片链接会立即失效，正在播放的 HLS 电台可能短暂中断；刷新页面或重新播放即可取得新签名。

## 10. 回滚

- 前端：在 Vercel **Deployments** 中找到上一份正常部署，将其提升为生产部署或执行回滚。
- Worker：在 Cloudflare Dashboard 的 Worker **Deployments** 中选择上一版本并回滚。
- 如果 Worker 故障但 HTTPS 电台仍需可用，可以暂时从 Vercel 删除 `VITE_STREAM_PROXY_URL` 并重新部署前端。此时只有 HTTP 电台不可用。

回滚 Worker 代码不会自动恢复已经修改的 Secret 或环境变量，请同时检查 Cloudflare 中的变量配置。

## 11. 常见问题

### HTTP 电台提示“请先配置音频中继地址”

- Vercel 没有设置 `VITE_STREAM_PROXY_URL`。
- 环境变量设置在错误的环境中。
- 设置变量后没有重新部署前端。

### Worker 返回 403 `Origin not allowed`

- 当前页面完整来源没有加入 `ALLOWED_ORIGINS`。
- `www` 子域、协议或端口不一致。
- 修改 `wrangler.toml` 后没有重新部署 Worker。

### Worker 返回 403 `Invalid or expired resource`

- HLS 签名已超过一小时，重新播放即可。
- `STREAM_PROXY_SECRET` 被轮换。
- 播放列表链接被缓存过久；确认 Worker 对播放列表返回 `no-store`。

### Worker 返回 502

- 电台已经下线或拒绝 Cloudflare 网络访问。
- Radio Browser 镜像暂时不可用。
- 上游重定向到了被禁止的地址。
- 电台使用了未加入 `ALLOWED_STREAM_PORTS` 的端口。

如果确认某个公开电台使用了其他端口，可以将端口追加到 `ALLOWED_STREAM_PORTS` 后重新部署 Worker。不要为了省事取消端口限制。

### 音频播放几分钟后中断

- 检查电台源本身是否稳定。
- 查看 Cloudflare Worker 日志和用量限制。
- 确认没有把中继实现改成 Vercel Function；持续广播应走 Worker。
- 检查移动设备是否因锁屏或省电策略暂停网页音频。

### 部分 HLS 电台仍然失败

一些 HLS 流会使用 DRM、Cookie、一次性请求头、地区限制或非标准播放列表，这些流无法通过通用中继可靠播放。项目不会尝试绕过授权或地区限制。

## 12. 安全与运维建议

- 不要把 Worker 改成接受任意 `?url=` 的公开代理。
- 不要提交 `STREAM_PROXY_SECRET`。
- 生产环境使用明确的 `ALLOWED_ORIGINS`。
- 只开放实际需要的流媒体端口。
- 定期查看 Cloudflare Worker 请求量、错误率和带宽使用情况。
- 流量较大时应关注第三方电台的使用条款，以及 Cloudflare 和 Vercel 当前套餐限制。
- Worker 只解决浏览器 Mixed Content 问题，不应被用于绕过付费、认证、版权或地区访问限制。

