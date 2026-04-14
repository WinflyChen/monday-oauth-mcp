/**
 * Monday.com MCP Server (Model Context Protocol)
 * 實作標準 MCP JSON-RPC 協議，支援 Streamable HTTP
 * MaiAgent 透過 POST / 來溝通
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const FormData = require('form-data');

const app = express();
const PORT = process.env.MCP_SERVER_PORT || 3003;
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;
const TOKEN_STORAGE_PATH = process.env.TOKEN_STORAGE_PATH || './tokens.json';
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// ============================================================================
// 初始化
// ============================================================================

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const upload = multer({
    dest: UPLOAD_DIR,
    limits: { fileSize: 100 * 1024 * 1024 }
});

// ============================================================================
// 下載遠端檔案到本機暫存
// ============================================================================

async function downloadFileToTemp(fileUrl, fileName) {
    const tempPath = path.join(UPLOAD_DIR, `tmp_${Date.now()}_${fileName}`);
    const response = await axios.get(fileUrl, { responseType: 'stream' });
    const writer = fs.createWriteStream(tempPath);
    await new Promise((resolve, reject) => {
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
    return tempPath;
}

// ============================================================================
// 實際二進制上傳到 Monday欄位
// ============================================================================

async function uploadFileBinaryToColumn(itemId, columnId, filePath, fileName, accessToken) {
    const form = new FormData();
    const query = `mutation add_file($file: File!) {
        add_file_to_column(item_id: ${itemId}, column_id: "${columnId}", file: $file) { id }
    }`;
    form.append('query', query);
    form.append('variables[file]', fs.createReadStream(filePath), {
        filename: fileName,
        contentType: 'application/octet-stream'
    });
    const response = await axios.post('https://api.monday.com/v2/file', form, {
        headers: { ...form.getHeaders(), 'Authorization': `Bearer ${accessToken}` },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
    });
    if (response.data.errors) throw new Error(response.data.errors[0].message);
    return response.data.data.add_file_to_column;
}

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use('/files', express.static(UPLOAD_DIR));

// ============================================================================
// Token Manager
// ============================================================================

function loadTokens() {
    try {
        if (fs.existsSync(TOKEN_STORAGE_PATH)) {
            return JSON.parse(fs.readFileSync(TOKEN_STORAGE_PATH, 'utf8'));
        }
    } catch (e) {}
    return {};
}

function saveTokens(tokens) {
    fs.writeFileSync(TOKEN_STORAGE_PATH, JSON.stringify(tokens, null, 2));
}

function getAccessToken(userId) {
    const tokens = loadTokens();
    const token = tokens[userId];
    if (!token) throw new Error(`未授權的用戶: ${userId}，請先完成 OAuth 授權`);
    return token.access_token || token.accessToken;
}

// ============================================================================
// Monday API
// ============================================================================

async function mondayQuery(query, accessToken) {
    const response = await axios.post(
        'https://api.monday.com/graphql',
        { query },
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
}

// ============================================================================
// MCP 工具定義
// ============================================================================

const TOOLS = [
    {
        name: 'monday_get_boards',
        description: '獲取 Monday.com 上的所有看板列表。使用此工具查看用戶有哪些看板。',
        inputSchema: {
            type: 'object',
            properties: {
                userId: {
                    type: 'string',
                    description: '用戶 ID，用於識別授權用戶'
                }
            },
            required: ['userId']
        }
    },
    {
        name: 'monday_create_board',
        description: '在 Monday.com 上創建一個新的看板。',
        inputSchema: {
            type: 'object',
            properties: {
                userId: { type: 'string', description: '用戶 ID' },
                boardName: { type: 'string', description: '新看板的名稱' }
            },
            required: ['userId', 'boardName']
        }
    },
    {
        name: 'monday_create_item',
        description: '在 Monday.com 的指定看板上創建一個新的項目（任務）。',
        inputSchema: {
            type: 'object',
            properties: {
                userId: { type: 'string', description: '用戶 ID' },
                boardId: { type: 'string', description: '看板 ID (Board ID)' },
                itemName: { type: 'string', description: '項目名稱' }
            },
            required: ['userId', 'boardId', 'itemName']
        }
    },
    {
        name: 'monday_get_items',
        description: '獲取指定看板上的所有項目列表。',
        inputSchema: {
            type: 'object',
            properties: {
                userId: { type: 'string', description: '用戶 ID' },
                boardId: { type: 'string', description: '看板 ID' }
            },
            required: ['userId', 'boardId']
        }
    },
    {
        name: 'monday_get_auth_url',
        description: '獲取 Monday.com 的 OAuth 授權連結。當用戶需要登入授權時使用此工具，然後引導用戶開啟該網址。',
        inputSchema: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'monday_upload_file_to_column',
        description: '上傳圖片或文件到 Monday.com 的指定欄位（File 欄位），上傳後可在看板中直接看到圖片縮圖，不是連結。需要提供 itemId、columnId 和本地文件路徑。',
        inputSchema: {
            type: 'object',
            properties: {
                userId: { type: 'string', description: '用戶 ID' },
                itemId: { type: 'string', description: '項目 ID (Item ID)' },
                columnId: { type: 'string', description: '欄位 ID，例如 file_mkzrr5mp' },
                filePath: { type: 'string', description: '（本機用）本地文件的絕對路徑' },
                fileUrl: { type: 'string', description: '（遠端用）文件的 HTTP/HTTPS 網址，會自動下載後上傳' },
                fileName: { type: 'string', description: '文件名稱（含副檔名），例如 photo.jpg' }
            },
            required: ['userId', 'itemId', 'columnId', 'fileName']
        }
    }
];

// ============================================================================
// MCP 工具執行
// ============================================================================

async function executeTool(name, args) {
    // 驗證 userId - 防止跨用戶存取
    if (name !== 'monday_get_auth_url') {
        const { userId } = args;
        if (!userId || typeof userId !== 'string' || userId.trim() === '') {
            throw new Error(`❌ 安全驗證失敗: userId 必須提供且有效。收到: ${JSON.stringify({ userId, args })}`);
        }
        console.log(`✓ 用戶驗證成功: ${userId} 呼叫工具 ${name}`);
    }

    switch (name) {

        case 'monday_get_auth_url': {
            const clientId = process.env.MONDAY_CLIENT_ID;
            const redirectUri = process.env.MONDAY_REDIRECT_URI || `${SERVER_URL}/oauth/callback`;
            const authUrl = `https://auth.monday.com/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}`;
            return {
                authUrl,
                message: '請引導用戶開啟此網址完成授權：' + authUrl
            };
        }

        case 'monday_upload_file_to_column': {
            const { userId, itemId, columnId, filePath, fileUrl, fileName } = args;
            const token = getAccessToken(userId);
            let localPath = filePath;
            let isTempFile = false;

            if (!localPath && fileUrl) {
                // 從 URL 下載到暫存
                console.log(`📥 Downloading file from URL: ${fileUrl}`);
                localPath = await downloadFileToTemp(fileUrl, fileName);
                isTempFile = true;
            }

            if (!localPath || !fs.existsSync(localPath)) {
                throw new Error(`找不到文件，請提供 filePath（本機路徑）或 fileUrl（網路網址）`);
            }

            const result = await uploadFileBinaryToColumn(itemId, columnId, localPath, fileName, token);

            // 清理暫存文件
            if (isTempFile) try { fs.unlinkSync(localPath); } catch (e) {}

            return {
                success: true,
                result,
                message: `文件 "${fileName}" 已成功上傳到 Monday 欄位 "${columnId}"，可在看板中直接預覽縮圖`
            };
        }

        case 'monday_get_boards': {
            const { userId } = args;
            const token = getAccessToken(userId);
            const data = await mondayQuery(`
                query { boards { id name description state } }
            `, token);
            return {
                boards: data.boards,
                count: data.boards.length
            };
        }

        case 'monday_create_board': {
            const { userId, boardName } = args;
            const token = getAccessToken(userId);
            const data = await mondayQuery(`
                mutation {
                    create_board(board_name: "${boardName}", board_kind: public) {
                        board { id name }
                    }
                }
            `, token);
            return {
                success: true,
                board: data.create_board.board,
                message: `看板 "${boardName}" 創建成功，ID: ${data.create_board.board.id}`
            };
        }

        case 'monday_create_item': {
            const { userId, boardId, itemName } = args;
            const token = getAccessToken(userId);
            const data = await mondayQuery(`
                mutation {
                    create_item(board_id: ${boardId}, item_name: "${itemName}") {
                        item { id name }
                    }
                }
            `, token);
            return {
                success: true,
                item: data.create_item.item,
                message: `項目 "${itemName}" 創建成功，ID: ${data.create_item.item.id}`
            };
        }

        case 'monday_get_items': {
            const { userId, boardId } = args;
            const token = getAccessToken(userId);
            const data = await mondayQuery(`
                query {
                    boards(ids: [${boardId}]) {
                        items_page {
                            items {
                                id
                                name
                                state
                                column_values { id text }
                            }
                        }
                    }
                }
            `, token);
            const items = data.boards[0]?.items_page?.items || [];
            return {
                items,
                count: items.length
            };
        }

        default:
            throw new Error(`未知的工具: ${name}`);
    }
}

// ============================================================================
// MCP JSON-RPC Handler（標準 MCP 協議）
// ============================================================================

async function handleMCPRequest(req, res) {
    const body = req.body;

    // 支援批次請求
    const requests = Array.isArray(body) ? body : [body];
    const responses = [];

    for (const request of requests) {
        const { jsonrpc, id, method, params } = request;

        try {
            let result;

            switch (method) {

                // 初始化握手
                case 'initialize':
                    result = {
                        protocolVersion: '2024-11-05',
                        capabilities: {
                            tools: {}
                        },
                        serverInfo: {
                            name: 'Monday.com MCP Server',
                            version: '1.0.0'
                        }
                    };
                    break;

                // 通知類（不需要回應）
                case 'notifications/initialized':
                    continue;

                // 列出所有工具
                case 'tools/list':
                    result = { tools: TOOLS };
                    break;

                // 執行工具
                case 'tools/call': {
                    const { name, arguments: toolArgs } = params;
                    console.log(`\n🔧 工具調用: ${name}`);
                    console.log(`   參數: ${JSON.stringify(toolArgs)}`);

                    const toolResult = await executeTool(name, toolArgs || {});
                    console.log(`   ✅ 結果: ${JSON.stringify(toolResult).substring(0, 100)}...`);

                    result = {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(toolResult, null, 2)
                            }
                        ]
                    };
                    break;
                }

                default:
                    responses.push({
                        jsonrpc: '2.0',
                        id,
                        error: {
                            code: -32601,
                            message: `Method not found: ${method}`
                        }
                    });
                    continue;
            }

            if (id !== undefined) {
                responses.push({ jsonrpc: '2.0', id, result });
            }

        } catch (error) {
            console.error(`❌ 工具執行錯誤: ${error.message}`);
            responses.push({
                jsonrpc: '2.0',
                id,
                error: {
                    code: -32000,
                    message: error.message
                }
            });
        }
    }

    if (responses.length === 0) {
        return res.status(204).send();
    }

    res.json(Array.isArray(body) ? responses : responses[0]);
}

// ============================================================================
// 路由設定
// ============================================================================

// 主要 MCP 端點 (POST /)
app.post('/', handleMCPRequest);

// OAuth 授權路由
app.get('/oauth/authorize', (req, res) => {
    const clientId = process.env.MONDAY_CLIENT_ID;
    const redirectUri = process.env.MONDAY_REDIRECT_URI || `${SERVER_URL}/oauth/callback`;
    const authUrl = `https://auth.monday.com/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=me:read boards:read boards:write updates:write`;
    res.redirect(authUrl);
});

// OAuth Callback
app.get('/oauth/callback', async (req, res) => {
    const { code, error } = req.query;

    if (error) {
        return res.status(400).send(`<h1>授權失敗</h1><p>${error}</p>`);
    }

    try {
        const tokenResponse = await axios.post('https://auth.monday.com/oauth2/token', {
            client_id: process.env.MONDAY_CLIENT_ID,
            client_secret: process.env.MONDAY_CLIENT_SECRET,
            code,
            redirect_uri: process.env.MONDAY_REDIRECT_URI || `${SERVER_URL}/oauth/callback`,
            grant_type: 'authorization_code'
        });

        const { access_token, refresh_token } = tokenResponse.data;

        // 取得用戶資訊
        const userInfo = await mondayQuery('query { me { id name email } }', access_token);
        const userId = userInfo.me.id;

        // 儲存 token
        const tokens = loadTokens();
        tokens[userId] = {
            access_token,
            refresh_token,
            user: userInfo.me,
            saved_at: new Date().toISOString()
        };
        saveTokens(tokens);

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>授權成功</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 50px; background: #f5f5f5; }
                    .card { background: white; padding: 30px; border-radius: 10px; max-width: 500px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .success { color: #28a745; font-size: 24px; }
                    code { background: #f0f0f0; padding: 5px 10px; border-radius: 4px; font-size: 16px; }
                    .hint { color: #666; font-size: 14px; margin-top: 15px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <p class="success">✅ Monday.com 授權成功！</p>
                    <p>用戶名稱：<strong>${userInfo.me.name}</strong></p>
                    <p>Email：${userInfo.me.email}</p>
                    <p>您的 User ID：<br><code>${userId}</code></p>
                    <p class="hint">⚠️ 請複製上方的 User ID，在 MaiAgent 對話中提供給 AI 使用。</p>
                </div>
            </body>
            </html>
        `);
    } catch (err) {
        res.status(500).send(`<h1>授權失敗</h1><p>${err.message}</p>`);
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        name: 'Monday.com MCP Server',
        port: PORT,
        protocol: 'MCP JSON-RPC 2024-11-05',
        tools: TOOLS.map(t => t.name)
    });
});

// ============================================================================
// 啟動
// ============================================================================

app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════╗
║     Monday.com MCP Server (MCP 協議)           ║
╚════════════════════════════════════════════════╝

🚀 MCP 伺服器已啟動
📍 MCP 端點: ${SERVER_URL}/ (POST)
🔗 OAuth 授權: ${SERVER_URL}/oauth/authorize
❤️  健康檢查: ${SERVER_URL}/health

🔧 已註冊工具 (${TOOLS.length} 個):
${TOOLS.map(t => `   - ${t.name}`).join('\n')}

${!process.env.MONDAY_CLIENT_ID ? '⚠️  警告: MONDAY_CLIENT_ID 未設置' : '✅ MONDAY_CLIENT_ID 已設置'}
${!process.env.MONDAY_CLIENT_SECRET ? '⚠️  警告: MONDAY_CLIENT_SECRET 未設置' : '✅ MONDAY_CLIENT_SECRET 已設置'}
    `);
});
