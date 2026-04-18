# ★ Shadow Web Scraper Bot ★

Professional Telegram Bot for Website Scraping with Bot Cloning System

## ✨ Features

### 🔐 Channel Verification
- Users must join Telegram channel before using the bot
- YouTube and WhatsApp channel links also displayed
- Auto-verification system with callback button

### 👤 User Menu
- **Scrap New Web** - Enter any website URL to scrape
- **Old Scraped Web** - View and access previously scraped websites
- **My Statistics** - View personal usage statistics

### 🔰 Owner Menu
- **Broadcast** - Send messages to all users
- **Bot Statistics** - Complete bot analytics
- **User List** - Exportable list of all users
- **Add Owner** - Grant owner access by user ID
- **Add Bot Token** - Create clone bots that work identically

### 🌐 Web Scraping
- Extracts HTML, CSS, JavaScript files
- Generates detailed scraping reports
- Creates organized ZIP archives
- Includes site metadata and form analysis
- Database endpoint detection

### 🤖 Bot Cloning System
- Add any bot token to create a clone
- Clone bots work identically to main bot
- Automatic clone bot startup on launch
- Persistent token storage

## 🚀 Railway Deployment

### Step 1: Create Bot
1. Open [@BotFather](https://t.me/BotFather) on Telegram
2. Create a new bot with `/newbot`
3. Copy the bot token

### Step 2: Get Your User ID
1. Open [@userinfobot](https://t.me/userinfobot)
2. Copy your user ID number

### Step 3: Create Channel
1. Create a Telegram channel for verification
2. Add your bot as administrator
3. Copy the channel username (e.g., @yourchannel)

### Step 4: Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template)

Or manually:

1. Fork/Upload this repo to GitHub
2. Create new project on [Railway](https://railway.app)
3. Connect your GitHub repo
4. Add environment variables:
   - `BOT_TOKEN` - Your bot token from BotFather
   - `OWNER_IDS` - Your Telegram user ID
   - `TELEGRAM_CHANNEL` - Your channel username
   - `REQUIRED_CHANNEL_ID` - Same channel username
5. Deploy! The bot will start automatically

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | Yes | Bot token from @BotFather |
| `OWNER_IDS` | Yes | Your Telegram user ID |
| `TELEGRAM_CHANNEL` | Yes | Channel users must join |
| `REQUIRED_CHANNEL_ID` | Yes | Same as above |
| `YOUTUBE_CHANNEL` | No | YouTube channel link |
| `WHATSAPP_CHANNEL` | No | WhatsApp channel link |

## 📁 Project Structure

```
shadow-web-scraper/
├── index.js              # Main entry point
├── package.json          # Dependencies
├── Procfile             # Railway process file
├── railway.json         # Railway config
├── .env.example         # Environment template
├── src/
│   ├── config.js        # Bot configuration
│   ├── handlers/
│   │   ├── commands.js  # Command handlers
│   │   ├── scraper.js   # Scraping handlers
│   │   └── owner.js     # Owner/admin handlers
│   ├── services/
│   │   ├── database.js  # JSON database
│   │   └── scraper.js   # Scraping engine
│   └── utils/           # Utility functions
├── data/                # Database storage
└── scraped_data/        # Scraped websites
```

## 🛠️ Local Development

```bash
# Clone repository
git clone https://github.com/yourusername/shadow-web-scraper.git
cd shadow-web-scraper

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your values

# Start bot
npm start
```

## 📱 Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Start the bot |
| `/help` | Show help message |
| `/menu` | Open main menu |
| `/scrape` | Quick scrape website |
| `/mystats` | Your statistics |
| `/myscrapes` | Your scraped websites |

## 🔒 Owner Commands

| Command | Description |
|---------|-------------|
| `/broadcast` | Message all users |
| `/stats` | Bot statistics |
| `/users` | User list |
| `/addowner` | Add new owner |
| `/addbot` | Add bot token (clone) |

## ⚡ Tech Stack

- **Node.js** - Runtime
- **Telegraf** - Telegram bot framework
- **Cheerio** - HTML parsing
- **Archiver** - ZIP creation
- **Axios** - HTTP requests
- **node-cron** - Scheduled tasks

## 📝 License

MIT License - feel free to use and modify!

---

★ Made with ❤️ by Shadow Developer ★
