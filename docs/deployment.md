# World Radio 网页端完整部署指南

本指南的推荐流程不需要本地终端：只使用 GitHub、Vercel 和 Cloudflare 的网页控制台即可完成部署。代码更新到 GitHub `main` 后，Vercel 与 Cloudflare 会分别自动发布前端和音频中继。

```text
GitHub main
├── Vercel 自动构建 Vue 前端
└── Cloudflare Workers Builds 自动部署音频中继

用户浏览器
├── HTTPS 电台 ─────────────────────> 电台源站
└── HTTP 电台 ──HTTPS──> Worker ──HTTP──> 电台源站
```

## 1. 准备账号和仓库

需要 GitHub、Vercel 和 Cloudflare 账号。确认 GitHub 仓库包含：

```text
package.json
worker/wrangler.toml
worker/src/index.js
```

部署时不需要修改代码文件。所有随环境变化的值都在平台网页中配置为变量。

## 2. 在 Vercel 创建前端项目

先部署前端，以便取得 Worker 白名单所需的正式域名。

1. 登录 Vercel Dashboard，选择 **Add New → Project**。
2. 连接 GitHub，导入本项目仓库，生产分支保持为 `main`。
3. Vercel 通常会自动识别 Vite；如需手动填写，使用：

| 设置 | 值 |
| --- | --- |
| Framework Preset | `Vite` |
| Root Directory | `./` |
| Install Command | `npm install` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js Version | 20 或更高 |

4. 暂时不添加环境变量，点击 **Deploy**。
5. 部署完成后记录生产地址，例如 `https://world-radio.vercel.app`。

第一次部署时，HTTPS 电台可以播放；HTTP 电台会提示尚未配置中继，这是正常现象。

如果准备使用自定义域名，建议现在到 Vercel 项目的 **Settings → Domains** 完成绑定，后续使用最终域名配置 Worker 白名单。

## 3. 在 Cloudflare 网页创建 Worker

1. 登录 Cloudflare Dashboard，进入 **Workers & Pages**。
2. 选择 **Create application**。
3. 在 **Import a repository** 旁选择 **Get started**。
4. 授权 GitHub，并选择同一个项目仓库。
5. Worker 名称填写 `world-radio-proxy`，与 `worker/wrangler.toml` 中的 `name` 保持一致。
6. 配置构建：

| 设置 | 值 |
| --- | --- |
| Production branch | `main` |
| Root directory | `/` 或留空 |
| Build command | 留空 |
| Deploy command | `npx wrangler deploy --config worker/wrangler.toml` |
| Non-production deploy command | `npx wrangler versions upload --config worker/wrangler.toml` |

7. 选择 **Save and Deploy**。
8. 首次部署完成后记录地址，例如 `https://world-radio-proxy.<账号子域>.workers.dev`。

以后 `main` 分支有提交时，Workers Builds 会自动更新生产 Worker。其他分支只上传预览版本，不会替换生产 Worker。

## 4. 在 Cloudflare 配置运行时变量

打开刚创建的 Worker，进入 **Settings → Variables and Secrets**，添加以下变量。

### 必需变量

| Type | Name | Value 示例 | 说明 |
| --- | --- | --- | --- |
| Text | `ALLOWED_ORIGINS` | `https://world-radio.vercel.app,https://radio.example.com` | 允许调用 Worker 的前端来源 |
| Secret | `STREAM_PROXY_SECRET` | 由密码管理器生成的随机值 | HLS 子资源签名密钥 |

`STREAM_PROXY_SECRET` 建议使用浏览器或密码管理器生成至少 32 个随机字符。类型必须选择 **Secret**，不要使用 Text。

### 可选变量

代码已经提供默认值，通常无需添加：

| Type | Name | 默认值 | 何时修改 |
| --- | --- | --- | --- |
| Text | `RADIO_BROWSER_API` | `https://all.api.radio-browser.info` | 需要固定到特定镜像时 |
| Text | `ALLOWED_STREAM_PORTS` | 未设置时允许 `80`、`81`、`443` 和 `1024–65535` | 需要使用精确端口白名单时 |

注意：

- 多个来源或端口使用英文逗号分隔。
- 来源必须包含协议，不要加末尾 `/`。
- `https://example.com` 与 `https://www.example.com` 是两个不同来源。
- 生产环境不要把 `ALLOWED_ORIGINS` 设置为 `*`。
- 未设置 `ALLOWED_ORIGINS` 时，Worker 会拒绝所有请求，避免意外成为开放代理。
- 不要把 `STREAM_PROXY_SECRET` 保存到 GitHub、Vercel 或普通文本变量中。

添加完成后选择 **Deploy**，让变量进入新的 Worker 部署。

## 5. 验证 Worker

在浏览器地址栏打开：

```text
https://world-radio-proxy.<账号子域>.workers.dev/health
```

预期显示：

```json
{"ok":true}
```

如果返回 `Origin not allowed`，检查 `ALLOWED_ORIGINS` 是否已保存并部署。健康接口成功只说明 Worker 正常运行，具体电台仍可能因源站失效或地区限制无法播放。

### 可选：绑定 Worker 自定义域名

在 Worker 的 **Settings → Domains & Routes** 中添加 Custom Domain，例如 `radio-proxy.example.com`。绑定后，下一步的 `VITE_STREAM_PROXY_URL` 使用这个自定义域名。

## 6. 在 Vercel 配置 Worker 地址

1. 打开 Vercel 项目，进入 **Settings → Environment Variables**。
2. 添加：

| Name | Value | Environment |
| --- | --- | --- |
| `VITE_STREAM_PROXY_URL` | `https://world-radio-proxy.<账号子域>.workers.dev` | Production |

值必须是 HTTPS 地址，且末尾不要加 `/`。

3. 保存变量，进入 **Deployments**。
4. 打开最近一次生产部署右侧菜单，选择 **Redeploy**。

Vite 会在构建阶段写入 `VITE_` 变量，所以修改变量后必须重新部署；变量不会自动进入已有部署。

如果需要 Vercel Preview 环境也访问 Worker，可为 Preview 添加同名变量，同时把该预览站点的完整来源加入 Cloudflare 的 `ALLOWED_ORIGINS`。预览域名可能变化，不建议用 `*` 放宽限制。

## 7. 上线验收

在桌面和手机浏览器分别检查：

1. 生产页面通过 HTTPS 正常打开。
2. 原生 HTTPS 电台可以播放。
3. 只支持 HTTP 的 MP3/AAC 电台可以播放。
4. HTTP HLS 电台可以播放。
5. 暂停、恢复、切台和音量控制正常。
6. 浏览器控制台没有 Mixed Content 错误。

在 Network 面板中可以进一步确认：

- HTTPS 电台直接请求原电台域名。
- HTTP 电台请求 Worker 的 `/station/<电台 ID>`。
- HLS 分片请求 Worker 的 `/resource?...&sig=...`。

## 8. 日常更新流程

完成 Git 连接后，更新只需要网页操作：

1. 在 GitHub 网页编辑或合并代码到 `main`。
2. Vercel 自动构建并发布前端。
3. Cloudflare Workers Builds 自动部署 Worker。
4. 分别在 Vercel **Deployments** 和 Cloudflare Worker **Builds/Deployments** 查看状态。

前端和 Worker 是两个独立部署。某次提交即使只修改前端，也可能触发两边构建；这不会清除 Cloudflare Dashboard 中的运行时变量，因为 `worker/wrangler.toml` 已启用 `keep_vars = true`。

## 9. 网页端修改和轮换变量

- 修改前端 Worker 地址：在 Vercel **Settings → Environment Variables** 修改 `VITE_STREAM_PROXY_URL`，然后重新部署前端。
- 修改 Worker 白名单或端口：在 Cloudflare Worker **Settings → Variables and Secrets** 修改变量并选择 **Deploy**。
- 轮换签名密钥：在 Cloudflare 中编辑 `STREAM_PROXY_SECRET`，生成新的随机值并部署。

轮换密钥后，旧 HLS 链接会立即失效，正在播放的 HLS 电台可能短暂中断；刷新页面或重新播放即可获取新签名。

## 10. 网页端回滚

- 前端：在 Vercel **Deployments** 中选择上一份正常部署并执行回滚或提升为 Production。
- Worker：在 Cloudflare Worker **Deployments** 中选择上一版本并回滚。
- 临时关闭 HTTP 中继：删除 Vercel 的 `VITE_STREAM_PROXY_URL`，重新部署前端。HTTPS 电台仍可直连。

代码回滚通常不会回滚平台变量。完成回滚后同时检查两边的 Environment Variables、Variables and Secrets。

## 11. 常见问题

### Cloudflare 构建提示找不到 `wrangler.toml`

确认 Root directory 为仓库根目录，并且 Deploy command 是：

```text
npx wrangler deploy --config worker/wrangler.toml
```

### Worker 名称不匹配

Cloudflare 项目名称应为 `world-radio-proxy`，与 `worker/wrangler.toml` 一致。如使用其他名称，需要同时修改仓库配置，或在 Cloudflare 中重新创建同名 Worker。

### HTTP 电台提示“请先配置音频中继地址”

- Vercel 没有设置 `VITE_STREAM_PROXY_URL`。
- 变量只配置到了 Preview，而不是 Production。
- 保存变量后没有重新部署。

### Worker 返回 403 `Origin not allowed`

- `ALLOWED_ORIGINS` 未设置。
- 当前站点的协议、域名或端口没有完整匹配。
- 修改变量后没有在 Cloudflare 选择 Deploy。

### Worker 返回 403 `Invalid or expired resource`

- HLS 链接已超过一小时，重新播放即可。
- `STREAM_PROXY_SECRET` 刚被轮换。
- 浏览器或中间网络缓存了旧播放列表。

### Worker 返回 502

- 电台已经下线或拒绝 Cloudflare 网络访问。
- Radio Browser 镜像暂时不可用。
- 上游重定向到了被禁止的地址。
- 电台端口不在 `ALLOWED_STREAM_PORTS` 中。

确认目标是公开电台后，可以在 Cloudflare 中追加所需端口。不要取消端口限制。

### 部分 HLS 电台仍然失败

部分 HLS 流依赖 DRM、Cookie、一次性请求头、地区限制或非标准播放列表，无法通过通用中继可靠播放。本项目不会绕过授权或地区限制。

## 12. 可选：本地开发

网页端部署不需要本节。只有开发代码时才需要 Node.js 和 Wrangler：

```bash
npm install
npm run test:proxy
npm run build
npm run worker:dev
```

前端本地变量放在 `.env.local`：

```text
VITE_STREAM_PROXY_URL=https://你的-worker.workers.dev
```

Worker 本地变量放在 `worker/.dev.vars`：

```text
ALLOWED_ORIGINS=http://localhost:5173
STREAM_PROXY_SECRET=本地随机密钥
RADIO_BROWSER_API=https://all.api.radio-browser.info
ALLOWED_STREAM_PORTS=80,443,8000,8101
```

`.env.local` 和 `.dev.vars` 已被 Git 忽略，不要提交真实密钥。

## 13. 安全与运维

- 不要把 Worker 改成接收任意 `?url=` 的公开代理。
- `STREAM_PROXY_SECRET` 必须使用 Cloudflare Secret 类型。
- 生产环境使用明确的 `ALLOWED_ORIGINS`。
- 默认策略支持互联网电台常见的高位端口，同时阻止大多数低位系统服务；安全要求更严格时可用 `ALLOWED_STREAM_PORTS` 改为精确白名单。
- 定期查看 Cloudflare Worker 的请求量、错误率和用量。
- 流量较大时关注第三方电台条款，以及 Cloudflare 和 Vercel 当前套餐限制。
- Worker 只解决浏览器 Mixed Content，不用于绕过付费、认证、版权或地区限制。

相关官方说明：[Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)、[Cloudflare 变量与密钥](https://developers.cloudflare.com/workers/configuration/environment-variables/)、[Vercel 环境变量](https://vercel.com/docs/environment-variables/managing-environment-variables)。
