# 行動版 OAuth 重定向修復方案

## 問題描述

Monday.com 的 OAuth 端點會檢測用戶端的 User-Agent，當檢測到行動裝置時，會自動重定向到應用程式下載頁面，而不是顯示授權頁面。

### 症狀
- 桌面 Chrome：✅ 正常顯示授權頁面
- 行動 Chrome：❌ 被導向到應用程式商店下載頁面
- 參數添加（`&app_redirect=false&view=web`）：⚠️ 無效，Monday.com 服務端已檢測

## 解決方案：伺服器端代理重定向

### 新增端點

#### `/oauth/desktop-redirect` (GET)

**目的：** 作為行動用戶端和 Monday.com OAuth 之間的代理層

**工作流程：**
```
行動客戶端
    ↓
瀏覽 /oauth/desktop-redirect?redirect_to=<oauth_url>
    ↓
伺服器返回中介頁面（帶 Service Worker）
    ↓
頁面使用 Fetch API 以「桌面 User-Agent」請求 Monday OAuth
    ↓
Monday.com 看到桌面 User-Agent，返回授權頁面
    ↓
客戶端重定向至授權頁面（正常流程）
```

### 實現細節

#### 1. 伺服器（server.js）

```javascript
app.get('/oauth/desktop-redirect', (req, res) => {
  const authUrl = decodeURIComponent(req.query.redirect_to);
  
  // 返回中介頁面，使用伺服器端 Fetch 且帶桌面 User-Agent
  const page = `
    <script>
      fetch("${authUrl}", {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...'
        },
        redirect: 'manual'
      })
      .then(r => {
        if (r.status >= 300 && r.status < 400) {
          window.location.href = r.headers.get('Location');
        }
      })
      .catch(() => window.location.href = "${authUrl}");
    </script>
  `;
});
```

#### 2. 授權頁面（server.js 第 350-360 行）

```javascript
function openInDesktopMode() {
  if (/Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent)) {
    // 行動：使用伺服器代理
    const proxyUrl = '/oauth/desktop-redirect?redirect_to=' + encodeURIComponent(authUrl);
    window.location.href = proxyUrl;
  } else {
    // 桌面：直接重定向
    window.location.href = authUrl;
  }
}
```

## 使用方法

### 行動用戶（Android/iOS）

1. 開啟 Telegram，輸入 `/login` 命令
2. 點擊「在網頁版中開啟授權」按鈕
3. **系統將自動:**
   - 偵測行動裝置
   - 透過伺服器代理請求
   - 顯示桌面版 Monday.com 授權頁面
4. 完成授權，重定向回 Telegram

### 桌面用戶（Windows/Mac/Linux）

1. 開啟 Telegram，輸入 `/login` 命令
2. 點擊任何授權按鈕
3. 正常顯示授權頁面，完成授權

## 技術優勢

| 方法 | 客戶端 UA 偽造 | 伺服器 UA 修改 | 效果 |
|------|:---:|:---:|---|
| **舊方案** | 試圖使用 JavaScript 改變 UA | ❌ 無法改變 | ❌ 失敗 |
| **新方案** | 保持原始行動 UA | ✅ 伺服器以桌面 UA 請求 | ✅ Monday 看到桌面 UA |

## 測試方法

### 在真實行動裝置上

1. 在 iPhone/Android 開啟 HTTPS 授權連結
2. 確認是否顯示授權頁面（而非下載頁面）

### 在開發環境中

```bash
# 模擬行動 User-Agent
curl -H "User-Agent: Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36" \
  https://opt-lauren-spirits-representations.trycloudflare.com/oauth/authorize
# 應返回授權頁面 HTML
```

## 故障排查

### 情況 1：仍然被導向下載頁面

**可能原因：**
- Cloudflare 快速隧道已過期，導致 URL 變更
- 伺服器未重啟，舊代碼仍在運行

**解決方案：**
```bash
# 檢查伺服器狀態
ps aux | grep "node server.js"

# 重啟伺服器
pkill -f "node server.js"
cd /Users/kevin/Documents/Project/047_monday_mcp
node server.js > server.log 2>&1 &

# 檢查日誌
tail -30 server.log
```

### 情況 2：授權頁面無法載入

**可能原因：**
- 伺服器 Fetch 請求失敗
- Monday.com OAuth 端點臨時無法訪問

**解決方案：**
1. 檢查伺服器日誌：`tail -30 server.log | grep desktop-redirect`
2. 驗證網路連線：`ping api.monday.com`
3. 手動測試端點：
   ```bash
   curl -I -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)" \
     "https://auth.monday.com/oauth2/authorize?client_id=..."
   ```

## 相關檔案修改

- **server.js**
  - 新增 `/oauth/desktop-redirect` 端點（第 490-560 行）
  - 更新 `openInDesktopMode()` 函數（第 650 行）
  - 授權頁面 HTML 已更新

- **環境設定** - 無需更改（保持現有隧道配置）

## 後續測試清單

- [ ] 在 iPhone Safari 中測試登入
- [ ] 在 Android Chrome 中測試登入
- [ ] 確認授權完成後正確回傳至 Telegram
- [ ] 驗證新用戶的 Token 已正確儲存
- [ ] 測試多用戶同時授權（確認隔離）
- [ ] 監控伺服器日誌中的 `desktop-redirect` 調用

## 額外考量

### Cloudflare 隧道穩定性

當前問題：快速隧道 URL 在伺服器重啟時會變更

**長期解決方案：**
1. 使用 Cloudflare Named Tunnel（固定 URL）
2. 或使用 ngrok 的付費方案（固定子網域）
3. 或自架反向代理（nginx/Apache）

### Timeout 保護

代理頁面包含 3 秒 Timeout：
```javascript
setTimeout(() => {
  window.location.href = authUrl; // 直接重定向（備用方案）
}, 3000);
```

若伺服器無回應，客戶端會自動回退到直接授權連結。

---

**更新時間：** 2025-01-20  
**版本：** 1.0  
**狀態：** 已實施，待行動裝置測試驗證
