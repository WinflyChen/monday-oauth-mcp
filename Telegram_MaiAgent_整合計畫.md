# Telegram → MaiAgent → Monday.com 整合計畫

**目標：** 使用者在 Telegram 傳訊息，透過 MaiAgent 使用 MCP 工具讀取 Monday.com 資料  
**建立日期：** 2026年3月26日  
**狀態：** 規劃中

---

## 架構說明

```
Telegram 使用者
  ↓ 傳送訊息
Telegram Bot (Bot Token)
  ↓ Webhook POST /webhook
telegram-bridge.js (埠 3004)
  ↓ POST /api/v1/chatbots/{id}/completions
MaiAgent 雲端 (Api-Key 認證)
  ↓ MCP 工具調用
MCP Server (埠 3003, ngrok 公開)
  ↓ GraphQL
Monday.com API
```

---

## Phase 1：事前準備（人工操作）

### 1. 申請 Telegram Bot Token

**步驟：**

1. 開啟 Telegram（手機或電腦版皆可）

2. 搜尋 `@BotFather`
   - 選擇有 ✅ 藍色認證勾勾的官方帳號

3. 開始對話，傳送 `/start`

4. 傳送 `/newbot` 建立新 Bot

5. 輸入 Bot 顯示名稱（例如：`Monday Assistant`）

6. 輸入 Bot username（**必須以 `bot` 結尾**，例如：`monday_kevin_bot`）
   - 若名稱被佔用，換一個再試

7. 成功後 BotFather 回傳 Token，格式如下：
   ```
   7123456789:AAHxxxxxxxxxxxxxxxxxxxxxx-xxxxxxxx
   ```

8. 複製 Token 填入 `.env`：
   ```env
   TELEGRAM_BOT_TOKEN=7123456789:AAHxxxxxxxxxxxxxxxxxxxxxx-xxxxxxxx
   ```

> ⚠️ Token 等同於 Bot 的密碼，不要公開，也不要 commit 進 git  
> 若 Token 外洩，對 BotFather 傳送 `/revoke` 可重新產生

---

### 2. 取得 MaiAgent API Key 與 Chatbot ID

#### 取得 API Key

1. 開啟瀏覽器，登入 [MaiAgent 後台](https://admin.maiagent.ai)

2. 點選右上角的帳號名稱或頭像 → **API 金鑰**（或 **API Keys**）

3. 點選 **新增 API 金鑰** 按鈕，填入名稱（例如：`telegram-bridge`）

4. 複製產生的 Key，格式如下：
   ```
   mai_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

5. 填入 `.env`：
   ```env
   MAIAGENT_API_KEY=mai_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

> ⚠️ API Key 只會顯示一次，請立即複製並妥善保存  
> 認證方式：所有 API 請求需帶 `Authorization: Api-Key YOUR_KEY` 標頭

#### 取得 Chatbot ID

1. 在 MaiAgent 後台左側選單點選 **聊天機器人**（Chatbots）

2. 找到已配置好 MCP 工具的 Bot（即先前整合 Monday.com 的那個）

3. 點選該 Bot 進入設定頁面

4. Chatbot ID 可從以下兩個地方取得：
   - 瀏覽器網址列：`https://admin.maiagent.ai/chatbots/` **`{chatbot_id}`** `/settings`
   - 或在 Bot 設定頁面中找到「Bot ID」欄位直接複製

5. 填入 `.env`：
   ```env
   MAIAGENT_CHATBOT_ID=your_chatbot_id_here
   ```

### 3. 確認 MCP Server 公開可存取

- 執行 `ngrok http 3003` 取得公開 URL
- 確認 MaiAgent 後台 MCP 工具 URL 已更新為 ngrok 網址

---

## Phase 2：更新 .env 配置

在 `.env` 新增以下變數：

```env
# Telegram Bot
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# MaiAgent
MAIAGENT_API_KEY=your_maiagent_api_key
MAIAGENT_CHATBOT_ID=your_chatbot_id
MAIAGENT_API_BASE=https://admin.maiagent.ai

# Telegram Bridge
TELEGRAM_PORT=3004
SERVER_PUBLIC_URL=https://xxxx.ngrok.io
```

---

## Phase 3：建立 Telegram Bridge 伺服器

### 新建 `telegram-bridge.js`

**核心功能：**
- Express 監聽 `POST /webhook`（接收 Telegram 訊息）
- `POST /telegram/set-webhook` 端點（手動設定 Telegram Webhook URL）
- 使用 `telegram_sessions.json` 儲存使用者 session：

```json
{
  "123456789": {
    "conversationId": "maiagent_conversation_id",
    "mondayUserId": "monday_user_id"
  }
}
```

**Telegram 指令：**

| 指令 | 功能 |
|------|------|
| `/start` | 歡迎訊息 + 使用說明 |
| `/login` | 產生 Monday OAuth URL 發給使用者 |
| `/boards` | 快速查詢看板（捷徑指令） |
| 一般文字訊息 | 轉發至 MaiAgent |

### 實作 `callMaiAgent()` 函式

```
POST https://admin.maiagent.ai/api/v1/chatbots/{chatbotId}/completions
Authorization: Api-Key MAIAGENT_API_KEY
Content-Type: application/json

{
  "conversation": "session.conversationId",
  "message": "使用者訊息（含 userId 上下文）"
}
```

- 首次訊息注入上下文：`"我的 Monday userId 是 {mondayUserId}"`
- 儲存回傳的 `conversationId` 到 session，保持對話連貫

### 修改 OAuth Callback 支援 Telegram 關聯

- `/oauth/authorize?telegramUserId=xxx` → state 參數帶入 telegramUserId
- OAuth callback 成功後：
  1. 讀取 state → 取得 telegramUserId
  2. 更新 `telegram_sessions.json`（寫入 mondayUserId）
  3. 呼叫 Telegram Bot API 通知使用者「✅ 授權成功！現在可以開始查詢 Monday 資料了」

---

## Phase 4：更新 package.json

新增啟動腳本：

```json
"telegram": "node telegram-bridge.js",
"telegram:dev": "nodemon telegram-bridge.js"
```

---

## Phase 5：設定 Telegram Webhook

1. 啟動 ngrok：`ngrok http 3004`
2. 設定 Webhook：

```
POST https://api.telegram.org/bot{TOKEN}/setWebhook
{"url": "https://xxxx.ngrok.io/webhook"}
```

或呼叫 Bridge 伺服器端點：`POST /telegram/set-webhook`

---

## 相關檔案清單

| 檔案 | 動作 | 說明 |
|------|------|------|
| `telegram-bridge.js` | **新建** | Bridge 伺服器主體 |
| `server.js` | **修改** | OAuth callback 支援 state=telegramUserId |
| `.env` | **修改** | 新增 Telegram / MaiAgent 環境變數 |
| `.env.example` | **修改** | 同步更新 |
| `package.json` | **修改** | 新增 telegram 腳本 |
| `telegram_sessions.json` | **自動建立** | 儲存 session 對應 |
| `mcp-server.js` | **不修改** | 已有完整工具 |

---

## 驗證步驟

1. 啟動所有服務：
   ```bash
   npm run mcp          # MCP Server (埠 3003)
   npm start            # OAuth Server (埠 3001)
   npm run telegram     # Telegram Bridge (埠 3004)
   ```
2. 執行 ngrok：`ngrok http 3003` 和 `ngrok http 3004`
3. Telegram 傳 `/start` → 確認收到歡迎訊息
4. Telegram 傳 `/login` → 點連結完成 Monday OAuth 授權 → 確認收到成功通知
5. Telegram 傳 `"幫我列出我的 Monday 看板"` → 確認 MaiAgent 回傳看板清單
6. Telegram 傳 `/boards` → 確認快速指令正常
7. 確認 `telegram_sessions.json` 正確記錄 `telegramUserId → mondayUserId`

---

## 技術決策

| 決策 | 理由 |
|------|------|
| 獨立 Bridge 伺服器，不修改 mcp-server.js | 保持 MCP Server 純粹，其他渠道（WhatsApp 等）也能共用 |
| 用 conversationId 保持對話上下文 | MaiAgent 能記住前幾輪對話，使用者不需重複說明 |
| Monday userId 注入對話上下文 | MCP 工具需要 userId 參數，首輪對話告知 AI 最簡單 |
| OAuth state 傳遞 telegramUserId | 授權完成後自動關聯帳號，使用者無需手動輸入 ID |

---

## 注意事項

1. **MaiAgent completions API 格式需實測確認**  
   參數名稱（`conversation` vs `conversation_id`，`message` vs `content`）依文件推測，實作後需先發一次請求驗證

2. **MaiAgent 目前無 Telegram 原生整合**  
   文件中提到支援 LINE / Messenger，Telegram 頁面 404 → 確認需使用此 Bridge 方案

3. **ngrok 免費版網址每次重啟會變動**  
   需同步更新 MaiAgent MCP 工具 URL 和 Telegram Webhook URL  
   生產環境建議改用固定網址（Railway / Heroku）

---

*計畫建立於 2026 年 3 月 26 日*
