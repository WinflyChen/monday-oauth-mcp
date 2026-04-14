# 在外部瀏覽器中打開授權

## 📱 新功能：直接在 Chrome/Safari 中授權

之前的問題：點擊授權鏈接時，Telegram 會用內置瀏覽器打開，導致 User-Agent 檢測問題。

**現在已改進！** 當您在 Telegram 執行 `/login` 命令時，會看到一個按鈕，直接在**外部瀏覽器**中打開授權頁面。

---

## 🎯 使用方法

### 步驟 1：打開 Telegram

找到機器人，輸入以下命令：

```
/login
```

### 步驟 2：點擊外部瀏覽器按鈕

您會看到兩個按鈕：

| 按鈕 | 作用 |
|------|------|
| **🌐 在外部瀏覽器中授權** | 直接在 Chrome、Safari 或預設瀏覽器中打開授權頁面 |
| **📋 複製連結** | 複製授權連結到剪貼板（如按鈕無法使用） |

### 步驟 3：選擇瀏覽器

點擊第一個按鈕後，Telegram 會詢問您要用哪個瀏覽器打開：

- ✅ **推薦**：Google Chrome
- ✅ **推薦**：Safari
- ❌ 避免：Telegram 內置瀏覽器

### 步驟 4：完成授權

在外部瀏覽器中看到授權表單後：

1. 輸入您的 Monday.com 帳號（Email）
2. 輸入密碼
3. 點擊「授權」按鈕
4. ✅ 自動重定向回 Telegram

---

## 🔄 備用方案："複製連結" 按鈕

如果第一個按鈕無法工作，使用「複製連結」：

1. 點擊 **📋 複製連結** 按鈕
2. 我會發送一個可複製的授權連結
3. 複製該連結
4. 打開 Chrome/Safari
5. 在位址列粘貼並按 Enter
6. 完成授權

---

## ✅ 為什麼在外部瀏覽器中打開更好？

### 優點

1. **避免 User-Agent 檢測問題**
   - 使用真實瀏覽器 User-Agent（Chrome / Safari）
   - Monday.com 不會誤認為是行動設備

2. **更好的安全性**
   - 使用您自己的加密連線
   - 密碼在外部瀏覽器中輸入，不經過 Telegram

3. **更好的相容性**
   - 避免 Telegram 內置瀏覽器的限制
   - 完整的 JavaScript 支援

4. **更快的載入**
   - 使用標準瀏覽器引擎
   - 無需轉發代理

---

## 🐛 故障排查

### 問題 1：按不了「在外部瀏覽器中授權」按鈕

**原因：** Telegram 應用版本過舊或不支援

**解決：**
1. 更新 Telegram 到最新版本
2. 使用「複製連結」按鈕替代
3. 使用 Chrome 直接打開複製的連結

### 問題 2：點擊按鈕後沒有反應

**原因：** 網路連線問題

**解決：**
1. 檢查網路連線
2. 重新執行 `/login` 命令
3. 確認 Telegram 有網路權限

### 問題 3：授權後不回傳 Telegram

**原因：** Telegram 機器人暫時離線

**解決：**
1. 在 Telegram 輸入 `/status` 檢查連線
2. 重新執行 `/login` 進行授權
3. 等待 5 秒，Telegram 應該會通知您授權成功

### 問題 4：仍然在 Telegram 內置瀏覽器中打開

**原因：** 某些 Telegram 版本的舊行為

**解決：**
1. 使用「複製連結」按鈕
2. 長按外部按鈕，選「複製連結」
3. 打開 Chrome → 貼上 → Enter

---

## 📋 訊息等待列表

當您第一次執行 `/login` 時，會看到：

```
🔐 連結 Monday.com 帳號

請點擊下方按鈕在 外部瀏覽器 中完成授權：

💡 提示：點擊按鈕後會開啟 Chrome 或您的預設瀏覽器，
而不是 Telegram 內置瀏覽器

[🌐 在外部瀏覽器中授權]
[📋 複製連結]
```

---

## 🎓 技術背景

### 為什麼 Telegram 內置瀏覽器會造成問題？

Telegram 的內置瀏覽器使用以下 User-Agent：

```
Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36
TelegramBot/6.0
```

Monday.com 偵測到 `Android` 並重定向到應用程式商店。

使用外部瀏覽器時，User-Agent 為：

```
Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15
Safari/605.1.15
```

或 Android Chrome：

```
Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0
```

Monday.com 有時仍會偵測到這些為行動設備，但這時可以使用**桌面模式**（如上面的 [CHROME_DESKTOP_MODE_GUIDE.md](CHROME_DESKTOP_MODE_GUIDE.md) 中所述）。

---

## 🚀 下一步

已授權的使用者現在可以：

1. ✅ Use `/boards` 列出所有 Monday 看板
2. ✅ 使用自然語言建立任務、新增項目
3. ✅ 使用 `/reset` 清除對話記憶
4. ✅ 使用 `/logout` 登出帳號

需要幫助？使用 `/status` 查看目前狀態。

---

**功能上線日期：** 2026-01-20  
**狀態：** 已部署，測試中  
**相容性：** Telegram Desktop、iOS App、Android App（v7.0+）
