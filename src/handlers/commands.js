const { Markup } = require('telegraf');
const config = require('../config');
const db = require('../services/database');

// ╔══════════════════════════════════════════╗
// ║      STYLISH COMMAND HANDLERS            ║
// ╚══════════════════════════════════════════╝

// ─── START MENU: 2 Buttons Only ────────────────
function startKb() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('👤 User Menu', 'user_menu')],
    [Markup.button.callback('🔰 Owner Menu', 'owner_menu')]
  ]);
}

// ─── USER MENU ─────────────────────────────────
function userKb() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🌐 Scrap New Website', 'scrape_new')],
    [Markup.button.callback('📦 My Scraped Websites', 'my_scrapes')],
    [Markup.button.callback('📊 My Statistics', 'my_stats')],
    [Markup.button.callback('🏠 Back', 'main_menu')]
  ]);
}

// ─── OWNER MENU ────────────────────────────────
function ownerKb() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📢 Broadcast', 'broadcast'), Markup.button.callback('📊 Bot Stats', 'bot_stats')],
    [Markup.button.callback('👥 User List', 'user_list'), Markup.button.callback('📥 Export Users', 'export_users')],
    [Markup.button.callback('➕ Add Owner', 'add_owner'), Markup.button.callback('🤖 Add Bot Token', 'add_bot_token')],
    [Markup.button.callback('🏠 Back', 'main_menu')]
  ]);
}

// ─── /START ── Direct 2 buttons ────────────────
async function handleStart(ctx) {
  const uid = ctx.from.id;
  await db.addUser(uid, {
    username: ctx.from.username,
    firstName: ctx.from.first_name,
    lastName: ctx.from.last_name
  });

  const welcome = `
╔═══════════════════════════════════╗
║                                   ║
║   ★  SHADOW WEB SCRAPER  ★       ║
║                                   ║
║   Clone any website in seconds!   ║
║                                   ║
╚═══════════════════════════════════╝

👋 Hey <b>${ctx.from.first_name || 'User'}</b>!

🤖 This bot scrapes any website and gives
   you a <b>complete mirror</b> with all files:
   
   ✓ HTML, CSS, JavaScript
   ✓ Images & fonts
   ✓ All assets included

📌 <b>Join our channels:</b>
   📢 <a href="${config.CHANNELS.TELEGRAM}">Telegram</a>
   📺 <a href="${config.CHANNELS.YOUTUBE}">YouTube</a>
   💬 <a href="${config.CHANNELS.WHATSAPP}">WhatsApp</a>

👇 <b>Choose a menu:</b>`;

  await ctx.replyWithHTML(welcome, startKb());
}

// ─── USER MENU ─────────────────────────────────
async function handleUserMenu(ctx) {
  const txt = `
╔═══════════════════════════════════╗
║         👤 USER MENU              ║
╚═══════════════════════════════════╝

🌐 <b>Scrap New Website</b>
   Enter any URL → Get ZIP with full site

📦 <b>My Scraped Websites</b>
   View and re-download your past scrapes

📊 <b>My Statistics</b>
   Your usage stats

Send /cancel anytime to go back.`;

  try {
    await ctx.editMessageText(txt, { parse_mode: 'HTML', ...userKb() });
  } catch {
    await ctx.replyWithHTML(txt, userKb());
  }
}

// ─── OWNER MENU ────────────────────────────────
async function handleOwnerMenu(ctx) {
  const isOwner = db.isOwner(ctx.from.id) || config.OWNER_IDS.includes(ctx.from.id);
  if (!isOwner) {
    return ctx.answerCbQuery('🔒 Owner access only!', { show_alert: true });
  }

  const txt = `
╔═══════════════════════════════════╗
║       🔰 OWNER DASHBOARD          ║
╚═══════════════════════════════════╝

📢 <b>Broadcast</b> — Message all users
📊 <b>Bot Stats</b> — Full analytics
👥 <b>User List</b> — All registered users
📥 <b>Export Users</b> — Download CSV
➕ <b>Add Owner</b> — Grant owner access
🤖 <b>Add Bot Token</b> — Clone this bot`;

  try {
    await ctx.editMessageText(txt, { parse_mode: 'HTML', ...ownerKb() });
  } catch {
    await ctx.replyWithHTML(txt, ownerKb());
  }
}

// ─── MY STATS ──────────────────────────────────
async function handleMyStats(ctx) {
  const uid = ctx.from.id;
  const user = db.getUser(uid);
  const scrapes = db.getUserScrapes(uid);

  const txt = `
╔═══════════════════════════════════╗
║         📊 YOUR STATS             ║
╚═══════════════════════════════════╝

👤 <b>Name:</b> ${ctx.from.first_name || ctx.from.username || 'User'}
🆔 <b>ID:</b> <code>${uid}</code>
📅 <b>Joined:</b> ${user ? new Date(user.joinedAt).toLocaleDateString() : 'N/A'}
🌐 <b>Websites Scraped:</b> ${scrapes.length}
🕐 <b>Last Active:</b> ${user ? new Date(user.lastActivity).toLocaleString() : 'N/A'}`;

  const kb = Markup.inlineKeyboard([[Markup.button.callback('🏠 Back', 'user_menu')]]);
  try {
    await ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb });
  } catch {
    await ctx.replyWithHTML(txt, kb);
  }
}

// ─── MAIN MENU ─────────────────────────────────
async function handleMainMenu(ctx) {
  const txt = `
╔═══════════════════════════════════╗
║   ★  SHADOW WEB SCRAPER  ★       ║
╚═══════════════════════════════════╝

🌐 Scrap any website into a complete
   mirror with all CSS, JS & images!

👇 Choose a menu:`;

  try {
    await ctx.editMessageText(txt, { parse_mode: 'HTML', ...startKb() });
  } catch {
    await ctx.replyWithHTML(txt, startKb());
  }
}

module.exports = {
  handleStart,
  handleUserMenu,
  handleOwnerMenu,
  handleMyStats,
  handleMainMenu,
  startKb,
  userKb,
  ownerKb
};
