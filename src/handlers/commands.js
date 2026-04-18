const { Markup } = require('telegraf');
const config = require('../config');
const db = require('../services/database');

// ╔══════════════════════════════════════════╗
// ║      COMMAND HANDLERS                    ║
// ╚══════════════════════════════════════════╝

const sb = '━━━━━━━━━━━━━━━━━━━━━━';

// ─── CHANNEL KEYBOARD ──────────────────────────
function getChannelKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.url('📢 Telegram', config.CHANNELS.TELEGRAM),
      Markup.button.url('📺 YouTube', config.CHANNELS.YOUTUBE)
    ],
    [
      Markup.button.url('💬 WhatsApp', config.CHANNELS.WHATSAPP)
    ],
    [
      Markup.button.callback('✅ Verify Joined', 'verify_join')
    ]
  ]);
}

// ─── MAIN MENU ─────────────────────────────────
function getMainMenu(isOwner) {
  const btns = [
    [Markup.button.callback('👤 User Menu', 'user_menu')],
    [Markup.button.callback('🌐 Scrap New Website', 'scrape_new')],
    [Markup.button.callback('📦 My Scraped Data', 'my_scrapes')],
    [Markup.button.callback('📊 My Statistics', 'my_stats')]
  ];
  if (isOwner) btns.push([Markup.button.callback('🔰 Owner Menu', 'owner_menu')]);
  return Markup.inlineKeyboard(btns);
}

function getUserMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🌐 Scrap New Website', 'scrape_new')],
    [Markup.button.callback('📦 Old Scraped Websites', 'my_scrapes')],
    [Markup.button.callback('📊 My Statistics', 'my_stats')],
    [Markup.button.callback('🏠 Main Menu', 'main_menu')]
  ]);
}

function getOwnerMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📢 Broadcast', 'broadcast')],
    [Markup.button.callback('📊 Bot Statistics', 'bot_stats')],
    [Markup.button.callback('👥 User List', 'user_list')],
    [Markup.button.callback('➕ Add Owner', 'add_owner')],
    [Markup.button.callback('🤖 Add Bot Token', 'add_bot_token')],
    [Markup.button.callback('🏠 Main Menu', 'main_menu')]
  ]);
}

// ─── /start ────────────────────────────────────
async function handleStart(ctx) {
  const uid = ctx.from.id;
  const uname = ctx.from.username || ctx.from.first_name || 'User';

  await db.addUser(uid, {
    username: ctx.from.username,
    firstName: ctx.from.first_name,
    lastName: ctx.from.last_name
  });

  const msg = `
<b>★ SHADOW WEB SCRAPER ★</b>

${sb}

<b>Welcome,</b> <code>${uname}</code>!

Join our channels below to get started.

<b>Channels:</b>
• Telegram Channel
• YouTube Channel
• WhatsApp Channel

<i>Click the buttons to join, then press Verify.</i>

${sb}`;

  await ctx.replyWithHTML(msg, getChannelKeyboard());
}

// ─── VERIFY ────────────────────────────────────
async function handleVerify(ctx) {
  const uid = ctx.from.id;
  try {
    const member = await ctx.telegram.getChatMember(config.REQUIRED_CHANNEL_ID, uid);
    const ok = ['member', 'administrator', 'creator'].includes(member.status);
    if (ok) {
      await db.verifyUser(uid);
      await ctx.answerCbQuery('Verified!');
      await sendIntro(ctx);
    } else {
      await ctx.answerCbQuery('Please join Telegram channel first!', { show_alert: true });
    }
  } catch (err) {
    console.error('Verify error:', err.message);
    await ctx.answerCbQuery('Error! Make sure bot is admin in channel.', { show_alert: true });
  }
}

// ─── STYLISH INTRO ─────────────────────────────
async function sendIntro(ctx) {
  const isOwner = db.isOwner(ctx.from.id);
  const d = config.DEVELOPER;

  const intro = `
${sb}
<b>✨ DEVELOPER INTRODUCTION ✨</b>
${sb}

👑 <b>DEVELOPER</b>
<code>${d.NAME}</code>

🌐 <b>BIO</b>
${d.BIO}

⚡ <b>SKILLS</b>
${d.SKILLS}

📊 <b>EXPERIENCE</b>
${d.EXPERIENCE}

${sb}
<b>🔗 SOCIAL MEDIA LINKS</b>
${sb}

• <a href="${d.TELEGRAM}">📱 Telegram</a>
• <a href="${d.GITHUB}">💻 GitHub</a>
• <a href="${d.INSTAGRAM}">📷 Instagram</a>
• <a href="${d.TIKTOK}">🎵 TikTok</a>
• <a href="${d.WHATSAPP_CHANNEL}">💬 WhatsApp Channel</a>
• <a href="${d.WHATSAPP_CONTACT}">📞 WhatsApp Contact</a>

${sb}
🤖 <b>${config.BOT.NAME} v${config.BOT.VERSION}</b>
🔥 Ready to scrape any website!
${sb}

<b>👇 Choose an option:</b>`;

  await ctx.replyWithHTML(intro, getMainMenu(isOwner));
}

// ─── USER MENU ─────────────────────────────────
async function handleUserMenu(ctx) {
  const menu = `
${sb}
<b>👤 USER MENU</b>
${sb}

• <b>Scrap New Website</b> - Enter URL to scrape
• <b>Old Scraped</b> - View previous scrapes
• <b>My Statistics</b> - Your usage stats

${sb}`;

  try {
    await ctx.editMessageText(menu, { parse_mode: 'HTML', ...getUserMenu() });
  } catch (e) {
    await ctx.replyWithHTML(menu, getUserMenu());
  }
}

// ─── OWNER MENU ────────────────────────────────
async function handleOwnerMenu(ctx) {
  if (!db.isOwner(ctx.from.id)) {
    return ctx.answerCbQuery('Owner only!', { show_alert: true });
  }
  const menu = `
${sb}
<b>🔰 OWNER MENU</b>
${sb}

• <b>Broadcast</b> - Message all users
• <b>Bot Statistics</b> - Full stats
• <b>User List</b> - All users
• <b>Add Owner</b> - Grant owner access
• <b>Add Bot Token</b> - Clone bot

${sb}`;
  try {
    await ctx.editMessageText(menu, { parse_mode: 'HTML', ...getOwnerMenu() });
  } catch (e) {
    await ctx.replyWithHTML(menu, getOwnerMenu());
  }
}

// ─── MY STATS ──────────────────────────────────
async function handleMyStats(ctx) {
  const uid = ctx.from.id;
  const user = db.getUser(uid);
  const scrapes = db.getUserScrapes(uid);

  const stats = `
${sb}
<b>📊 YOUR STATISTICS</b>
${sb}

👤 <b>User:</b> ${ctx.from.username || 'N/A'}
🆔 <b>ID:</b> <code>${uid}</code>
📅 <b>Joined:</b> ${user ? new Date(user.joinedAt).toLocaleDateString() : 'N/A'}
✅ <b>Verified:</b> ${user && user.verified ? 'Yes' : 'No'}
🌐 <b>Total Scrapes:</b> ${scrapes.length}
🕐 <b>Last Active:</b> ${user ? new Date(user.lastActivity).toLocaleString() : 'N/A'}

${sb}`;

  try {
    await ctx.editMessageText(stats, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🏠 Main Menu', 'main_menu')]]) });
  } catch (e) {
    await ctx.replyWithHTML(stats, Markup.inlineKeyboard([[Markup.button.callback('🏠 Main Menu', 'main_menu')]]));
  }
}

// ─── MAIN MENU ─────────────────────────────────
async function handleMainMenu(ctx) {
  const isOwner = db.isOwner(ctx.from.id);
  const menu = `
${sb}
<b>🤖 ${config.BOT.NAME}</b>
${sb}

<b>👇 Choose an option:</b>`;

  try {
    await ctx.editMessageText(menu, { parse_mode: 'HTML', ...getMainMenu(isOwner) });
  } catch (e) {
    await ctx.replyWithHTML(menu, getMainMenu(isOwner));
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
  getChannelKeyboard,
  getMainMenu,
  getUserMenu,
  getOwnerMenu
};
