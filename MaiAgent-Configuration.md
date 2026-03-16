# MaiAgent MCP 配置指南

## 📋 MCP 工具設定截圖解說

根據上方提供的截圖，MaiAgent 的 MCP 工具配置頁面包含以下字段：

### 配置欄位說明

```
┌─────────────────────────────────────────────┐
│ 工具類型（必填）                             │
│ ┌─────────────────────────────────────────┐ │
│ │ ▼ MCP                                   │ │  ← 選擇 MCP
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ 顯示名稱（必填）                             │
│ ┌─────────────────────────────────────────┐ │
│ │ OA_MCP                                  │ │  ← 工具的顯示名稱
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ 描述（必填）                                 │
│ ┌─────────────────────────────────────────┐ │
│ │  輸入工具的功能描述，這將顯示給用戶...   │ │
│ │  ┌─────────────────────────────────────┐ │ │
│ │  │  Monday.com API 集成工具             │ │ │
│ │  │  - 通過 OAuth 安全認證              │ │ │
│ │  │  - 支持創建、編輯、刪除項目          │ │ │
│ │  │  - 查詢 Board 和項目信息            │ │ │
│ │  │  - 需要使用者授權後才能使用         │ │ │
│ │  └─────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ 提示詞（Agent 提示詞）                       │
│ ┌─────────────────────────────────────────┐ │
│ │  輸入詳細的 Agent 提示詞...              │ │
│ │  ┌─────────────────────────────────────┐ │ │
│ │  │ 你是 Monday.com 助手，可以：         │ │ │
│ │  │ 1. 查看用戶的 Board 和項目          │ │ │
│ │  │ 2. 创建新的 Monday 项目            │ │ │
│ │  │ 3. 更新項目狀態和信息               │ │ │
│ │  │ 4. 刪除過期的項目                   │ │ │
│ │  │                                    │ │ │
│ │  │ API 端點：                          │ │ │
│ │  │ - 獲取用戶信息: /api/user           │ │ │
│ │  │ - 獲取 Board: /api/boards           │ │ │
│ │  │ - 獲取項目: /api/items/:boardId     │ │ │
│ │  │ - 創建項目: POST /api/items         │ │ │
│ │  │ - 更新項目: PUT /api/items/:itemId  │ │ │
│ │  │ - 刪除項目: DELETE /api/items/:...  │ │ │
│ │  │                                    │ │ │
│ │  │ 使用時在 header 中提供 userId      │ │ │
│ │  └─────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ MCP 配置                                    │
│ ┌─────────────────────────────────────────┐ │
│ │ 輸入或選擇 MCP 工具網址                  │ │
│ │ ┌─────────────────────────────────────┐ │ │
│ │ │ http://localhost:3001               │ │ │
│ │ └─────────────────────────────────────┘ │ │
│ │                                         │ │
│ │ 【選擇】 【搜索】                       │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘

¤ 按鈕
┌──────┐  ┌──────┐
│ 取消 │  │ 確認 │
└──────┘  └──────┘
```

---

## 配置步驟

### 步驟 1: 準備 OAuth MCP 伺服器

確保伺服器正常運行：

```bash
cd /Users/kevin/Documents/Project/047_monday_mcp

# 安裝依賴
npm install

# 啟動伺服器
npm run dev
# 或簡單地
node server.js
```

伺服器應該在 `http://localhost:3001` 啟動。

### 步驟 2: 填寫 MCP 工具配置

#### 欄位 1: 工具類型
- **值**: `MCP`
- **說明**: 這是一個 Model Context Protocol 工具

#### 欄位 2: 顯示名稱
```
Monday OAuth
```

#### 欄位 3: 描述

```
Monday.com API 集成工具，提供以下功能：

✅ OAuth 安全認證 - 使用 Monday 官方 OAuth 流程
✅ Board 管理 - 查看和編輯 Board
✅ 項目管理 - 創建、更新、刪除項目
✅ 用戶信息 - 獲取和更新用戶數據

使用此工具前，用戶需要完成 OAuth 授權。
授權的用戶數據通過 X-User-ID 發送請求。
```

#### 欄位 4: 提示詞 (Agent 使用者指南)

```
你是一個 Monday.com 助手，可以幫助用戶管理他們的 Monday 工作區。

==== 能力列表 ====

1. 查詢功能：
   - 獲取用戶信息: GET /api/user
   - 列出所有 Board: GET /api/boards
   - 獲取特定 Board 的項目: GET /api/items/{boardId}?limit=50
   - 獲取列信息: GET /api/columns/{boardId}

2. 創建功能：
   - 創建新項目: POST /api/items
     Body: {
       "boardId": "12345",
       "itemName": "新項目名稱",
       "columnValues": {
         "status": "Todo",
         "priority": "High"
       }
     }

3. 編輯功能：
   - 更新項目: PUT /api/items/{itemId}
     Body: {
       "boardId": "12345",
       "columnValues": {
         "status": "In Progress"
       }
     }

4. 刪除功能：
   - 刪除項目: DELETE /api/items/{itemId}
     Body: { "boardId": "12345" }

==== 認證說明 ====

所有 API 調用需要在 Header 或查詢參數中提供用戶 ID：
- Header 方式: X-User-ID: {userId}
- 查詢參數方式: /api/items/123?userId={userId}

用戶的 Monday ID 是在 OAuth 授權後自動分配的。

==== 使用流程 ====

1. 首次使用：
   - 用戶訪問授權連結: http://localhost:3001/oauth/authorize
   - 完成 Monday OAuth 認證
   - 記下返回中顯示的用戶 ID

2. 後續使用：
   - 在請求中提供用戶 ID
   - 無需重新授權，除非 Token 過期

==== 錯誤處理 ====

- 401 Unauthorized: 用戶未授權或 ID 錯誤
- 400 Bad Request: 請求參數不正確
- 500 Server Error: MCP 伺服器出錯

==== 範例對話 ====

用戶: "幫我列出所有的 Board"
你的動作: GET /api/boards (with X-User-ID header)

用戶: "在 Board 1234 中創建一個名為 '緊急任務' 的項目"
你的動作: POST /api/items (with appropriate data)

用戶: "顯示 Board 5678 中的所有項目"
你的動作: GET /api/items/5678 (with X-User-ID header)
```

#### 欄位 5: MCP 工具網址

```
http://localhost:3001
```

**重要注意事項：**
- ✅ 如果伺服器在本地運行: `http://localhost:3001`
- ✅ 如果伺服器在遠程運行: `https://yourdomain.com`
- 🔒 生產環境務必使用 HTTPS


---

## MaiAgent 完整配置範例

### JSON 配置 (如需導出配置)

```json
{
  "tools": [
    {
      "id": "monday_oauth_mcp",
      "type": "MCP",
      "name": "Monday OAuth",
      "displayName": "Monday OAuth",
      "description": "Monday.com API 集成工具，提供 OAuth 安全認證和完整的 Board 與項目管理功能",
      "prompt": "你是一個 Monday.com 助手...",
      "config": {
        "mcpUrl": "http://localhost:3001",
        "endpoints": [
          {
            "path": "/oauth/authorize",
            "method": "GET",
            "description": "開始 OAuth 授權流程"
          },
          {
            "path": "/oauth/callback",
            "method": "GET",
            "description": "OAuth 回調端點（自動處理）"
          },
          {
            "path": "/api/user",
            "method": "GET",
            "description": "獲取當前用戶信息",
            "auth": "X-User-ID"
          },
          {
            "path": "/api/boards",
            "method": "GET",
            "description": "獲取所有 Board",
            "auth": "X-User-ID"
          },
          {
            "path": "/api/items/{boardId}",
            "method": "GET",
            "description": "獲取特定 Board 的項目",
            "auth": "X-User-ID"
          },
          {
            "path": "/api/items",
            "method": "POST",
            "description": "創建新項目",
            "auth": "X-User-ID"
          },
          {
            "path": "/api/items/{itemId}",
            "method": "PUT",
            "description": "更新項目",
            "auth": "X-User-ID"
          },
          {
            "path": "/api/items/{itemId}",
            "method": "DELETE",
            "description": "刪除項目",
            "auth": "X-User-ID"
          }
        ]
      }
    }
  ]
}
```

---

## 驗證配置成功

### 測試清單

- [ ] 伺服器在 http://localhost:3001 上运行
- [ ] 訪問 http://localhost:3001 能看到歡迎頁面
- [ ] MaiAgent 中 MCP 工具配置已保存
- [ ] 授權後可以獲取用戶 ID
- [ ] API 調用(with userId)能返回正確數據

### 測試命令（使用 curl）

```bash
# 1. 檢查伺服器健康狀態
curl http://localhost:3001/health

# 2. 獲取授權 URL（需要複製到瀏覽器中授權）
curl http://localhost:3001/oauth/authorize

# 3. OAuth 授權後，使用返回的 userId 測試 API
# 記得替換 YOUR_USER_ID
curl -H "X-User-ID: YOUR_USER_ID" \
  http://localhost:3001/api/user

# 4. 獲取 Board 列表
curl -H "X-User-ID: YOUR_USER_ID" \
  http://localhost:3001/api/boards

# 5. 獲取特定 Board 的項目
curl -H "X-User-ID: YOUR_USER_ID" \
  http://localhost:3001/api/items/YOUR_BOARD_ID
```

---

## 故障排除

### 問題 1: MaiAgent 顯示 "無法連接到 MCP"

**可能原因：**
- 伺服器未啟動
- 伺服器地址配置錯誤
- 防火牆阻止了連接

**解決方案：**
```bash
# 確認伺服器正在運行
ps aux | grep node

# 檢查埠是否監聽
lsof -i :3001

# 重新啟動伺服器
npm run dev
```

### 問題 2: OAuth 授權後沒有 User ID

**可能原因：**
- MONDAY_CLIENT_ID 或 SECRET 錯誤
- Redirect URI 未正確配置

**解決方案：**
```bash
# 檢查 .env 文件
cat .env

# 確認 Monday OAuth 應用設置
# 訪問 Monday App Marketplace 檢查設置
```

### 問題 3: API 返回 401 Unauthorized

**可能原因：**
- 未提供 X-User-ID header
- User ID 不存在或不正確
- Token 已過期

**解決方案：**
```bash
# 確保請求包含 X-User-ID header
curl -H "X-User-ID: 12345" http://localhost:3001/api/user

# 檢查 Token 是否有效
# 查看 tokens.json 文件
cat tokens.json
```

---

## 高級配置

### 使用 HTTPS（生產環境）

```javascript
// server.js 修改
const https = require('https');
const fs = require('fs');

const options = {
    key: fs.readFileSync('path/to/key.pem'),
    cert: fs.readFileSync('path/to/cert.pem')
};

https.createServer(options, app).listen(3001);
```

### 配置 CORS

如果 MaiAgent 和 MCP 伺服器在不同域名：

```javascript
// server.js
app.use(cors({
    origin: 'https://maiagent.yourdomain.com',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-ID']
}));
```

### 添加速率限制

```bash
npm install express-rate-limit
```

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 分鐘
    max: 100 // 限制 100 個請求
});

app.use('/api', limiter);
```

---

## 下一步

1. ✅ 按照上方步驟配置 MCP 工具
2. ✅ 在 MaiAgent 中保存配置
3. ✅ 進行 OAuth 授權
4. ✅ 測試 API 端點
5. ✅ 在 MaiAgent 中使用 Monday 功能
