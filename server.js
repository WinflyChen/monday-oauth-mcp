/**
 * Monday.com OAuth MCP Server
 * Handles authentication, token management, and Monday API integration
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const PORT = process.env.MCP_PORT || 3001;
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;
const MONDAY_CLIENT_ID = process.env.MONDAY_CLIENT_ID;
const MONDAY_CLIENT_SECRET = process.env.MONDAY_CLIENT_SECRET;
const MONDAY_REDIRECT_URI = process.env.MONDAY_REDIRECT_URI || `${SERVER_URL}/oauth/callback`;
const TOKEN_STORAGE_PATH = process.env.TOKEN_STORAGE_PATH || './tokens.json';

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================================
// TOKEN MANAGEMENT SERVICE
// ============================================================================

class TokenManager {
  constructor(storagePath) {
    this.storagePath = storagePath;
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

  setToken(userId, accessToken, refreshToken, expiresIn) {
    const expiresAt = Date.now() + (expiresIn * 1000);
    this.tokens[userId] = {
      accessToken,
      refreshToken,
      expiresAt,
      createdAt: new Date().toISOString()
    };
    this.saveTokens();
    console.log(`✅ Token saved for user ${userId}`);
  }

  getToken(userId) {
    return this.tokens[userId] || null;
  }

  isTokenExpired(userId) {
    const token = this.getToken(userId);
    if (!token) return true;
    return Date.now() >= token.expiresAt;
  }

  async getValidAccessToken(userId, oauthService) {
    const token = this.getToken(userId);
    if (!token) {
      throw new Error(`No token found for user ${userId}`);
    }

    if (this.isTokenExpired(userId)) {
      console.log(`🔄 Token expired for user ${userId}, refreshing...`);
      const newToken = await oauthService.refreshAccessToken(token.refreshToken);
      this.setToken(userId, newToken.accessToken, newToken.refreshToken, newToken.expiresIn);
      return newToken.accessToken;
    }

    return token.accessToken;
  }

  clearToken(userId) {
    delete this.tokens[userId];
    this.saveTokens();
  }

  getAllTokens() {
    return Object.keys(this.tokens).map(userId => ({
      userId,
      expiresAt: this.tokens[userId].expiresAt,
      isExpired: this.isTokenExpired(userId)
    }));
  }
}

// ============================================================================
// OAUTH SERVICE
// ============================================================================

class OAuthService {
  constructor(clientId, clientSecret, redirectUri) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.authorizationEndpoint = 'https://auth.monday.com/oauth2/authorize';
    this.tokenEndpoint = 'https://auth.monday.com/oauth2/token';
  }

  getAuthorizationUrl(state) {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      state: state
    });

    // 添加强制桌面版参数（Monday.com 可能支持）
    const baseUrl = `${this.authorizationEndpoint}?${params.toString()}`;
    // 尝试添加 app_redirect=false 或类似参数来强制网页版
    return `${baseUrl}&app_redirect=false&view=web`;
  }

  async exchangeCodeForToken(code) {
    try {
      const params = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: code,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code'
      });
      const response = await axios.post(this.tokenEndpoint, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in || 3600,
        tokenType: response.data.token_type
      };
    } catch (error) {
      console.error('Token exchange error status:', error.response?.status);
      console.error('Token exchange error data:', JSON.stringify(error.response?.data));
      console.error('Token exchange error msg:', error.message);
      throw error;
    }
  }

  async refreshAccessToken(refreshToken) {
    try {
      const params = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      });
      const response = await axios.post(this.tokenEndpoint, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token || refreshToken,
        expiresIn: response.data.expires_in || 3600,
        tokenType: response.data.token_type
      };
    } catch (error) {
      console.error('Token refresh error:', error.response?.data || error.message);
      throw error;
    }
  }
}

// ============================================================================
// MONDAY API SERVICE
// ============================================================================

class MondayAPI {
  constructor() {
    this.endpoint = 'https://api.monday.com/v2';
  }

  async query(query, accessToken, variables = {}) {
    try {
      const response = await axios.post(
        this.endpoint,
        { query, variables },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'API-Version': '2024-01'
          }
        }
      );

      if (response.data.errors) {
        console.error('GraphQL error:', response.data.errors);
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

// ============================================================================
// INITIALIZE SERVICES
// ============================================================================

const tokenManager = new TokenManager(TOKEN_STORAGE_PATH);
const oauthService = new OAuthService(MONDAY_CLIENT_ID, MONDAY_CLIENT_SECRET, MONDAY_REDIRECT_URI);
const mondayAPI = new MondayAPI();

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Extract user from X-User-ID header
const extractUser = (req, res, next) => {
  req.userId = req.headers['x-user-id'] || req.query.userId || 'default-user';
  next();
};

app.use(extractUser);

// ============================================================================
// ROUTES - OAUTH
// ============================================================================

/**
 * Mobile redirect intermediary page
 * GET /oauth/mobile-helper?authUrl=...
 * Shows instructions for using "Open in..." on mobile
 */
app.get('/oauth/mobile-helper', (req, res) => {
  try {
    const authUrl = decodeURIComponent(req.query.authUrl || '');
    const userAgent = req.headers['user-agent'] || '';
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

    if (!authUrl) {
      return res.status(400).json({ error: 'Missing authUrl parameter' });
    }

    console.log(`📱 Mobile helper accessed: ${isMobile ? 'Mobile' : 'Desktop'}`);

    res.send(`<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>開啟授權頁面</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      background: white;
      border-radius: 20px;
      padding: 40px 32px;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
    }
    .icon { font-size: 64px; margin-bottom: 20px; }
    h1 { font-size: 1.6rem; font-weight: 700; color: #2d3748; margin-bottom: 16px; }
    .step-box {
      background: #f7fafc;
      border-left: 4px solid #667eea;
      padding: 16px;
      margin: 20px 0;
      text-align: left;
      border-radius: 8px;
    }
    .step-num {
      display: inline-block;
      background: #667eea;
      color: white;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      text-align: center;
      line-height: 32px;
      font-weight: 700;
      margin-right: 12px;
    }
    .step-title { font-weight: 700; color: #2d3748; margin-bottom: 8px; }
    .step-text { font-size: 0.95rem; color: #718096; line-height: 1.6; }
    .button-group { margin-top: 32px; }
    .btn {
      display: block;
      padding: 16px 24px;
      margin: 12px 0;
      border: none;
      border-radius: 12px;
      font-size: 1.05rem;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.3s ease;
    }
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4); }
    .btn-secondary {
      background: #e2e8f0;
      color: #2d3748;
    }
    .btn-secondary:hover { background: #cbd5e0; }
    .warning-box {
      background: #fff5f5;
      border: 1.5px solid #fc8181;
      border-radius: 12px;
      padding: 16px;
      margin: 24px 0;
    }
    .warning-title { color: #c53030; font-weight: 700; margin-bottom: 8px; }
    .warning-text { color: #742a2a; font-size: 0.95rem; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🔓</div>
    <h1>完成 monday.com 授權</h1>

    <div class="warning-box">
      <div class="warning-title">⚠️ 重要</div>
      <div class="warning-text">
        monday.com 偵測到您使用行動設備。
        請按以下步驟，在<strong>桌面版瀏覽器</strong>中完成授權。
      </div>
    </div>

    <div class="ios-note">
      <div style="font-size: 0.95rem; color: #1a365d;">
        ✨ <strong>iOS 用戶無需額外操作！</strong><br>
        Safari 會直接打開授權頁面，無需像 Android 一樣選擇瀏覽器。
        按照下面的步驟即可完成授權。
      </div>
    </div>

    <div class="step-box">
      <div class="step-title">
        <span class="step-num">1️⃣</span>
        點擊下方「前往授權」按鈕
      </div>
      <div class="step-text">
        按鈕會在行動 Chrome 中開啟授權頁面。
      </div>
      
      <div class="android-note">
        <div style="font-size: 0.95rem; color: #000;">
          當看到「<strong>Open in Browser</strong>」對話框時：<br><br>
          <span class="checkbox-highlight">☐ Always open links from auth.monday.com in browser</span><br><br>
          <strong style="color: #c92a2a;">👉 一定要打勾才能完成設定！</strong><br>
          <span style="font-size: 0.85rem; color: #666;">（打勾後下次就不用再選）</span>
        </div>
      </div>
    </div>

    <div class="step-box">
      <div class="step-title">
        <span class="step-num">2️⃣</span>
        點選瀏覽器選單的「Open in...」選項
      </div>
      <div class="step-text">
        <strong>📱 Android Chrome：</strong> 點擊右上角「⋮」 → 看到「Open in...」並選擇<br>
        <strong>🍎 iOS Safari：</strong> 點擊右下角「↑↓」 → 向上滑到「Open in...」
      </div>
    </div>

    <div class="step-box">
      <div class="step-title">
        <span class="step-num">3️⃣</span>
        啟用「桌面版網站」模式
      </div>
      <div class="step-text">
        <strong style="display: block; margin-bottom: 8px;">🔧 Android Chrome：</strong>
        點擊右上角「<strong>⋮</strong>」(三點) 
        → 向下滑動 
        → 勾選「<strong>桌面版網站</strong>」<br>
        <br>
        <strong style="display: block; margin-bottom: 8px;">🔧 iOS Safari：</strong>
        點擊右下角「<strong>↑↓</strong>」(分享按鈕) 
        → 向上滑動 
        → 勾選「<strong>以桌面版方式查看網站</strong>」<br>
        <br>
        <span style="color: #666; font-size: 0.9rem;">💡 這樣瀏覽器會假裝是桌面設備，monday.com 就會顯示授權表單而非下載頁面</span>
      </div>
    </div>

    <div class="step-box">
      <div class="step-title">
        <span class="step-num">4️⃣</span>
        重新整理，看到授權表單
      </div>
      <div class="step-text">
        <strong>📱 Android：</strong> 點擊 Chrome 右上角「⟳」(重新整理) 或向下拖動<br>
        <strong>🍎 iOS：</strong> 向下拖動 Safari 頁面進行重新整理<br>
        <br>
        ✅ 應該看到 monday.com 授權表單（要求輸入 Email 和密碼），而非下載頁面<br>
        <br>
        輸入您的 monday.com 帳號並完成授權
      </div>
    </div>

    <div class="button-group">
      <a href="${authUrl}" class="btn btn-primary" target="_blank" rel="noopener">
        🚀 前往 monday.com 授權
      </a>
      <button class="btn btn-secondary" onclick="copyLink()">📋 複製授權連結</button>
    </div>

    <div class="warning-box" style="margin-top: 20px;">
      <div class="warning-title">💡 提示</div>
      <div class="warning-text">
        若上述方法無效，使用「複製連結」按鈕，
        並在 Chrome (Android) 或 Safari (iOS) 中直接貼上連結。
      </div>
    </div>

    <div class="warning-box" style="margin-top: 16px; background: #f0f9ff; border-color: #3182ce;">
      <div class="warning-title" style="color: #2c5282;">🔧 Android：管理「Always Open」設定</div>
      <div class="warning-text" style="color: #1a365d; font-size: 0.9rem;">
        如果之後想要修改或清除設定：<br>
        Android 設定 → 應用程式 → Chrome → 預設應用程式 → 清除預設值<br>
        <br>
        下次會重新詢問 ✓
      </div>
    </div>

    <div class="warning-box" style="margin-top: 16px; background: #f0f9f5; border-color: #2f9e68;">
      <div class="warning-title" style="color: #296d54;">✨ iOS：Safari 提示</div>
      <div class="warning-text" style="color: #0c3b2e; font-size: 0.9rem;">
        iOS 用戶通常不需要擔心瀏覽器選擇問題。<br>
        如果您想使用特定瀏覽器打開連結，可以在 iOS 設定中變更預設瀏覽器。<br>
        <br>
        iOS 設定 → 尋找「預設瀏覽器應用」→ 選擇您喜歡的瀏覽器
      </div>
    </div>
  </div>

  <script>
    const authUrl = ${JSON.stringify(authUrl)};
    
    function copyLink() {
      navigator.clipboard.writeText(authUrl).then(() => {
        alert('✅ 授權連結已複製到剪貼板');
      }).catch(() => {
        const el = document.createElement('textarea');
        el.value = authUrl;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        alert('✅ 連結已複製');
      });
    }
  </script>
</body>
</html>`);
  } catch (error) {
    console.error('Mobile helper error:', error);
    res.status(500).json({ error: 'Helper page error', details: error.message });
  }
});

/**
 * Start authorization flow
 * GET /oauth/authorize
 */
app.get('/oauth/authorize', (req, res) => {
  try {
    const telegramUserId = req.query.telegramUserId || req.userId;
    const state = `${Math.random().toString(36).substring(7)}_tg${telegramUserId}`;
    const authUrl = oauthService.getAuthorizationUrl(state);
    const userAgent = req.headers['user-agent'] || '';
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

    console.log(`🔗 Authorization started for user: ${req.userId}`);
    console.log(`   State: ${state}`);
    console.log(`   Device: ${isMobile ? '📱 Mobile' : '🖥️ Desktop'}`);
    if (req.query.telegramUserId) {
      console.log(`   Telegram User ID: ${req.query.telegramUserId}`);
    }

    // If mobile detected, redirect to helper page instead of showing OAuth page directly
    if (isMobile) {
      console.log('   → Redirecting to mobile helper page');
      const helperUrl = `${SERVER_URL}/oauth/mobile-helper?authUrl=${encodeURIComponent(authUrl)}`;
      return res.redirect(helperUrl);
    }

    console.log(`🔗 Authorization started for user: ${req.userId}`);
    console.log(`   State: ${state}`);
    if (req.query.telegramUserId) {
      console.log(`   Telegram User ID: ${req.query.telegramUserId}`);
    }

    res.send(`<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>連結 monday.com 帳號</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", sans-serif;
      background: #f4f6f9;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      background: white;
      border-radius: 20px;
      padding: 40px 32px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 4px 24px rgba(0,0,0,0.10);
      text-align: center;
    }
    .logo { font-size: 56px; margin-bottom: 16px; }
    h1 { font-size: 1.4rem; font-weight: 700; color: #1a202c; margin-bottom: 10px; }
    p { color: #718096; font-size: 0.95rem; line-height: 1.6; margin-bottom: 24px; }
    .btn {
      display: block;
      background: linear-gradient(135deg, #ff6b35, #f7931e);
      color: white;
      text-decoration: none;
      padding: 16px 24px;
      border-radius: 12px;
      font-size: 1.05rem;
      font-weight: 700;
      margin-bottom: 16px;
    }
    .divider {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 20px 0;
      color: #cbd5e0;
      font-size: 0.85rem;
    }
    .divider::before, .divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: #e2e8f0;
    }
    .android-box {
      background: #f7f8fa;
      border: 1.5px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 16px;
      text-align: left;
    }
    .android-box .title {
      font-weight: 700;
      font-size: 0.9rem;
      color: #2d3748;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .android-box .desc {
      font-size: 0.83rem;
      color: #718096;
      margin-bottom: 12px;
      line-height: 1.5;
    }
    .chrome-btn {
      display: block;
      width: 100%;
      background: #1a73e8;
      color: white;
      border: none;
      border-radius: 10px;
      padding: 12px;
      font-size: 0.95rem;
      font-weight: 700;
      cursor: pointer;
      margin-bottom: 10px;
    }
    .copy-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .copy-label {
      font-size: 0.78rem;
      color: #a0aec0;
    }
    .copy-btn {
      background: #2d3748;
      color: white;
      border: none;
      border-radius: 8px;
      padding: 6px 12px;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }
    .copy-btn.copied { background: #38a169; }
    .note { font-size: 0.82rem; color: #a0aec0; line-height: 1.5; }
    .android-box ol {
      list-style-position: inside;
      padding: 0;
      margin: 0;
    }
    .step-box ol {
      list-style-position: inside;
      padding: 0;
      margin: 0;
    }
    .step-box li {
      margin-bottom: 8px;
    }
    .android-note {
      background: #fff3cd;
      border: 2.5px solid #ff6b6b;
      border-radius: 12px;
      padding: 16px;
      margin: 20px 0;
      position: relative;
    }
    .android-note::before {
      content: '⚠️ 重要';
      display: block;
      font-weight: 800;
      color: #c92a2a;
      font-size: 1.1rem;
      margin-bottom: 8px;
    }
    .checkbox-highlight {
      background: #ffd43b;
      color: #000;
      padding: 8px 12px;
      border-radius: 8px;
      font-weight: 700;
      display: inline-block;
      margin: 8px 0;
    }
    .ios-note {
      background: #d3f9d8;
      border: 2px solid #51cf66;
      border-radius: 12px;
      padding: 16px;
      margin: 20px 0;
    }
    .ios-note::before {
      content: '✅ iOS 用戶';
      display: block;
      font-weight: 800;
      color: #2b8a3e;
      font-size: 1.1rem;
      margin-bottom: 8px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">📋</div>
    <h1>Connect monday.com Account</h1>
    <p>Tap the button below to authorize monday.com in your browser.</p>
    <a class="btn" href="${authUrl}" target="_blank" rel="noopener">Go to monday.com Authorization</a>

    <div class="divider">Android Users</div>

    <div class="android-box">
      <div class="title">📱 Redirected to the App download page?</div>
      <div class="desc">This is caused by Android intercepting the link. Tap below to open directly in Chrome:</div>
      <button class="chrome-btn" onclick="openInDesktopMode()">Open in Chrome</button>
      <div class="copy-row">
        <span class="copy-label">Or copy the URL and paste into Chrome:</span>
        <button class="copy-btn" id="copyBtn" onclick="copyUrl()">Copy URL</button>
      </div>
    </div>

    <div class="divider">If it still doesn't work</div>

    <div class="android-box" style="background: #fff5f5; border-color: #fc8181;">
      <div class="title" style="color: #c53030;">🔧 Enable Desktop Mode manually</div>
      <div class="desc">This is the most reliable solution:</div>

      <ol style="text-align: left; font-size: 0.9rem; line-height: 1.8; color: #2d3748;">
        <li>Copy the authorization URL (tap "Copy URL" above)</li>
        <li>Open <strong>Google Chrome</strong></li>
        <li>Paste the URL in the address bar, <strong>but don't press Enter yet</strong></li>
        <li>Tap the <strong>⋮</strong> menu in the top-right corner</li>
        <li>Scroll down to find "<strong>Desktop site</strong>"</li>
        <li>Toggle on "<strong>Desktop site</strong>" ✓</li>
        <li>Now press <strong>Enter</strong> to open the page</li>
        <li>You should see the monday.com login form (not the download page)</li>
      </ol>
    </div>

    <p class="note" style="margin-top: 20px;">
      ✅ After authorization you will be redirected back to Telegram automatically
    </p>
  </div>
  <script>
    const authUrl = ${JSON.stringify(authUrl)};

    function openInDesktopMode() {
      // For mobile users, use server-side proxy to handle User-Agent
      if (/Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent)) {
        console.log('Mobile detected - using server proxy');
        // Use server proxy that sends desktop User-Agent
        const proxyUrl = '/oauth/desktop-redirect?redirect_to=' + encodeURIComponent(authUrl);
        window.location.href = proxyUrl;
      } else {
        // Desktop: direct redirect
        window.location.href = authUrl;
      }
    }

    function copyUrl() {
      const urlToCopy = authUrl + '\\n\\n💡 提示：複製後貼到 Chrome 位址列，若出現下載頁面，點選「以桌面版開啟」';
      
      navigator.clipboard.writeText(authUrl).then(() => {
        showCopied();
      }).catch(() => {
        const el = document.createElement('textarea');
        el.value = authUrl;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        showCopied();
      });
    }

    function showCopied() {
      showCopied2();
    }

    // ── i18n ──────────────────────────────────────────────────────────
    const i18n = {
      'zh': {
        title:        '連結 monday.com 帳號',
        desc:         '點擊下方按鈕，在瀏覽器中完成 monday.com 授權。',
        authBtn:      '前往 monday.com 授權',
        divider1:     'Android 手機專用',
        androidTitle: '📱 點按鈕後被導到 App 下載頁？',
        androidDesc:  '這是 Android 系統攔截造成的。點下方按鈕可直接在 Chrome 開啟授權頁面：',
        chromeBtn:    '在 Chrome 中開啟授權頁面',
        copyLabel:    '或手動複製網址貼到 Chrome：',
        copyBtn:      '複製網址',
        copiedBtn:    '已複製 ✓',
        divider2:     '若仍無法成功',
        desktopTitle: '🔧 手動啟用「桌面模式」',
        desktopDesc:  '這是最可靠的解決方案：',
        steps: [
          '複製授權網址（點上方「複製」按鈕）',
          '開啟 <strong>Google Chrome</strong>',
          '在網址列貼上網址，<strong>但不要按Enter</strong>',
          '點擊網址列右側的「⋮」（三點選單）',
          '向下捲動找到「<strong>桌面版網站</strong>」',
          '點擊勾選「桌面版網站」 ✓',
          '現在按 <strong>Enter</strong> 開啟授權頁面',
          '應該看到 monday.com 授權表單（而非下載頁面）'
        ],
        note: '✅ 授權完成後會自動回傳 Telegram，無需手動返回'
      },
      'en': {
        title:        'Connect monday.com Account',
        desc:         'Tap the button below to authorize monday.com in your browser.',
        authBtn:      'Go to monday.com Authorization',
        divider1:     'Android Users',
        androidTitle: '📱 Redirected to the App Store?',
        androidDesc:  'This is caused by Android intercepting the link. Tap below to open directly in Chrome:',
        chromeBtn:    'Open in Chrome',
        copyLabel:    'Or copy the URL and paste into Chrome:',
        copyBtn:      'Copy URL',
        copiedBtn:    'Copied ✓',
        divider2:     'If it still doesn\'t work',
        desktopTitle: '🔧 Enable Desktop Mode manually',
        desktopDesc:  'This is the most reliable solution:',
        steps: [
          'Copy the authorization URL (tap "Copy URL" above)',
          'Open <strong>Google Chrome</strong>',
          'Paste the URL in the address bar, <strong>but don\'t press Enter yet</strong>',
          'Tap the <strong>⋮</strong> menu in the top-right corner',
          'Scroll down to find "<strong>Desktop site</strong>"',
          'Toggle on "<strong>Desktop site</strong>" ✓',
          'Now press <strong>Enter</strong> to open the page',
          'You should see the monday.com login form (not the download page)'
        ],
        note: '✅ After authorization you will be redirected back to Telegram automatically'
      },
      'ja': {
        title:        'monday.com アカウントを連携',
        desc:         '下のボタンをタップして、ブラウザで monday.com の認証を完了してください。',
        authBtn:      'monday.com 認証へ',
        divider1:     'Android ユーザー向け',
        androidTitle: '📱 アプリのダウンロードページに飛ばされましたか？',
        androidDesc:  'Android がリンクを横取りしています。下のボタンで Chrome に直接開けます：',
        chromeBtn:    'Chrome で開く',
        copyLabel:    'またはURLをコピーして Chrome に貼り付け：',
        copyBtn:      'URLをコピー',
        copiedBtn:    'コピーしました ✓',
        divider2:     'うまくいかない場合',
        desktopTitle: '🔧 「PC版サイト」を手動で有効にする',
        desktopDesc:  '最も確実な方法：',
        steps: [
          '認証URLをコピー（上のボタンをタップ）',
          '<strong>Google Chrome</strong> を開く',
          'アドレスバーにURLを貼り付け（<strong>Enterはまだ押さない</strong>）',
          '右上の <strong>⋮</strong> メニューをタップ',
          '下にスクロールして「<strong>PC版サイト</strong>」を探す',
          '「PC版サイト」をオン ✓',
          '<strong>Enter</strong> を押してページを開く',
          'monday.com のログィンフォームが表示されるはずです'
        ],
        note: '✅ 認証完了後、自動で Telegram に戻ります'
      },
      'ko': {
        title:        'monday.com 계정 연결',
        desc:         '아래 버튼을 눌러 브라우저에서 monday.com 인증을 완료하세요.',
        authBtn:      'monday.com 인증으로 이동',
        divider1:     'Android 사용자 전용',
        androidTitle: '📱 앱 다운로드 페이지로 이동됐나요?',
        androidDesc:  'Android가 링크를 가로챈 것입니다. 아래 버튼으로 Chrome에서 바로 열 수 있습니다:',
        chromeBtn:    'Chrome에서 열기',
        copyLabel:    '또는 URL을 복사하여 Chrome에 붙여넣기:',
        copyBtn:      'URL 복사',
        copiedBtn:    '복사됨 ✓',
        divider2:     '그래도 안 될 경우',
        desktopTitle: '🔧 데스크톱 모드 수동 활성화',
        desktopDesc:  '가장 확실한 방법:',
        steps: [
          '인증 URL 복사 (위의 복사 버튼 탭)',
          '<strong>Google Chrome</strong> 열기',
          '주소창에 URL 붙여넣기 (<strong>Enter는 아직 누르지 마세요</strong>)',
          '오른쪽 상단 <strong>⋮</strong> 메뉴 탭',
          '스크롤하여 "<strong>데스크톱 버전</strong>" 찾기',
          '"<strong>데스크톱 버전</strong>" 켜기 ✓',
          '<strong>Enter</strong>를 눌러 페이지 열기',
          'monday.com 로그인 폼이 표시되어야 합니다'
        ],
        note: '✅ 인증 완료 후 자동으로 Telegram으로 돌아갑니다'
      }
    };

    function getLang() {
      // DEMO MODE: force English — restore auto-detect when ready:
      // const lang = (navigator.languages?.[0] || navigator.language || 'zh').toLowerCase();
      // if (lang.startsWith('ja')) return 'ja';
      // if (lang.startsWith('ko')) return 'ko';
      // if (lang.startsWith('en')) return 'en';
      // return 'zh';
      return 'en';
    }

    function applyI18n() {
      const t = i18n[getLang()];
      const q = (sel) => document.querySelector(sel);
      const qa = (sel) => document.querySelectorAll(sel);

      document.title = t.title;
      qa('h1').forEach(el => el.textContent = t.title);
      qa('p:not(.note)').forEach(el => { if (el.closest('.card') && !el.closest('.android-box')) el.textContent = t.desc; });

      // Main auth buttons
      qa('a.btn').forEach(el => el.textContent = t.authBtn);

      // Dividers
      const dividers = qa('.divider');
      if (dividers[0]) dividers[0].textContent = t.divider1;
      if (dividers[1]) dividers[1].textContent = t.divider2;

      // Android box (first one)
      const boxes = qa('.android-box');
      if (boxes[0]) {
        const titleEl = boxes[0].querySelector('.title');
        const descEl  = boxes[0].querySelector('.desc');
        if (titleEl) titleEl.textContent = t.androidTitle;
        if (descEl)  descEl.textContent  = t.androidDesc;
        const chromeBtn = boxes[0].querySelector('.chrome-btn');
        if (chromeBtn) chromeBtn.textContent = t.chromeBtn;
        const copyLbl = boxes[0].querySelector('.copy-label');
        if (copyLbl) copyLbl.textContent = t.copyLabel;
        const copyBtn = boxes[0].querySelector('.copy-btn');
        if (copyBtn) { copyBtn.textContent = t.copyBtn; copyBtn._i18n = t; }
      }

      // Desktop mode box (second android-box with red bg)
      if (boxes[1]) {
        const titleEl = boxes[1].querySelector('.title');
        const descEl  = boxes[1].querySelector('.desc');
        if (titleEl) titleEl.textContent = t.desktopTitle;
        if (descEl)  descEl.textContent  = t.desktopDesc;
        const items = boxes[1].querySelectorAll('li');
        items.forEach((li, i) => { if (t.steps[i]) li.innerHTML = t.steps[i]; });
      }

      // Note
      qa('.note').forEach(el => el.textContent = t.note);
    }

    document.addEventListener('DOMContentLoaded', applyI18n);

    function showCopied2() {
      const btn = document.getElementById('copyBtn');
      const t = i18n[getLang()];
      btn.textContent = t.copiedBtn;
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = t.copyBtn; btn.classList.remove('copied'); }, 2000);
    }
  </script>
</body>
</html>`);
  } catch (error) {
    console.error('Authorization error:', error);
    res.status(500).json({ error: 'Authorization failed', details: error.message });
  }
});

/**
 * Mobile OAuth Desktop Redirect Proxy v2
 * GET /oauth/desktop-redirect?redirect_to=...
 * Handles mobile clients by making server-side request with desktop User-Agent
 * then redirects client (preserving full desktop context)
 */
app.get('/oauth/desktop-redirect', async (req, res) => {
  try {
    const redirectTo = req.query.redirect_to || req.query.authUrl;
    
    if (!redirectTo) {
      return res.status(400).json({ error: 'Missing redirect_to parameter' });
    }

    // Decode if URL encoded
    const decodedUrl = decodeURIComponent(redirectTo);
    
    console.log(`🔄 Desktop redirect initiated for: ${decodedUrl.substring(0, 100)}...`);

    // Server-side HEAD request with desktop User-Agent to check response
    try {
      const response = await axios.head(decodedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Cache-Control': 'max-age=0'
        },
        maxRedirects: 5,
        validateStatus: () => true // Accept any status
      });
      
      console.log(`   Monday.com response: ${response.status}`);
      
      // If Monday redirects (3xx), client will follow it with desktop User-Agent
      // If Monday returns 200 but with app download page, we'll catch it below
      
    } catch (headErr) {
      console.warn(`   HEAD check failed, will use GET fallback: ${headErr.message}`);
    }

    // Return a page that triggers a full-page navigation to Monday
    // This way, the browser maintains full desktop context during redirect
    res.send(`<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="0; url=javascript:void(0)">
  <title>正在開啟授權頁面...</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      margin: 0;
      color: white;
    }
    .container {
      text-align: center;
      padding: 20px;
    }
    .spinner {
      width: 50px;
      height: 50px;
      border: 4px solid rgba(255,255,255,0.3);
      border-top: 4px solid white;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    h1 { font-size: 1.5rem; margin: 0 0 10px 0; font-weight: 700; }
    p { font-size: 1rem; opacity: 0.9; margin: 0; }
    .hint { font-size: 0.9rem; opacity: 0.7; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h1>Opening Authorization Page...</h1>
    <p>Connecting to monday.com in desktop mode</p>
    <div class="hint">⏳ If the page doesn't redirect automatically, tap the button below</div>
    <button id="fallbackBtn" style="margin-top:20px; padding:12px 24px; background:white; color:#667eea; border:none; border-radius:8px; font-size:1rem; font-weight:700; cursor:pointer; display:none;">Open Authorization Page</button>
  </div>

  <script>
    const authUrl = ${JSON.stringify(decodedUrl)};
    
    // Strategy 1: Fetch with desktop headers to check what Monday actually returns
    console.log('Starting OAuth redirect...');
    
    const desktopHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'DNT': '1',
      'Upgrade-Insecure-Requests': '1'
    };
    
    // Attempt to fetch with desktop context
    fetch(authUrl, {
      method: 'GET',
      headers: desktopHeaders,
      credentials: 'omit',
      redirect: 'follow',
      mode: 'no-cors'
    })
    .then(response => {
      console.log('Fetch response received, attempting direct redirect');
      // Even if CORS blocks content, we can still do a direct redirect
      window.location.href = authUrl;
    })
    .catch(err => {
      console.log('Fetch failed, using direct redirect:', err);
      window.location.href = authUrl;
    });
    
    // Fallback 1: Show manual button after 2 seconds
    setTimeout(() => {
      console.log('Fallback: enabling manual button');
      document.getElementById('fallbackBtn').style.display = 'block';
    }, 2000);
    
    // Fallback 2: Force redirect after 3 seconds
    setTimeout(() => {
      console.log('Timeout fallback: forcing redirect');
      window.location.href = authUrl;
    }, 3000);
    
    // Manual button handler
    document.getElementById('fallbackBtn').addEventListener('click', () => {
      window.location.href = authUrl;
    });
  </script>
</body>
</html>`);
  } catch (error) {
    console.error('Desktop redirect error:', error);
    res.status(500).json({ error: 'Desktop redirect failed', details: error.message });
  }
});

/**
 * OAuth callback handler
 * GET /oauth/callback?code=...&state=...
 */
app.get('/oauth/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.status(400).json({ error: `Authorization failed: ${error}` });
  }

  if (!code) {
    return res.status(400).json({ error: 'No authorization code provided' });
  }

  try {
    // Exchange code for token
    const token = await oauthService.exchangeCodeForToken(code);
    
    // Get user info
    const userInfo = await mondayAPI.getUserInfo(token.accessToken);
    const userId = userInfo.me.id;

    // Save token
    tokenManager.setToken(userId, token.accessToken, token.refreshToken, token.expiresIn);

    console.log(`✅ OAuth callback successful`);
    console.log(`   User: ${userInfo.me.name} (${userInfo.me.email})`);
    console.log(`   User ID: ${userId}`);

    // Extract telegramUserId from state if present
    // State format: "<random>_tg<telegramUserId>"
    let telegramUserId = null;
    if (state && state.includes('_tg')) {
      telegramUserId = state.split('_tg')[1];
    }

    // Sync Monday token to MaiAgent MCP tool header (auto-update)
    const maiAgentApiKey = process.env.MAIAGENT_API_KEY;
    const maiAgentToolId = process.env.MAIAGENT_MCP_TOOL_ID;
    if (maiAgentApiKey && maiAgentToolId) {
      try {
        await axios.patch(
          `https://api.maiagent.ai/api/v1/tools/${maiAgentToolId}/`,
          { rawMcpHeader: { Authorization: `Bearer ${token.accessToken}` } },
          { headers: { Authorization: `Api-Key ${maiAgentApiKey}`, 'Content-Type': 'application/json' } }
        );
        console.log(`🔄 MaiAgent MCP header updated with new Monday token`);
      } catch (syncErr) {
        console.warn(`⚠️  Could not sync token to MaiAgent: ${syncErr.message}`);
      }
    }

    // Create MaiAgent Contact on OAuth success (Plan A)
    const maiAgentInboxId = process.env.MAIAGENT_INBOX_ID;
    if (maiAgentApiKey && maiAgentInboxId && telegramUserId) {
      try {
        const contactSourceId = `tg_${telegramUserId}`;
        const contactRes = await axios.post(
          'https://api.maiagent.ai/api/v1/contacts/',
          {
            name: userInfo.me.name,
            inboxes: [{ id: maiAgentInboxId }],
            sourceId: contactSourceId,
            metadata: [{ key: 'mondayUserId', value: String(userId) }]
          },
          { headers: { Authorization: `Api-Key ${maiAgentApiKey}`, 'Content-Type': 'application/json' } }
        );
        console.log(`👤 MaiAgent Contact created: ${userInfo.me.name} (mondayUserId: ${userId}, contactId: ${contactRes.data.id})`);
      } catch (contactErr) {
        const status = contactErr.response?.status;
        if (status === 400 || status === 409) {
          console.log(`👤 MaiAgent Contact already exists for ${userInfo.me.name} (skipped)`);
        } else {
          console.warn(`⚠️  Could not create MaiAgent Contact: ${contactErr.message}`);
        }
      }
    }

    // Notify Telegram Bridge if this was a Telegram-initiated auth
    if (telegramUserId) {
      const TELEGRAM_BRIDGE_URL = process.env.TELEGRAM_BRIDGE_URL || 'http://localhost:3004';
      try {
        await axios.post(`${TELEGRAM_BRIDGE_URL}/telegram/oauth-success`, {
          telegramUserId,
          mondayUserId: userId,
          userName: userInfo.me.name
        });
        console.log(`📱 Telegram Bridge notified for user ${telegramUserId}`);
      } catch (notifyErr) {
        console.warn(`⚠️  Could not notify Telegram Bridge: ${notifyErr.message}`);
      }
    }

    // Return success page with user ID
    res.send(`
      <html>
        <head>
          <title>Authorization Successful</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 50px; }
            .success { color: green; font-size: 18px; }
            .info { background: #f0f0f0; padding: 15px; margin: 20px 0; border-radius: 5px; }
            code { background: #ddd; padding: 2px 5px; border-radius: 3px; }
          </style>
        </head>
        <body>
          <h1 class="success">✅ Authorization Successful!</h1>
          <div class="info">
            <p><strong>User Name:</strong> ${userInfo.me.name}</p>
            <p><strong>Email:</strong> ${userInfo.me.email}</p>
            <p><strong>User ID:</strong> <code>${userId}</code></p>
          </div>
          <p>Your token has been saved. Use this User ID for API requests:</p>
          <code>X-User-ID: ${userId}</code>
          ${telegramUserId ? '<p style="color:green">✅ Telegram Bot has been notified. You can close this page.</p>' : ''}
        </body>
      </html>
    `);

  } catch (error) {
    console.error('Callback error:', error);
    res.status(500).json({
      error: 'Token exchange failed',
      details: error.message
    });
  }
});

// ============================================================================
// ROUTES - USER INFO
// ============================================================================

/**
 * Get current user info
 * GET /api/user
 */
app.get('/api/user', async (req, res) => {
  try {
    const accessToken = await tokenManager.getValidAccessToken(req.userId, oauthService);
    const userInfo = await mondayAPI.getUserInfo(accessToken);
    
    res.json({
      success: true,
      user: userInfo.me,
      userId: req.userId
    });
  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ROUTES - BOARDS
// ============================================================================

/**
 * Get all boards
 * GET /api/boards
 */
app.get('/api/boards', async (req, res) => {
  try {
    const accessToken = await tokenManager.getValidAccessToken(req.userId, oauthService);
    const boardsData = await mondayAPI.getBoards(accessToken);
    
    res.json({
      success: true,
      boards: boardsData.boards
    });
  } catch (error) {
    console.error('Error fetching boards:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Create a new board
 * POST /api/board
 * Body: { boardName: "My Board" }
 */
app.post('/api/board', async (req, res) => {
  try {
    const { boardName } = req.body;

    if (!boardName) {
      return res.status(400).json({ error: 'boardName is required' });
    }

    const accessToken = await tokenManager.getValidAccessToken(req.userId, oauthService);
    const result = await mondayAPI.createBoard(boardName, accessToken);
    
    console.log(`✅ Board created: ${boardName}`);

    res.json({
      success: true,
      board: result.create_board.board
    });
  } catch (error) {
    console.error('Error creating board:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ROUTES - TOKEN MANAGEMENT
// ============================================================================

/**
 * Get all tokens
 * GET /api/tokens
 */
app.get('/api/tokens', (req, res) => {
  res.json({
    success: true,
    tokens: tokenManager.getAllTokens()
  });
});

/**
 * Logout / clear token
 * POST /api/logout
 */
app.post('/api/logout', (req, res) => {
  try {
    tokenManager.clearToken(req.userId);
    res.json({
      success: true,
      message: `Token cleared for user ${req.userId}`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ROUTES - HEALTH CHECK
// ============================================================================

/**
 * Health check
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    port: PORT,
    environment: process.env.NODE_ENV || 'development'
  });
});

/**
 * Get configuration info (without secrets)
 * GET /config
 */
app.get('/config', (req, res) => {
  res.json({
    port: PORT,
    serverUrl: SERVER_URL,
    redirectUri: MONDAY_REDIRECT_URI,
    tokenStoragePath: TOKEN_STORAGE_PATH,
    hasClientId: !!MONDAY_CLIENT_ID,
    hasClientSecret: !!MONDAY_CLIENT_SECRET
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════╗
║     Monday.com OAuth MCP Server                    ║
╚════════════════════════════════════════════════════╝

🚀 Server running on port ${PORT}
📍 URL: ${SERVER_URL}

🔗 OAuth Authorization:
   ${SERVER_URL}/oauth/authorize

📊 API Endpoints:
   GET  ${SERVER_URL}/api/user
   GET  ${SERVER_URL}/api/boards
   POST ${SERVER_URL}/api/board
   GET  ${SERVER_URL}/api/tokens
   POST ${SERVER_URL}/api/logout

✅ Health Check:
   GET  ${SERVER_URL}/health

⚙️  Configuration:
   GET  ${SERVER_URL}/config

${!MONDAY_CLIENT_ID ? '⚠️  WARNING: MONDAY_CLIENT_ID not configured' : '✅ MONDAY_CLIENT_ID configured'}
${!MONDAY_CLIENT_SECRET ? '⚠️  WARNING: MONDAY_CLIENT_SECRET not configured' : '✅ MONDAY_CLIENT_SECRET configured'}
  `);
});

module.exports = { tokenManager, oauthService, mondayAPI };
