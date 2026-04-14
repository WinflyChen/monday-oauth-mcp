# WhatsApp × MaiAgent × Monday.com 整合方案評估

> **文件版本：** 2026-04-14 (已根據 Telegram 實現經驗重新評估)
> **目的：** 基於已驗證的 Telegram + MaiAgent + Monday.com 架構，評估 WhatsApp 整合的可行性與方案選擇。
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

## WhatsApp 整合方案重新評估

基於 Telegram 已驗證的架構，WhatsApp 集成將採用**完全相同的模式**：

### 架構模式 (無需改動核心)

```
WhatsApp Event ────→ whatsapp-bridge.js (新建，Port 3005)
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
- Token 管理、用户隔离邏輯**完全複用**
- 只需新增 `whatsapp-bridge.js` + `whatsapp_sessions.json`

---

## 三大方案比較 (更新版)

### 方案 A｜Meta Cloud API（官方）✅ **推薦**

| 項目 | 說明 |
|------|------|
| **費用** | 免費額度：每月前 1,000 則對話免費；超出按對話計費 |
| **技術** | HTTP Webhook，與 Telegram bridge **完全相同模式** |
| **申請門檻** | 需要 Meta 開發者帳號 + **Meta Business 驗證** |
| **電話號碼** | 需要一支未綁定個人 WhatsApp 的門號 |
| **訊息限制** | 用戶必須先主動傳訊（或使用 Template Message） |
| **沙盒測試** | 可直接在 Meta Developer Portal 測試 |
| **穩定性** | ★★★★★ 官方 API，SLA 保障，已驗證 Telegram 架構完全適用 |
| **Tunnel 需求** | 需要 1 條獨立 Tunnel（參考 Telegram 已驗證的配置） |
| **已驗證要點** | ✅ webhook 模式 ✅ 多用戶隔離 ✅ OAuth 流程 ✅ MaiAgent 集成 |

**實施步驟：**
1. 申請 Meta Business 帳號 + 驗證
2. 創建 WhatsApp Business App
3. 開發 `whatsapp-bridge.js` (參考 telegram-bridge.js)
4. 測試 webhook 接收 + userId 驗證

---

### 方案 B｜Twilio WhatsApp API

| 項目 | 說明 |
|------|------|
| **費用** | Twilio 平台費 + API 費用（整體高於方案 A） |
| **申請門檻** | 只需 Twilio 帳號，**快速 PoC** |
| **技術** | HTTP Webhook，與 Telegram 架構相同 |
| **沙盒測試** | 極為方便，掃 QR Code 即可測試 |
| **穩定性** | ★★★★☆ 依賴 Twilio 中間層 |
| **適合用途** | 快速驗證 PoC（1–2 天內可有 Demo） |

**適用情境：** 
- 需要立即驗證整合可行性
- 公司尚未申請 Meta 資格

---

### 方案 C｜whatsapp-web.js（非官方）❌ **不建議**

| 項目 | 說明 |
|------|------|
| **風險** | ⚠️ WhatsApp 明確禁止自動化個人帳號，**永久封號風險高** |
| **維護** | ★★☆☆☆ WhatsApp 更新後容易失效 |
| **適合用途** | 僅限內部短期測試，**絕對不建議生產使用** |

---

## 實施規模 (基於 Telegram 經驗估算)

### 開發工時預估：**2–3 工作天**

#### 1. `whatsapp-bridge.js` 開發 (參考 telegram-bridge.js)

```javascript
// Path: whatsapp-bridge.js
// 功能與 telegram-bridge.js 幾乎完全相同
- 初始化 WhatsApp 連接
- startSession() → 讀 whatsapp_sessions.json
- callMaiAgent() → 系統提示強制 userId（完全複用邏輯）
- handleLogin() → 產生 OAuth 連結
- handleStatus() → 查看登入狀態
- handleLogout() → 清除授權
- /webhook 端點接收 WhatsApp 消息

估計行數: 300–350 行 (直接改編 telegram-bridge.js)
```

#### 2. `server.js` 修改 (最小化)

```javascript
// 在 OAuth callback 完成後新增通知
if (whatsappUserId) {
  await axios.post(`${WHATSAPP_BRIDGE_URL}/whatsapp/oauth-success`, {
    whatsappUserId,
    mondayUserId: userId,
    userName: userInfo.me.name
  });
}
```

**修改行數：** ~10 行

#### 3. 配置與部署

- 新建 `whatsapp_sessions.json` ✅ 自動產生
- 更新 `.env`:
  ```env
  WHATSAPP_TOKEN=xxx
  WHATSAPP_PHONE_NUMBER_ID=xxx
  WHATSAPP_VERIFY_TOKEN=xxx
  WHATSAPP_API_VERSION=v18.0
  WHATSAPP_BRIDGE_URL=http://localhost:3005
  ```
- 配置 Cloudflare Tunnel：
  ```bash
  cloudflared tunnel --url http://localhost:3005
  ```

**預估時間：** 0.5 工作天

#### 4. 測試

- Webhook 接收驗證
- userId 隔離測試
- OAuth 流程驗證
- MaiAgent 系統提示效果

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
任何 Bridge (Telegram / WhatsApp / Slack / ...)
    ↓ (系統提示強制 userId)
MaiAgent
    ↓ (MCP 工具調用，包含 userId)
mcp-server.js
    ↓ (驗證 userId + 查詢 token)
Monday API
```

**這個模式已用 3 個真實用戶驗證通過，完全適用於 WhatsApp。**

---

## 現存風險與對策

### 🟡 Tunnel URL 不穩定

**當前問題：**
- Cloudflare 临时 tunnel 每次重启生成新 URL
- OAuth redirect_uri 需要频繁更新

**已驗證的應對：**
- 使用 2 條獨立 Tunnel (OAuth 一條，Webhook 一條)
- 配置持久化 Named Tunnel (需要 Cloudflare 帳戶)

**WhatsApp 方案：**
- 同樣採用獨立 Tunnel
- 需要更新腳本自動化 Tunnel URL 維護（可參考 Telegram 經驗）

### 🟡 OAuth 配置錯誤

**當前已解決：** ✅
- MONDAY_REDIRECT_URI
- SERVER_URL
- OAUTH_SERVER_URL

**WhatsApp 新增：**
- 需要驗證 Meta 的 webhook verify token 機制

---

## 建議行動方案 (修訂版)

### 第 1 階段：快速驗證（本週）
```
✅ 已完成
├─ Telegram 架構驗證完成
├─ 多用戶隔離驗證通過
└─ 3 個真實用戶授權成功
```

### 第 2 階段：WhatsApp PoC（下週）
```
選項 A (推薦): Meta Cloud API Sandbox
├─ 開發 whatsapp-bridge.js (~1 日)
├─ 配置 Meta Webhook (~0.5 日)
├─ 測試隔離邏輯 (~0.5 日)
└─ 驗收完成 (2 日內)

選項 B (快速): Twilio Sandbox
├─ 使用 Twilio 預設配置 (~0.5 日)
├─ 快速測試整合 (~1 日)
└─ 驗收完成 (1–2 日內)
```

### 第 3 階段：生產部署（2–3 週後）
```
├─ 向 Meta 申請 Business 驗證 (1–2 週等待)
├─ 準備專屬電話號碼
├─ 部署正式 Meta Cloud API
└─ 建立生產環境監控
```

---

## 需要確認的關鍵問題

1. **使用情境**：WhatsApp 整合是對外客戶服務，還是內部員工使用？
   - 對外 → 需要 Meta Business 驗證
   - 內部 → 可先用 Twilio Sandbox 或個人帳號測試

2. **時間優先級**：是否需要立即 Demo？
   - 是 → 建議先用 Twilio Sandbox (1–2 日可交付)
   - 否 → 直接申請 Meta 資格 (費用低、穩定性高)

3. **費用預算**：是否接受 Meta Cloud API 按量計費？
   - 是 → 方案 A (官方、最穩定、費用低)
   - 否 → 方案 B (Twilio、固定費用)

4. **多用戶支持**：WhatsApp 用戶是否各自做 Monday OAuth？
   - 是 → 完全複用目前 Telegram 的隔離架構 ✅
   - 否 → 改為共用一個服務帳號 token (需調整)

---

## 已驗證的架構文檔

📄 詳細映射文檔：[USER_ID_MAPPING.md](USER_ID_MAPPING.md)

核心內容：
- ✅ Telegram ID → Monday ID → Token 映射驗證
- ✅ 三層隔離防護機制
- ✅ 3 個真實用戶的完整數據流

---

## 結論

### 📊 WhatsApp 整合可行性評估

| 維度 | 評分 | 說明 |
|------|:----|------|
| **技術可行性** | ⭐⭐⭐⭐⭐ | 基於 Telegram 架構已驗證，複用度 95% 以上 |
| **開發成本** | ⭐⭐⭐⭐ | 預計 2–3 工作天 (低風險) |
| **多用戶隔離** | ⭐⭐⭐⭐⭐ | 已驗證 3 個用戶，邏輯完全通用 |
| **穩定性** | ⭐⭐⭐⭐ | 基於官方 API，SLA 保障 |
| **長期維護** | ⭐⭐⭐⭐ | 架構設計良好，擴展性強 |

### ✅ **強烈推薦實施**

**主要理由：**
1. 架構已驗證，技術風險極低
2. 開發工時短 (2–3 日)
3. 多用戶隔離已完全驗證
4. 無需修改核心組件 (MCP、MaiAgent、tokens)
5. 現有 Telegram 經驗可直接套用

**建議優先順序：**
1. **方案 A (Meta Cloud API)** ← 長期首選，費用最低，穩定性最高
2. **方案 B (Twilio)** ← 快速 PoC 或缺乏 Meta 驗證時使用
3. **方案 C (whatsapp-web.js)** ← 不建議，風險太高

---

**評估人：** Kevin  
**評估日期：** 2026-04-14  
**基於：** 3 個成功授權用戶 + 多用戶隔離驗證通過  
**下一步：** 確認上述 4 個關鍵問題，即可開始第 2 階段開發

---

## 三大方案比較

### 方案 A｜Meta Cloud API（官方）

| 項目 | 說明 |
|------|------|
| **費用** | 免費額度：每月前 1,000 則對話免費；超出按對話計費（約 $0.005–$0.08/對話，依地區） |
| **技術** | 純 HTTP Webhook，與現有 Telegram bridge 架構完全一致 |
| **申請門檻** | 需要 Meta 開發者帳號 + **Meta Business 驗證**（需上傳公司文件） |
| **電話號碼** | 需要一支未綁定個人 WhatsApp 的門號 |
| **訊息限制** | 用戶必須先主動傳訊（或使用 Template Message）才能由 Bot 發起 |
| **沙盒測試** | 可直接在 Meta Developer Portal 測試，免申請即可體驗 |
| **穩定性** | ★★★★★ 官方 API，SLA 保障 |
| **資料主權** | 訊息經過 Meta 伺服器 |

**適合情境：** 公司有 Meta Business 帳號、需要對外客戶服務、長期正式使用。

---

### 方案 B｜Twilio WhatsApp API

| 項目 | 說明 |
|------|------|
| **費用** | Twilio 平台費 + WhatsApp 對話費（底層仍是 Meta Cloud API），費用比直接用 Meta 稍高 |
| **技術** | HTTP Webhook，與現有架構一致 |
| **申請門檻** | 只需 Twilio 帳號即可，**Sandbox 幾分鐘內可測試** |
| **沙盒測試** | 極為方便，掃 QR Code 即可測試 |
| **穩定性** | ★★★★☆ 依賴 Twilio 中間層 |
| **資料主權** | 訊息經過 Twilio + Meta 兩層伺服器 |

**適合情境：** 需要快速 PoC 驗證（1–2 天內可有 Demo）、或已有 Twilio 帳號。

---

### 方案 C｜whatsapp-web.js（非官方）

| 項目 | 說明 |
|------|------|
| **費用** | 完全免費，使用一般 WhatsApp 個人帳號 |
| **技術** | 需要 Node.js + Puppeteer + Chrome，用 QR Code 掃描登入帳號 |
| **申請門檻** | 無需任何申請，一支手機號碼即可 |
| **沙盒測試** | 即裝即用 |
| **封號風險** | ⚠️ WhatsApp 明確禁止自動化個人帳號，**有永久封號風險** |
| **穩定性** | ★★☆☆☆ WhatsApp 更新後可能失效，維護成本高 |
| **資料主權** | 訊息在自己的伺服器處理 |

**適合情境：** 僅限內部非正式測試，**不建議用於生產環境**。

---

## 方案對比總表

| 比較維度 | Meta Cloud API | Twilio API | whatsapp-web.js |
|----------|:--------------:|:----------:|:---------------:|
| 費用 | 免費額度 + 按量 | 較高 | 免費 |
| 申請難度 | 中（需 Meta 驗證） | 低 | 無 |
| 技術複雜度 | 低 | 低 | 高 |
| 上線速度 | 1–2 週 | 1–2 天 | 1 天 |
| 穩定性 | 極高 | 高 | 低 |
| 封號風險 | 無 | 無 | 高 |
| 適合生產 | ✅ | ✅ | ❌ |
| **推薦** | ⭐ 長期首選 | ⭐ 快速 PoC | 僅測試 |

---

## 技術實作規模評估

無論選擇 A 或 B，技術工程量如下：

1. **新建** `whatsapp-bridge.js`（約 300–400 行，參考 `telegram-bridge.js`）
2. **修改** `server.js`：OAuth 完成後多通知一個 `/whatsapp/oauth-success`
3. **新建** `whatsapp_sessions.json`（自動產生）
4. **新增** `.env` 環境變數：
   - `WHATSAPP_TOKEN`
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_VERIFY_TOKEN`

**MCP Server、MaiAgent 設定、Monday.com 連線完全不需要修改。**

預估開發工時：**2–3 個工作天**（選方案 A 或 B）。

---

## 需要確認的問題（供討論）

1. **使用情境**：WhatsApp 整合是對外客戶服務，還是內部員工使用？
2. **帳號類型**：公司是否已有 Meta Business Manager 帳號？
3. **電話號碼**：是否有一支專屬門號（不能同時用在個人 WhatsApp）？
4. **預算**：是否接受 Meta Cloud API 的按量計費？
5. **時程**：是否需要快速 PoC？（若需則建議先用 Twilio Sandbox 驗證，再申請正式 Meta 資格）
6. **Monday.com 授權**：WhatsApp 用戶是否每人各自做 OAuth 授權，還是共用一個服務帳號 token？

---

## 建議行動方案

```
短期（本週）   → 用 Twilio Sandbox 建立 PoC，驗證整合流程可行性
中期（1–2 週） → 申請 Meta Business 驗證 + 準備專屬電話號碼
長期（上線後） → 切換為 Meta Cloud API 正式環境
```

---

> **結論：技術上完全可行。** 現有架構設計良好，新增 WhatsApp 管道只需新建一個 bridge 服務，複用所有現有的 MaiAgent + MCP + Monday.com 基礎設施，開發風險極低。
