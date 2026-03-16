# 🚀 Monday 上傳系統 - 快速入門指南

5 分鐘內部署文件上傳系統到 Monday.com

---

## ⚡ 極速開始（5分鐘）

### 步驟 1: 進入項目目錄

```bash
cd /Users/kevin/Documents/Project/047_monday_mcp
```

### 步驟 2: 安裝依賴

```bash
# 安裝所有必需的 npm 包
npm install

# 驗證是否安裝成功
npm list --depth=0
```

### 步驟 3: 創建 .env 文件

```bash
# 複製配置模板
cp .env.example .env

# 編輯 .env 文件，填入你的 Monday OAuth 信息
# 使用你喜歡的編輯器打開
nano .env
```

需要填入的內容：
```env
MONDAY_CLIENT_ID=your_actual_id
MONDAY_CLIENT_SECRET=your_actual_secret
MONDAY_REDIRECT_URI=http://localhost:3001/oauth/callback
SERVER_URL=http://localhost:3002
```

### 步驟 4: 啟動服務器

**開啟第一個終端 - 啟動 OAuth MCP**

```bash
npm start
# 或開發模式
npm run dev
```

輸出應該類似：
```
🚀 OAuth MCP Server started on http://localhost:3001
📋 API Documentation available at http://localhost:3001
```

**開啟第二個終端 - 啟動上傳服務**

```bash
npm run upload
# 或開發模式
npm run upload:dev
```

輸出應該類似：
```
╔════════════════════════════════════════╗
║   Monday Upload MCP 伺服器已啟動       ║
╚════════════════════════════════════════╝
🌐 網址: http://localhost:3002
```

### 步驟 5: 完成授權

在瀏覽器中打開：
```
http://localhost:3002/oauth/authorize
```

按照提示在 Monday.com 中授權，記下返回的 **User ID**。

### ✅ 完成！

現在你可以上傳文件了！

---

## 🎯 使用示例

### 示例 1: 上傳單個圖片

```bash
# 準備文件路徑
IMAGE_PATH="/path/to/your/image.jpg"

# 準備參數（使用實際的值）
USER_ID="12345"           # 從授權頁面獲得
BOARD_ID="67890"          # 你的 Board ID
ITEM_ID="99999"           # 你的項目 ID

# 上傳文件
curl -X POST \
  -F "file=@$IMAGE_PATH" \
  -F "userId=$USER_ID" \
  -F "boardId=$BOARD_ID" \
  -F "itemId=$ITEM_ID" \
  http://localhost:3002/api/upload
```

成功後會看到：
```json
{
  "success": true,
  "message": "File uploaded successfully",
  "data": {
    "filename": "image-1710633000000.jpg",
    "fileUrl": "http://localhost:3002/files/image-1710633000000.jpg"
  }
}
```

### 示例 2: 批量上傳多個文件

```bash
curl -X POST \
  -F "files=@image1.jpg" \
  -F "files=@image2.jpg" \
  -F "files=@video.mp4" \
  -F "userId=12345" \
  -F "boardId=67890" \
  -F "itemId=99999" \
  http://localhost:3002/api/upload-multiple
```

### 示例 3: 創建新 Board

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-User-ID: 12345" \
  -d '{"boardName": "My New Project"}' \
  http://localhost:3002/api/board
```

返回新 Board 的 ID：
```json
{
  "success": true,
  "data": {
    "id": "1234567890",
    "name": "My New Project"
  }
}
```

---

## 📋 常用命令速查

```bash
# 啟動服務
npm start              # OAuth MCP
npm run upload         # 上傳服務

# 開發模式
npm run dev            # 帶熱重載的 OAuth MCP
npm run upload:dev     # 帶熱重載的上傳服務

# 測試
npm test               # 運行測試腳本

# 設置
npm run setup          # 初始化設置
```

---

## 🔗 API 端點速查

### 認證
- `GET /oauth/authorize` - 開始 OAuth 授權
- `GET /oauth/callback` - OAuth 回調（自動）

### 上傳
- `POST /api/upload` - 上傳單個文件
- `POST /api/upload-multiple` - 批量上傳（最多 10 個）
- `GET /files/:filename` - 下載/預覽文件
- `GET /api/files` - 列出所有文件
- `DELETE /api/files/:filename` - 刪除文件

### Board 管理
- `POST /api/board` - 創建新 Board
- `GET /api/boards` - 列出所有 Board
- `POST /api/board/:boardId/item` - 創建項目

### 健康檢查
- `GET /health` - 檢查伺服器狀態
- `GET /` - 查看 API 文檔

---

## 🧪 驗證安裝

### 檢查 1: 伺服器運行

```bash
# 終端 1 已啟動 OAuth MCP
curl http://localhost:3001/health
# 應返回: {"status":"ok",...}

# 終端 2 已啟動上傳服務
curl http://localhost:3002/health
# 應返回: {"status":"ok",...}
```

### 檢查 2: OAuth 授權

訪問瀏覽器：
```
http://localhost:3002/oauth/authorize
```

應該重定向到 Monday.com 登入頁面

### 檢查 3: 上傳功能

使用提供的測試文件：
```bash
# 在項目目錄中創建測試文件
echo "Test content" > test.txt

# 上傳測試
USER_ID="your_id_from_oauth"
BOARD_ID="your_board_id"
ITEM_ID="your_item_id"

curl -X POST \
  -F "file=@test.txt" \
  -F "userId=$USER_ID" \
  -F "boardId=$BOARD_ID" \
  -F "itemId=$ITEM_ID" \
  http://localhost:3002/api/upload
```

---

## 📚 下一步

### 進階配置

1. **更改埠號** - 編輯 `.env` 中的 `MCP_PORT` 和 `UPLOAD_PORT`

2. **使用雲存儲** - 配置 S3 或 Cloudinary
   ```env
   STORAGE_TYPE=s3
   AWS_REGION=us-east-1
   ```

3. **部署到雲端** - 使用 Railway/Heroku/Replit

### 集成到 MaiAgent

1. 在 MaiAgent 中添加 MCP 工具
2. 設置 MCP 網址為 `http://localhost:3002`
3. 在 WebAgent 中上傳文件

詳見 [Upload-System-Guide.md](Upload-System-Guide.md)

---

## 🐛 常見問題

### Q: "Cannot find module 'multer'"
**A:** 運行 `npm install` 安裝所有依賴

### Q: "MONDAY_CLIENT_ID is undefined"  
**A:** 檢查 `.env` 文件是否存在並填入正確的值

### Q: "Cannot POST /api/upload"
**A:** 確保上傳服務器正在運行（`npm run upload`）

### Q: "File too large"
**A:** 文件超過 100MB，編輯 `.env` 中的 `MAX_FILE_SIZE`

### Q: "User not authorized"
**A:** 先完成 OAuth 授權流程 (`http://localhost:3002/oauth/authorize`)

詳細故障排除見 [Upload-System-Guide.md](Upload-System-Guide.md#%EF%B8%8F-故障排除)

---

## 📖 完整文檔

- **[Upload-System-Guide.md](Upload-System-Guide.md)** - 完整的 API 文檔
- **[README.md](README.md)** - 項目總指南
- **[GitHub-Deployment-Guide.md](GitHub-Deployment-Guide.md)** - 部署指南

---

## 🎉 恭喜！

你現在已經可以：

✅ 上傳圖片、視頻、文檔到 Monday.com

✅ 直接從 WebAgent 管理文件

✅ 創建和管理 Board

開始上傳吧！ 🚀

```bash
# 確保兩個終端都在運行
# 終端 1: npm start
# 終端 2: npm run upload

# 然後在 MaiAgent 中或通過 API 上傳文件
curl -X POST -F "file=@your-file.jpg" ... http://localhost:3002/api/upload
```

還有問題？查看 [Upload-System-Guide.md](Upload-System-Guide.md) 或 [GitHub-Deployment-Guide.md](GitHub-Deployment-Guide.md)
