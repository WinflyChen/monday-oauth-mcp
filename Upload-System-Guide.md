# Monday Upload MCP - 檔案上傳系統

完整的文件上傳、Board 創建和項目管理系統

---

## 📋 功能概覽

### ✅ 已實現功能

1. **文件上傳**
   - ✅ 上傳圖片、影片、文檔到 Monday.com
   - ✅ 批量上傳多個文件
   - ✅ 支持 100MB 以內的文件

2. **Board 管理**
   - ✅ 創建新 Board
   - ✅ 列出用戶所有 Board
   - ✅ 創建項目並關聯文件

3. **文件管理**
   - ✅ 本地存儲上傳的文件
   - ✅ 生成公開 URL
   - ✅ 刪除文件管理

4. **OAuth 認證**
   - ✅ Monday.com OAuth 授權
   - ✅ Token 管理和刷新
   - ✅ 多用戶支持

---

## 🚀 快速開始

### 步驟 1: 安裝依賴

```bash
cd /Users/kevin/Documents/Project/047_monday_mcp

# 安裝額外的依賴（在原有的基礎上）
npm install multer form-data
```

更新 `package.json`：

```json
{
  "dependencies": {
    "express": "^5.2.1",
    "cors": "^2.8.5",
    "axios": "^1.6.0",
    "dotenv": "^16.3.1",
    "multer": "^1.4.5-lts.1",
    "form-data": "^4.0.0"
  }
}
```

### 步驟 2: 配置環境變數

更新 `.env`：

```env
# Monday.com OAuth 設置
MONDAY_CLIENT_ID=your_client_id
MONDAY_CLIENT_SECRET=your_client_secret
MONDAY_REDIRECT_URI=http://localhost:3001/oauth/callback

# 上傳伺服器設置
SERVER_URL=http://localhost:3002
MCP_PORT=3002
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=104857600

# 日誌
LOG_LEVEL=debug
```

### 步驟 3: 啟動伺服器

```bash
# 啟動上傳伺服器（在另一個終端）
node upload-server.js

# 或用 nodemon（開發模式）
npx nodemon upload-server.js
```

伺服器應該在 `http://localhost:3002` 啟動。

---

## 📚 API 詳細說明

### 認證端點

#### `GET /oauth/authorize`
開始 Monday OAuth 授權流程

```bash
# 在瀏覽器中訪問
http://localhost:3002/oauth/authorize
```

**響應**: 重定向到 Monday.com，完成授權後返回用戶 ID

---

### 文件上傳端點

#### `POST /api/upload`
上傳單個文件到 Monday 項目

**請求參數**:
```bash
curl -X POST \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/path/to/file.jpg" \
  -F "userId=12345" \
  -F "boardId=67890" \
  -F "itemId=11111" \
  http://localhost:3002/api/upload
```

**必需字段**:
- `file` - 上傳的文件
- `userId` - Monday 用戶 ID（已授權）
- `boardId` - 目標 Board ID
- `itemId` - 目標項目 ID
- `columnId` (可選) - 文件欄位 ID

**成功響應**:
```json
{
  "success": true,
  "message": "File uploaded successfully",
  "data": {
    "filename": "image-1710633000000.jpg",
    "fileUrl": "http://localhost:3002/files/image-1710633000000.jpg",
    "fileSize": 2048576,
    "mimeType": "image/jpeg",
    "uploadedAt": "2026-03-16T10:30:00.000Z"
  }
}
```

#### `POST /api/upload-multiple`
批量上傳多個文件

**請求參數**:
```bash
curl -X POST \
  -H "Content-Type: multipart/form-data" \
  -F "files=@/path/to/image1.jpg" \
  -F "files=@/path/to/image2.jpg" \
  -F "files=@/path/to/video.mp4" \
  -F "userId=12345" \
  -F "boardId=67890" \
  -F "itemId=11111" \
  http://localhost:3002/api/upload-multiple
```

**最多上傳**: 10 個文件

**成功響應**:
```json
{
  "success": true,
  "message": "3 files processed",
  "data": [
    {
      "filename": "image1-1710633000000.jpg",
      "fileUrl": "http://localhost:3002/files/image1-1710633000000.jpg",
      "status": "success"
    }
  ]
}
```

#### `GET /files/:filename`
下載或預覽已上傳的文件

```bash
# 直接在瀏覽器打開
http://localhost:3002/files/image-1710633000000.jpg

# 下載
curl -O http://localhost:3002/files/image-1710633000000.jpg
```

#### `GET /api/files`
列出所有上傳的文件

```bash
curl http://localhost:3002/api/files
```

**響應**:
```json
{
  "success": true,
  "data": [
    {
      "filename": "image-1710633000000.jpg",
      "url": "http://localhost:3002/files/image-1710633000000.jpg",
      "size": 2048576,
      "uploadedAt": "2026-03-16T10:30:00.000Z"
    }
  ]
}
```

#### `DELETE /api/files/:filename`
刪除已上傳的文件

```bash
curl -X DELETE http://localhost:3002/api/files/image-1710633000000.jpg
```

---

### Board 操作端點

#### `POST /api/board`
創建新 Board

**請求**:
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-User-ID: 12345" \
  -d '{
    "boardName": "My New Project"
  }' \
  http://localhost:3002/api/board
```

**必需字段**:
- `userId` - Monday 用戶 ID
- `boardName` - Board 名稱

**成功響應**:
```json
{
  "success": true,
  "message": "Board created successfully",
  "data": {
    "id": "1234567890",
    "name": "My New Project",
    "owner": {
      "id": "12345",
      "name": "User Name"
    }
  }
}
```

#### `GET /api/boards`
獲取用戶所有 Board

**請求**:
```bash
curl -H "X-User-ID: 12345" \
  http://localhost:3002/api/boards
```

**成功響應**:
```json
{
  "boards": [
    {
      "id": "1234567890",
      "name": "Board 1",
      "owner": { "name": "User Name" }
    },
    {
      "id": "0987654321",
      "name": "Board 2",
      "owner": { "name": "User Name" }
    }
  ]
}
```

#### `POST /api/board/:boardId/item`
在 Board 中創建項目

**請求**:
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-User-ID: 12345" \
  -d '{
    "itemName": "My Task",
    "columnValues": {
      "status": "Todo",
      "priority": "High"
    }
  }' \
  http://localhost:3002/api/board/1234567890/item
```

**必需字段**:
- `userId` - Monday 用戶 ID
- `itemName` - 項目名稱
- `columnValues` (可選) - 列值

**成功響應**:
```json
{
  "success": true,
  "data": {
    "create_item": {
      "id": "999",
      "name": "My Task"
    }
  }
}
```

---

## 🔄 完整工作流程

### 場景 1: 上傳文件到現有項目

```bash
# 1. OAuth 授權（一次性）
curl -L http://localhost:3002/oauth/authorize
# 完成授權，記下 USER_ID

# 2. 獲取 Board 列表（找到目標 Board 和項目）
curl -H "X-User-ID: YOUR_USER_ID" \
  http://localhost:3002/api/boards

# 3. 上傳文件
curl -X POST \
  -F "file=@/path/to/file.jpg" \
  -F "userId=YOUR_USER_ID" \
  -F "boardId=BOARD_ID" \
  -F "itemId=ITEM_ID" \
  http://localhost:3002/api/upload

# 完成！文件已上傳到 Monday
```

### 場景 2: 創建新 Board 並上傳文件

```bash
# 1. 創建 Board
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-User-ID: YOUR_USER_ID" \
  -d '{"boardName": "Project Alpha"}' \
  http://localhost:3002/api/board

# 記下返回的 BOARD_ID

# 2. 創建項目
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-User-ID: YOUR_USER_ID" \
  -d '{"itemName": "Task 1"}' \
  http://localhost:3002/api/board/BOARD_ID/item

# 記下返回的 ITEM_ID

# 3. 上傳文件
curl -X POST \
  -F "file=@/path/to/file.jpg" \
  -F "userId=YOUR_USER_ID" \
  -F "boardId=BOARD_ID" \
  -F "itemId=ITEM_ID" \
  http://localhost:3002/api/upload

# 完成！
```

---

## 🔧 MaiAgent WebAgent 集成

在 MaiAgent 的 WebAgent 中使用此服務：

### 1. 在 MaiAgent 中添加 MCP 工具

**工具類型**: `MCP`

**MCP 工具網址**: `http://localhost:3002`

**提示詞**:
```
你可以上傳文件到 Monday.com。支持的功能：

1. 上傳文件：
   - POST /api/upload - 上傳單個文件
   - POST /api/upload-multiple - 批量上傳

2. Board 管理：
   - POST /api/board - 創建新 Board
   - GET /api/boards - 列出所有 Board
   - POST /api/board/:boardId/item - 創建項目

3. 文件管理：
   - GET /api/files - 列出文件
   - DELETE /api/files/:filename - 刪除文件

所有上傳都需要提供：
- userId: Monday 用戶 ID
- boardId: 目標 Board ID
- itemId: 目標項目 ID

使用示例：
"上傳這個圖片到我的 Monday Board"
"創建一個新 Board 並上傳文檔"
"批量上傳多個文件"
```

### 2. 使用示例

**上傳圖片**：
```
我想上傳一個圖片到 Monday.com 中的某個項目
用戶 ID: 12345
Board ID: 67890
項目 ID: 99999
文件: [用戶選擇的圖片]
```

MaiAgent 會調用：
```
POST /api/upload
- file: [圖片數據]
- userId: 12345
- boardId: 67890
- itemId: 99999
```

**創建 Board 並上傳**：
```
我想創建一個新的 Board \"Project Beta\" 並上傳這些文件
```

MaiAgent 會自動：
1. 調用 `POST /api/board` 創建 Board
2. 獲取 Board ID
3. 調用 `POST /api/board/:boardId/item` 創建項目
4. 調用 `POST /api/upload-multiple` 上傳文件

---

## 📁 項目結構

```
047_monday_mcp/
├── server.js                  # 原始 OAuth MCP
├── upload-server.js           # 新增：文件上傳服務
├── services/
│   ├── oauthService.js
│   ├── tokenManager.js
│   └── mondayApi.js
├── routes/
│   ├── oauth.js
│   └── monday.js
├── uploads/                   # 上傳的文件存儲目錄
│   ├── image-1710633000000.jpg
│   ├── video-1710633000001.mp4
│   └── document-1710633000002.pdf
├── package.json
├── .env
└── README.md
```

---

## 🔐 安全性考慮

### 文件上傳安全

1. **文件類型驗證**
   ```javascript
   // 在 upload-server.js 中添加
   const allowedMimes = [
       'image/jpeg', 'image/png', 'image/gif',
       'video/mp4', 'video/webm',
       'application/pdf', 'text/plain'
   ];
   
   if (!allowedMimes.includes(req.file.mimetype)) {
       return res.status(400).json({ error: 'File type not allowed' });
   }
   ```

2. **文件大小限制**
   ```javascript
   const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
   ```

3. **防止目錄遍歷**
   ```javascript
   // 已實現
   if (!filePath.startsWith(uploadDir)) {
       return res.status(403).json({ error: 'Access denied' });
   }
   ```

### 認證安全

1. **Token 管理**
   - Tokens 存儲在 `tokens.json`（生產環境應使用加密）
   - 自動刷新過期 Token
   - 支持多用戶

2. **CORS 限制**
   ```javascript
   // 在生產環境應限制 origin
   app.use(cors({
       origin: 'https://your-maiagent-domain.com',
       credentials: true
   }));
   ```

---

## ⚙️ 高級配置

### 使用雲存儲（S3/Cloudinary）

如果不想在本地存儲文件，可以使用雲服務：

#### 配置 AWS S3

```bash
npm install aws-sdk
```

```javascript
const AWS = require('aws-sdk');
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY
});

// 上傳到 S3
async function uploadToS3(file) {
    const params = {
        Bucket: process.env.S3_BUCKET,
        Key: file.filename,
        Body: fs.readFileSync(file.path),
        ContentType: file.mimetype
    };
    
    const data = await s3.upload(params).promise();
    return data.Location; // 返回公開 URL
}
```

#### 配置 Cloudinary

```bash
npm install cloudinary
```

```javascript
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// 上傳到 Cloudinary
async function uploadToCloudinary(filePath) {
    const result = await cloudinary.uploader.upload(filePath, {
        folder: 'monday-uploads',
        resource_type: 'auto'
    });
    return result.secure_url;
}
```

---

## 🚀 部署到生產環境

### 方案 1: Railway + S3

```env
# .env
AWS_ACCESS_KEY=your_key
AWS_SECRET_KEY=your_secret
S3_BUCKET=your_bucket
STORAGE_TYPE=s3
```

### 方案 2: Heroku + Cloudinary

```bash
heroku config:set CLOUDINARY_NAME=your_cloud_name
heroku config:set CLOUDINARY_API_KEY=your_key
heroku config:set CLOUDINARY_API_SECRET=your_secret
heroku config:set STORAGE_TYPE=cloudinary
```

---

## 🧪 測試

### 測試腳本

```bash
# 1. 檢查伺服器
curl http://localhost:3002/health

# 2. OAuth 授權流程
curl -L http://localhost:3002/oauth/authorize

# 3. 上傳檔案
curl -X POST \
  -F "file=@test.jpg" \
  -F "userId=12345" \
  -F "boardId=67890" \
  -F "itemId=99999" \
  http://localhost:3002/api/upload

# 4. 查看所有文檔
curl http://localhost:3002/api/files
```

---

## 📊 支持的文件類型

| 類型 | 副檔名 | 限制 |
|------|--------|------|
| **圖像** | .jpg, .png, .gif | 100MB |
| **視頻** | .mp4, .webm | 100MB |
| **文檔** | .pdf, .txt | 100MB |
| **其他** | 可自訂 | 100MB |

---

## 🐛 故障排除

### 問題 1: "File not found"
```
確保檔案上傳成功後在本地存儲
檢查 uploads/ 目錄是否存在並有寫入權限
```

### 問題 2: "Monday API error"
```
檢查 Token 是否有效（有可能過期）
檢查 userId, boardId, itemId 是否正確
檢查 Monday API 是否支援該操作
```

### 問題 3: "CORS error"
```
確保在 MaiAgent 中配置正確的 MCP 網址
檢查伺服器端 CORS 設置
```

### 問題 4: "File too large"
```
文件大小超過 100MB 限制
在 upload-server.js 中修改 MAX_FILE_SIZE
```

---

## 📚 相關資源

- [Multer 文檔](https://github.com/expressjs/multer)
- [Monday API 檔案上傳](https://monday.com/api/graphql)
- [AWS S3 SDK](https://docs.aws.amazon.com/s3/)
- [Cloudinary API](https://cloudinary.com/documentation)

---

## ✅ 檢查清單

部署前：

- [ ] 已安裝所有依賴 (npm install multer form-data)
- [ ] 已配置 .env 文件
- [ ] 已創建 uploads/ 目錄
- [ ] 已完成 Monday OAuth 授權
- [ ] 已測試基本上傳功能
- [ ] 已在 MaiAgent 中配置 MCP 工具
- [ ] 已測試端到端上傳流程

生產環境：

- [ ] CORS 設置已限制
- [ ] 文件類型驗證已啟用
- [ ] 使用雲存儲服務
- [ ] 有日誌記錄和監控
- [ ] 有備份和恢復機制

---

## 🎉 完成！

現在你可以：

✅ 在 MaiAgent WebAgent 中上傳圖片、文檔、視頻

✅ 直接將文件添加到 Monday.com 項目

✅ 創建新 Board 並管理項目

✅ 通過 MCP 與 Monday 無縫集成

開始使用吧！ 🚀
