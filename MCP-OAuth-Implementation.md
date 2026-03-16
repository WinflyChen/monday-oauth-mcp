# MaiAgent OAuth MCP 實現指南

## 📚 目錄
1. [架構概述](#架構概述)
2. [環境設置](#環境設置)
3. [MCP 伺服器實現](#mcp-伺服器實現)
4. [OAuth 流程](#oauth-流程)
5. [MaiAgent 配置](#maiagent-配置)
6. [部署指南](#部署指南)

---

## 架構概述

```
┌─────────────┐
│  MaiAgent   │ (前端)
└──────┬──────┘
       │ 調用 MCP Tool
       ▼
┌─────────────────────────────┐
│   OAuth MCP 伺服器          │ (localhost:3001)
│  ├─ OAuth Callback Handler  │
│  ├─ Token Manager           │
│  └─ Monday API Wrapper      │
└──────┬──────────────────────┘
       │ HTTP Request with Token in Header
       ▼
┌──────────────────────────────┐
│   Monday.com API (v2)        │
│   https://api.monday.com/v2  │
└──────────────────────────────┘
```

### 關鍵組件說明

| 組件 | 功能 | 作用 |
|-----|-----|------|
| **MCP 伺服器** | HTTP 服務 | 接收 MaiAgent 的請求，調用 Monday API |
| **OAuth 管理器** | Token 存儲 & 刷新 | 管理用戶的 OAuth Token 生命週期 |
| **Monday API 包裝層** | API 調用層 | 簡化 Monday GraphQL 查詢 |
| **Callback 處理** | 授權端點 | 接收 Monday OAuth Callback |

---

## 環境設置

### 1. 前置需求

```bash
# 確保有 Node.js
node --version  # v18 或更高

# 在 047_monday_mcp 目錄初始化
cd /Users/kevin/Documents/Project/047_monday_mcp
npm init -y
```

### 2. 安裝依賴

```bash
npm install express cors axios dotenv socket.io body-parser
npm install --save-dev nodemon
```

### 3. 創建 .env 文件

```env
# Monday.com OAuth 配置
MONDAY_CLIENT_ID=your_client_id_here
MONDAY_CLIENT_SECRET=your_client_secret_here
MONDAY_REDIRECT_URI=http://localhost:3001/oauth/callback

# MCP 伺服器配置
MCP_PORT=3001
MCP_HOST=localhost

# 儲存 Token 的路徑
TOKEN_STORAGE_PATH=./tokens.json

# 日誌級別
LOG_LEVEL=debug
```

### 4. package.json 腳本

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "node test.js"
  }
}
```

---

## MCP 伺服器實現

### 文件結構

```
047_monday_mcp/
├── server.js                 # 主服務器入口
├── routes/
│   ├── oauth.js             # OAuth 認證路由
│   └── monday.js            # Monday API 路由
├── services/
│   ├── tokenManager.js      # Token 管理服務
│   ├── mondayApi.js         # Monday API 封裝
│   └── oauthService.js      # OAuth 服務
├── middleware/
│   ├── auth.js              # Token 認證中間件
│   └── errorHandler.js      # 錯誤處理中間件
├── utils/
│   ├── logger.js            # 日誌工具
│   └── crypto.js            # 加密工具
├── tokens.json              # Token 存儲 (gitignore)
├── .env                      # 環境變數 (gitignore)
└── .env.example             # 環境變數範例
```

### server.js - 主服務器

```javascript
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// 加載環境變數
dotenv.config();

// 導入路由和中間件
const oauthRoutes = require('./routes/oauth');
const mondayRoutes = require('./routes/monday');
const errorHandler = require('./middleware/errorHandler');
const authMiddleware = require('./middleware/auth');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.MCP_PORT || 3001;

// ==================== 中間件配置 ====================
app.use(cors({
    origin: '*',  // MaiAgent 可以來自任何源
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 請求日誌
app.use((req, res, next) => {
    logger.info(`[${req.method}] ${req.path} - Client: ${req.ip}`);
    next();
});

// ==================== 路由配置 ====================

// OAuth 路由 (不需要認證)
app.use('/oauth', oauthRoutes);

// 狀態檢查端點
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        message: 'OAuth MCP Server is running',
        timestamp: new Date().toISOString()
    });
});

// Monday API 路由 (需要認證)
app.use('/api/monday', authMiddleware, mondayRoutes);

// 默認路由
app.get('/', (req, res) => {
    res.json({
        name: 'Monday OAuth MCP Server',
        version: '1.0.0',
        endpoints: {
            health: 'GET /health',
            oauth: {
                authorize: 'GET /oauth/authorize',
                callback: 'GET /oauth/callback',
                refresh: 'POST /oauth/refresh'
            },
            monday: {
                items: 'GET /api/monday/items/:boardId',
                createItem: 'POST /api/monday/items',
                updateItem: 'PUT /api/monday/items/:itemId',
                getUserInfo: 'GET /api/monday/user'
            }
        }
    });
});

// ==================== 錯誤處理 ====================
app.use(errorHandler);

// 404 處理
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Endpoint not found',
        path: req.path 
    });
});

// ==================== 伺服器啟動 ====================
app.listen(PORT, () => {
    logger.info(`🚀 OAuth MCP Server started on http://localhost:${PORT}`);
    logger.info(`📋 API Documentation available at http://localhost:${PORT}`);
});

module.exports = app;
```

### services/tokenManager.js - Token 管理

```javascript
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

const TOKEN_STORAGE_PATH = process.env.TOKEN_STORAGE_PATH || './tokens.json';

class TokenManager {
    constructor() {
        this.tokens = this.loadTokens();
    }

    /**
     * 加載現有 Token
     */
    loadTokens() {
        try {
            if (fs.existsSync(TOKEN_STORAGE_PATH)) {
                const data = fs.readFileSync(TOKEN_STORAGE_PATH, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            logger.error('Error loading tokens:', error);
        }
        return {};
    }

    /**
     * 存儲 Token
     */
    saveTokens() {
        try {
            fs.writeFileSync(TOKEN_STORAGE_PATH, JSON.stringify(this.tokens, null, 2));
        } catch (error) {
            logger.error('Error saving tokens:', error);
            throw error;
        }
    }

    /**
     * 保存用戶的 OAuth Token
     */
    saveUserToken(userId, token) {
        this.tokens[userId] = {
            accessToken: token.access_token,
            refreshToken: token.refresh_token,
            expiresAt: Date.now() + (token.expires_in * 1000),
            tokenType: token.token_type,
            scope: token.scope,
            savedAt: new Date().toISOString(),
            ownerInfo: token.user_info || null
        };
        this.saveTokens();
        logger.info(`Token saved for user: ${userId}`);
        return this.tokens[userId];
    }

    /**
     * 獲取用戶的 Token
     */
    getUserToken(userId) {
        return this.tokens[userId] || null;
    }

    /**
     * 檢查 Token 是否過期
     */
    isTokenExpired(userId) {
        const userToken = this.tokens[userId];
        if (!userToken) return true;
        return Date.now() > userToken.expiresAt;
    }

    /**
     * 刷新 Token
     */
    async refreshUserToken(userId, oauthService) {
        const userToken = this.tokens[userId];
        if (!userToken || !userToken.refreshToken) {
            throw new Error(`No refresh token found for user: ${userId}`);
        }

        try {
            const newToken = await oauthService.refreshToken(userToken.refreshToken);
            return this.saveUserToken(userId, newToken);
        } catch (error) {
            logger.error(`Failed to refresh token for user ${userId}:`, error);
            // 刪除無效的 Token
            delete this.tokens[userId];
            this.saveTokens();
            throw error;
        }
    }

    /**
     * 獲取有效的 Access Token
     */
    async getValidAccessToken(userId, oauthService) {
        if (!this.tokens[userId]) {
            throw new Error(`User ${userId} has not authorized`);
        }

        if (this.isTokenExpired(userId)) {
            logger.info(`Token expired for user ${userId}, refreshing...`);
            await this.refreshUserToken(userId, oauthService);
        }

        return this.tokens[userId].accessToken;
    }

    /**
     * 刪除用戶的 Token
     */
    revokeUserToken(userId) {
        if (this.tokens[userId]) {
            delete this.tokens[userId];
            this.saveTokens();
            logger.info(`Token revoked for user: ${userId}`);
            return true;
        }
        return false;
    }

    /**
     * 列出所有已授權的用戶
     */
    listAuthorizedUsers() {
        return Object.keys(this.tokens).map(userId => ({
            userId,
            ownerInfo: this.tokens[userId].ownerInfo,
            savedAt: this.tokens[userId].savedAt,
            isExpired: this.isTokenExpired(userId)
        }));
    }
}

module.exports = new TokenManager();
```

### services/oauthService.js - OAuth 服務

```javascript
const axios = require('axios');
const querystring = require('querystring');
const logger = require('../utils/logger');

class OAuthService {
    constructor() {
        this.clientId = process.env.MONDAY_CLIENT_ID;
        this.clientSecret = process.env.MONDAY_CLIENT_SECRET;
        this.redirectUri = process.env.MONDAY_REDIRECT_URI;
        this.authUrl = 'https://auth.monday.com/oauth2/authorize';
        this.tokenUrl = 'https://auth.monday.com/oauth2/token';
    }

    /**
     * 生成授權 URL
     */
    getAuthorizeUrl(state = null) {
        const params = {
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            response_type: 'code',
            scope: 'me:read boards:read items:read items:write',
            state: state || this.generateState()
        };

        const query = new URLSearchParams(params).toString();
        const url = `${this.authUrl}?${query}`;
        logger.info('Generated authorization URL');
        return url;
    }

    /**
     * 交換授權碼獲取 Access Token
     */
    async exchangeCodeForToken(code) {
        try {
            const response = await axios.post(this.tokenUrl, {
                client_id: this.clientId,
                client_secret: this.clientSecret,
                code: code,
                redirect_uri: this.redirectUri,
                grant_type: 'authorization_code'
            }, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            logger.info('Successfully exchanged code for token');
            return response.data;
        } catch (error) {
            logger.error('Error exchanging code for token:', error.response?.data || error.message);
            throw new Error('Failed to exchange authorization code');
        }
    }

    /**
     * 刷新 Token
     */
    async refreshToken(refreshToken) {
        try {
            const response = await axios.post(this.tokenUrl, {
                client_id: this.clientId,
                client_secret: this.clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            }, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            logger.info('Successfully refreshed token');
            return response.data;
        } catch (error) {
            logger.error('Error refreshing token:', error.response?.data || error.message);
            throw new Error('Failed to refresh token');
        }
    }

    /**
     * 驗證 Token 有效性
     */
    async validateToken(accessToken) {
        try {
            // 這只是測試 Token 有效性的方式
            // 實際上應該調用一個驗證端點
            return { valid: true };
        } catch (error) {
            return { valid: false };
        }
    }

    /**
     * 生成隨機狀態以防止 CSRF
     */
    generateState() {
        const crypto = require('crypto');
        return crypto.randomBytes(16).toString('hex');
    }
}

module.exports = new OAuthService();
```

### services/mondayApi.js - Monday API 封裝

```javascript
const axios = require('axios');
const logger = require('../utils/logger');

class MondayApiService {
    constructor() {
        this.apiUrl = 'https://api.monday.com/v2';
    }

    /**
     * 執行 GraphQL 查詢
     */
    async query(accessToken, query, variables = {}) {
        try {
            const response = await axios.post(
                this.apiUrl,
                {
                    query: query,
                    variables: variables
                },
                {
                    headers: {
                        'Authorization': accessToken,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data.errors) {
                logger.warn('GraphQL errors:', response.data.errors);
                throw new Error(JSON.stringify(response.data.errors));
            }

            return response.data.data;
        } catch (error) {
            logger.error('Monday API query error:', error.message);
            throw error;
        }
    }

    /**
     * 獲取用戶信息
     */
    async getUserInfo(accessToken) {
        const query = `
            query {
                me {
                    id
                    name
                    email
                    phone
                    created_at
                }
            }
        `;
        return this.query(accessToken, query);
    }

    /**
     * 獲取用戶的 Board 列表
     */
    async getBoards(accessToken) {
        const query = `
            query {
                boards {
                    id
                    name
                    description
                    owner {
                        id
                        name
                    }
                }
            }
        `;
        return this.query(accessToken, query);
    }

    /**
     * 獲取特定 Board 的項目
     */
    async getItems(accessToken, boardId, limit = 50) {
        const query = `
            query {
                boards(ids: ["${boardId}"]) {
                    id
                    name
                    items_page(limit: ${limit}) {
                        cursor
                        items {
                            id
                            name
                            created_at
                            updated_at
                            column_values {
                                id
                                text
                            }
                        }
                    }
                }
            }
        `;
        return this.query(accessToken, query);
    }

    /**
     * 創建新項目
     */
    async createItem(accessToken, boardId, itemName, columnValues = {}) {
        const query = `
            mutation {
                create_item(
                    board_id: "${boardId}",
                    item_name: "${itemName}",
                    column_values: "${JSON.stringify(columnValues).replace(/"/g, '\\"')}"
                ) {
                    id
                    name
                }
            }
        `;
        return this.query(accessToken, query);
    }

    /**
     * 更新項目
     */
    async updateItem(accessToken, boardId, itemId, columnValues = {}) {
        const query = `
            mutation {
                change_multiple_column_values(
                    board_id: "${boardId}",
                    item_id: ${itemId},
                    column_values: "${JSON.stringify(columnValues).replace(/"/g, '\\"')}"
                ) {
                    id
                }
            }
        `;
        return this.query(accessToken, query);
    }

    /**
     * 刪除項目
     */
    async deleteItem(accessToken, boardId, itemId) {
        const query = `
            mutation {
                delete_item(board_id: "${boardId}", item_id: ${itemId}) {
                    id
                }
            }
        `;
        return this.query(accessToken, query);
    }

    /**
     * 獲取 Board 列詳細信息
     */
    async getColumnInfo(accessToken, boardId) {
        const query = `
            query {
                boards(ids: ["${boardId}"]) {
                    columns {
                        id
                        title
                        type
                    }
                }
            }
        `;
        return this.query(accessToken, query);
    }
}

module.exports = new MondayApiService();
```

### routes/oauth.js - OAuth 路由

```javascript
const express = require('express');
const router = express.Router();
const oauthService = require('../services/oauthService');
const tokenManager = require('../services/tokenManager');
const mondayApi = require('../services/mondayApi');
const logger = require('../utils/logger');

/**
 * GET /oauth/authorize
 * 重定向到 Monday OAuth 授權頁面
 */
router.get('/authorize', (req, res) => {
    try {
        const state = req.query.state || null;
        const authorizeUrl = oauthService.getAuthorizeUrl(state);
        logger.info('User redirected to Monday OAuth');
        res.redirect(authorizeUrl);
    } catch (error) {
        logger.error('Error in authorize:', error);
        res.status(500).json({ error: 'Failed to generate authorization URL' });
    }
});

/**
 * GET /oauth/callback
 * Monday OAuth Callback 處理
 */
router.get('/callback', async (req, res) => {
    try {
        const { code, state, error } = req.query;

        if (error) {
            logger.error('OAuth error:', error);
            return res.status(400).json({ error: `Callback error: ${error}` });
        }

        if (!code) {
            logger.error('No authorization code received');
            return res.status(400).json({ error: 'No authorization code' });
        }

        // 交換授權碼獲取 Token
        const tokenData = await oauthService.exchangeCodeForToken(code);
        logger.info('Token received from Monday');

        // 獲取用戶信息
        const accessToken = tokenData.access_token;
        const userInfo = await mondayApi.getUserInfo(accessToken);
        const userId = userInfo.me.id;

        // 補充用戶信息到 Token
        tokenData.user_info = userInfo.me;

        // 保存 Token
        const savedToken = tokenManager.saveUserToken(userId, tokenData);

        // 返回成功頁面
        const successHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Authorization Successful</title>
                <style>
                    body { font-family: Arial; margin: 40px; }
                    .success { color: green; padding: 20px; border: 1px solid green; border-radius: 5px; }
                </style>
            </head>
            <body>
                <div class="success">
                    <h1>✅ Authorization Successful!</h1>
                    <p>User: <strong>${userInfo.me.name}</strong> (ID: ${userId})</p>
                    <p>You can now close this window and use Monday.com API through MaiAgent.</p>
                    <hr>
                    <p><small>Token saved securely. Do not share this window's information.</small></p>
                </div>
            </body>
            </html>
        `;
        res.send(successHtml);
        logger.info(`User ${userId} successfully authorized`);

    } catch (error) {
        logger.error('Error in callback:', error);
        const errorHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Authorization Failed</title>
                <style>
                    body { font-family: Arial; margin: 40px; }
                    .error { color: red; padding: 20px; border: 1px solid red; border-radius: 5px; }
                </style>
            </head>
            <body>
                <div class="error">
                    <h1>❌ Authorization Failed</h1>
                    <p>Error: ${error.message}</p>
                    <p>Please try again or contact support.</p>
                </div>
            </body>
            </html>
        `;
        res.status(500).send(errorHtml);
    }
});

/**
 * POST /oauth/refresh
 * 手動刷新 Token
 */
router.post('/refresh', async (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        const newToken = await tokenManager.refreshUserToken(userId, oauthService);
        res.json({
            success: true,
            message: 'Token refreshed successfully',
            token: {
                accessToken: newToken.accessToken,
                expiresAt: newToken.expiresAt
            }
        });

        logger.info(`Token refreshed for user: ${userId}`);
    } catch (error) {
        logger.error('Error refreshing token:', error);
        res.status(400).json({ error: error.message });
    }
});

/**
 * GET /oauth/status
 * 檢查授權狀態
 */
router.get('/status', (req, res) => {
    try {
        const authorizedUsers = tokenManager.listAuthorizedUsers();
        res.json({
            success: true,
            authorizedUsers: authorizedUsers,
            totalUsers: authorizedUsers.length
        });
    } catch (error) {
        logger.error('Error checking status:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /oauth/revoke/:userId
 * 撤銷用戶授權
 */
router.delete('/revoke/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        const revoked = tokenManager.revokeUserToken(userId);

        if (revoked) {
            res.json({ success: true, message: `Token revoked for user: ${userId}` });
            logger.info(`Token revoked for user: ${userId}`);
        } else {
            res.status(404).json({ error: `No token found for user: ${userId}` });
        }
    } catch (error) {
        logger.error('Error revoking token:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
```

### routes/monday.js - Monday API 路由

```javascript
const express = require('express');
const router = express.Router();
const mondayApi = require('../services/mondayApi');
const tokenManager = require('../services/tokenManager');
const oauthService = require('../services/oauthService');
const logger = require('../utils/logger');

/**
 * GET /api/monday/user
 * 獲取當前用戶信息
 */
router.get('/user', async (req, res) => {
    try {
        const userId = req.user.userId;
        const accessToken = await tokenManager.getValidAccessToken(userId, oauthService);
        const userInfo = await mondayApi.getUserInfo(accessToken);
        res.json(userInfo);
    } catch (error) {
        logger.error('Error getting user info:', error);
        res.status(400).json({ error: error.message });
    }
});

/**
 * GET /api/monday/boards
 * 獲取所有 Board
 */
router.get('/boards', async (req, res) => {
    try {
        const userId = req.user.userId;
        const accessToken = await tokenManager.getValidAccessToken(userId, oauthService);
        const boards = await mondayApi.getBoards(accessToken);
        res.json(boards);
    } catch (error) {
        logger.error('Error getting boards:', error);
        res.status(400).json({ error: error.message });
    }
});

/**
 * GET /api/monday/items/:boardId
 * 獲取特定 Board 的項目
 */
router.get('/items/:boardId', async (req, res) => {
    try {
        const { boardId } = req.params;
        const { limit = 50 } = req.query;
        const userId = req.user.userId;

        const accessToken = await tokenManager.getValidAccessToken(userId, oauthService);
        const items = await mondayApi.getItems(accessToken, boardId, limit);
        res.json(items);
    } catch (error) {
        logger.error('Error getting items:', error);
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /api/monday/items
 * 創建新項目
 */
router.post('/items', async (req, res) => {
    try {
        const { boardId, itemName, columnValues } = req.body;
        const userId = req.user.userId;

        if (!boardId || !itemName) {
            return res.status(400).json({ 
                error: 'boardId and itemName are required' 
            });
        }

        const accessToken = await tokenManager.getValidAccessToken(userId, oauthService);
        const result = await mondayApi.createItem(
            accessToken,
            boardId,
            itemName,
            columnValues || {}
        );

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Error creating item:', error);
        res.status(400).json({ error: error.message });
    }
});

/**
 * PUT /api/monday/items/:itemId
 * 更新項目
 */
router.put('/items/:itemId', async (req, res) => {
    try {
        const { itemId } = req.params;
        const { boardId, columnValues } = req.body;
        const userId = req.user.userId;

        if (!boardId) {
            return res.status(400).json({ error: 'boardId is required' });
        }

        const accessToken = await tokenManager.getValidAccessToken(userId, oauthService);
        const result = await mondayApi.updateItem(
            accessToken,
            boardId,
            itemId,
            columnValues || {}
        );

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Error updating item:', error);
        res.status(400).json({ error: error.message });
    }
});

/**
 * DELETE /api/monday/items/:itemId
 * 刪除項目
 */
router.delete('/items/:itemId', async (req, res) => {
    try {
        const { itemId } = req.params;
        const { boardId } = req.body;
        const userId = req.user.userId;

        if (!boardId) {
            return res.status(400).json({ error: 'boardId is required' });
        }

        const accessToken = await tokenManager.getValidAccessToken(userId, oauthService);
        const result = await mondayApi.deleteItem(accessToken, boardId, itemId);

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Error deleting item:', error);
        res.status(400).json({ error: error.message });
    }
});

/**
 * GET /api/monday/columns/:boardId
 * 獲取 Board 列詳細信息
 */
router.get('/columns/:boardId', async (req, res) => {
    try {
        const { boardId } = req.params;
        const userId = req.user.userId;

        const accessToken = await tokenManager.getValidAccessToken(userId, oauthService);
        const columns = await mondayApi.getColumnInfo(accessToken, boardId);
        res.json(columns);
    } catch (error) {
        logger.error('Error getting column info:', error);
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
```

### middleware/auth.js - 認證中間件

```javascript
const logger = require('../utils/logger');

/**
 * 認證中間件 - 驗證用戶身份
 * 期望在 header 中有 X-User-ID 或從查詢參數中獲取
 */
const authMiddleware = (req, res, next) => {
    try {
        // 方式 1: 從 Header 獲取用戶 ID
        let userId = req.headers['x-user-id'];

        // 方式 2: 從查詢參數獲取
        if (!userId) {
            userId = req.query.userId;
        }

        // 方式 3: 從 Body 獲取（POST 請求）
        if (!userId && req.body) {
            userId = req.body.userId;
        }

        if (!userId) {
            return res.status(401).json({ 
                error: 'Unauthorized',
                message: 'User ID is required. Provide via X-User-ID header or userId parameter.'
            });
        }

        // 將用戶 ID 附加到 request 對象
        req.user = { userId };

        logger.debug(`Authenticated user: ${userId}`);
        next();
    } catch (error) {
        logger.error('Authentication error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
};

module.exports = authMiddleware;
```

### middleware/errorHandler.js - 錯誤處理

```javascript
const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
    logger.error('Error:', err);

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(statusCode).json({
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = errorHandler;
```

### utils/logger.js - 日誌工具

```javascript
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const levels = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
};

const colors = {
    debug: '\x1b[36m',    // Cyan
    info: '\x1b[32m',     // Green
    warn: '\x1b[33m',     // Yellow
    error: '\x1b[31m',    // Red
    reset: '\x1b[0m'      // Reset
};

const logger = {
    debug: (msg, data) => {
        if (levels[LOG_LEVEL] <= levels.debug) {
            console.log(`${colors.debug}[DEBUG]${colors.reset}`, msg, data || '');
        }
    },
    info: (msg, data) => {
        if (levels[LOG_LEVEL] <= levels.info) {
            console.log(`${colors.info}[INFO]${colors.reset}`, msg, data || '');
        }
    },
    warn: (msg, data) => {
        if (levels[LOG_LEVEL] <= levels.warn) {
            console.log(`${colors.warn}[WARN]${colors.reset}`, msg, data || '');
        }
    },
    error: (msg, data) => {
        if (levels[LOG_LEVEL] <= levels.error) {
            console.log(`${colors.error}[ERROR]${colors.reset}`, msg, data || '');
        }
    }
};

module.exports = logger;
```

---

## OAuth 流程

### 用戶授權流程

```
1. MaiAgent 需要訪問 Monday
   ↓
2. 用戶點擊 "授權" 按鈕
   ↓
3. GET http://localhost:3001/oauth/authorize
   ↓
4. 重定向到 Monday OAuth 登錄頁面
   ↓
5. 用戶輸入認證信息並同意授權
   ↓
6. Monday 重定向到 http://localhost:3001/oauth/callback?code=...
   ↓
7. MCP 伺服器交換授權碼獲取 Access Token
   ↓
8. Token 保存在 tokens.json
   ↓
9. 返回成功頁面給用戶
```

### API 調用流程

```
MaiAgent 發送請求
  ↓
GET /api/monday/items/12345?userId=user789
  ↓
認證中間件檢查 userId
  ↓
從 tokens.json 獲取用戶的 Access Token
  ↓
檢查 Token 是否過期
  ├─ 過期 → 自動刷新
  └─ 有效 → 直接使用
  ↓
調用 Monday API (with Authorization: Bearer {token})
  ↓
返回結果給 MaiAgent
```

---

## MaiAgent 配置

### 步驟 1: 添加 MCP 工具

在 MaiAgent 的 MCP 工具配置中，點擊「新增MCP工具」：

**基本設置：**
- **工具類型**：MCP
- **顯示名稱**：monday (OAuth)
- **描述**：Monday.com 集成工具，通過 OAuth 安全授權訪問 Monday 資源

**提示詞：**
```
你是 Monday.com 的 API 助手。可以幫助用戶：
1. 查看 Board 列表和項目
2. 創建和編輯項目
3. 更新項目狀態和信息
4. 獲取用戶信息

使用時需要提供用戶 ID（userId），該用戶必須已完成 OAuth 授權。
主要 API 端點：
- GET /api/monday/user - 獲取當前用戶信息
- GET /api/monday/boards - 列出所有 Board
- GET /api/monday/items/:boardId - 獲取特定 Board 的項目
- POST /api/monday/items - 創建新項目
- PUT /api/monday/items/:itemId - 更新項目
- DELETE /api/monday/items/:itemId - 刪除項目
```

**MCP 配置：**
- **輸入或選擇 MCP 工具網址**：`http://localhost:3001`

### 步驟 2: 從 MaiAgent 調用

示例調用：

```javascript
// 在 MaiAgent 中使用 Monday OAuth MCP

// 1. 首先授權用戶
await callMcp('monday', {
    method: 'GET',
    path: '/oauth/authorize'
});

// 2. 獲取用戶信息
const userInfo = await callMcp('monday', {
    method: 'GET',
    path: '/api/monday/user',
    headers: {
        'X-User-ID': 'user_id_123'
    }
});

// 3. 獲取 Board 和項目
const boards = await callMcp('monday', {
    method: 'GET',
    path: '/api/monday/boards',
    headers: {
        'X-User-ID': 'user_id_123'
    }
});

// 4. 創建新項目
const newItem = await callMcp('monday', {
    method: 'POST',
    path: '/api/monday/items',
    headers: {
        'X-User-ID': 'user_id_123'
    },
    body: {
        boardId: '1234567890',
        itemName: '新的任務',
        columnValues: {
            'status': 'Not Started'
        }
    }
});
```

---

## 部署指南

### 開發環境

```bash
cd /Users/kevin/Documents/Project/047_monday_mcp

# 安裝依賴
npm install

# 創建 .env 文件
cp .env.example .env

# 編輯 .env 文件，填入你的 Monday OAuth 認證信息
nano .env

# 啟動開發伺服器
npm run dev
```

### 生產環境部署

#### 使用 PM2

```bash
# 全局安裝 PM2
npm install -g pm2

# 啟動應用
pm2 start server.js --name "monday-oauth-mcp"

# 設置開機自啟
pm2 startup
pm2 save

# 查看日誌
pm2 logs monday-oauth-mcp
```

#### 使用 Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3001

CMD ["node", "server.js"]
```

```bash
# 構建
docker build -t monday-oauth-mcp .

# 運行
docker run -p 3001:3001 \
  -e MONDAY_CLIENT_ID=your_id \
  -e MONDAY_CLIENT_SECRET=your_secret \
  -e MONDAY_REDIRECT_URI=https://yourdomain.com/oauth/callback \
  monday-oauth-mcp
```

### 安全性檢查清單

- [ ] 在生產環境使用 HTTPS
- [ ] 環境變數不要提交到 Git (使用 .env)
- [ ] Token 使用加密存儲
- [ ] 實施 Rate Limiting
- [ ] 添加請求日誌和監控
- [ ] 定期檢查 Token 有效性
- [ ] 實施 CORS 正確配置

---

## 常見問題 (FAQ)

### Q: 如何獲得 Monday OAuth 認證信息？

A: 訪問 Monday App Marketplace，創建一個新應用程式，會獲得 Client ID 和 Client Secret。設置 Redirect URI 為 `http://localhost:3001/oauth/callback`（開發環境）。

### Q: Token 如何保存得更安全？

A: 建議使用加密庫（如 `crypto`）對 Token 進行加密後再存儲。可以使用以下方法：

```javascript
const crypto = require('crypto');

// 加密
function encryptToken(token, secret) {
    return crypto.createHash('sha256').update(token + secret).digest('hex');
}

// 實際應用中應使用 AES 加密而不是簡單的 Hash
```

### Q: 如何處理 Token 過期？

A: MCP 伺服器會自動檢查 Token 過期時間，並在需要時使用 Refresh Token 自動刷新。

### Q: 多個用戶如何使用？

A: 在調用 API 時提供 `X-User-ID` header，系統會根據用戶 ID 管理對應的 Token。

---

## 下一步

1. 按照上述代碼創建完整的項目結構
2. 設置 Monday OAuth 應用
3. 配置 .env 文件
4. 啟動 MCP 伺服器
5. 在 MaiAgent 中添加 MCP 工具
6. 進行端到端測試
