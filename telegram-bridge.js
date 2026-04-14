/**
 * Telegram Bridge Server
 * Connects Telegram Bot → MaiAgent → Monday.com MCP
 * Port: 3004
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================

const PORT = process.env.TELEGRAM_PORT || 3004;
const SERVER_PUBLIC_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MAIAGENT_API_KEY = process.env.MAIAGENT_API_KEY;
const MAIAGENT_CHATBOT_ID = (process.env.MAIAGENT_CHATBOT_ID || '').trim();
const MAIAGENT_API_BASE = (process.env.MAIAGENT_API_BASE || 'https://api.maiagent.ai/api').replace(/\/$/, '');
const OAUTH_SERVER_URL = process.env.OAUTH_SERVER_URL || 'http://localhost:3001';

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const SESSIONS_PATH = path.join(__dirname, 'telegram_sessions.json');

// Validate required env vars
if (!TELEGRAM_BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is not set');
  process.exit(1);
}
if (!MAIAGENT_API_KEY) {
  console.error('❌ MAIAGENT_API_KEY is not set');
  process.exit(1);
}
if (!MAIAGENT_CHATBOT_ID) {
  console.error('❌ MAIAGENT_CHATBOT_ID is not set');
  process.exit(1);
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_PATH)) {
      return JSON.parse(fs.readFileSync(SESSIONS_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading sessions:', err.message);
  }
  return {};
}

function saveSessions(sessions) {
  try {
    fs.writeFileSync(SESSIONS_PATH, JSON.stringify(sessions, null, 2));
  } catch (err) {
    console.error('Error saving sessions:', err.message);
  }
}

function getSession(telegramUserId) {
  const sessions = loadSessions();
  return sessions[String(telegramUserId)] || null;
}

function setSession(telegramUserId, data) {
  const sessions = loadSessions();
  sessions[String(telegramUserId)] = {
    ...sessions[String(telegramUserId)],
    ...data,
    updatedAt: new Date().toISOString()
  };
  saveSessions(sessions);
}

// ============================================================================
// TELEGRAM API HELPERS
// ============================================================================

async function sendMessage(chatId, text, options = {}) {
  try {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      ...options
    });
  } catch (err) {
    console.error('sendMessage error:', err.response?.data || err.message);
  }
}

async function sendTyping(chatId) {
  try {
    await axios.post(`${TELEGRAM_API}/sendChatAction`, {
      chat_id: chatId,
      action: 'typing'
    });
  } catch (err) {
    // non-critical, ignore
  }
}

// ============================================================================
// MAIAGENT API
// ============================================================================

async function callMaiAgent(telegramUserId, userMessage) {
  const session = getSession(telegramUserId);
  const conversationId = session?.conversationId || null;
  const mondayUserId = session?.mondayUserId || null;

  // First message: inject Monday userId context and rules
  let message = userMessage;
  if (!conversationId && mondayUserId) {
    message = `【⚠️ 重要系統指示】
我的 Monday.com userId 是 ${ mondayUserId}，你 MUST 在呼叫所有 Monday 工具時提供此 userId 作為參數。

【工具呼叫要求】
- 呼叫 monday_get_boards 時：{ "userId": "${mondayUserId}" }
- 呼叫 monday_create_board 時：{ "userId": "${mondayUserId}", "boardName": "..." }
- 呼叫 monday_create_item 時：{ "userId": "${mondayUserId}", "boardId": "...", "itemName": "..." }
- 呼叫 monday_get_items 時：{ "userId": "${mondayUserId}", "boardId": "..." }
- 呼叫 monday_upload_file_to_column 時：{ "userId": "${mondayUserId}", ... }

【禁止事項】
❌ 不要在呼叫工具時省略 userId
❌ 不要使用其他 userId（如有其他值，會導致跨帳號存取錯誤）
❌ 不要猜測 userId，一定要用系統指定的值

【Board 創建規則】
- 使用 board_kind: "private" 建立私有看板
- 帳號不允許建立 public board（會收到 403 授權錯誤）

---

${userMessage}`;
  }

  try {
    const payload = {
      message: { role: 'user', content: message }
    };
    if (conversationId) {
      payload.conversationId = conversationId;
    }

    const response = await axios.post(
      `${MAIAGENT_API_BASE}/v1/chatbots/${MAIAGENT_CHATBOT_ID}/completions/`,
      payload,
      {
        headers: {
          'Authorization': `Api-Key ${MAIAGENT_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    const data = response.data;

    // Save conversation ID for future context
    if (data.conversationId) {
      if (data.conversationId !== conversationId) {
        setSession(telegramUserId, { conversationId: data.conversationId });
      }
    }

    // Extract reply text
    const reply = data.content || data.answer || data.message || data.text || JSON.stringify(data);
    return reply;

  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data;
    console.error(`MaiAgent API error [${status}]:`, detail || err.message);

    if (status === 401) {
      return '❌ MaiAgent API 認證失敗，請確認 MAIAGENT_API_KEY 是否正確。';
    }
    if (status === 404) {
      return '❌ Chatbot 不存在，請確認 MAIAGENT_CHATBOT_ID 是否正確。';
    }
    return `❌ MaiAgent 呼叫失敗（${status || err.message}），請稍後再試。`;
  }
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

async function handleStart(chatId, telegramUserId, firstName) {
  const name = firstName || '您';
  await sendMessage(chatId,
    `👋 您好，<b>${name}</b>！\n\n` +
    `我是 Monday.com AI 助理，透過 MaiAgent 幫您管理任務。\n\n` +
    `<b>可用指令：</b>\n` +
    `🔐 /login — 連結您的 Monday.com 帳號\n` +
    `📋 /boards — 查看所有看板\n` +
    `👤 /status — 查看目前登入狀態\n` +
    `🗑 /reset — 清除對話記憶\n` +
    `🚪 /logout — 登出 Monday.com 帳號\n\n` +
    `或直接輸入任何問題，例如：\n` +
    `「列出我的所有看板」\n` +
    `「在 XX 看板新增一個任務：YY」`
  );
}

async function handleLogin(chatId, telegramUserId) {
  const oauthUrl = `${OAUTH_SERVER_URL}/oauth/authorize?telegramUserId=${telegramUserId}`;
  
  try {
    // Send message with inline button that opens in external browser
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text: `🔐 <b>連結 Monday.com 帳號</b>\n\n` +
            `請點擊下方按鈕開始授權：\n\n` +
            `系統會自動偵測您的設備並提供對應的授權方式。`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🌐 前往授權頁面',
              url: oauthUrl
            }
          ],
          [
            {
              text: '📋 複製授權連結',
              callback_data: `copy_login_${telegramUserId}`
            }
          ]
        ]
      }
    });
  } catch (err) {
    console.error('handleLogin error:', err.response?.data || err.message);
    // Fallback to plain text message
    await sendMessage(chatId,
      `🔐 <b>連結 Monday.com 帳號</b>\n\n` +
      `請點擊下方連結進行授權：\n` +
      `${oauthUrl}\n\n` +
      `授權完成後，Bot 會自動通知您。`
    );
  }
}

async function handleBoards(chatId, telegramUserId) {
  const session = getSession(telegramUserId);
  if (!session?.mondayUserId) {
    await sendMessage(chatId, '⚠️ 尚未連結 Monday.com 帳號，請先執行 /login');
    return;
  }
  await sendTyping(chatId);
  const reply = await callMaiAgent(telegramUserId, '請列出我所有的 Monday.com 看板名稱與 ID');
  await sendMessage(chatId, reply);
}

async function handleStatus(chatId, telegramUserId) {
  const session = getSession(telegramUserId);
  if (!session?.mondayUserId) {
    await sendMessage(chatId,
      `📊 <b>目前狀態</b>\n\n` +
      `Monday.com：❌ 未連結\n\n` +
      `請執行 /login 進行授權。`
    );
  } else {
    await sendMessage(chatId,
      `📊 <b>目前狀態</b>\n\n` +
      `Monday.com：✅ 已連結\n` +
      `Monday userId：<code>${session.mondayUserId}</code>\n` +
      `對話 ID：<code>${session.conversationId || '尚未開始'}</code>`
    );
  }
}

async function handleReset(chatId, telegramUserId) {
  const session = getSession(telegramUserId);
  // Keep mondayUserId, only clear conversationId
  setSession(telegramUserId, { conversationId: null });
  await sendMessage(chatId, '🗑 對話記憶已清除，下一則訊息將重新開始新對話。');
}

async function handleLogout(chatId, telegramUserId) {
  const session = getSession(telegramUserId);
  if (!session?.mondayUserId) {
    await sendMessage(chatId, '⚠️ 您目前未連結任何 Monday.com 帳號。');
    return;
  }
  // 完全清除用戶的 Monday 綁定和對話記憶
  setSession(telegramUserId, { mondayUserId: null, conversationId: null });
  await sendMessage(chatId, '🚪 已登出 Monday.com 帳號。\n\n若要重新連結，請執行 /login。');
}

async function handleTextMessage(chatId, telegramUserId, text) {
  const session = getSession(telegramUserId);
  if (!session?.mondayUserId) {
    await sendMessage(chatId,
      '⚠️ 您尚未連結 Monday.com 帳號。\n\n' +
      '請先執行 /login 進行授權，授權後即可開始使用。'
    );
    return;
  }

  await sendTyping(chatId);
  const reply = await callMaiAgent(telegramUserId, text);

  // Split long messages (Telegram limit: 4096 chars)
  if (reply.length <= 4096) {
    await sendMessage(chatId, reply);
  } else {
    const chunks = reply.match(/[\s\S]{1,4000}/g) || [reply];
    for (const chunk of chunks) {
      await sendMessage(chatId, chunk);
    }
  }
}

// ============================================================================
// EXPRESS APP
// ============================================================================

const app = express();
app.use(cors());
app.use(express.json());

/**
 * Telegram Webhook endpoint
 * POST /webhook
 */
app.post('/webhook', async (req, res) => {
  // Acknowledge immediately so Telegram doesn't retry
  res.sendStatus(200);

  const update = req.body;

  // Handle callback_query (inline keyboard)
  if (update.callback_query) {
    const callback = update.callback_query;
    const chatId = callback.message.chat.id;
    const callbackId = callback.id;
    const data = callback.data;
    const telegramUserId = String(callback.from.id);

    console.log(`🔘 Callback: ${data} from ${telegramUserId}`);

    // Handle copy login link
    if (data.startsWith('copy_login_')) {
      const oauthUrl = `${OAUTH_SERVER_URL}/oauth/authorize?telegramUserId=${telegramUserId}`;
      
      // Answer callback with notification
      try {
        await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
          callback_query_id: callbackId,
          text: '✅ 授權連結已複製到剪貼板，請貼到外部瀏覽器',
          show_alert: false
        });

        // Send the link as a separate message that user can copy
        await sendMessage(chatId,
          `📋 <b>授權連結（複製後貼到瀏覽器）</b>\n\n` +
          `<code>${oauthUrl}</code>\n\n` +
          `💡 <i>點擊上方連結可複製</i>`
        );
      } catch (err) {
        console.error('Copy link error:', err.message);
      }
    }
    
    return;
  }

  // Handle regular message
  const message = update.message;
  if (!message || !message.text) return;

  const chatId = message.chat.id;
  const telegramUserId = String(message.from.id);
  const firstName = message.from.first_name;
  const text = message.text.trim();

  console.log(`📨 [${telegramUserId}] ${firstName}: ${text}`);

  try {
    if (text === '/start' || text.startsWith('/start ')) {
      await handleStart(chatId, telegramUserId, firstName);
    } else if (text === '/login') {
      await handleLogin(chatId, telegramUserId);
    } else if (text === '/boards') {
      await handleBoards(chatId, telegramUserId);
    } else if (text === '/status') {
      await handleStatus(chatId, telegramUserId);
    } else if (text === '/reset') {
      await handleReset(chatId, telegramUserId);
    } else if (text === '/logout') {
      await handleLogout(chatId, telegramUserId);
    } else if (text.startsWith('/')) {
      await sendMessage(chatId,
        '❓ 未知指令。可用指令：\n' +
        '/start /login /boards /status /reset'
      );
    } else {
      await handleTextMessage(chatId, telegramUserId, text);
    }
  } catch (err) {
    console.error('Error handling message:', err.message);
    await sendMessage(chatId, '⚠️ 處理訊息時發生錯誤，請稍後再試。');
  }
});

/**
 * Set Telegram webhook URL
 * POST /telegram/set-webhook
 * Body: { url: "https://xxx.ngrok.io" }  (optional, defaults to SERVER_PUBLIC_URL)
 */
app.post('/telegram/set-webhook', async (req, res) => {
  const baseUrl = req.body?.url || SERVER_PUBLIC_URL;
  const webhookUrl = `${baseUrl}/webhook`;
  try {
    const result = await axios.post(`${TELEGRAM_API}/setWebhook`, { url: webhookUrl });
    console.log(`✅ Webhook set to: ${webhookUrl}`);
    res.json({ success: true, webhookUrl, result: result.data });
  } catch (err) {
    console.error('setWebhook error:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

/**
 * Get current webhook info
 * GET /telegram/webhook-info
 */
app.get('/telegram/webhook-info', async (req, res) => {
  try {
    const result = await axios.get(`${TELEGRAM_API}/getWebhookInfo`);
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

/**
 * OAuth callback notification endpoint (called by server.js after successful auth)
 * POST /telegram/oauth-success
 * Body: { telegramUserId, mondayUserId, userName }
 */
app.post('/telegram/oauth-success', async (req, res) => {
  const { telegramUserId, mondayUserId, userName } = req.body;

  if (!telegramUserId || !mondayUserId) {
    return res.status(400).json({ error: 'telegramUserId and mondayUserId are required' });
  }

  setSession(telegramUserId, { mondayUserId });
  console.log(`✅ OAuth success: Telegram ${telegramUserId} → Monday ${mondayUserId}`);

  await sendMessage(telegramUserId,
    `✅ <b>授權成功！</b>\n\n` +
    `已連結 Monday.com 帳號：<b>${userName || mondayUserId}</b>\n\n` +
    `現在可以開始查詢 Monday 資料了！\n` +
    `試試看：輸入「列出我的看板」`
  );

  res.json({ success: true });
});

/**
 * Health check
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'telegram-bridge',
    port: PORT,
    timestamp: new Date().toISOString(),
    config: {
      hasBotToken: !!TELEGRAM_BOT_TOKEN,
      hasApiKey: !!MAIAGENT_API_KEY,
      chatbotId: MAIAGENT_CHATBOT_ID,
      apiBase: MAIAGENT_API_BASE
    }
  });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════╗
║     Telegram Bridge Server                         ║
╚════════════════════════════════════════════════════╝

🚀 Server running on port ${PORT}

🤖 Telegram Bot: Configured
🧠 MaiAgent Chatbot ID: ${MAIAGENT_CHATBOT_ID}
🔗 MaiAgent API: ${MAIAGENT_API_BASE}

📋 Endpoints:
   POST  /webhook                  ← Telegram webhook
   POST  /telegram/set-webhook     ← Set webhook URL
   GET   /telegram/webhook-info    ← Check webhook status
   POST  /telegram/oauth-success   ← OAuth callback notification
   GET   /health                   ← Health check

⚡ Next step: Set Telegram webhook
   POST http://localhost:${PORT}/telegram/set-webhook
   Body: { "url": "https://YOUR_NGROK_URL" }
`);
});
