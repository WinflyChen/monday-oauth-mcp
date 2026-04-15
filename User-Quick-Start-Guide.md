# User Quick Start Guide

Control your monday.com workspace through Telegram using natural language.

---

## Before You Begin

- A **Telegram account** (mobile or desktop)
- A **monday.com account** (with actual workspace data)

---

## Install Telegram

If you haven't installed Telegram yet, download it first:

| Platform | Download |
|----------|----------|
| 📱 iPhone / iPad | [App Store](https://apps.apple.com/app/telegram-messenger/id686449807) |
| 🤖 Android | [Google Play](https://play.google.com/store/apps/details?id=org.telegram.messenger) |
| 💻 Mac | [Mac App Store](https://apps.apple.com/app/telegram/id747648890) |
| 🖥️ Windows | [Desktop Download](https://desktop.telegram.org/) |
| 🌐 Web | [web.telegram.org](https://web.telegram.org/) |

After installing, register with your phone number.

---

## Step 1: Find the Bot

Search in the Telegram search bar:

```
@igroup_kevin_bot
```

Tap to open the conversation.

---

## Step 2: Start the Bot

Send the following message:

```
/start
```

The Bot will greet you and prompt you to log in before you can use it.

---

## Step 3: Connect Your monday.com Account

Send the following message:

```
/login
```

The Bot will return an **authorization link**. Tap it to go to the monday.com authorization page.

> 📌 This step only needs to be done **once**. You won't need to log in again after that.

---

## Step 4: Authorize on monday.com

### 💻 Desktop

1. Click the link sent by the Bot — the page will open the monday.com authorization directly
2. If not logged in, sign in with your email and password
3. Click "Authorize" or "Allow" to confirm
4. When the page shows "Authorization Successful", you're done
5. Return to Telegram — the Bot will notify you that the connection is complete

### 📱 Mobile (Important)

monday.com detects mobile browsers and forcefully redirects to the App download page. Follow the steps below to work around this:

**Android Chrome:**
1. Tap the Bot's link, enter the authorization page, then tap "Go to monday.com Authorization"
2. If an "Open in Browser" dialog appears, check **"Always open links from auth.monday.com in browser"** then tap Continue
3. When redirected to the download page, tap the **⋮** menu in the top-right corner
4. Select **"Open in..."**, then enable **"Desktop site"**
5. Refresh the page — you should now see the monday.com login form

**iOS Safari:**
1. Tap the Bot's link, enter the authorization page, then tap "Go to monday.com Authorization"
2. When redirected to the download page, tap the **↑↓** share button at the bottom
3. Select **"Open in..."**, then enable **"Request Desktop Website"**
4. Refresh the page — you should now see the monday.com login form

> 💡 Enabling desktop mode makes monday.com treat your mobile browser as a desktop device, allowing the authorization page to load correctly.

---

## Step 5: Start Using

After authorization, you can talk to the Bot directly in natural language, for example:

| What you say | What the Bot does |
|-------------|------------------|
| List all my boards | Shows your monday.com board list |
| Create a board called "Marketing Plan" | Adds a new board to your workspace |
| What boards do I have | Lists all board names and links |

---

## Common Commands

| Command | Purpose |
|---------|---------|
| `/start` | Start the Bot |
| `/login` | Connect monday.com account (first time or re-authorize) |
| `/status` | Check current login status |
| `/reset` | Clear login state (to switch accounts) |

---

## FAQ

**Q: The authorization link shows "Cannot reach this site"?**  
A: The link may have expired. Send `/login` again to get a new one.

**Q: The Bot is not responding to my messages?**  
A: Send `/status` first to confirm you're logged in. If not, run `/login` again.

**Q: Can I use it on multiple devices?**  
A: Yes. As long as you use the same Telegram account, authorization only needs to be done once.

**Q: My mobile keeps going to the App download page — what do I do?**  
A: This is monday.com's mobile detection mechanism. Enable "Desktop site" mode in your mobile browser. For Android tap `⋮ → Open in...`, for iOS tap `↑↓ → Open in...`. See Step 4 for full details.

**Q: Is my monday.com data safe?**  
A: The Bot only uses the permissions you authorized to read/operate data. Your account password is never stored.
