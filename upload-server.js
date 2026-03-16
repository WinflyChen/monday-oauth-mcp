const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

dotenv.config();

const app = express();
const PORT = process.env.MCP_PORT || 3002;

// ==================== 設置存儲 ====================

// 本地存儲配置
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const originalName = path.parse(file.originalname);
        cb(null, `${originalName.name}-${timestamp}${originalName.ext}`);
    }
});

const upload = multer({ 
    storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB
    }
});

// ==================== 中間件 ====================

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-ID']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 日誌中間件
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

// ==================== 工具函數 ====================

/**
 * 上傳文件到 Monday.com
 */
async function uploadFileToMonday(filePath, fileName, accessToken) {
    try {
        const fileStream = fs.createReadStream(filePath);
        const form = new FormData();
        form.append('file', fileStream);

        const response = await axios.post(
            'https://api.monday.com/v2/files',
            form,
            {
                headers: {
                    ...form.getHeaders(),
                    'Authorization': accessToken
                }
            }
        );

        return response.data;
    } catch (error) {
        console.error('Error uploading file to Monday:', error);
        throw new Error(`Failed to upload file: ${error.message}`);
    }
}

/**
 * 創建 Board
 */
async function createBoard(boardName, accessToken) {
    const query = `
        mutation {
            create_board(
                board_name: "${boardName}",
                board_kind: public
            ) {
                id
                name
                owner {
                    id
                    name
                }
            }
        }
    `;

    try {
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

        if (response.data.errors) {
            throw new Error(JSON.stringify(response.data.errors));
        }

        return response.data.data.create_board;
    } catch (error) {
        console.error('Error creating board:', error);
        throw new Error(`Failed to create board: ${error.message}`);
    }
}

/**
 * 添加文件到項目
 */
async function addFileToItem(boardId, itemId, fileUrl, accessToken) {
    const query = `
        mutation {
            add_file_to_item(
                item_id: ${itemId},
                file_url: "${fileUrl}"
            ) {
                id
            }
        }
    `;

    try {
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

        if (response.data.errors) {
            throw new Error(JSON.stringify(response.data.errors));
        }

        return response.data.data.add_file_to_item;
    } catch (error) {
        console.error('Error adding file to item:', error);
        throw new Error(`Failed to add file: ${error.message}`);
    }
}

/**
 * 更新項目的文件欄位
 */
async function updateItemFileField(boardId, itemId, fileUrl, columnId, accessToken) {
    // Monday 不原生支持直接上傳文件到 File 欄位
    // 我們使用替代方案：添加評論或更新相關欄位
    
    // 方案 1: 使用 add_file_to_item（推薦）
    return addFileToItem(boardId, itemId, fileUrl, accessToken);
}

/**
 * 獲取文件的公開 URL
 */
function getFilePublicUrl(filename) {
    return `${process.env.SERVER_URL || 'http://localhost:3002'}/files/${filename}`;
}

// ==================== 服務：Token Manager ====================

class TokenManager {
    constructor(storagePath) {
        this.storagePath = storagePath || './tokens.json';
        this.tokens = this.loadTokens();
    }

    loadTokens() {
        try {
            if (fs.existsSync(this.storagePath)) {
                return JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
            }
        } catch (error) {
            console.error('Error loading tokens:', error.message);
        }
        return {};
    }

    saveTokens() {
        try {
            fs.writeFileSync(this.storagePath, JSON.stringify(this.tokens, null, 2));
        } catch (error) {
            console.error('Error saving tokens:', error.message);
        }
    }

    saveUserToken(userId, tokenData) {
        this.tokens[userId] = {
            ...tokenData,
            saved_at: new Date().toISOString()
        };
        this.saveTokens();
        return this.tokens[userId];
    }

    getToken(userId) {
        return this.tokens[userId] || null;
    }

    isTokenExpired(userId) {
        const token = this.getToken(userId);
        if (!token) return true;
        if (!token.expires_at) return false;
        return Date.now() >= token.expires_at;
    }

    async getValidAccessToken(userId, oauthService) {
        const token = this.getToken(userId);
        if (!token) {
            throw new Error(`No token found for user ${userId}`);
        }

        if (this.isTokenExpired(userId) && token.refresh_token) {
            console.log(`🔄 Refreshing token for user ${userId}`);
            const newToken = await oauthService.refreshAccessToken(token.refresh_token);
            this.saveUserToken(userId, newToken);
            return newToken.access_token;
        }

        return token.access_token;
    }
}

// ==================== 服務：OAuth Service ====================

class OAuthService {
    constructor(clientId, clientSecret, redirectUri) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
        this.authEndpoint = 'https://auth.monday.com/oauth2/authorize';
        this.tokenEndpoint = 'https://auth.monday.com/oauth2/token';
    }

    getAuthorizeUrl(state) {
        const params = new URLSearchParams({
            client_id: this.clientId,
            response_type: 'code',
            redirect_uri: this.redirectUri,
            state: state || 'default',
            scope: 'me:read boards:read boards:write items:read items:write files:write'
        });
        return `${this.authEndpoint}?${params.toString()}`;
    }

    async exchangeCodeForToken(code) {
        try {
            const response = await axios.post(this.tokenEndpoint, {
                client_id: this.clientId,
                client_secret: this.clientSecret,
                code: code,
                redirect_uri: this.redirectUri,
                grant_type: 'authorization_code'
            });

            return {
                access_token: response.data.access_token,
                refresh_token: response.data.refresh_token,
                expires_in: response.data.expires_in || 3600,
                expires_at: Date.now() + (response.data.expires_in * 1000),
                token_type: response.data.token_type
            };
        } catch (error) {
            console.error('Token exchange error:', error.response?.data || error.message);
            throw error;
        }
    }

    async refreshAccessToken(refreshToken) {
        try {
            const response = await axios.post(this.tokenEndpoint, {
                client_id: this.clientId,
                client_secret: this.clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            });

            return {
                access_token: response.data.access_token,
                refresh_token: response.data.refresh_token || refreshToken,
                expires_in: response.data.expires_in || 3600,
                expires_at: Date.now() + (response.data.expires_in * 1000),
                token_type: response.data.token_type
            };
        } catch (error) {
            console.error('Token refresh error:', error.response?.data || error.message);
            throw error;
        }
    }
}

// ==================== 服務：Monday API ====================

class MondayAPI {
    constructor() {
        this.endpoint = 'https://api.monday.com/graphql';
    }

    async query(query, accessToken, variables = {}) {
        try {
            const response = await axios.post(
                this.endpoint,
                { query, variables },
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data.errors) {
                throw new Error(response.data.errors[0].message);
            }

            return response.data.data;
        } catch (error) {
            console.error('Monday API error:', error.message);
            throw error;
        }
    }

    async getUserInfo(accessToken) {
        const query = `
            query {
                me {
                    id
                    name
                    email
                }
            }
        `;
        return this.query(query, accessToken);
    }

    async getBoards(accessToken) {
        const query = `
            query {
                boards {
                    id
                    name
                    owner {
                        id
                        name
                    }
                }
            }
        `;
        return this.query(query, accessToken);
    }

    async createBoard(boardName, accessToken) {
        const query = `
            mutation {
                create_board(board_name: "${boardName}", board_kind: public) {
                    board {
                        id
                        name
                    }
                }
            }
        `;
        return this.query(query, accessToken);
    }

    async createItem(boardId, itemName, columnValues = {}, accessToken) {
        const columnValuesStr = JSON.stringify(columnValues);
        const query = `
            mutation {
                create_item(board_id: ${boardId}, item_name: "${itemName}", column_values: "${columnValuesStr.replace(/"/g, '\\"')}") {
                    item {
                        id
                        name
                    }
                }
            }
        `;
        return this.query(query, accessToken);
    }
}

// ==================== 服務初始化 ====================

const tokenManager = new TokenManager(process.env.TOKEN_STORAGE_PATH || './tokens.json');
const oauthService = new OAuthService(
    process.env.MONDAY_CLIENT_ID,
    process.env.MONDAY_CLIENT_SECRET,
    process.env.MONDAY_REDIRECT_URI || `${process.env.SERVER_URL || 'http://localhost:3002'}/oauth/callback`
);
const mondayApi = new MondayAPI();

// ==================== 路由：OAuth ====================

app.get('/oauth/authorize', (req, res) => {
    try {
        const state = req.query.state || null;
        const authorizeUrl = oauthService.getAuthorizeUrl(state);
        res.redirect(authorizeUrl);
    } catch (error) {
        console.error('Error in authorize:', error);
        res.status(500).json({ error: 'Failed to generate authorization URL' });
    }
});

app.get('/oauth/callback', async (req, res) => {
    try {
        const { code, error } = req.query;

        if (error) {
            return res.status(400).json({ error: `Callback error: ${error}` });
        }

        if (!code) {
            return res.status(400).json({ error: 'No authorization code' });
        }

        const tokenData = await oauthService.exchangeCodeForToken(code);
        const accessToken = tokenData.access_token;
        const userInfo = await mondayApi.getUserInfo(accessToken);
        const userId = userInfo.me.id;

        tokenData.user_info = userInfo.me;
        const savedToken = tokenManager.saveUserToken(userId, tokenData);

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
                    <p>You can now upload files to Monday.com</p>
                </div>
            </body>
            </html>
        `;
        res.send(successHtml);
    } catch (error) {
        console.error('Error in callback:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== 路由：文件上傳 ====================

/**
 * POST /api/upload
 * 上傳文件到服務器
 * 需要提供：userId, boardId, itemId
 */
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        const { userId, boardId, itemId, columnId } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: 'No file provided' });
        }

        if (!userId || !boardId || !itemId) {
            return res.status(400).json({ 
                error: 'userId, boardId, and itemId are required' 
            });
        }

        // 獲取用戶的有效 Token
        const accessToken = await tokenManager.getValidAccessToken(userId, oauthService);

        // 獲取文件公開 URL
        const fileName = req.file.filename;
        const fileUrl = getFilePublicUrl(fileName);

        console.log(`📤 Uploading file to Monday - File: ${fileName}, URL: ${fileUrl}`);

        // 添加文件到 Monday 項目
        const result = await addFileToItem(boardId, itemId, fileUrl, accessToken);

        res.json({
            success: true,
            message: 'File uploaded successfully',
            data: {
                filename: fileName,
                fileUrl: fileUrl,
                fileSize: req.file.size,
                mimeType: req.file.mimetype,
                uploadedAt: new Date().toISOString(),
                mondayStatus: result
            }
        });

    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /api/upload-multiple
 * 批量上傳文件
 */
app.post('/api/upload-multiple', upload.array('files', 10), async (req, res) => {
    try {
        const { userId, boardId, itemId } = req.body;

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files provided' });
        }

        if (!userId || !boardId || !itemId) {
            return res.status(400).json({ 
                error: 'userId, boardId, and itemId are required' 
            });
        }

        const accessToken = await tokenManager.getValidAccessToken(userId, oauthService);
        const uploadResults = [];

        for (const file of req.files) {
            const fileName = file.filename;
            const fileUrl = getFilePublicUrl(fileName);

            try {
                const result = await addFileToItem(boardId, itemId, fileUrl, accessToken);
                uploadResults.push({
                    filename: fileName,
                    fileUrl: fileUrl,
                    status: 'success'
                });
            } catch (error) {
                uploadResults.push({
                    filename: fileName,
                    fileUrl: getFilePublicUrl(fileName),
                    status: 'failed',
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            message: `${uploadResults.length} files processed`,
            data: uploadResults
        });

    } catch (error) {
        console.error('Error uploading files:', error);
        res.status(400).json({ error: error.message });
    }
});

// ==================== 路由：Board 操作 ====================

/**
 * POST /api/board
 * 創建新 Board
 */
app.post('/api/board', async (req, res) => {
    try {
        const { userId, boardName } = req.body;

        if (!userId || !boardName) {
            return res.status(400).json({ 
                error: 'userId and boardName are required' 
            });
        }

        const accessToken = await tokenManager.getValidAccessToken(userId, oauthService);
        const board = await createBoard(boardName, accessToken);

        res.json({
            success: true,
            message: 'Board created successfully',
            data: board
        });

    } catch (error) {
        console.error('Error creating board:', error);
        res.status(400).json({ error: error.message });
    }
});

/**
 * GET /api/boards
 * 獲取用戶的 Board 列表
 */
app.get('/api/boards', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'] || req.query.userId;

        if (!userId) {
            return res.status(401).json({ error: 'userId is required' });
        }

        const accessToken = await tokenManager.getValidAccessToken(userId, oauthService);
        const boards = await mondayApi.getBoards(accessToken);

        res.json(boards);
    } catch (error) {
        console.error('Error getting boards:', error);
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /api/board/:boardId/item
 * 在 Board 中創建項目
 */
app.post('/api/board/:boardId/item', async (req, res) => {
    try {
        const { userId, itemName, columnValues } = req.body;
        const { boardId } = req.params;

        if (!userId || !itemName) {
            return res.status(400).json({ 
                error: 'userId and itemName are required' 
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
        console.error('Error creating item:', error);
        res.status(400).json({ error: error.message });
    }
});

// ==================== 靜態文件服務 ====================

/**
 * 提供上傳的文件下載和預覽
 */
app.get('/files/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(uploadDir, filename);

        // 安全檢查：防止目錄遍歷攻擊
        if (!filePath.startsWith(uploadDir)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        // 設置適當的 MIME 類型
        const ext = path.extname(filename).toLowerCase();
        const mimeTypes = {
            '.pdf': 'application/pdf',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.mp4': 'video/mp4',
            '.txt': 'text/plain',
            '.zip': 'application/zip'
        };

        const mimeType = mimeTypes[ext] || 'application/octet-stream';
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } catch (error) {
        console.error('Error serving file:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 列出所有上傳的文件
 */
app.get('/api/files', (req, res) => {
    try {
        const files = fs.readdirSync(uploadDir).map(filename => ({
            filename,
            url: getFilePublicUrl(filename),
            size: fs.statSync(path.join(uploadDir, filename)).size,
            uploadedAt: fs.statSync(path.join(uploadDir, filename)).mtime
        }));

        res.json({
            success: true,
            data: files
        });
    } catch (error) {
        console.error('Error listing files:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 刪除文件
 */
app.delete('/api/files/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(uploadDir, filename);

        // 安全檢查
        if (!filePath.startsWith(uploadDir)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        fs.unlinkSync(filePath);

        res.json({
            success: true,
            message: `File ${filename} deleted`
        });
    } catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== 健康檢查 ====================

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        service: 'Monday Upload MCP',
        timestamp: new Date().toISOString()
    });
});

app.get('/', (req, res) => {
    res.json({
        name: 'Monday Upload MCP Server',
        version: '1.0.0',
        features: [
            'File upload to Monday',
            'Create Board',
            'Create Item with attachments'
        ],
        endpoints: {
            auth: {
                authorize: 'GET /oauth/authorize',
                callback: 'GET /oauth/callback'
            },
            upload: {
                uploadFile: 'POST /api/upload',
                uploadMultiple: 'POST /api/upload-multiple',
                listFiles: 'GET /api/files',
                deleteFile: 'DELETE /api/files/:filename',
                getFile: 'GET /files/:filename'
            },
            board: {
                createBoard: 'POST /api/board',
                listBoards: 'GET /api/boards',
                createItem: 'POST /api/board/:boardId/item'
            }
        }
    });
});

// ==================== 錯誤處理 ====================

app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ 
        error: err.message || 'Internal Server Error',
        timestamp: new Date().toISOString()
    });
});

// ==================== 啟動伺服器 ====================

app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║   Monday Upload MCP 伺服器已啟動       ║
╠════════════════════════════════════════╣
║  🌐 網址: http://localhost:${PORT}     ║
║  📤 上傳: /api/upload                  ║
║  📋 Board: /api/board                  ║
║  📁 文件: /files/:filename             ║
╚════════════════════════════════════════╝
    `);
});

module.exports = app;
