# MaiAgent Contact 整合計畫：方案 A vs 方案 B

## 背景說明

目前 Telegram Bot 透過 `telegram-bridge.js` 直接呼叫 MaiAgent Chatbot Completions API，用戶資訊僅儲存在本地 `telegram_sessions.json`，不會出現在 MaiAgent 的 Contacts 列表中。

本文件評估三種讓用戶資訊出現在 MaiAgent Contacts 的方案，並附上研究結論。

---

## 方案 A：輕量整合（推薦優先評估）

### 概念

保留現有 Telegram Bridge 架構不動，僅在 OAuth 完成後，額外呼叫一次 MaiAgent Contacts API，把用戶資料「手動登記」進去。

### 架構示意

```
現有流程（不變）：
Telegram → telegram-bridge.js → MaiAgent Chatbot API → MCP → Monday

新增（只加這一段）：
OAuth 完成 → server.js 呼叫 POST /api/v1/contacts/ → Contact 出現在 MaiAgent 後台
```

### 需要的前置設定

1. 在 MaiAgent 後台建立一個 Inbox（任意類型，例如 Web 或自定義），命名如「Telegram Bot 用戶」
2. 取得該 Inbox 的 UUID
3. 在 `.env` 新增一行：
   ```
   MAIAGENT_INBOX_ID=<Inbox UUID>
   ```

### 程式碼改動

**只改 `server.js`，在 OAuth callback 成功後新增約 20 行。**

位置：`server.js` 第 395 行（通知 Telegram Bridge 之後）新增：

```javascript
// 自動建立 MaiAgent Contact
const maiAgentInboxId = process.env.MAIAGENT_INBOX_ID;
if (maiAgentApiKey && maiAgentInboxId) {
  try {
    await axios.post(
      'https://api.maiagent.ai/api/v1/contacts/',
      {
        name: userInfo.me.name,
        inboxes: [{ id: maiAgentInboxId }],
        sourceId: telegramUserId || null,
        metadata: [
          { key: 'mondayUserId', value: String(userId) },
          { key: 'telegramUserId', value: telegramUserId || '' },
          { key: 'email', value: userInfo.me.email || '' }
        ]
      },
      {
        headers: {
          Authorization: `Api-Key ${maiAgentApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`👤 MaiAgent Contact created for ${userInfo.me.name}`);
  } catch (contactErr) {
    console.warn(`⚠️  Could not create MaiAgent Contact: ${contactErr.message}`);
  }
}
```

### 完成後 Contacts 列表顯示效果

| 欄位 | 值 |
|------|-----|
| CONTACT NAME | Monday 帳號姓名（例如：陳小明） |
| PLATFORM | 你建的 Inbox 名稱（例如：Telegram Bot 用戶） |
| SOURCE ID | Telegram User ID（例如：987654321） |
| QUERY METADATA | - |
| metadata | mondayUserId、email（點進詳情可見） |

### 已知限制

- Contact 是**手動建立**的，與 MaiAgent 的對話紀錄**不會自動連結**
- 對話記錄仍在 MaiAgent 的 Conversations 中，但 Contact 和 Conversation 是分開的兩個資料集
- 若同一用戶重複授權（重新 /login），會建立**重複的 Contact**（除非加查重防護）

### 改動範圍

| 檔案 | 改動量 |
|------|--------|
| `server.js` | 新增約 20 行 |
| `.env` | 新增 1 個環境變數 |
| `telegram-bridge.js` | 不動 |
| `mcp-server.js` | 不動 |
| MaiAgent 後台 | 建立 1 個 Inbox（手動操作一次） |

### 開發工時估計

**0.5 ～ 1 小時**

---

## 方案 B：完整整合（MaiAgent Telegram Inbox）

> ⚠️ **研究結論：有根本性障礙，不建議直接執行。請參考 Hybrid B 方案。**

### 概念

把 Telegram Bot 完全改成透過 MaiAgent 的 **Telegram Inbox** 機制運作。MaiAgent 原生支援 Telegram，一旦接管後可自動建立 Contact、記錄對話。

### 架構示意

```
現有架構：
Telegram → telegram-bridge.js（自維護） → MaiAgent completions API → MCP → Monday

方案 B 架構：
Telegram → MaiAgent Telegram Inbox（MaiAgent 原生接管） → Chatbot → MCP → Monday
                      ↓
              自動建立 Contact + 對話記錄完整連結
```

### 研究確認支援的部分

- MaiAgent 文件明確列出 **LINE、FB Messenger、Telegram** 為支援的 Inbox 類型
- 透過 Telegram Inbox 進來的用戶，會**自動建立非匿名 Contact**（source ID = Telegram User ID）
- 對話記錄與 Contact **自動連結**，後台管理完整

### ❌ 根本性障礙：mondayUserId 無法注入

這是無法繞過的核心問題。

**`queryMetadata` 的用途是「限定知識庫查詢範圍」，不是對話 context 注入**

MaiAgent 文件明確說明：
> queryMetadata 是「限定查詢範圍的動態條件，指定使用者能查詢哪些知識庫、FAQ、文件」

MaiAgent 目前**沒有**類似 `{{contact.metadata.mondayUserId}}` 讓 System Prompt 讀取 Contact metadata 的機制。

**結構性衝突：**

| 現有架構 | 方案 B |
|----------|--------|
| 你的 server 收 Telegram webhook | MaiAgent 的 server 接管 Telegram webhook |
| 呼叫 completions API 時可自由注入 userId | MaiAgent 內部路由，你無法再介入注入邏輯 |
| mondayUserId 從 session 讀取並注入訊息 | 無對應機制，MCP 工具收不到 userId |

一旦 Telegram Bot 交由 MaiAgent Telegram Inbox 接管，`mondayUserId` 就無法傳給 MCP 工具，導致所有 Monday.com 功能完全失效。

### 評估過的替代做法（均有障礙）

| 做法 | 問題 |
|------|------|
| 把 mondayUserId 存在 Contact queryMetadata | queryMetadata 用於知識庫篩選，不注入對話 context |
| 用 mcpCredentials 欄位存 per-user token | 文件無說明此欄位如何在對話中被 MCP 使用 |
| System Prompt 靜態寫死 userId | 多用戶無法共用同一個 System Prompt |

### 開發工時估計

**不建議執行**（核心障礙目前無法解決）

---

## 方案 Hybrid B：Contact 連結 + 保留現有架構（推薦）

### 概念

在方案 A（建立 Contact）的基礎上，進一步讓每次對話**自動掛到對應的 Contact**，使 MaiAgent 後台的 Contact 頁面能看到完整對話記錄。不接管 Telegram Webhook，也完全不改變 mondayUserId 注入邏輯。

### 關鍵發現

`telegram-bridge.js` 呼叫的是 MaiAgent 官方的 completions API，這個 API 的 payload 支援帶入 `contactId`：

```
POST /api/v1/chatbots/{chatbotId}/completions/
{
  "message": { "role": "user", "content": "..." },
  "conversationId": "...",       ← 現有
  "contactId": "maiagent-uuid"   ← 新增這個
}
```

帶入後，這次對話就會自動出現在 Contact 的對話記錄中。

### 架構示意

```
Telegram → telegram-bridge.js → MaiAgent completions API（帶 contactId）→ MCP → Monday
                ↑                        ↑
           mondayUserId 注入邏輯不變    對話自動連結到 Contact
```

### 需要的前置設定

1. 先完成方案 A（建立 Contact，取得 `maiAgentContactId`）
2. 將 `maiAgentContactId` 存入 `telegram_sessions.json`

### 程式碼改動

**改動一：`server.js` OAuth callback**（在方案 A 的程式碼基礎上多加 3 行）

```javascript
const contactRes = await axios.post('https://api.maiagent.ai/api/v1/contacts/', { ... });
const maiAgentContactId = contactRes.data.id;  // ← 新增：儲存回傳的 UUID

// 通知 Telegram Bridge 時一併傳入
await axios.post(`${TELEGRAM_BRIDGE_URL}/telegram/oauth-success`, {
  telegramUserId,
  mondayUserId: userId,
  userName: userInfo.me.name,
  maiAgentContactId   // ← 新增
});
```

**改動二：`telegram-bridge.js` callMaiAgent 函式**（約 3 行）

```javascript
const payload = {
  message: { role: 'user', content: message }
};
if (conversationId) payload.conversationId = conversationId;
if (session?.maiAgentContactId) payload.contactId = session.maiAgentContactId;  // ← 新增
```

### 完成後效果

| 功能 | 結果 |
|------|------|
| Contact 出現在後台 | ✅ 有名字、有 Source ID（Telegram ID）、有 metadata |
| 對話記錄與 Contact 連結 | ✅ 每次對話自動連結，後台可直接查看 |
| mondayUserId 注入 | ✅ 原有邏輯完全不變 |
| 現有 /login /boards 等指令 | ✅ 完全不變 |
| 架構複雜度 | ✅ 幾乎不變 |

### 已知限制與注意事項

- **需要先驗證**：MaiAgent completions API 是否實際支援 `contactId` 參數（5 分鐘可測試）
- 若同一用戶重複授權（重新 /login），Contact 建立前需先查重，避免重複建立

### 改動範圍

| 檔案 | 改動量 |
|------|--------|
| `server.js` | 方案 A 的基礎上再加約 3 行 |
| `telegram-bridge.js` | 約 3 行（payload 加欄位） |
| `.env` | 新增 1 個環境變數（同方案 A） |
| `mcp-server.js` | 不動 |
| MaiAgent 後台 | 建立 1 個 Inbox（同方案 A） |

### 開發工時估計

**1 ～ 2 小時**（含測試 `contactId` 參數支援度）

---

## 方案比較表

| 比較項目 | 方案 A（輕量） | 方案 B（Inbox 接管） | **Hybrid B（推薦）** |
|----------|:------------:|:------------:|:------------:|
| 改動量 | 極小（20 行） | 大（重寫核心） | 極小（方案 A + 3 行） |
| 開發工時 | 0.5 ～ 1 小時 | ~~2 ～ 5 天~~ 不建議 | **1 ～ 2 小時** |
| Contact 出現在後台 | ✅ 有 | ✅ 有 | ✅ 有 |
| 對話記錄與 Contact 連結 | ❌ 分離 | ✅ 完整連結 | **✅ 自動連結** |
| 現有功能中斷風險 | 極低 | ~~中高~~ **根本性障礙** | **極低（架構不變）** |
| MaiAgent 依存度 | 低 | 高（且有障礙） | 低 |
| mondayUserId 傳遞 | 現有機制不變 | ❌ 無法解決 | **現有機制完全不變** |
| 後台管理完整性 | 中 | 無法執行 | **高（Contact + 對話連結）** |
| 可執行性 | ✅ | ❌ | **✅** |

---

## 建議路線

**直接執行 Hybrid B**

方案 B（Telegram Inbox 接管）已透過官方文件研究確認有根本性障礙（`queryMetadata` 僅用於知識庫篩選，無法注入對話 context），現有 `mondayUserId` 注入機制在接管後完全失效。

Hybrid B 在方案 A 的基礎上只需再加 3 行程式碼，即可同時達到：
- ✅ Contact 出現在 MaiAgent 後台
- ✅ 對話記錄自動連結到 Contact
- ✅ 現有所有功能完全不受影響

**執行步驟（建議順序）**：
1. 先用 5 分鐘驗證 completions API 支援 `contactId` 參數：
   ```bash
   curl -X POST https://api.maiagent.ai/api/v1/chatbots/{chatbotId}/completions/ \
     -H "Authorization: Api-Key YOUR_KEY" \
     -H "Content-Type: application/json" \
     -d '{"message":{"role":"user","content":"test"},"contactId":"fake-uuid"}'
   # 若回傳 400 錯誤說明不支援；若 200 則支援
   ```
2. 確認支援後，依 Hybrid B 章節實作 `server.js` + `telegram-bridge.js` 改動
3. 測試新用戶 OAuth 流程，確認 Contact 建立並對話連結正常

---

*產生日期：2026-04-13*
