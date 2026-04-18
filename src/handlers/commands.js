const { Markup } = require('telegraf');
const config = require('../config');
const db = require('../services/database');

// ╔══════════════════════════════════════════╗
// ║      STYLISH COMMAND HANDLERS            ║
// ╚══════════════════════════════════════════╝

// ─── CHANNEL JOIN KEYBOARD ─────────────────────
function channelKb() {
  return Markup.inlineKeyboard([
    [Markup.button.url('📢 Telegram Channel', config.CHANNELS.TELEGRAM)],
    [Markup.button.url('📺 YouTube Channel', config.CHANNELS.YOUTUBE)],
    [Markup.button.url('💬 WhatsApp Channel', config.CHANNELS.WHATSAPP)],
    [Markup.button.callback('✅ I Have Joined All', 'verify_join')]
  ]);
}

// ─── MAIN MENU ─────────────────────────────────
function mainKb(isOwner) {
  const rows = [
    [Markup.button.callback('🌐 Scrap Website', 'scrape_new')],
    [Markup.button.callback('📦 My Scraped Sites', 'my_scrapes'), Markup.button.callback('📊 My Stats', 'my_stats')],
    [Markup.button.callback('👤 User Menu', 'user_menu')]
  ];
  if (isOwner) {
    rows.push([Markup.button.callback('🔰 Owner Menu', 'owner_menu')]);
  }
  return Markup.inlineKeyboard(rows);
}

function userKb() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🌐 Scrap New Website', 'scrape_new')],
    [Markup.button.callback('📦 My Scraped Websites', 'my_scrapes')],
    [Markup.button.callback('📊 My Statistics', 'my_stats')],
    [Markup.button.callback('🏠 Back to Main', 'main_menu')]
  ]);
}

function ownerKb() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📢 Broadcast', 'broadcast'), Markup.button.callback('📊 Bot Stats', 'bot_stats')],
    [Markup.button.callback('👥 User List', 'user_list'), Markup.button.callback('📥 Export Users', 'export_users')],
    [Markup.button.callback('➕ Add Owner', 'add_owner'), Markup.button.callback('🤖 Add Bot Token', 'add_bot_token')],
    [Markup.button.callback('🏠 Back to Main', 'main_menu')]
  ]);
}

// ─── /START ────────────────────────────────────
async function handleStart(ctx) {
  const uid = ctx.from.id;
  const name = ctx.from.first_name || ctx.from.username || 'User';

  await db.addUser(uid, {
    username: ctx.from.username,
    firstName: ctx.from.first_name,
    lastName: ctx.from.last_name
  });

  const welcome = `
╔═══════════════════════════════════╗
║     ★ SHADOW WEB SCRAPER ★       ║
╚═══════════════════════════════════╝

👋 <b>Hey ${name}!</b>

Welcome to <b>Shadow Web Scraper</b> — the ultimate website cloning tool.

📌 <b>Before you start:</b>
   Join all 3 channels below, then tap Verify.

🔹 Telegram Channel  → Required ✅
🔹 YouTube Channel   → Optional
🔹 WhatsApp Channel  → Optional`;

  await ctx.replyWithHTML(welcome, channelKb());
}

// ─── VERIFY JOIN ───────────────────────────────
async function handleVerify(ctx) {
  const uid = ctx.from.id;
  try {
    const member = await ctx.telegram.getChatMember(config.REQUIRED_CHANNEL_ID, uid);
    const isMember = ['member', 'administrator', 'creator'].includes(member.status);
    if (isMember) {
      await db.verifyUser(uid);
      await ctx.answerCbQuery('✅ Verified! Welcome aboard.');
      await sendIntro(ctx);
    } else {
      await ctx.answerCbQuery('❌ You must join the Telegram channel first!', { show_alert: true });
    }
  } catch (err) {
    console.error('Verify error:', err.message);
    await ctx.answerCbQuery('⚠️ Verification failed. Make sure the bot is admin in the channel.', { show_alert: true });
  }
}

// ─── STYLISH INTRO ─────────────────────────────
async function sendIntro(ctx) {
  const isOwner = db.isOwner(ctx.from.id) || config.OWNER_IDS.includes(ctx.from.id);
  const d = config.DEVELOPER;

  const intro = `
╔═══════════════════════════════════╗
║    ✨ DEVELOPER INTRODUCTION ✨    ║
╚═══════════════════════════════════╝

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  👑 <b>${d.NAME}</b>
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

📝 <b>About</b>
${d.BIO}

⚡ <b>Skills</b>
${d.SKILLS}

📊 <b>Experience</b>
${d.EXPERIENCE}

═══════════════════════════════════
🔗 <b>CONNECT WITH ME</b>
═══════════════════════════════════

📱 <a href="${d.TELEGRAM}">Telegram</a>  |  💻 <a href="${d.GITHUB}">GitHub</a>
📷 <a href="${d.INSTAGRAM}">Instagram</a>  |  🎵 <a href="${d.TIKTOK}">TikTok</a>
💬 <a href="${d.WHATSAPP_CHANNEL}">WhatsApp Channel</a>
📞 <a href="${d.WHATSAPP_CONTACT}">WhatsApp Contact</a>

═══════════════════════════════════
🤖 <b>${config.BOT.NAME} v${config.BOT.VERSION}</b>
═══════════════════════════════════`;

  await ctx.replyWithHTML(intro, mainKb(isOwner));
}

// ─── USER MENU ─────────────────────────────────
async function handleUserMenu(ctx) {
  const txt = `
╔═══════════════════════════════════╗
║         👤 USER MENU              ║
╚═══════════════════════════════════╝

🌐 <b>Scrap New Website</b>
   Enter any URL, get a single index.html
   with all CSS & JS inlined!

📦 <b>My Scraped Websites</b>
   View and re-download your past scrapes

📊 <b>My Statistics</b>
   Your usage stats and activity`;

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
📊 <b>Bot Stats</b> — Analytics & metrics
👥 <b>User List</b> — All registered users
📥 <b>Export Users</b> — Download as CSV
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
✅ <b>Verified:</b> ${user && user.verified ? 'Yes' : 'No'}
🌐 <b>Websites Scraped:</b> ${scrapes.length}
🕐 <b>Last Active:</b> ${user ? new Date(user.lastActivity).toLocaleString() : 'N/A'}`;

  const kb = Markup.inlineKeyboard([[Markup.button.callback('🏠 Back to Main', 'main_menu')]]);
  try {
    await ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb });
  } catch {
    await ctx.replyWithHTML(txt, kb);
  }
}

// ─── MAIN MENU ─────────────────────────────────
async function handleMainMenu(ctx) {
  const isOwner = db.isOwner(ctx.from.id) || config.OWNER_IDS.includes(ctx.from.id);
  const txt = `
╔═══════════════════════════════════╗
║     ★ SHADOW WEB SCRAPER ★       ║
╚═══════════════════════════════════╝

🌐 Scrap any website into a single
   self-contained <b>index.html</b> file!

Choose an option below:`;

  try {
    await ctx.editMessageText(txt, { parse_mode: 'HTML', ...mainKb(isOwner) });
  } catch {
    await ctx.replyWithHTML(txt, mainKb(isOwner));
  }
}

module.exports = {
  handleStart,
  handleVerify,
  sendIntro,
  handleUserMenu,
  handleOwnerMenu,
  handleMyStats,
  handleMainMenu,
  channelKb,
  mainKb,
  userKb,
  ownerKb
};
