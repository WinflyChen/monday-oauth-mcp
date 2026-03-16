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
      state: state,
      scope: 'me:read boards:read boards:write items:read items:write files:write'
    });

    return `${this.authorizationEndpoint}?${params.toString()}`;
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
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in || 3600,
        tokenType: response.data.token_type
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
 * Start authorization flow
 * GET /oauth/authorize
 */
app.get('/oauth/authorize', (req, res) => {
  try {
    const state = Math.random().toString(36).substring(7);
    const authUrl = oauthService.getAuthorizationUrl(state);
    
    console.log(`🔗 Authorization started for user: ${req.userId}`);
    console.log(`   State: ${state}`);
    
    res.redirect(authUrl);
  } catch (error) {
    console.error('Authorization error:', error);
    res.status(500).json({ error: 'Authorization failed', details: error.message });
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
