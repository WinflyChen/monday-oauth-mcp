# LINE × MaiAgent × Monday.com 整合方案評估

> **文件版本：** 2026-04-14 (基於 Telegram 實現經驗重新評估)
> **目的：** 基於已驗證的 Telegram + MaiAgent + Monday.com 架構，評估 LINE 整合的可行性與方案選擇。
> **評估人：** Kevin
> **當前狀態：** Telegram 系統已完全實現，3 個用戶已授權，多用戶隔離驗證通過 ✅

---

## 當前 Telegram 系統實現總結

### ✅ 已驗證完成的功能

| 模塊 | 狀態 | 備註 |
|------|------|------|
| **OAuth 授權流程** | ✅ 完成 | Monday.com 授權 3 個用戶成功 |
| **多用戶隔離** | ✅ 驗證通過 | Token 隔離、userId 驗證、系統提示強制 |
| **MaiAgent 集成** | ✅ 完成 | 通過系統提示強制 userId，防止越權 |
| **MCP 工具調用** | ✅ 完成 | 服務端驗證 userId，Token 存儲隔離 |
| **Telegram Webhook** | ✅ 完成 | Cloudflare Tunnel (ships-yet-scout-okay.trycloudflare.com) |
| **Data Storage** | ✅ 完成 | tokens.json + telegram_sessions.json |
| **命令系統** | ✅ 完成 | /login, /logout, /status, /reset, /boards |

### ⚠️ 發現的問題與解決方案

| 問題 | 原因 | 解決方案 | 狀態 |
|------|------|---------|------|
| OAuth redirect_uri 不匹配 | 配置錯誤 | 更新 MONDAY_REDIRECT_URI 到正確的 Tunnel URL | ✅ 已修復 |
| Tunnel URL 頻繁變動 | 使用臨時 Tunnel | 需改用 Cloudflare Named Tunnel 或自建反向代理 | ⚠️ 需改進 |
| 多條 Tunnel 管理複雜 | OAuth 和 Webhook 需分離 | 已實現兩條獨立 Tunnel 方案 | ✅ 已改進 |

### 🔐 安全架構驗證

```
Telegram ID → Telegram Session
    ↓
查詢 telegram_sessions.json
    ↓
提取 mondayUserId
    ↓
系統提示強制注入 userId (第 1 層防護)
    ↓
MaiAgent 調用工具參數包含 userId
    ↓
mcp-server.js 驗證 userId 非空 (第 2 層防護)
    ↓
tokens.json['mondayUserId'] 獲取 token (第 3 層防護)
    ↓
Monday API 調用 (隔離完成)
```

**多用戶隔離：** ✅ 完全驗證，3 條獨立 Token，互相無法越權

---

## Telegram 現有架構圖

```
Telegram Event
    ↓
Cloudflare Tunnel (2 條)
├─ OAuth Tunnel: https://opt-lauren-spirits-representations.trycloudflare.com (port 3001)
└─ Webhook Tunnel: https://ships-yet-scout-okay.trycloudflare.com (port 3004)
    ↓
telegram-bridge.js (Port 3004)
├─ /webhook ← Telegram messages
├─ /telegram/set-webhook
├─ /telegram/oauth-success ← OAuth callback
└─ /health
    ↓
MaiAgent Chatbot
├─ System Prompt (強制 userId)
└─ MCP Tool Call
    ↓
mcp-server.js (Port 3003)
├─ 驗證 userId
├─ 查詢 tokens.json
└─ GraphQL → Monday API
    ↓
Monday.com
```

---

## LINE 整合方案重新評估

基於 Telegram 已驗證的架構，LINE 集成將採用**完全相同的模式**：

### 架構模式 (無需改動核心)

```
LINE Event ────→ line-bridge.js (新建，Port 3006)
                      ↓
                MaiAgent Chatbot ✅ 複用
                (系統提示強制 userId)
                      ↓
                mcp-server.js ✅ 複用
                (驗證 + Token 隔離)
                      ↓
                Monday.com API ✅ 複用
```

**核心優勢：** 
- MCP Server、MaiAgent 配置**完全不變**
- Monday OAuth 流程**完全不變**
- Token 管理、用户隔離邏輯**完全複用**
- 只需新增 `line-bridge.js` + `line_sessions.json`

---

## 三大方案比較

### 方案 A｜LINE Official Account API（官方）✅ **推薦**

| 項目 | 說明 |
|------|------|
| **費用** | 免費方案 + 選用功能計費（API 基本免費，訊息計費可選） |
| **技術** | HTTP Webhook，與 Telegram bridge **完全相同模式** |
| **申請門檻** | 需要 LINE 開發者帳號 + **LINE Official Account** |
| **帳號類型** | 可用個人帳號或公司帳號，無需企業認證 |
| **訊息限制** | 用戶可自行添加帳號，無須等待批准 |
| **沙盒測試** | 可直接在 LINE Developers 建立 Test Bot |
| **穩定性** | ★★★★★ 官方 API，日本上市企業 (LINE Corporation)，SLA 保障，在亞太地區穩定性極高 |
| **User Base** | 全球 2 億用戶，亞洲最受歡迎的通訊軟體 |
| **Tunnel 需求** | 需要 1 條獨立 Tunnel（參考 Telegram 已驗證的配置） |
| **已驗證要點** | ✅ webhook 模式 ✅ 多用戶隔離 ✅ OAuth 流程 ✅ MaiAgent 集成 |

**實施步驟：**
1. 申請 LINE 開發者帳號 (免費)
2. 創建 LINE Official Account + Channel
3. 開發 `line-bridge.js` (參考 telegram-bridge.js)
4. 測試 webhook 接收 + userId 驗證

**特別優勢：**
- 無需企業認證（Telegram 優勢）
- 申請快速（通常 10 分鐘內完成）
- LINE 在亞洲普及率極高，用戶量龐大

---

### 方案 B｜Twilio LINE API

| 項目 | 說明 |
|------|------|
| **費用** | Twilio 平台費 + API 費用（整體高於方案 A） |
| **申請門檻** | 只需 Twilio 帳號，**快速 PoC** |
| **技術** | HTTP Webhook，與 Telegram 架構相同 |
| **沙盒測試** | 方便，但需要綁定 Twilio 帳號 |
| **穩定性** | ★★★★☆ 依賴 Twilio 中間層 |
| **適合用途** | 快速驗證 PoC；公司已有 Twilio 帳號 |

**適用情境：** 
- 需要立即驗證整合可行性
- 公司尚未申請 LINE Official Account

---

### 方案 C｜Messaging API SDK（非官方第三方）❌ **不建議**

| 項目 | 說明 |
|------|------|
| **風險** | ⚠️ LINE SDK 版本更新頻繁，維護成本高 |
| **技術支持** | ★★☆☆☆ 依賴第三方社群，官方支持有限 |
| **適合用途** | 僅限內部短期測試，**不建議生產使用** |

---

## LINE 特有優勢分析

### 📱 為什麼 LINE 比 WhatsApp 和 Telegram 更適合亞洲市場

| 因素 | LINE | WhatsApp | Telegram |
|------|------|---------|----------|
| **亞洲用戶基數** | ⭐⭐⭐⭐⭐ 2 億 | ⭐⭐ 低 | ⭐⭐⭐ 中等 |
| **企業整合成熟度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **官方支持** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **申請難度** | ⭐⭐⭐⭐⭐ (極簡) | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **本地化程度** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| **消息樣式豐富度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **Button / Card 支持** | ✅ 完全支持 | ✅ 部分支持 | ✅ 完全支持 |
| **Rich Menu 功能** | ✅ 是 | ❌ 否 | ❌ 否 |

### 🎨 LINE Rich Menu 優勢

LINE 獨有的 **Rich Menu** 功能可以為用戶提供：
```
┌─────────────────────────────────────┐
│     LINE Official Account          │
├─────────────────────────────────────┤
│                                     │
│  🏠 首頁    📊 看板    ⚙️ 設定     │
│  ❓ 幫助    📞 聯絡    🔓 登入     │  ← Rich Menu
│                                     │
├─────────────────────────────────────┤
│ 請告訴我您需要幫助 ✨                 │
└─────────────────────────────────────┘
```

這提供了比 Telegram 命令更直觀的用戶體驗！

### 💬 LINE LIFF（LINE Front-end Framework）

LINE 支持 LIFF，可以嵌入 Web 應用程序，用於：
- OAuth 授權頁面（可在 LINE 內直接完成）
- Monday.com 看板預覽
- 複雜表單填寫

**與 Telegram 相比的優勢：** 更完整的應用程序體驗

---

## 實施規模 (基於 Telegram 經驗估算)

### 開發工時預估：**2–3 工作天**

#### 1. `line-bridge.js` 開發 (參考 telegram-bridge.js)

```javascript
// Path: line-bridge.js
// 功能與 telegram-bridge.js 幾乎完全相同
- 初始化 LINE SDK (line/bot-sdk)
- startSession() → 讀 line_sessions.json
- callMaiAgent() → 系統提示強制 userId（完全複用邏輯）
- handleLogin() → 產生 OAuth 連結
- handleStatus() → 查看登入狀態
- handleLogout() → 清除授權
- /webhook 端點接收 LINE 訊息
- Rich Menu 初始化與按鈕處理

估計行數: 350–400 行 (參考 telegram-bridge.js + LINE Rich Menu 邏輯)
```

#### 2. `server.js` 修改 (最小化)

```javascript
// 在 OAuth callback 完成後新增通知
if (lineUserId) {
  await axios.post(`${LINE_BRIDGE_URL}/line/oauth-success`, {
    lineUserId,
    mondayUserId: userId,
    userName: userInfo.me.name
  });
}
```

**修改行數：** ~10 行

#### 3. 配置與部署

- 新建 `line_sessions.json` ✅ 自動產生
- 新建 `line_rich_menu_config.json` (Rich Menu 定義)
- 更新 `.env`:
  ```env
  LINE_CHANNEL_ACCESS_TOKEN=xxx
  LINE_CHANNEL_SECRET=xxx
  LINE_RICH_MENU_ID=xxx
  LINE_BRIDGE_URL=http://localhost:3006
  ```
- 配置 Cloudflare Tunnel：
  ```bash
  cloudflared tunnel --url http://localhost:3006
  ```

**預估時間：** 0.5 工作天

#### 4. LINE Rich Menu 設計 (可選增強)

```
基本版本 (直接使用文本命令，複用 Telegram 邏輯)
  ├─ /login
  ├─ /logout  
  ├─ /status
  └─ /boards

Enhanced 版本 (含 Rich Menu 按鈕)
  ├─ 🔓 登入
  ├─ 🚪 登出
  ├─ 📊 查看看板
  └─ ⚙️ 設定
```

**預估時間：** 0.5–1 工作天（可選）

#### 5. 測試

- Webhook 接收驗證
- userId 隔離測試
- OAuth 流程驗證
- MaiAgent 系統提示效果
- Rich Menu 按鈕功能

**預估時間：** 0.5–1 工作天

---

## 已驗證的架構優勢

### ✅ 無需修改的現有組件

| 組件 | 原因 |
|------|------|
| **MCP Server** | userID 驗證邏輯已通用化，任何 bridge 都可用 |
| **MaiAgent** | 系統提示模式適用所有消息渠道 |
| **Monday OAuth** | Token 存儲邏輯 (按 mondayUserId) 完全通用 |
| **tokens.json** | 格式通用，直接複用 |
| **多用戶隔離** | 三層防護 (提示 + 驗證 + Token) 完全適用 |

### ✅ 已驗證的通訊模式

```
任何 Bridge (Telegram / LINE / WhatsApp / Slack / ...)
    ↓ (系統提示強制 userId)
MaiAgent
    ↓ (MCP 工具調用，包含 userId)
mcp-server.js
    ↓ (驗證 userId + 查詢 token)
Monday API
```

**這個模式已用 3 個真實用戶驗證通過，完全適用於 LINE。**

---

## 現存風險與對策

### 🟡 Tunnel URL 不穩定

**當前問題：**
- Cloudflare 临时 tunnel 每次重启生成新 URL
- OAuth redirect_uri 需要频繁更新

**已驗證的應對：**
- 使用 2 條獨立 Tunnel (OAuth 一條，Webhook 一條)
- 配置持久化 Named Tunnel (需要 Cloudflare 帳戶)

**LINE 方案：**
- 同樣採用獨立 Tunnel
- 需要更新腳本自動化 Tunnel URL 維護（可參考 Telegram 經驗）

### 🟡 LINE API 版本更新

**風險：** LINE 定期更新 API，SDK 需同步更新

**應對：**
- 使用官方 LINE Node.js SDK (line/bot-sdk)，由 LINE 官方維護
- 定期檢查版本更新，提前測試
- 使用 npm 語義化版本控制 (~版本可接受小更新)

### 🟡 OAuth 配置錯誤

**當前已解決：** ✅
- MONDAY_REDIRECT_URI
- SERVER_URL
- OAUTH_SERVER_URL

**LINE 新增：**
- 需要驗證 LINE Login 的正確流程
- 確保 Redirect URI 在 LINE Developers Console 提前註冊

---

## 建議行動方案

### 第 1 階段：快速驗證（本週）
```
✅ 已完成
├─ Telegram 架構驗證完成
├─ 多用戶隔離驗證通過
└─ 3 個真實用戶授權成功
```

### 第 2 階段：LINE PoC（下週）
```
選項 A (推薦): LINE Official Account + Developers
├─ 申請 LINE 開發者帳號 + Official Account (~30 分鐘)
├─ 開發 line-bridge.js (~1 日)
├─ 配置 LINE Webhook (~0.5 日)
├─ 測試隔離邏輯 (~0.5 日)
└─ 驗收完成 (2 日內)

選項 B (快速): Twilio LINE API
├─ 使用 Twilio 預設配置 (~0.5 日)
├─ 快速測試整合 (~1 日)
└─ 驗收完成 (1–2 日內)
```

### 第 3 階段：生產部署（1–2 週後）
```
├─ 優化 Rich Menu 與 LFF 體驗
├─ 搭建生產環境獨立 Tunnel
├─ 建立監控與告警
└─ 正式上線 LINE Official Account
```

---

## 需要確認的關鍵問題

1. **使用情境**：LINE 整合是對外客戶服務，還是內部員工使用？
   - 對外 → 需要公開發佈 Official Account
   - 內部 → 可先用 Test Bot 進行長期測試

2. **時間優先級**：是否需要立即 Demo？
   - 是 → 建議按方案 A 快速申請 (30 分鐘完成基本設定)
   - 否 → 仍然推薦方案 A，更穩定、費用更低

3. **用戶體驗**：是否需要 Rich Menu 和 LIFF 等高級功能？
   - 是 → 預計額外 1 工作天設計與開發
   - 否 → 基本版本 2 日內完成

4. **多用戶支持**：LINE 用戶是否各自做 Monday OAuth？
   - 是 → 完全複用目前 Telegram 的隔離架構 ✅
   - 否 → 改為共用一個服務帳號 token (需調整)

5. **對標對象**：是否計劃同時支持 Telegram、LINE、WhatsApp？
   - 是 → 當前架構已支持，可按優先級逐步部署
   - 否 → 先專注 LINE，後續擴展

---

## LINE vs Telegram：功能對比

| 功能 | LINE | Telegram |
|------|------|----------|
| **訊息樣式** | ✅ 卡片、按鈕、Rich Menu | ✅ Inline Keyboard |
| **檔案共享** | 最大 200MB | 最大 20MB |
| **群組支持** | ✅ 是 | ✅ 是 |
| **自動回覆** | ✅ 是 (需設定) | ✅ 是 |
| **API 穩定性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **亞洲普及率** | 極高 | 中等 |
| **企業應用案例** | 極多 | 中等偏低 |
| **Web 應用支持** | ✅ LIFF | ❌ 無 |
| **申請難度** | 極簡 (10 分鐘) | 簡 (5 分鐘) |
| **費用** | 免費基礎 + 按量計費 | 完全免費 |

---

## 已驗證的架構文檔

📄 詳細映射文檔：[USER_ID_MAPPING.md](USER_ID_MAPPING.md)

核心內容：
- ✅ Telegram ID → Monday ID → Token 映射驗證
- ✅ 三層隔離防護機制
- ✅ 3 個真實用戶的完整數據流

**對 LINE 的適用性：** 只需替換 `telegramId` 為 `lineUserId`，邏輯完全通用 ✅

---

## LINE Messaging API 快速開始

### 申請流程（預計 10 分鐘）

1. **申請 LINE 開發者帳號**
   - 訪問 https://developers.line.biz/en/
   - 使用 LINE 帳號或 Email 註冊
   - 完成身份驗證

2. **建立 Channel**
   - LINE Developers Console → Create a new channel
   - 選擇 "Messaging API"
   - 填寫基本信息 (名稱、類別、說明)

3. **獲取認證信息**
   ```
   Channel Access Token: xxxx (用於 API 調用)
   Channel Secret: xxxx (用於 Webhook 驗證)
   ```

4. **設定 Webhook**
   - 輸入 Webhook URL: `https://your-tunnel-domain.trycloudflare.com/webhook`
   - 上傳服務器 SSL 憑證 (如需)
   - 點擊 "驗證"

5. **測試 Bot**
   - 掃描 QR Code 添加 Bot 好友
   - 發送訊息測試

---

## 結論

### 📊 LINE 整合可行性評估

| 維度 | 評分 | 說明 |
|------|:----|------|
| **技術可行性** | ⭐⭐⭐⭐⭐ | 基於 Telegram 架構已驗證，複用度 95% 以上 |
| **開發成本** | ⭐⭐⭐⭐⭐ | 預計 2–3 工作天 (低風險) |
| **申請難度** | ⭐⭐⭐⭐⭐ | 極簡，10 分鐘內完成申請 |
| **多用戶隔離** | ⭐⭐⭐⭐⭐ | 已驗證 3 個用戶，邏輯完全通用 |
| **穩定性** | ⭐⭐⭐⭐⭐ | 官方 API，日本上市企業支持，SLA 保障 |
| **亞洲適配度** | ⭐⭐⭐⭐⭐ | 最適合亞洲市場，2 億用戶基數 |
| **長期維護** | ⭐⭐⭐⭐⭐ | 架構設計良好，官方支持強大 |

### ✅ **強烈推薦優先實施**

**主要理由：**
1. 架構已驗證，技術風險極低
2. 開發工時短 (2–3 日)
3. 申請極為簡單 (10 分鐘)
4. 多用戶隔離已完全驗證
5. 無需修改核心組件 (MCP、MaiAgent、tokens)
6. 現有 Telegram 經驗可直接套用
7. **對亞洲市場最友善** ← LINE 獨有優勢
8. Rich Menu 和 LIFF 提供更好的用戶體驗

### 📈 建議優先順序

```
1. 🥇 LINE Official Account (推薦首先)
   └─ 原因：申請最簡單，市場最契合，體驗最好
   
2. 🥈 Telegram (已完成)
   └─ 原因：已穩定運行，3 個用戶已授權
   
3. 🥉 WhatsApp (後續選項)
   └─ 原因：申請複雜，但對歐美市場友善
```

---

**評估人：** Kevin  
**評估日期：** 2026-04-14  
**基於：** 3 個成功授權用戶 + 多用戶隔離驗證通過 + Telegram 完整架構  
**下一步：** 確認上述 5 個關鍵問題，即可開始第 2 階段開發  
**預期交付時間：** 2 工作天內完成基本 PoC  

---

## 附錄：LINE Official Account 與 Business Account 區別

| 特性 | Official Account | Business Account |
|------|:---:|:---:|
| **申請門檻** | 最低 | 需認證 |
| **用戶添加** | 用戶主動搜尋+掃 QR | 管理員邀請 |
| **訊息推送** | ✅ 是 | ✅ 是 |
| **One-way 訊息** | ✅ 是 | ✅ 是 |
| **對話模式** | ✅ 是 | ✅ 是 |
| **Rich Menu** | ✅ 是 | ✅ 是 |
| **LIFF 支持** | ✅ 是 | ✅ 是 |
| **推薦用途** | 對外客戶服務 | 內部企業應用 |

**對本項目的建議：** 如果是對外使用，建議從 Official Account 開始 ✅

