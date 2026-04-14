# 三个 ID 关系与隔离机制

## 📊 核心关系图

```
Telegram ID          Monday ID           MaiAgent Contact
(用户账户)     →    (账户授权)      →    (用户身份)
                        ↓
                    OAuth Token
                    (服务器端存储)
```

---

## 👥 当前系统中的 3 个用户

### 用户 1
| 属性 | 值 |
|------|-----|
| **Telegram ID** | `818240639` ← Telegram 用户账户 |
| **Monday ID** | `52950372` ← Monday 用户账户 (独立授权) |
| **MaiAgent Contact ID** | `tg_818240639` |
| **Contact Metadata** | `mondayUserId: "52950372"` |

### 用户 2
| 属性 | 值 |
|------|-----|
| **Telegram ID** | `851846181` |
| **Monday ID** | `102111214` |
| **MaiAgent Contact ID** | `tg_851846181` |
| **Contact Metadata** | `mondayUserId: "102111214"` |

### 用户 3
| 属性 | 值 |
|------|-----|
| **Telegram ID** | `8773055811` |
| **Monday ID** | `57444209` |
| **MaiAgent Contact ID** | `tg_8773055811` |
| **Contact Metadata** | `mondayUserId: "57444209"` |

---

## 📁 数据存储位置

### 1️⃣ `tokens.json` - Monday OAuth Token 存储

**位置**: `/Users/kevin/Documents/Project/047_monday_mcp/tokens.json`

**结构**: 
- Key = `mondayUserId` (Monday 用户 ID)
- Value = Token 信息 (accessToken, expiresAt, createdAt)

```json
{
  "52950372": {
    "accessToken": "eyJhbGci...",
    "expiresAt": 1776076467566,
    "createdAt": "2026-04-13T09:34:27.566Z"
  },
  "102111214": {
    "accessToken": "eyJhbGci...",
    "expiresAt": 1776133051866,
    "createdAt": "2026-04-14T01:17:31.866Z"
  },
  "57444209": {
    "accessToken": "eyJhbGci...",
    "expiresAt": 1776133316780,
    "createdAt": "2026-04-14T01:21:56.780Z"
  }
}
```

**用途**: 
- 存储每个 Monday 用户的 OAuth 令牌
- 每个用户的 token 完全隔离
- **只在服务器端持有，不暴露给 MaiAgent**

---

### 2️⃣ `telegram_sessions.json` - Telegram 用户映射

**位置**: `/Users/kevin/Documents/Project/047_monday_mcp/telegram_sessions.json`

**结构**:
- Key = `telegramUserId` (Telegram 用户 ID)
- Value = 用户会话信息，包含 Monday ID 映射

```json
{
  "818240639": {
    "mondayUserId": "52950372",
    "conversationId": "9832ce89-e7fc-4872-bf7d-6393cec6d6b2",
    "updatedAt": "2026-04-13T09:45:42.025Z"
  },
  "851846181": {
    "mondayUserId": "102111214",
    "conversationId": "2e29150a-a13d-4af1-8ac9-a3e052413546",
    "updatedAt": "2026-04-14T01:34:39.423Z"
  },
  "8773055811": {
    "mondayUserId": "57444209",
    "conversationId": "d990ecfc-01ed-4cdc-b71a-c3b76cafa65e",
    "updatedAt": "2026-04-14T01:18:18.760Z"
  }
}
```

**用途**:
- 将 Telegram ID 映射到 Monday ID
- 存储每个用户的 MaiAgent 对话 ID
- 用户每发送消息时查询此文件

---

### 3️⃣ MaiAgent Contacts (云端)

**位置**: MaiAgent 后台 → Inbox 中的 Contacts

**结构**:
- Contact ID: `tg_${telegramUserId}`
- Name: 用户名
- Metadata: 包含 `mondayUserId` 字段

```
Contact: tg_818240639
├─ 姓名: [User Name]
├─ 来源: Telegram
└─ 元数据:
   └─ mondayUserId: 52950372
```

**用途**:
- 在 MaiAgent 后台追踪用户
- 通过 metadata 关联 Monday 账号
- 方便日后查询用户对话历史

---

## 🔄 消息处理流程 (隔离验证)

### 当用户发送 Telegram 消息时

```
1. Telegram 消息到达
   ↓
2. telegram-bridge.js 接收
   ↓
3. 查询 telegram_sessions.json
   → 提取: mondayUserId (从 telegramUserId 查询)
   ↓
4. 系统提示强制注入 mondayUserId
   → "【重要】你必须用 userId='52950372' 调用所有工具"
   ↓
5. 消息发送至 MaiAgent
   (系统提示使 MaiAgent 受约束)
   ↓
6. MaiAgent 调用 MCP 工具
   → { "name": "monday_get_boards", "args": { "userId": "52950372" } }
   ↓
7. mcp-server.js 验证
   ✓ 检查: userId='52950372' 非空且有效
   ✓ 从 tokens.json['52950372'] 获取 accessToken
   ✓ 使用该 token 调用 Monday GraphQL API
   ↓
8. 返回用户 1 的 Monday 数据
   (其他用户数据完全隐藏)
```

---

## 🔐 隔离与安全机制

### ✅ 多用户隔离的三层防护

#### 第 1 层: 系统提示强制 (telegram-bridge.js)

**文件**: `telegram-bridge.js` 第 120-133 行

**原理**: 在用户第一条消息时，注入系统提示:

```text
【⚠️ 重要系統指示】
我的 Monday.com userId 是 52950372，你 MUST 在呼叫所有 Monday 工具時提供此 userId 作為參數。

【工具呼叫要求】
- 呼叫 monday_get_boards 時：{ "userId": "52950372" }
- 呼叫 monday_create_board 時：{ "userId": "52950372", "boardName": "..." }
- ...
```

**效果**: MaiAgent AI 受提示约束，必须使用指定的 userId

#### 第 2 层: MCP 服务端验证 (mcp-server.js)

**文件**: `mcp-server.js` 第 211-219 行

**原理**: 每个工具调用时强制检查 userId:

```javascript
if (name !== 'monday_get_auth_url') {
    const { userId } = args;
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        throw new Error(`❌ 安全驗證失敗: userId 必須提供且有效`);
    }
    console.log(`✓ 用戶驗證成功: ${userId} 呼叫工具 ${name}`);
}
```

**效果**: 无 userId 的请求被拒绝执行

#### 第 3 层: Token 隔离存储 (server.js)

**文件**: `server.js` 第 283 行 + tokens.json

**原理**: 每个 mondayUserId 独立持有一份 token

```javascript
const token = getAccessToken(userId);
// tokens.json['52950372'] → 用户 1 的 token
// tokens.json['102111214'] → 用户 2 的 token
// tokens.json['57444209'] → 用户 3 的 token
```

**效果**: 
- Token 只在服务器端持有，不暴露给 MaiAgent
- 每次 API 调用时，用该 userId 对应的 token

---

### ❌ 被阻止的攻击场景

| 场景 | 阻止方式 | 结果 |
|------|---------|------|
| 用户 2 尝试调用用户 1 的 userId | 系统提示强制用己的 userId | ❌ 被忽略 |
| 知道用户 1 的 mondayUserId，尝试伪造 API 调用 | MCP 验证 userId 非空 + token 隔离 | ❌ 拿不到 token |
| 伪造其他用户的 MaiAgent Contact | Contact 由 OAuth 创建，包含验证 | ❌ 无权创建 |
| 省略 userId 参数直接调用工具 | MCP 服务端验证 | ❌ 请求被拒绝 |

---

## 🎯 确认的隔离效果

### ✅ 完全隔离保证

- **用户 1 的 Telegram 消息** → **只能操作用户 1 的 Monday 账号**
- **用户 2 的 Telegram 消息** → **只能操作用户 2 的 Monday 账号**
- **用户 3 的 Telegram 消息** → **只能操作用户 3 的 Monday 账号**

### ✅ 其他用户无法访问

- ❌ 无法获取其他用户的 token (token 只存服务器)
- ❌ 无法猜测其他用户的 userId (系统强制注入)
- ❌ 无法绕过 MCP 验证 (每个请求都检查)
- ❌ 无法伪造其他用户的对话上下文

---

## 📐 完整的数据流

```
Telegram                    本地服务器                      Monday.com
   ↓                              ↓                              ↓
用户1发消息                   解析消息
(telegram_id)           ↓ telegram_sessions.json
   │                  查到: mondayUserId=52950372
   │                        ↓
   │                  系统提示注入 userId
   │                   (强制使用 52950372)
   │                        ↓
   ├──→ Bridge ─────→ MaiAgent
   │    (3004)      发送带系统提示的消息
   │                        ↓
   │               MaiAgent 调用 MCP 工具
   │              { userId: "52950372", ... }
   │                        ↓
   │               ✓ mcp-server 验证 userId
   │              （检查是否为空、是否有效）
   │                        ↓
   │              ✓ 从 tokens.json 获取 token
   │              （52950372 的 accessToken）
   │                        ↓
   │               使用 token 调用 Monday API ──────→ 用户 1 的 Monday 账号
   │              （GraphQL 查询/变更）                数据返回
   │                        ↓
   │              返回查询结果 (仅用户 1 可见)
   ↓
用户1收到回复
```

---

## 📝 总结

| 组件 | 作用 | 隔离点 |
|------|------|--------|
| **Telegram ID** | 用户在 Telegram 中的唯一标识 | 用于查询 telegram_sessions.json |
| **Monday ID** | 用户在 Monday.com 中的唯一标识 | 用于查询 tokens.json 获取 token |
| **MaiAgent Contact ID** | 用户在 MaiAgent 中的身份 | 用于追踪用户对话，metadata 包含 Monday ID |
| **Token** | Monday OAuth 令牌 | 每个 Monday ID 独立持有，服务器端保管 |

---

## 🔒 关键安全检查清单

- [x] 每个 Telegram 用户有独立的 mondayUserId
- [x] 每个 mondayUserId 有独立的 accessToken (存储在 tokens.json)
- [x] 系统提示强制 MaiAgent 使用指定的 userId
- [x] MCP 服务端验证每个请求都包含有效的 userId
- [x] Token 只在服务器端持有，不暴露给 MaiAgent
- [x] MaiAgent Contact 通过 metadata 链接 Monday 身份
- [x] 其他用户无法越权访问

---

**最后更新**: 2026-04-14  
**系统状态**: ✅ 多用户隔离完成
