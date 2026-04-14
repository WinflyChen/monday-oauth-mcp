# Telegram Bridge 技術文件

> 建立日期：2026-03-31  
> 專案路徑：`/Users/kevin/Documents/Project/047_monday_mcp/`

---

## 架構概覽

```
Telegram 使用者
      │
      ▼
Telegram Bot API (webhook)
      │
      ▼
telegram-bridge.js (port 3004)   ←──── Cloudflare Tunnel
      │
      ├─── OAuth 授權 ──────────→ server.js (port 3001)
      │                                    │
      │                                    ▼
      │                          Monday.com OAuth 2.0
      │
      └─── 自然語言 ────────────→ MaiAgent API
                                          │
                                          ▼
                                  Monday MCP Server
                                  (mcp.monday.com/mcp)
                                          │
                                          ▼
                                  Monday.com 帳號操作
```

---

## 服務清單

| 服務 | 檔案 | Port | 說明 |
|------|------|------|------|
| OAuth Server | `server.js` | 3001 | 處理 Monday OAuth 授權、儲存 token |
| MCP Server | `mcp-server.js` | 3003 | 給 MaiAgent 使用的 MCP 協議服務 |
| Telegram Bridge | `telegram-bridge.js` | 3004 | Telegram Bot webhook 與 AI 橋接 |

---

## 啟動方式

### 前置條件
- Node.js v22.16.0（路徑：`~/.nvm/versions/node/v22.16.0/bin/node`）
- Cloudflare Tunnel（`cloudflared`）

### 啟動服務

```bash
cd /Users/kevin/Documents/Project/047_monday_mcp

# 1. 啟動 OAuth Server (port 3001)
/Users/kevin/.nvm/versions/node/v22.16.0/bin/node server.js > /tmp/server_log.txt 2>&1 &

# 2. 啟動 MCP Server (port 3003，可選)
/Users/kevin/.nvm/versions/node/v22.16.0/bin/node mcp-server.js &

# 3. 啟動 Telegram Bridge (port 3004)
/Users/kevin/.nvm/versions/node/v22.16.0/bin/node telegram-bridge.js > /tmp/telegram_log.txt 2>&1 &
```

### 啟動 Cloudflare Tunnel

```bash
# Port 3001（OAuth callback 用）
cloudflared tunnel --url http://localhost:3001
# 記錄產生的網址，例如：https://capital-dodge-galleries-roster.trycloudflare.com

# Port 3004（Telegram webhook 用）
cloudflared tunnel --url http://localhost:3004
# 記錄產生的網址，例如：https://convergence-ask-drill-assign.trycloudflare.com
```

> ⚠️ 每次重新執行 cloudflared 會產生新網址，需要更新 `.env` 與 Monday 開發者後台。

### 設定 Telegram Webhook

```bash
curl -s -X POST http://localhost:3004/telegram/set-webhook
```

### 確認所有服務正常

```bash
curl -s http://localhost:3001/health   # OAuth Server
curl -s http://localhost:3004/health   # Telegram Bridge
```

---

## 環境變數（.env）

```env
# Monday OAuth
MONDAY_CLIENT_ID=d09eae3449d5efeb0487971ff9dfe354
MONDAY_CLIENT_SECRET=1c5f6145adf23b736eb0be4e9a0db1f7
MONDAY_REDIRECT_URI=https://<cloudflare-3001-url>/oauth/callback
OAUTH_SERVER_URL=https://<cloudflare-3001-url>

# Telegram
TELEGRAM_BOT_TOKEN=8768034460:AAEz1rAVFUXNvVirwwmRsBk1xQvFKQsriuU

# MaiAgent
MAIAGENT_API_KEY=2HZzbixO.KdJYn426rX18A0zpADR1EKs3uI5kf8Te
MAIAGENT_CHATBOT_ID=9fb109b3-2414-475e-a3d7-24863d58f384
MAIAGENT_API_BASE=https://api.maiagent.ai/api
MAIAGENT_MCP_TOOL_ID=09110e58-00bc-464b-8eea-d220af538bb4
```

> ⚠️ Cloudflare Tunnel 網址每次重啟都會變，需要同步更新 `MONDAY_REDIRECT_URI`、`OAUTH_SERVER_URL`，並重新在 Monday 開發者後台的 Redirect URL 欄位更新。

---

## Monday 開發者後台設定

路徑：Monday.com → 右上角頭像 → 開發者 → 你的 App（mcp）→ OAuth 分頁

- **Redirect URLs** 需加入：`https://<cloudflare-3001-url>/oauth/callback`
- **Scopes**：`me:read boards:read boards:write updates:write`

---

## MaiAgent 設定

- **Chatbot**：`Kevin_monday_test`（ID: `9fb109b3-2414-475e-a3d7-24863d58f384`）
- **MCP Tool**：`monday_test`（ID: `09110e58-00bc-464b-8eea-d220af538bb4`）
  - MCP URL：`https://mcp.monday.com/mcp`
  - `rawMcpHeader`：需要包含 `Authorization: Bearer <monday_access_token>`

### Token 過期時自動同步

每次使用者成功 OAuth 授權後，`server.js` 會自動 PATCH MaiAgent tool 的 `rawMcpHeader`，無需手動操作。

手動更新指令：
```bash
cd /Users/kevin/Documents/Project/047_monday_mcp
/Users/kevin/.nvm/versions/node/v22.16.0/bin/node -e "
const axios = require('axios');
const fs = require('fs');
const tokens = JSON.parse(fs.readFileSync('tokens.json'));
const mondayToken = Object.values(tokens)[0].accessToken;
axios.patch('https://api.maiagent.ai/api/v1/tools/09110e58-00bc-464b-8eea-d220af538bb4/',
  { rawMcpHeader: { Authorization: 'Bearer ' + mondayToken } },
  { headers: { Authorization: 'Api-Key 2HZzbixO.KdJYn426rX18A0zpADR1EKs3uI5kf8Te', 'Content-Type': 'application/json' } }
).then(r => console.log('OK')).catch(e => console.error(e.response?.data));
"
```

---

## Telegram Bot 指令

| 指令 | 說明 |
|------|------|
| `/start` | 顯示歡迎訊息與指令列表 |
| `/login` | 取得 Monday.com OAuth 授權連結 |
| `/boards` | 列出所有 Monday 看板 |
| `/status` | 查看目前登入狀態與對話 ID |
| `/reset` | 清除 AI 對話記憶（保留登入狀態） |
| 任意文字 | 透過 MaiAgent AI 處理 Monday 操作 |

---

## 自然語言可操作功能

| 分類 | 範例說明 |
|------|------|
| 看板 | 列出所有看板、建立新看板（private）、查看看板資訊 |
| 項目 | 新增項目、更新欄位值、搜尋項目 |
| 留言 | 新增 update 留言、查看留言記錄 |
| 通知 | 傳送通知給指定使用者 |
| 文件 | 建立 Doc、新增內容、閱讀 Doc |
| 工作區 | 列出工作區、建立工作區/資料夾 |
| 表單 | 建立/更新/查看表單 |
| 儀表板 | 建立儀表板與 widget |
| Sprint | 查看 sprint 看板、metadata、摘要 |
| 使用者 | 列出使用者與團隊 |

> ⚠️ **已知限制**：此帳號只能建立 `private` board，無法建立 `public` board（API 回傳 403）。

---

## OAuth 流程

```
1. 使用者在 Telegram 傳 /login
2. telegram-bridge.js 產生連結：
   https://<cloudflare-3001-url>/oauth/authorize?telegramUserId=<id>
3. 使用者點連結，server.js 建立 state：<random>_tg<telegramUserId>
4. 導向 Monday OAuth 授權頁
5. 使用者授權後，Monday 導回 callback URL
6. server.js 換取 access token
7. server.js 自動更新 MaiAgent tool 的 rawMcpHeader
8. server.js 通知 telegram-bridge.js（POST /telegram/oauth-success）
9. Telegram Bot 傳送授權成功訊息
```

---

## 對話 Session 機制

Session 儲存在 `telegram_sessions.json`，每個使用者記錄：
- `mondayUserId`：Monday 帳號 ID（授權後寫入）
- `conversationId`：MaiAgent 對話 ID（AI 記憶上下文用）
- `updatedAt`：最後更新時間

使用 `/reset` 會清除 `conversationId`，每次新對話第一則訊息會自動注入系統提示（userId + 操作規則）。

---

## API 呼叫規格

### MaiAgent Completions API

```
POST https://api.maiagent.ai/api/v1/chatbots/{chatbotId}/completions/
Authorization: Api-Key <MAIAGENT_API_KEY>
Content-Type: application/json

{
  "message": { "role": "user", "content": "<訊息內容>" },
  "conversationId": "<上次的 conversationId>"  // 可選，省略則開新對話
}
```

回應重要欄位：
- `content`：AI 回覆內容
- `conversationId`：對話 ID（下次帶入以延續上下文）

### Monday GraphQL API

```
POST https://api.monday.com/v2
Authorization: Bearer <access_token>
Content-Type: application/json
API-Version: 2024-01
```

---

## 除錯指令

```bash
# 查看 OAuth Server log
cat /tmp/server_log.txt

# 查看 Telegram Bridge log
cat /tmp/telegram_log.txt

# 確認 token 是否存在及是否過期
cat /Users/kevin/Documents/Project/047_monday_mcp/tokens.json

# 確認目前 session
cat /Users/kevin/Documents/Project/047_monday_mcp/telegram_sessions.json

# 測試 Monday token 是否有效
MONDAY_TOKEN=$(python3 -c "import json; d=json.load(open('tokens.json')); print(list(d.values())[0]['accessToken'])")
curl -s -X POST "https://api.monday.com/v2" \
  -H "Authorization: Bearer $MONDAY_TOKEN" \
  -H "Content-Type: application/json" \
  -H "API-Version: 2024-01" \
  -d '{"query":"{ me { id name email } }"}' | python3 -m json.tool

# 重啟所有服務
pkill -f "node server.js"; pkill -f "node telegram-bridge.js"; sleep 1
/Users/kevin/.nvm/versions/node/v22.16.0/bin/node server.js > /tmp/server_log.txt 2>&1 &
/Users/kevin/.nvm/versions/node/v22.16.0/bin/node telegram-bridge.js > /tmp/telegram_log.txt 2>&1 &
```

---

## 已知問題與解法

| 問題 | 原因 | 解法 |
|------|------|------|
| Token exchange failed (401) | 授權碼已過期或重複使用 | 重新執行 `/login` |
| MaiAgent 呼叫失敗 (405) | API endpoint 格式錯誤 | endpoint 結尾需加 `/` |
| create_board 授權錯誤 (403) | 帳號不支援建立 public board | 使用 `board_kind: private` |
| AI 不遵守 private 規則 | prompt 對進行中對話無效 | `/reset` 後重新操作 |
| Cloudflare 網址變更 | 每次重啟 tunnel 產生新網址 | 更新 `.env` + Monday 後台 + 重啟服務 |
