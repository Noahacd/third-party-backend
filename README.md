# third-party-backend

基于 **Express 5** 的第三方 OAuth 认证 API 服务，为 [third-party-frontend](https://github.com/Noahacd/third-party-frontend) 前端提供 Google、X (Twitter)、Telegram、邮箱验证码登录及 JWT 会话管理能力。

## 功能概览

| 功能 | 说明 |
|------|------|
| Google OAuth 2.0 | 授权码流程，自动创建/更新用户 |
| X OAuth 2.0 + PKCE | 授权码 + PKCE，自动创建/更新用户 |
| Telegram Login | 校验 Telegram 授权数据（HMAC-SHA256），支持 POST 与 GET callback |
| JWT 会话 | Access Token（短期）+ Refresh Token（长期），HttpOnly Cookie |
| 自动续期 | `/auth/me` 在 Access Token 失效时用 Refresh Token 静默刷新 |
| SQLite 持久化 | 用户表 + Refresh Token 表，启动时自动建表/迁移 |

## 技术栈

- Node.js（`--watch` 热重载开发）
- Express 5
- better-sqlite3
- google-auth-library
- jsonwebtoken
- cookie-parser + cors

## 项目结构

```
third-party-backend/
├── index.js              # 入口：CORS、Cookie、路由挂载
├── render.yaml           # Render Blueprint 部署配置
├── routes/
│   └── auth.js           # 全部认证路由
├── db/
│   ├── index.js          # SQLite 连接与表结构迁移
│   ├── users.js          # 用户 CRUD（Google / X / Telegram）
│   └── refresh-tokens.js # Refresh Token 签发与吊销
├── lib/
│   ├── cookies.js        # 设置 / 清除认证 Cookie
│   ├── tokens.js         # JWT 签发与校验
│   ├── x-oauth.js        # X OAuth PKCE 工具
│   └── telegram-auth.js  # Telegram 授权校验与 OAuth URL
├── data/                 # SQLite 数据库文件（git 忽略，本地开发）
├── .env.example          # 环境变量模板
└── package.json
```

## 快速开始

### 前置条件

- Node.js 20+
- pnpm
- 各第三方平台已创建 OAuth 应用（见下方配置说明）

### 安装与启动

```bash
cp .env.example .env   # 复制并填写真实配置
pnpm install
pnpm dev               # 默认 http://localhost:3000
```

健康检查：

```bash
curl http://localhost:3000/health
# {"ok":true}
```

前端开发时，[third-party-frontend](https://github.com/Noahacd/third-party-frontend) 通过 `/api` 代理将请求转发到本服务。

## 环境变量

复制 `.env.example` 为 `.env` 后填写：

| 变量 | 必填 | 说明 |
|------|------|------|
| `PORT` | 否 | 服务端口，默认 `3000` |
| `FRONTEND_URL` | 是 | 前端地址（CORS 来源、OAuth 重定向目标） |
| `GOOGLE_CLIENT_ID` | Google 登录 | Google OAuth 客户端 ID |
| `GOOGLE_CLIENT_SECRET` | Google 登录 | Google OAuth 客户端密钥 |
| `GOOGLE_REDIRECT_URI` | Google 登录 | 授权回调（经前端代理） |
| `X_CLIENT_ID` | X 登录 | X 应用 Client ID |
| `X_CLIENT_SECRET` | X 登录 | X 应用 Client Secret |
| `X_REDIRECT_URI` | X 登录 | 授权回调（经前端代理） |
| `TELEGRAM_BOT_TOKEN` | Telegram 登录 | Bot Token（@BotFather 获取） |
| `TELEGRAM_BOT_USERNAME` | Telegram 登录 | Bot 用户名，**不带** `@` |
| `JWT_SECRET` | 是 | JWT 签名密钥（长随机字符串） |
| `ACCESS_TOKEN_EXPIRES_IN` | 否 | Access Token 有效期，默认 `15m` |
| `REFRESH_TOKEN_EXPIRES_IN` | 否 | Refresh Token 有效期，默认 `7d` |
| `DATABASE_PATH` | 否 | SQLite 路径，默认 `./data/app.db` |

示例（`.env.example`）：

```env
PORT=3000
FRONTEND_URL=http://127.0.0.1:4050

GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://127.0.0.1:4050/api/auth/google/callback

JWT_SECRET=replace-with-a-long-random-string
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

DATABASE_PATH=./data/app.db

X_CLIENT_ID=your-x-client-id
X_CLIENT_SECRET=your-x-client-secret
X_REDIRECT_URI=http://127.0.0.1:4050/api/auth/x/callback

TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_BOT_USERNAME=your_bot_username
```

> **重要：** 请统一使用 `http://127.0.0.1:4050` 作为前端地址，不要使用 `localhost`，避免 Cookie 域名不一致导致登录失败。

## API 接口

所有路由挂载在 `/auth` 下。前端通过 Next.js 代理访问时路径为 `/api/auth/*`。

### OAuth 发起

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/auth/google` | 跳转 Google 授权页；`?reauth=1` 强制重新登录 |
| `GET` | `/auth/x` | 跳转 X 授权页（PKCE）；`?reauth=1` 强制重新登录 |
| `GET` | `/auth/telegram/config` | 返回 `{ botUsername, loginUrl, logoutUrl }` |

### OAuth 回调

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/auth/google/callback` | Google 回调，签发 Cookie，重定向 `/dashboard` |
| `GET` | `/auth/x/callback` | X 回调，签发 Cookie，重定向 `/dashboard` |
| `GET` | `/auth/telegram/callback` | Telegram 服务端回调（备用；前端主要走 POST） |
| `POST` | `/auth/telegram` | 客户端提交 Telegram 授权数据，返回 `{ user, accessToken }` |

### 会话

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/auth/me` | 获取当前用户；Token 过期时自动 Refresh |
| `POST` | `/auth/refresh` | 用 Refresh Token 换取新会话 |
| `POST` | `/auth/logout` | 吊销 Refresh Token，清除 Cookie |

### 响应示例

`GET /auth/me` 成功：

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name",
    "picture": "https://...",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z",
    "lastLoginAt": "2026-01-01T00:00:00.000Z"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

## 认证机制

### Cookie

| Cookie | 说明 |
|--------|------|
| `access_token` | JWT Access Token，HttpOnly |
| `refresh_token` | 随机 Refresh Token（哈希后存库），HttpOnly |

生产环境（`NODE_ENV=production`）下 Cookie 启用 `secure`。

### 用户标识

`users` 表通过不同第三方 ID 关联同一逻辑用户：

| 字段 | 来源 |
|------|------|
| `google_id` | Google `sub` |
| `x_id` | X 用户 ID |
| `telegram_id` | Telegram 用户 ID |

X 用户若无公开邮箱，系统生成占位邮箱：`{username}@users.x.local`。

### Telegram 校验

1. 按 Telegram 文档对授权字段排序拼接，用 Bot Token 的 SHA256 作为 HMAC 密钥
2. 校验 `hash` 与 `auth_date`（默认 24 小时内有效）
3. 校验通过后 `upsertTelegramUser` 并签发会话

## 登录流程（与前端协作）

### Google / X

```
浏览器 → GET /auth/google（或 /auth/x）
       → 第三方授权
       → GET /auth/{provider}/callback?code=...&state=...
       → 校验 state，换取用户信息，upsert 用户
       → Set-Cookie: access_token, refresh_token
       → 302 → FRONTEND_URL/dashboard
```

### Telegram（前端主导）

```
浏览器 → GET /auth/telegram/config → loginUrl
       → oauth.telegram.org 授权
       → 回到前端，hash 含 #tgAuthResult
       → 前端 POST /auth/telegram（body 为授权字段）
       → Set-Cookie + 返回 JSON
       → 前端跳转 /dashboard
```

## 第三方平台配置

### Google Cloud Console

1. 创建 OAuth 2.0 客户端（Web 应用）
2. **已授权的重定向 URI：** `http://127.0.0.1:4050/api/auth/google/callback`
3. 将 Client ID / Secret 填入 `.env`

### X Developer Portal

1. 创建 App，启用 OAuth 2.0
2. **Callback URI：** `http://127.0.0.1:4050/api/auth/x/callback`
3. 将 Client ID / Secret 填入 `.env`

### Telegram

1. 通过 [@BotFather](https://t.me/BotFather) 创建 Bot，获取 Token
2. 设置 `TELEGRAM_BOT_USERNAME`（不含 `@`）
3. 前端通过 OAuth 跳转登录，无需在 Bot 设置 Webhook

## 数据库

首次启动自动创建 `data/app.db`（路径由 `DATABASE_PATH` 控制）及表结构：

- `users` — 用户基本信息与第三方 ID
- `refresh_tokens` — Refresh Token 哈希、过期时间、吊销状态

`data/` 目录已加入 `.gitignore`，请勿将数据库文件提交到版本库。

## 常用脚本

```bash
pnpm dev      # 开发模式（node --watch）
pnpm start    # 生产启动
pnpm format   # Prettier 格式化
```

## 部署注意事项

1. **CORS：** `FRONTEND_URL` 必须与实际前端域名完全一致
2. **HTTPS：** 生产环境前后端均应使用 HTTPS，并设置 `NODE_ENV=production`
3. **JWT_SECRET：** 使用足够长的随机字符串，切勿泄露或提交到 Git
4. **数据库：** `better-sqlite3` 为原生模块，部署环境需能编译或预构建；生产可考虑迁移至 PostgreSQL 等
5. **代理：** 若前端不经过 Next.js 代理，需将 `NEXT_PUBLIC_API_URL` 直接指向本服务，并确保 Cookie `SameSite` / 域名配置正确

## Render 部署

推荐与 Vercel 上的 `third-party-frontend` 配合：`/api/*` 由 Vercel 代理到 Render 后端。

### 方式一：Blueprint（推荐）

仓库根目录已包含 `render.yaml`。在 [Render Dashboard](https://dashboard.render.com)：

1. **New +** → **Blueprint** → 连接本 GitHub 仓库
2. 按提示填写 `sync: false` 的环境变量（见 `.env.example` 中的 Render 示例）
3. 部署完成后复制服务 URL，例如 `https://third-party-backend.onrender.com`

### 方式二：手动创建 Web Service

| 配置项 | 值 |
|--------|-----|
| Root Directory | （留空，仓库即服务根目录） |
| Runtime | Node |
| Build Command | `pnpm install --frozen-lockfile` |
| Start Command | `pnpm start` |
| Health Check Path | `/health` |
| Environment | `ENABLE_PNPM=true` |

**Persistent Disk（生产必开）：** Mount Path `/data`，环境变量 `DATABASE_PATH=/data/app.db`。免费实例无持久磁盘，重启后 SQLite 数据会丢失。

### Render 环境变量要点

```env
NODE_ENV=production
DATABASE_PATH=/data/app.db
FRONTEND_URL=https://your-app.vercel.app
GOOGLE_REDIRECT_URI=https://your-app.vercel.app/api/auth/google/callback
X_REDIRECT_URI=https://your-app.vercel.app/api/auth/x/callback
```

OAuth 回调地址填 **Vercel 前端域名 + `/api`**，不要填 `*.onrender.com`。

### 配置 Vercel 代理

```env
API_PROXY_TARGET=https://your-service.onrender.com
NEXT_PUBLIC_API_URL=/api
```

验证：

```bash
curl https://your-service.onrender.com/health
curl https://your-app.vercel.app/api/health
```

## 常见问题

**`401 Unauthorized` on `/auth/me`**  
Cookie 未携带或 Refresh Token 已过期/吊销，需重新登录。

**Google `redirect_uri_mismatch`**  
`GOOGLE_REDIRECT_URI` 与 Google Console 中配置的 URI 必须字符级一致。

**Telegram `invalid_telegram_auth`**  
Bot Token 错误、授权数据过期（超过 24 小时）、或 hash 校验失败；确认前端 POST 的字段完整。

**X 登录 `x_not_configured`**  
未配置 `X_CLIENT_ID` / `X_CLIENT_SECRET` / `X_REDIRECT_URI`。

**CORS 错误**  
检查 `FRONTEND_URL` 是否与浏览器访问的前端地址一致（含协议、主机、端口）。
