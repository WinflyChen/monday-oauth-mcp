# 📚 MaiAgent OAuth MCP 完整指南

歡迎使用 MaiAgent OAuth MCP 整合方案！本文件為所有資源的索引和快速導航。

---

## 📖 文件總覽

### 1️⃣ **QuickStart.md** ⭐ 從這裡開始
- **用途**: 5分鐘快速開始
- **內容**:
  - 快速安裝步驟
  - 最簡單的單文件 Node.js 實現
  - 立即可用的代碼
- **適合**: 想要快速上手的用戶
- **預計時間**: 5-10 分鐘

### 2️⃣ **MCP-OAuth-Implementation.md** 完整實現指南
- **用途**: 完整的技術實現
- **內容**:
  - 完整的項目架構
  - 模塊化的代碼組織
  - 詳細的服務層實現
  - 路由和中間件設置
  - 安全性最佳實踐
- **適合**: 需要生產級別實現的開發者
- **預計時間**: 30-45 分鐘閱讀，1-2 小時實現

### 3️⃣ **MaiAgent-Configuration.md** MaiAgent 集成指南
- **用途**: 在 MaiAgent 中配置 MCP 工具
- **內容**:
  - 截圖解說
  - 步驟指南
  - 配置欄位說明
  - 故障排除
  - 高級配置
- **適合**: 使用 MaiAgent 的用戶
- **預計時間**: 15-20 分鐘

### 4️⃣ **Testing-and-Examples.md** 測試和範例
- **用途**: 驗證和測試整個系統
- **內容**:
  - 完整的測試流程
  - Node.js 測試腳本
  - MaiAgent 集成測試
  - 錯誤排除
  - 性能優化建議
- **適合**: 想要驗證系統工作的用戶
- **預計時間**: 20-30 分鐘

### 5️⃣ **analysis.html** 技術分析報告
- **用途**: 整合方案的技術分析
- **內容**:
  - 核心挑戰分析
  - 架構設計
  - 實現方案
  - 安全考慮
- **適合**: 了解技術背景的開發者
- **預計時間**: 10-15 分鐘閱讀

---

## 🎯 選擇你的學習路徑

### 路徑 A: 我想最快地開始 (5分鐘)
```
1. 閱讀 QuickStart.md
2. 複製並運行 server.js 代碼
3. 訪問 http://localhost:3001
4. 完成！
```

### 路徑 B: 我想要生產級別實現 (2小時)
```
1. 閱讀 MCP-OAuth-Implementation.md
2. 創建完整的項目結構
3. 安裝所有依賴
4. 配置環境變數
5. 啟動並測試
6. 部署到生產環境
```

### 路徑 C: 我想要快速集成到 MaiAgent (15分鐘)
```
1. 啟動 OAuth MCP 伺服器
2. 閱讀 MaiAgent-Configuration.md
3. 在 MaiAgent 中填寫配置欄位
4. 進行 OAuth 授權
5. 開始使用！
```

### 路徑 D: 我想要完整理解 (1小時)
```
1. 閱讀 analysis.html (10分鐘)
2. 閱讀 MCP-OAuth-Implementation.md (30分鐘)
3. 閱讀 MaiAgent-Configuration.md (15分鐘)
4. 瀏覽 Testing-and-Examples.md (5分鐘)
```

---

## ⚡ 核心概念速查表

### OAuth 授權流程
```
用戶點擊授權
    ↓
重定向到 Monday OAuth
    ↓
用戶登錄並同意
    ↓
回調到 http://localhost:3001/oauth/callback
    ↓
交換授權碼獲取 Access Token
    ↓
保存 Token 到 tokens.json
    ↓
返回成功頁面 ✅
```

### API 調用流程
```
MaiAgent 發送請求 (with X-User-ID header)
    ↓
檢測 Token 是否過期
    ├─ 過期 → 自動刷新
    └─ 有效 → 繼續
    ↓
調用 Monday API
    ↓
返回結果給 MaiAgent
```

### 關鍵組件
```
express      = HTTP 伺服器框架
axios        = HTTP 客戶端
dotenv       = 環境變數管理
cors         = 跨域請求支持
tokens.json  = Token 存儲
```

---

## 💻 快速命令參考

### 开发环境
```bash
# 初始化项目
npm init -y
npm install express cors axios dotenv

# 启动开发服务器
npm run dev  # 需要配有 nodemon
node server.js

# 查看健康状态
curl http://localhost:3001/health
```

### OAuth 授權
```bash
# 在瀏覽器中打開
http://localhost:3001/oauth/authorize

# 或自動重定向
curl -L http://localhost:3001/oauth/authorize
```

### API 調用
```bash
# 假設 USER_ID = "12345"
USER_ID="12345"

# 獲取用戶信息
curl -H "X-User-ID: $USER_ID" \
  http://localhost:3001/api/user

# 獲取 Board
curl -H "X-User-ID: $USER_ID" \
  http://localhost:3001/api/boards

# 獲取項目
curl -H "X-User-ID: $USER_ID" \
  http://localhost:3001/api/items/BOARD_ID

# 創建項目
curl -X POST -H "X-User-ID: $USER_ID" \
  -H "Content-Type: application/json" \
  -d '{"boardId":"BOARD_ID","itemName":"New Item"}' \
  http://localhost:3001/api/items
```

### Token 管理
```bash
# 查看已授權用戶
curl http://localhost:3001/oauth/status

# 手動刷新 Token
curl -X POST http://localhost:3001/oauth/refresh \
  -d '{"userId":"USER_ID"}'

# 撤銷授權
curl -X DELETE http://localhost:3001/oauth/revoke/USER_ID
```

### 日誌和監控
```bash
# 開發環境
npm run dev

# 生產環境（使用 PM2）
pm2 start server.js --name "monday-mcp"
pm2 logs monday-mcp

# 檢查 Token
cat tokens.json | jq .

# 清除 Token
echo '{}' > tokens.json
```

---

## 🔧 環境設置步驟

### 第 1 步: 準備 Monday OAuth 應用

1. 訪問 [Monday App Marketplace](https://monday.com/marketplace)
2. 創建新應用
3. 記下 **Client ID** 和 **Client Secret**
4. 設置 Redirect URI: `http://localhost:3001/oauth/callback`

### 第 2 步: 創建 .env 文件

```env
# Monday OAuth 設定
MONDAY_CLIENT_ID=你的_CLIENT_ID
MONDAY_CLIENT_SECRET=你的_CLIENT_SECRET
MONDAY_REDIRECT_URI=http://localhost:3001/oauth/callback

# 伺服器設定
MCP_PORT=3001
LOG_LEVEL=debug
```

### 第 3 步: 安裝和啟動

```bash
cd /Users/kevin/Documents/Project/047_monday_mcp
npm install
npm run dev
```

### 第 4 步: 授權用戶

訪問 `http://localhost:3001/oauth/authorize` 並完成 OAuth 流程

### 第 5 步: 記下 User ID

授權完成後，頁面會顯示你的 Monday User ID，記下它！

### 第 6 步: 在 MaiAgent 中配置

按照 MaiAgent-Configuration.md 中的步驟配置 MCP 工具

---

## ✨ 核心功能清單

### ✅ 已實現的功能

- [x] OAuth 2.0 授權流程
- [x] Token 自動刷新
- [x] 用戶信息查詢
- [x] Board 列表和詳情
- [x] 項目查詢、創建、更新、刪除
- [x] 列信息查詢
- [x] 錯誤處理和日誌
- [x] Token 存儲和管理
- [x] CORS 支持
- [x] 健康檢查端點

### 🔮 可擴展的功能

- [ ] WebSocket 實時更新
- [ ] 批量操作
- [ ] 高級過濾和搜索
- [ ] 文件上傳支持
- [ ] 活動日誌監控
- [ ] 性能緩存層
- [ ] 數據庫持久化

---

## 🚀 部署選項

### 選項 1: 本地開發
```bash
npm run dev
# 伺服器在 http://localhost:3001
```

### 選項 2: 生產環境 (PM2)
```bash
npm install -g pm2
pm2 start server.js --name "monday-mcp"
pm2 startup
pm2 save
```

### 選項 3: Docker 容器
```bash
docker build -t monday-oauth-mcp .
docker run -p 3001:3001 \
  -e MONDAY_CLIENT_ID=... \
  -e MONDAY_CLIENT_SECRET=... \
  monday-oauth-mcp
```

### 選項 4: 雲部署 (Heroku)
```bash
# 創建 Procfile
echo "web: node server.js" > Procfile

# 部署
git push heroku main

# 設置環境變數
heroku config:set MONDAY_CLIENT_ID=...
```

---

## 🐛 故障排除速查

| 問題 | 原因 | 解決方案 |
|------|------|--------|
| 無法連接到伺服器 | 伺服器未啟動 | `npm run dev` |
| OAuth 授權失敗 | Client ID/Secret 錯誤 | 檢查 .env 文件 |
| 401 Unauthorized | 未提供 User ID | 添加 `X-User-ID` header |
| Token 過期 | 超過 Token 有效期 | 自動刷新（無需操作） |
| CORS 錯誤 | 跨域請求被阻止 | 檢查 CORS 配置 |
| MaiAgent 連接失敗 | MCP 工具 URL 錯誤 | 確保使用 `http://localhost:3001` |

---

## 📚 相關資源

### Monday.com 官方
- [Monday API 文檔](https://monday.com/api)
- [OAuth 指南](https://monday.com/docs/connect/oauth)
- [GraphQL 遊樂場](https://api.monday.com/graphql)

### 技術文檔
- [Express.js 官方文檔](https://expressjs.com/)
- [Axios 文檔](https://axios-http.com/)
- [OAuth 2.0 RFC 標準](https://tools.ietf.org/html/rfc6749)

### MCP 相關
- [Model Context Protocol 規範](https://modelcontextprotocol.io/)
- [MCP 實現指南](https://modelcontextprotocol.io/implementation)

---

## 📞 獲取幫助

### 遇到問題？

1. **檢查日誌**
   ```bash
   # 開發環境日誌
   npm run dev
   
   # 生產環境日誌
   pm2 logs monday-mcp
   ```

2. **檢查 Token 狀態**
   ```bash
   curl http://localhost:3001/oauth/status
   ```

3. **重新授權**
   ```bash
   rm tokens.json
   echo '{}' > tokens.json
   # 訪問 http://localhost:3001/oauth/authorize
   ```

4. **查看完整錯誤**
   - 在瀏覽器 Console 查看客戶端錯誤
   - 在終端查看伺服器錯誤日誌
   - 使用 `curl -v` 查看詳細請求信息

---

## ✅ 實施檢查清單

- [ ] 已閱讀適合自己的指南
- [ ] 已安裝必要的依賴 (npm install)
- [ ] 已創建 .env 文件並填入正確的值
- [ ] 已啟動 OAuth MCP 伺服器
- [ ] 已完成 OAuth 授權流程
- [ ] 已記下 User ID
- [ ] 已測試 API 端點
- [ ] 已在 MaiAgent 中配置 MCP 工具
- [ ] 已進行端到端測試
- [ ] 已準備部署方案

---

## 🎉 下一步行動

根據你選擇的路徑，現在就開始：

**🚀 快速開始** → 閱讀 QuickStart.md

**🏗️ 完整實現** → 閱讀 MCP-OAuth-Implementation.md

**🔌 MaiAgent 集成** → 閱讀 MaiAgent-Configuration.md

**🧪 系統驗證** → 閱讀 Testing-and-Examples.md

---

## 💡 最後提醒

1. **安全第一**: 永遠不要在代碼中硬編碼 OAuth 密鑰
2. **Token 保護**: 在生產環境中要加密存儲 Token
3. **HTTPS**: 生產環境必須使用 HTTPS
4. **日誌記錄**: 保留完整的請求/響應日誌以便調試
5. **監控告警**: 設置監控來檢測異常情況

祝你實施順利！ 🎊
