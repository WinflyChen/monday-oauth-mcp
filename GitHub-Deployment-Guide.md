# GitHub 部署和 MaiAgent 集成指南

完整的 GitHub → 雲端部署 → MaiAgent 集成流程

---

## 📋 完整的工作流程

```
1. 編寫程式（本地開發）
   ↓
2. 推送到 GitHub
   ↓
3. 部署到雲端（Heroku、Railway、Replit 等）
   ↓
4. 在 MaiAgent 中配置 MCP 工具
   ↓
5. 集成測試和使用
```

---

## 方案 1: 使用 GitHub + Heroku（推薦用於生產環境）

### 步驟 1: 準備 GitHub 倉庫

```bash
cd /Users/kevin/Documents/Project/047_monday_mcp

# 初始化 Git
git init

# 創建 .gitignore
cat > .gitignore << EOF
node_modules/
.env
tokens.json
*.log
.DS_Store
.vscode/
.idea/
dist/
build/
EOF

# 添加所有文件
git add .

# 創建初始提交
git commit -m "Initial OAuth MCP implementation"
```

### 步驟 2: 連接 GitHub 遠程倉庫

在 GitHub 上創建新倉庫 `monday-oauth-mcp` 後：

```bash
git remote add origin https://github.com/YOUR_USERNAME/monday-oauth-mcp.git
git branch -M main
git push -u origin main
```

### 步驟 3: 部署到 Heroku

#### 3.1 安裝 Heroku CLI

```bash
# macOS
brew install heroku/brew/heroku

# 登錄
heroku login
```

#### 3.2 創建 Heroku 應用

```bash
heroku create your-app-name

# 例如
heroku create monday-oauth-mcp-prod
```

#### 3.3 設置環境變數

```bash
# 設置 Monday OAuth 配置
heroku config:set MONDAY_CLIENT_ID="your_actual_client_id"
heroku config:set MONDAY_CLIENT_SECRET="your_actual_client_secret"

# 更新 Redirect URI 為 Heroku 應用的 URL
heroku config:set MONDAY_REDIRECT_URI="https://monday-oauth-mcp-prod.herokuapp.com/oauth/callback"

# 其他設置
heroku config:set MCP_PORT=3001
heroku config:set LOG_LEVEL=info
```

#### 3.4 部署應用

```bash
# 推送到 Heroku
git push heroku main

# 查看部署日誌
heroku logs --tail

# 訪問應用
heroku open
```

#### 3.5 在 MaiAgent 中配置

在 MaiAgent 的 MCP 工具配置中設置：

```
MCP 工具網址: https://monday-oauth-mcp-prod.herokuapp.com
```

---

## 方案 2: 使用 Railway.app（推薦，最簡單）

Railway 支持自動 GitHub 部署，無需複雜配置。

### 優點
- ✅ 支持 GitHub 自動部署
- ✅ 推送到 GitHub 後自動更新
- ✅ 免費額度足夠測試
- ✅ 自動 HTTPS
- ✅ 界面友好

### 部署步驟

#### 2.1 創建 Railway 帳戶

訪問 https://railway.app 並註冊

#### 2.2 新建項目

1. 點擊「New」按鈕
2. 選擇「Deploy from GitHub repo」
3. 授權 GitHub 訪問權限
4. 選擇 `monday-oauth-mcp` 倉庫

#### 2.3 Railway 自動配置

Railway 會自動：
- 檢測 Node.js 項目
- 安裝依賴 (`npm install`)
- 啟動應用 (`npm start`)

#### 2.4 設置環境變數

在 Railway 儀表板中：

1. 進入項目設置
2. 點擊「Variables」
3. 添加變數：

```
MONDAY_CLIENT_ID = your_actual_client_id
MONDAY_CLIENT_SECRET = your_actual_client_secret
MONDAY_REDIRECT_URI = https://your-railway-domain.up.railway.app/oauth/callback
MCP_PORT = 3001
LOG_LEVEL = info
```

#### 2.5 自動部署

每次推送到 GitHub，Railway 會自動：
- 拉取最新代碼
- 重新安裝依賴
- 重新啟動應用

#### 2.6 在 MaiAgent 中配置

```
MCP 工具網址: https://your-railway-domain.up.railway.app
```

### 查看應用狀態

```bash
# 查看部署日誌
railway logs

# 查看環境變數
railway env

# 查看應用 URL
railway open
```

---

## 方案 3: 使用 Replit（開發階段最快）

Replit 最適合快速開發和測試。

### 優點
- ✅ 無需本地開發環境
- ✅ 支持 GitHub 導入
- ✅ 即時協作
- ✅ 實時預覽
- ✅ 極快的設置時間

### 部署步驟

#### 3.1 導入 GitHub 倉庫

1. 訪問 https://replit.com
2. 點擊「Import」
3. 選擇「Import from GitHub」
4. 輸入倉庫 URL：`https://github.com/YOUR_USERNAME/monday-oauth-mcp`
5. Replit 自動創建新 REPL

#### 3.2 安裝依賴

```bash
# Replit 會自動檢測 package.json 並安裝
npm install
```

#### 3.3 設置環境變數

點擊 Replit 左側的「Secrets」圖標，添加：

```
MONDAY_CLIENT_ID
MONDAY_CLIENT_SECRET
MONDAY_REDIRECT_URI
MCP_PORT
LOG_LEVEL
```

#### 3.4 運行應用

按下「Run」按鈕或執行：

```bash
npm start
```

Replit 會自動分配一個公開 URL，例如：
```
https://monday-oauth-mcp.your-username.repl.co
```

#### 3.5 在 MaiAgent 中配置

```
MCP 工具網址: https://monday-oauth-mcp.your-username.repl.co
```

---

## 方案 4: 使用 Docker + 雲端（企業級）

### 創建 Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

# 複製 package 文件
COPY package*.json ./

# 安裝依賴
RUN npm install --production

# 複製應用代碼
COPY . .

# 暴露埠
EXPOSE 3001

# 設置環境
ENV NODE_ENV=production

# 啟動命令
CMD ["node", "server.js"]
```

### 創建 .dockerignore

```
node_modules
npm-debug.log
.env
tokens.json
.git
.gitignore
.DS_Store
.env.example
```

### 構建 Docker 鏡像

```bash
# 構建
docker build -t monday-oauth-mcp:latest .

# 本地運行測試
docker run -p 3001:3001 \
  -e MONDAY_CLIENT_ID=test \
  -e MONDAY_CLIENT_SECRET=test \
  monday-oauth-mcp:latest
```

### 部署選項

#### Google Cloud Run（推薦）

```bash
# 需要 gcloud CLI

# 創建項目
gcloud projects create monday-oauth-mcp

# 構建並推送
gcloud builds submit --tag gcr.io/monday-oauth-mcp/app

# 部署
gcloud run deploy monday-oauth-mcp \
  --image gcr.io/monday-oauth-mcp/app \
  --platform managed \
  --port 3001 \
  --set-env-vars MONDAY_CLIENT_ID=xxx,MONDAY_CLIENT_SECRET=yyy
```

#### Azure Container Instances

```bash
# 需要 Azure CLI

az container create \
  --resource-group myResourceGroup \
  --name monday-oauth-mcp \
  --image monday-oauth-mcp:latest \
  --ports 3001 \
  --environment-variables \
    MONDAY_CLIENT_ID=xxx \
    MONDAY_CLIENT_SECRET=yyy
```

#### DigitalOcean App Platform

1. 連接 GitHub 倉庫
2. 自動檢測 Node.js
3. 配置環境變數
4. 點擊「Deploy」

---

## 📋 部署前的完整檢查清單

### 項目結構驗證

```
monday-oauth-mcp/
├── server.js                    ← 主入口
├── routes/
│   ├── oauth.js                ← OAuth 路由
│   └── monday.js               ← Monday API 路由
├── services/
│   ├── tokenManager.js         ← Token 管理
│   ├── mondayApi.js            ← Monday API 封裝
│   └── oauthService.js         ← OAuth 服務
├── middleware/
│   ├── auth.js                 ← 認證中間件
│   └── errorHandler.js         ← 錯誤處理
├── utils/
│   ├── logger.js               ← 日誌工具
│   └── crypto.js               ← 加密工具
├── package.json                ← ✅ 檢查 start 腳本
├── .env.example                ← ✅ 包含配置範例（無實際值）
├── .gitignore                  ← ✅ 包含敏感文件
├── Procfile                    ← ✅ 給 Heroku（如使用）
├── Dockerfile                  ← ✅ 給 Docker（如使用）
├── .dockerignore               ← ✅ Docker 忽略文件
├── README.md
└── .github/                    ← ✅ GitHub Actions（可選）
    └── workflows/
        └── deploy.yml
```

### package.json 檢查

```json
{
  "name": "monday-oauth-mcp",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "node test.js"
  },
  "engines": {
    "node": "18.x"
  },
  "dependencies": {
    "express": "^5.2.1",
    "cors": "^2.8.5",
    "axios": "^1.6.0",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
```

### .env.example 檢查

```env
# Monday.com OAuth 設置
MONDAY_CLIENT_ID=your_client_id_here
MONDAY_CLIENT_SECRET=your_client_secret_here
MONDAY_REDIRECT_URI=https://your-deployed-url.com/oauth/callback

# 伺服器設置
MCP_PORT=3001
LOG_LEVEL=debug
```

**重要**: `.env.example` 中不能包含實際的 Client ID 和 Secret！

### .gitignore 檢查

```
# Node
node_modules/
npm-debug.log
package-lock.json
yarn.lock

# 環境和敏感信息
.env
.env.local
.env.production

# Token 和數據
tokens.json
*.db
*.sqlite

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db

# 日誌
logs/
*.log
```

### 必需檢查項目

- [ ] `package.json` 存在且有正確的 `start` 腳本
- [ ] `.env.example` 存在
- [ ] `.gitignore` 包含 `.env`, `tokens.json`, `node_modules`
- [ ] 所有敏感信息都在環境變數中（不在代碼中）
- [ ] `server.js` 使用 `process.env.PORT` 或使用 `.env` 中的變數
- [ ] 沒有硬編碼的 OAuth 密鑰
- [ ] 錯誤處理完整
- [ ] 有適當的日誌記錄

### Heroku 特定檢查

- [ ] `Procfile` 正確配置
- [ ] `engines` 在 `package.json` 中指定 Node.js 版本
- [ ] 應用在啟動時監聽 `process.env.PORT`

### Docker 特定檢查

- [ ] `Dockerfile` 正確
- [ ] `.dockerignore` 包含不必要的文件
- [ ] 應用不依賴本地文件系統（Token 應存在環境變數或數據庫）

---

## 🚀 GitHub 完整操作指南

### 初始化和首次推送

```bash
# 進入項目目錄
cd /Users/kevin/Documents/Project/047_monday_mcp

# 初始化 Git（如果還沒有）
git init

# 檢查狀態
git status

# 添加所有文件
git add .

# 創建初始提交
git commit -m "feat: Initial OAuth MCP implementation

- OAuth 2.0 認證流程
- Token 管理和刷新
- Monday API 集成
- MaiAgent MCP 工具"

# 添加遠程倉庫
git remote add origin https://github.com/YOUR_USERNAME/monday-oauth-mcp.git

# 重命名分支為 main（如需要）
git branch -M main

# 推送到 GitHub
git push -u origin main
```

### 後續更新

```bash
# 查看更改
git status

# 添加更改
git add .

# 創建提交
git commit -m "fix: Fix token refresh issue"

# 推送更改
git push origin main
```

### 創建開發分支

```bash
# 創建並切換到開發分支
git checkout -b develop

# 進行開發...

# 推送開發分支
git push origin develop

# 在 GitHub 上創建 Pull Request
# 審查後合併到 main
```

### 標記版本

```bash
# 創建版本標籤
git tag v1.0.0

# 推送標籤
git push origin v1.0.0

# 查看所有標籤
git tag
```

---

## 🧪 建議的開發流程

### 階段 1: 本地開發和測試（開發環境）

```bash
# 終端 1: 啟動開發伺服器
cd /Users/kevin/Documents/Project/047_monday_mcp
npm run dev

# 終端 2: 運行測試
npm test

# 使用 curl 或 Postman 進行 API 測試
curl -H "X-User-ID: test_user" \
  http://localhost:3001/api/user
```

### 階段 2: GitHub 提交

```bash
# 確保本地測試通過
npm test

# 提交到 GitHub
git add .
git commit -m "feature: Add new endpoint"
git push origin main
```

### 階段 3: 部署到測試環境

```bash
# 方案 A: Railway 自動部署（推薦）
# GitHub push 後自動部署

# 方案 B: Heroku 手動部署
git push heroku main

# 檢查日誌
heroku logs --tail
```

### 階段 4: MaiAgent 集成測試

在 MaiAgent 中配置 MCP 工具，指向測試環境 URL

### 階段 5: 生產環境部署

確認測試環境無誤後，部署到生產環境

---

## 🔐 安全部署檢查清單

部署前必須確認：

### 代碼安全
- [ ] 沒有硬編碼的 API 密鑰
- [ ] `.env` 被加入 `.gitignore`
- [ ] `tokens.json` 被加入 `.gitignore`
- [ ] 沒有提交 `.env` 文件到 GitHub
- [ ] `.env.example` 只含示例值（無實際密鑰）

### 應用安全
- [ ] 所有 API 調用使用 HTTPS（生產環境）
- [ ] CORS 設置正確並受限
- [ ] 輸入驗證完整
- [ ] 錯誤消息不洩露敏感信息
- [ ] 實施了速率限制

### 部署安全
- [ ] 環境變數正確設置在雲端（不在代碼中）
- [ ] 數據庫連接字符串是環境變數
- [ ] 日誌不包含敏感信息
- [ ] 伺服器有適當的監控和告警
- [ ] 定期檢查依賴安全漏洞

### Monday OAuth 安全
- [ ] Redirect URI 正確配置
- [ ] Client Secret 絕不暴露
- [ ] Token 使用 HTTPS 傳輸
- [ ] Token 在伺服器端安全存儲
- [ ] Token 定期驗證有效性

---

## 📊 部署方案比較

| 特性 | Heroku | Railway | Replit | GCP Cloud Run |
|------|--------|---------|--------|---------------|
| **難度** | ⭐⭐ | ⭐ | ⭐ | ⭐⭐⭐ |
| **成本** | 付費 | 免費/付費 | 免費 | 按用量 |
| **部署速度** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **自動部署** | 否 | 是 | 是 | 可配置 |
| **HTTPS** | 自動 | 自動 | 自動 | 自動 |
| **維護** | 簡單 | 簡單 | 簡單 | 中等 |
| **適合階段** | 生產 | 開發/生產 | 開發 | 生產 |

**推薦方案**:
- 開發階段: **Replit**（最快）
- 測試階段: **Railway**（穩定簡單）
- 生產環境: **Heroku** 或 **Google Cloud Run**（可靠穩定）

---

## 🌐 MaiAgent 最終配置

在 MaiAgent 中配置 MCP 工具時：

### 工具類型
```
MCP
```

### 顯示名稱
```
Monday OAuth
```

### 描述
```
Monday.com API 集成工具，提供 OAuth 安全認證和完整的 Board 與項目管理功能
```

### MCP 工具網址

根據部署方式選擇：

```
開發環境: http://localhost:3001
Replit: https://your-username.repl.co
Railway: https://your-project.up.railway.app
Heroku: https://your-app-name.herokuapp.com
GCP: https://your-app-region.run.app
```

### 提示詞
```
你是一個 Monday.com 助手，可以幫助用戶管理他們的 Monday 工作區。

能力：
- 獲取用戶信息和 Board 列表
- 創建、編輯、刪除項目
- 查詢列詳細信息
- 更新項目狀態

所有 API 調用需要在 Header 中提供 X-User-ID。
用戶需要先完成 OAuth 授權。
```

---

## ✅ 完整流程示例

### 完整部署步驟（從頭到尾）

```bash
# ========== 第 1 步: 準備本地項目 ==========

cd /Users/kevin/Documents/Project/047_monday_mcp

# 確保 package.json 正確
cat package.json | grep "start"

# 測試本地運行
npm install
npm run dev
# 訪問 http://localhost:3001 確認可用


# ========== 第 2 步: 準備 GitHub ==========

git init
git add .
git commit -m "Initial OAuth MCP implementation"

# 在 GitHub 上創建倉庫 monday-oauth-mcp
git remote add origin https://github.com/YOUR_USERNAME/monday-oauth-mcp.git
git branch -M main
git push -u origin main


# ========== 第 3 步: 部署到 Railway（最簡單） ==========

# 訪問 https://railway.app
# 1. 標誌入/註冊
# 2. 點擊「New Project」
# 3. 選擇「Deploy from GitHub repo」
# 4. 授權並選擇 monday-oauth-mcp 倉庫
# 5. 設置環境變數
# 6. 自動部署完成！

# 獲取部署 URL（例如）
# https://monday-oauth-mcp-prod.up.railway.app


# ========== 第 4 步: 在 Monday 設置 OAuth ==========

# 訪問 Monday App Marketplace
# 創建應用並設置：
# - Redirect URI: https://monday-oauth-mcp-prod.up.railway.app/oauth/callback
# 記下 Client ID 和 Secret


# ========== 第 5 步: 更新部署環境變數 ==========

# 在 Railway 儀表板中設置：
MONDAY_CLIENT_ID = your_client_id
MONDAY_CLIENT_SECRET = your_client_secret
MONDAY_REDIRECT_URI = https://monday-oauth-mcp-prod.up.railway.app/oauth/callback
MCP_PORT = 3001
LOG_LEVEL = info

# Railway 自動重啟應用


# ========== 第 6 步: MaiAgent 配置 ==========

# 在 MaiAgent 中：
# 1. 點擊「新增MCP工具」
# 2. 工具類型: MCP
# 3. 顯示名稱: Monday OAuth
# 4. MCP 工具網址: https://monday-oauth-mcp-prod.up.railway.app
# 5. 填入描述和提示詞
# 6. 點擊「確認」


# ========== 第 7 步: 測試 ==========

# 在 MaiAgent 中進行 OAuth 授權
# 訪問: https://monday-oauth-mcp-prod.up.railway.app/oauth/authorize
# 完成授權，記下 User ID
# 在 MaiAgent 中使用此 User ID 進行操作


# ========== 完成！ ==========

echo "🎉 部署完成，系統已上線！"
```

---

## 🔄 後續更新流程

每次更新代碼只需：

```bash
# 1. 進行本地更改和測試
# 2. 提交到 GitHub
git add .
git commit -m "Update: description of changes"
git push origin main

# 3. Railway 自動檢測並重新部署
# （可在 Railway 儀表板觀看）

# 4. 自動生效，MaiAgent 中無需重新配置
```

---

## 💡 故障排除

### Railway 部署失敗

```bash
# 查看部署日誌
railway logs

# 常見原因：
# 1. package.json 中 start 腳本不正確
# 2. 環境變數遺漏
# 3. Node.js 版本不兼容
```

### MaiAgent 連接失敗

```bash
# 檢查部署 URL 是否正確
curl https://your-railway-app.up.railway.app/health

# 確認 CORS 設置
# 確認環境變數正確設置
```

### OAuth 認證失敗

```bash
# 檢查 MONDAY_REDIRECT_URI 是否與 Monday 應用設置一致
# 檢查 Client ID 和 Secret 是否正確
# 查看伺服器日誌
railway logs
```

---

## 📚 相關資源

- [Railway 官方文檔](https://docs.railway.app/)
- [Heroku 官方文檔](https://devcenter.heroku.com/)
- [GitHub 官方文檔](https://docs.github.com/)
- [Monday API 文檔](https://monday.com/api)

---

## ✨ 總結

這個流程確保了：

✅ **安全** - 敏感信息通過環境變數管理

✅ **便捷** - 推送到 GitHub 後自動部署

✅ **可靠** - 雲端部署確保高可用性

✅ **可擴展** - 容易添加新功能和部署新版本

✅ **協作** - Git 版本控制便於團隊協作

準備好開始部署了嗎？選擇你喜歡的方案，開始部署吧！ 🚀
