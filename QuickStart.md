# 快速開始 - OAuth MCP 5分鐘設置

## 📦 快速安裝

```bash
cd /Users/kevin/Documents/Project/047_monday_mcp

# 1. 初始化項目
npm init -y

# 2. 安裝依賴
npm install express cors axios dotenv socket.io body-parser

# 3. 創建 .env 文件
cat > .env << EOF
# Monday.com OAuth 設置
MONDAY_CLIENT_ID=your_client_id
MONDAY_CLIENT_SECRET=your_client_secret
MONDAY_REDIRECT_URI=http://localhost:3001/oauth/callback

# MCP 伺服器設置
MCP_PORT=3001
MCP_HOST=localhost
LOG_LEVEL=debug
EOF

# 4. 複製下面的代碼到文件
# 5. 啟動伺服器
node server.js
```

---

## 🚀 最簡單的實現 (server.js)

```javascript
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const fs = require('fs');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.MCP_PORT || 3001;
const TOKEN_FILE = './tokens.json';

// ==================== 工具函數 ====================

// 加載 Token
function loadTokens() {
    try {
        return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    } catch {
        return {};
    }
}

// 保存 Token
function saveTokens(tokens) {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
}

// 獲取用戶的有效 Token
async function getUserToken(userId) {
    const tokens = loadTokens();
    const userToken = tokens[userId];

    if (!userToken) {
        throw new Error(`User ${userId} not authorized`);
    }

    // 檢查是否過期
    if (Date.now() > userToken.expiresAt) {
        console.log(`Token expired for ${userId}, refreshing...`);
        try {
            const newToken = await refreshToken(userToken.refreshToken);
            tokens[userId] = {
                ...tokens[userId],
                accessToken: newToken.access_token,
                expiresAt: Date.now() + (newToken.expires_in * 1000)
            };
            saveTokens(tokens);
            return newToken.access_token;
        } catch (error) {
            delete tokens[userId];
            saveTokens(tokens);
            throw error;
        }
    }

    return userToken.accessToken;
}

// 刷新 Token
async function refreshToken(refreshTokenValue) {
    const response = await axios.post('https://auth.monday.com/oauth2/token', {
        client_id: process.env.MONDAY_CLIENT_ID,
        client_secret: process.env.MONDAY_CLIENT_SECRET,
        refresh_token: refreshTokenValue,
        grant_type: 'refresh_token'
    });
    return response.data;
}

// 調用 Monday API
async function callMondayAPI(accessToken, query) {
    const response = await axios.post(
        'https://api.monday.com/v2',
        { query },
        {
            headers: {
                'Authorization': accessToken,
                'Content-Type': 'application/json'
            }
        }
    );
    return response.data;
}

// ==================== OAuth 路由 ====================

// 開始授權
app.get('/oauth/authorize', (req, res) => {
    const params = new URLSearchParams({
        client_id: process.env.MONDAY_CLIENT_ID,
        redirect_uri: process.env.MONDAY_REDIRECT_URI,
        response_type: 'code',
        scope: 'me:read boards:read items:read items:write'
    });
    res.redirect(`https://auth.monday.com/oauth2/authorize?${params}`);
});

// OAuth Callback
app.get('/oauth/callback', async (req, res) => {
    try {
        const { code, error } = req.query;

        if (error) {
            return res.send(`<h1>Error: ${error}</h1>`);
        }

        // 交換授權碼
        const tokenResponse = await axios.post('https://auth.monday.com/oauth2/token', {
            client_id: process.env.MONDAY_CLIENT_ID,
            client_secret: process.env.MONDAY_CLIENT_SECRET,
            code,
            redirect_uri: process.env.MONDAY_REDIRECT_URI,
            grant_type: 'authorization_code'
        });

        const accessToken = tokenResponse.data.access_token;

        // 獲取用戶信息
        const userResponse = await callMondayAPI(accessToken, `
            query {
                me {
                    id
                    name
                    email
                }
            }
        `);

        const userId = userResponse.data.me.id;
        const tokens = loadTokens();
        tokens[userId] = {
            accessToken: tokenResponse.data.access_token,
            refreshToken: tokenResponse.data.refresh_token,
            expiresAt: Date.now() + (tokenResponse.data.expires_in * 1000),
            userName: userResponse.data.me.name,
            userEmail: userResponse.data.me.email
        };
        saveTokens(tokens);

        res.send(`
            <h1>✅ Authorization Successful</h1>
            <p>User: ${userResponse.data.me.name}</p>
            <p>ID: ${userId}</p>
            <p>You can now use Monday API with this ID.</p>
        `);
    } catch (error) {
        console.error(error);
        res.status(500).send(`<h1>Error: ${error.message}</h1>`);
    }
});

// ==================== API 路由 ====================

// 認證中間件
app.use('/api', (req, res, next) => {
    const userId = req.headers['x-user-id'] || req.query.userId;
    if (!userId) {
        return res.status(401).json({ error: 'userId required' });
    }
    req.userId = userId;
    next();
});

// 獲取用戶信息
app.get('/api/user', async (req, res) => {
    try {
        const token = await getUserToken(req.userId);
        const result = await callMondayAPI(token, `
            query {
                me {
                    id
                    name
                    email
                }
            }
        `);
        res.json(result.data);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// 獲取 Board
app.get('/api/boards', async (req, res) => {
    try {
        const token = await getUserToken(req.userId);
        const result = await callMondayAPI(token, `
            query {
                boards {
                    id
                    name
                    owner { name }
                }
            }
        `);
        res.json(result.data);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// 獲取 Board 項目
app.get('/api/items/:boardId', async (req, res) => {
    try {
        const { boardId } = req.params;
        const token = await getUserToken(req.userId);
        const result = await callMondayAPI(token, `
            query {
                boards(ids: ["${boardId}"]) {
                    items_page(limit: 50) {
                        items {
                            id
                            name
                            column_values {
                                id
                                text
                            }
                        }
                    }
                }
            }
        `);
        res.json(result.data);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// 創建項目
app.post('/api/items', async (req, res) => {
    try {
        const { boardId, itemName } = req.body;
        const token = await getUserToken(req.userId);
        const result = await callMondayAPI(token, `
            mutation {
                create_item(
                    board_id: "${boardId}",
                    item_name: "${itemName}"
                ) {
                    id
                    name
                }
            }
        `);
        res.json(result.data);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// 健康檢查
app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// ==================== 啟動伺服器 ====================

app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║   Monday OAuth MCP 伺服器已啟動        ║
╠════════════════════════════════════════╣
║  🌐 網址: http://localhost:${PORT}     ║
║  📝 授權: http://localhost:${PORT}/oauth/authorize
║  🔗 回調: ${process.env.MONDAY_REDIRECT_URI}
╚════════════════════════════════════════╝

⏳ 請稍候，伺服器初始化中...
    `);
    console.log(`✅ 伺服器運行中`);
    console.log(`📖 訪問 http://localhost:${PORT} 查看文檔`);
});

// ==================== 靜態文檔 ====================

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Monday OAuth MCP</title>
            <style>
                body { font-family: Arial; margin: 40px; background: #f5f5f5; }
                .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
                h1 { color: #667eea; }
                code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
                .endpoint { background: #e8f4f8; padding: 15px; margin: 10px 0; border-left: 4px solid #2196F3; }
                button { background: #667eea; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
                button:hover { background: #764ba2; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🚀 Monday OAuth MCP 伺服器</h1>
                <p>這是一個 OAuth MCP 伺服器，用於與 Monday.com 進行安全集成。</p>

                <h2>第一步：授權</h2>
                <p>點擊下方按鈕進行 OAuth 授權：</p>
                <button onclick="window.location='/oauth/authorize'">點擊授權</button>

                <h2>API 端點</h2>

                <div class="endpoint">
                    <strong>認證</strong> (所有 API 調用都需要)<br>
                    Header: <code>X-User-ID: user_id</code>
                </div>

                <div class="endpoint">
                    <strong>GET /api/user</strong><br>
                    獲取當前用戶信息
                </div>

                <div class="endpoint">
                    <strong>GET /api/boards</strong><br>
                    獲取所有 Board
                </div>

                <div class="endpoint">
                    <strong>GET /api/items/:boardId</strong><br>
                    獲取特定 Board 的項目
                </div>

                <div class="endpoint">
                    <strong>POST /api/items</strong><br>
                    創建新項目<br>
                    Body: <code>{ "boardId": "xxx", "itemName": "xxx" }</code>
                </div>

                <h2>示例調用</h2>
                <pre>
curl -H "X-User-ID: 123456" \\
  http://localhost:3001/api/boards
                </pre>
            </div>
        </body>
        </html>
    `);
});
```

---

## 📝 MaiAgent 中的調用範例

### 在 MaiAgent 提示詞中使用：

```
你現在可以訪問 Monday API。可用的命令：

1. 授權：
   http://localhost:3001/oauth/authorize

2. 獲取用戶信息：
   GET http://localhost:3001/api/user
   Header: X-User-ID: {user_id}

3. 獲取 Board 列表：
   GET http://localhost:3001/api/boards
   Header: X-User-ID: {user_id}

4. 獲取 Board 項目：
   GET http://localhost:3001/api/items/{board_id}
   Header: X-User-ID: {user_id}

5. 創建項目：
   POST http://localhost:3001/api/items
   Header: X-User-ID: {user_id}
   Body: {"boardId": "...", "itemName": "..."}

在使用前，用戶需要先訪問授權連結進行 OAuth 認證。
認證後，在 API 調用中使用使用者的 Monday ID 作為 X-User-ID。
```

---

## 🔧 單文件部署的完整 Node.js 版本

如果想要更完整但仍在單個文件中的版本：

```bash
# package.json
{
  "name": "monday-oauth-mcp",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "npx nodemon server.js"
  },
  "dependencies": {
    "express": "^5.2.1",
    "cors": "^2.8.5",
    "axios": "^1.6.0",
    "dotenv": "^16.3.1"
  }
}
```

```bash
npm install && npm start
```

---

## ✅ 測試檢查清單

- [ ] 伺服器啟動成功（可訪問 http://localhost:3001）
- [ ] OAuth 授權可以重定向到 Monday
- [ ] 回調成功接收用戶的 Token
- [ ] Token 已保存到 tokens.json
- [ ] 可以使用 User ID 調用 API
- [ ] 獲取用戶信息端點正常工作
- [ ] 獲取 Board 列表正常工作
- [ ] 可以創建新項目
- [ ] MaiAgent 可以成功調用此 MCP

---

## 🚨 常見問題

**Q: 顯示 "MONDAY_CLIENT_ID is undefined"**
A: 檢查 .env 文件是否創建並填入正確的 OAuth 認證信息

**Q: Token 回調失敗**
A: 確保在 Monday 應用設置中的 Redirect URI 與代碼中一致

**Q: API 返回 401 Unauthorized**
A: 確保在請求 Header 中包含 X-User-ID，且該用戶已完成 OAuth 認證

---

## 下一步

1. ✅ 保存並運行上面的代碼
2. ✅ 訪問 http://localhost:3001/oauth/authorize 進行授權
3. ✅ 獲取你的 User ID
4. ✅ 使用 User ID 調用 API
5. ✅ 在 MaiAgent 中配置 MCP 工具指向 http://localhost:3001
