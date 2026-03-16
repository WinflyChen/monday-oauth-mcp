# OAuth MCP 測試和使用示例

## 🧪 完整測試流程

### 階段 1: 伺服器驗證

```bash
# 1. 確保伺服器在運行
curl -s http://localhost:3001/health | jq .

# 預期輸出:
# {
#   "status": "ok",
#   "time": "2024-03-16T10:30:00.000Z"
# }

# 2. 檢查伺服器狀態
curl -s http://localhost:3001 | jq .
```

### 階段 2: OAuth 授權流程

```bash
# 1. 在瀏覽器中訪問授權 URL
# http://localhost:3001/oauth/authorize

# 2. 系統會重定向到 Monday.com OAuth 登錄
# - 輸入 Monday 認證信息
# - 同意授權

# 3. 授權完成後，回調頁面會顯示：
# ✅ Authorization Successful
# User: [Your Name]
# ID: [YOUR_USER_ID]

# 記下 USER_ID，後續所有 API 調用都需要使用它
```

### 階段 3: API 測試

```bash
# 保存你的 USER_ID（從授權頁面獲得）
USER_ID="your_user_id_here"

# ==================== 測試 1: 獲取用戶信息 ====================
echo "📋 測試 1: 獲取用戶信息"
curl -s -H "X-User-ID: $USER_ID" \
  http://localhost:3001/api/user | jq .

# 預期輸出:
# {
#   "me": {
#     "id": "12345",
#     "name": "Your Name",
#     "email": "your@email.com"
#   }
# }

# ==================== 測試 2: 獲取 Board 列表 ====================
echo "📋 測試 2: 獲取 Board 列表"
curl -s -H "X-User-ID: $USER_ID" \
  http://localhost:3001/api/boards | jq .

# 預期輸出:
# {
#   "boards": [
#     {
#       "id": "1234567",
#       "name": "My Board",
#       "owner": { "name": "Owner Name" }
#     }
#   ]
# }

# ==================== 測試 3: 獲取特定 Board 的項目 ====================
# 首先，使用你從 Board 列表獲得的 BOARD_ID
BOARD_ID="1234567"

echo "📋 測試 3: 獲取 Board 項目"
curl -s -H "X-User-ID: $USER_ID" \
  "http://localhost:3001/api/items/$BOARD_ID" | jq .

# 預期輸出:
# {
#   "boards": [
#     {
#       "items_page": {
#         "items": [
#           {
#             "id": "123",
#             "name": "Item Name",
#             "column_values": [...]
#           }
#         ]
#       }
#     }
#   ]
# }

# ==================== 測試 4: 創建新項目 ====================
echo "📋 測試 4: 創建新項目"
curl -s -X POST \
  -H "X-User-ID: $USER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "boardId": "'$BOARD_ID'",
    "itemName": "Test Item from OAuth MCP"
  }' \
  http://localhost:3001/api/items | jq .

# 預期輸出:
# {
#   "create_item": {
#     "id": "999",
#     "name": "Test Item from OAuth MCP"
#   }
# }

# ==================== 測試 5: 檢查 Token 狀態 ====================
echo "📋 測試 5: 檢查 Token 狀態"
curl -s http://localhost:3001/oauth/status | jq .

# 預期輸出:
# {
#   "success": true,
#   "authorizedUsers": [
#     {
#       "userId": "12345",
#       "ownerInfo": { "name": "Your Name" },
#       "savedAt": "2024-03-16T10:30:00.000Z",
#       "isExpired": false
#     }
#   ],
#   "totalUsers": 1
# }
```

---

## 🧬 Node.js 測試腳本

建立 `test.js` 文件：

```javascript
const axios = require('axios');

const BASE_URL = 'http://localhost:3001';
const USER_ID = process.argv[2] || 'test_user';

const api = axios.create({
    baseURL: BASE_URL,
    headers: {
        'X-User-ID': USER_ID,
        'Content-Type': 'application/json'
    }
});

// 彩色輸出
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m'
};

const log = {
    success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
    info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
    section: (msg) => console.log(`\n${colors.yellow}═══ ${msg} ═══${colors.reset}`)
};

// 測試函數
async function runTests() {
    log.section('OAuth MCP 測試套件');
    log.info(`使用 USER_ID: ${USER_ID}`);

    try {
        // Test 1: 健康檢查
        log.section('1. 健康檢查');
        const health = await axios.get(`${BASE_URL}/health`);
        log.success(`伺服器狀態: ${health.data.status}`);

        // Test 2: 獲取用戶信息
        log.section('2. 獲取用戶信息');
        const user = await api.get('/api/user');
        log.success(`用戶: ${user.data.me.name} (ID: ${user.data.me.id})`);
        const actualUserId = user.data.me.id;

        // Test 3: 獲取 Board
        log.section('3. 獲取 Board 列表');
        const boards = await api.get('/api/boards');
        const boardList = boards.data.boards || [];
        
        if (boardList.length > 0) {
            log.success(`找到 ${boardList.length} 個 Board`);
            boardList.forEach((board, idx) => {
                console.log(`   ${idx + 1}. ${board.name} (ID: ${board.id})`);
            });
            return boardList[0].id;
        } else {
            log.error('沒有找到任何 Board');
            return null;
        }

    } catch (error) {
        if (error.response) {
            log.error(`API 錯誤: ${error.response.status} - ${error.response.data.error}`);
            if (error.response.status === 401) {
                log.info('需要完成 OAuth 授權。請訪問: http://localhost:3001/oauth/authorize');
            }
        } else {
            log.error(`連接錯誤: ${error.message}`);
            log.info('伺服器是否正在運行？');
        }
    }
}

// 測試項目操作
async function testItemOperations(boardId) {
    if (!boardId) return;

    log.section('4. 項目操作測試');

    try {
        // 獲取現有項目
        log.info('獲取 Board 項目...');
        const items = await api.get(`/api/items/${boardId}`);
        const itemList = items.data.boards[0].items_page.items;
        log.success(`找到 ${itemList.length} 個項目`);

        if (itemList.length > 0) {
            console.log(`   第一個項目: ${itemList[0].name}`);
        }

        // 創建新項目
        log.info('創建新項目...');
        const newItem = await api.post('/api/items', {
            boardId: boardId,
            itemName: `測試項目 ${new Date().toISOString().split('T')[0]}`
        });
        
        if (newItem.data.create_item) {
            log.success(`創建成功: ${newItem.data.create_item.name} (ID: ${newItem.data.create_item.id})`);
        }

    } catch (error) {
        log.error(`項目操作失敗: ${error.response?.data?.error || error.message}`);
    }
}

// 執行測試
(async () => {
    const boardId = await runTests();
    await testItemOperations(boardId);
    log.section('測試完成');
})();
```

執行測試：

```bash
# 使用預設 user_id
node test.js

# 使用指定的 user_id
node test.js your_actual_user_id
```

---

## 🔗 MaiAgent 集成測試

### 測試 1: 基本查詢

在 MaiAgent 中輸入：

```
查看我的 Monday Board 列表
```

預期 MaiAgent 應該：
1. 調用 `/api/boards` 端點
2. 從 Monday 獲取 Board 列表
3. 返回可讀的 Board 信息

### 測試 2: 項目操作

在 MaiAgent 中輸入：

```
在我的 Board 'Project Alpha' 中創建一個名為 '完成 OAuth 集成' 的項目
```

預期 MaiAgent 應該：
1. 自動識別 Board ID
2. 調用 `/api/items` POST 端點
3. 在 Monday 中創建新項目
4. 返回創建成功的確認

### 測試 3: 錯誤處理

在 MaiAgent 中輸入：

```
刪除一個不存在的項目
```

預期 MaiAgent 應該：
1. 得到 404 錯誤
2. 優雅地處理錯誤
3. 告知用戶錯誤原因

---

## 📊 監控和日誌

### 查看伺服器日誌

```bash
# 開發模式下查看實時日誌
npm run dev

# 生產環境使用 PM2 查看日誌
pm2 logs monday-oauth-mcp
```

### 檢查 Token 存儲

```bash
# 查看保存的 Token 信息
cat tokens.json | jq .

# 查看特定用戶的 Token
cat tokens.json | jq '.["USER_ID"]'

# 清除所有 Token（重新授權）
rm tokens.json
echo '{}' > tokens.json
```

---

## 🚨 常見錯誤和解決方案

### 錯誤 1: "Cannot GET /oauth/authorize"

```
問題: 404 Not Found
原因: 伺服器未啟動或路由未定義
解決: 確保伺服器正在運行 (npm run dev)
```

### 錯誤 2: "Unauthorized - userId required"

```
問題: 401 Unauthorized
原因: 未提供 X-User-ID header
解決: 在所有 API 請求中添加
     -H "X-User-ID: your_user_id"
```

### 錯誤 3: "MONDAY_CLIENT_ID is undefined"

```
問題: TypeError: Cannot read property 'includes' of undefined
原因: .env 文件未加載
解決: 
  1. 確認 .env 文件存在
  2. 檢查環境變數拼寫正確
  3. 重啟伺服器
```

### 錯誤 4: "Token refresh failed"

```
問題: Token 自動刷新失敗
原因: Refresh Token 已過期或 Monday Server 錯誤
解決:
  1. 重新授權: http://localhost:3001/oauth/authorize
  2. 刪除 tokens.json
  3. 重新啟動伺服器
```

### 錯誤 5: "CORS error"

```
問題: Cross-Origin Request Blocked
原因: MaiAgent 和 MCP 伺服器域名不同
解決: 在 server.js 中配置 CORS
     app.use(cors({ origin: '*' }))
```

---

## ✅ 部署前檢查清單

- [ ] 伺服器可以正常啟動
- [ ] 健康檢查端點 (/health) 返回 ok
- [ ] OAuth 授權流程完整
- [ ] 可以獲取並保存 Token
- [ ] Token 刷新機制正常工作
- [ ] 所有 API 端點都可以正常調用
- [ ] 錯誤處理和日誌記錄完善
- [ ] .env 已配置（密鑰安全）
- [ ] MaiAgent 可以成功連接
- [ ] 端到端流程測試通過

---

## 📈 性能優化建議

1. **添加緩存**
   ```javascript
   const cache = {};
   function cacheResult(key, value, ttl) {
       cache[key] = { value, expiry: Date.now() + ttl };
   }
   ```

2. **批量操作**
   ```javascript
   // 支持批量查詢 Board 項目
   GET /api/items?boardIds=1,2,3
   ```

3. **分頁支持**
   ```javascript
   // 已支持
   GET /api/items/:boardId?limit=50&cursor=xxx
   ```

4. **WebSocket 實時更新**
   ```javascript
   // 使用 socket.io 推送實時變更
   io.emit('item:created', { itemId, name });
   ```

---

## 🔐 安全增強

### 1. 添加速率限制

```bash
npm install express-rate-limit
```

```javascript
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use('/api', limiter);
```

### 2. 加密 Token 存儲

```javascript
const crypto = require('crypto');

function encryptToken(token, secret) {
    const cipher = crypto.createCipher('aes-256-cbc', secret);
    return cipher.update(token, 'utf8', 'hex') + cipher.final('hex');
}

function decryptToken(encryptedToken, secret) {
    const decipher = crypto.createDecipher('aes-256-cbc', secret);
    return decipher.update(encryptedToken, 'hex', 'utf8') + decipher.final('utf8');
}
```

### 3. HTTPS 支持

```javascript
const https = require('https');
const fs = require('fs');

const options = {
    key: fs.readFileSync('server.key'),
    cert: fs.readFileSync('server.cert')
};

https.createServer(options, app).listen(3001);
```

---

## 📚 相關資源

- [Monday.com API 文檔](https://monday.com/api/graphql)
- [OAuth 2.0 標準](https://tools.ietf.org/html/rfc6749)
- [Express.js 官方文檔](https://expressjs.com/)
- [MCP 規範](https://modelcontextprotocol.io/)
