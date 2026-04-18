const { Markup } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('../services/database');

// ╔══════════════════════════════════════════╗
// ║      OWNER HANDLERS                      ║
// ╚══════════════════════════════════════════╝

const sessions = new Map();
const cloneBots = new Map();

// ─── IS OWNER ──────────────────────────────────
function isOwner(uid) {
  if (!uid) return false;
  if (config.OWNER_IDS.includes(uid)) return true;
  return db.isOwner(uid);
}

function isOwnerCtx(ctx) {
  return isOwner(ctx.from && ctx.from.id);
}

// ─── BROADCAST ─────────────────────────────────
async function handleBroadcast(ctx) {
  if (!isOwnerCtx(ctx)) return ctx.answerCbQuery('🔒 Owner only!', { show_alert: true });
  await ctx.answerCbQuery();

  const txt = `
╔═══════════════════════════════════╗
║        📢 BROADCAST               ║
╚═══════════════════════════════════╝

Send a message to broadcast to ALL users.

Supports: Text, Photo, Video
Send /cancel to abort.`;

  try {
    await ctx.editMessageText(txt, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'owner_menu')]]) });
  } catch {
    await ctx.replyWithHTML(txt, Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'owner_menu')]]));
  }
  sessions.set(ctx.from.id, { action: 'broadcast' });
}

async function processBroadcast(ctx) {
  const uid = ctx.from.id;
  const s = sessions.get(uid);
  if (!s || s.action !== 'broadcast') return;
  sessions.delete(uid);

  const users = db.getVerifiedUsers();
  let sent = 0;
  let failed = 0;

  const status = await ctx.replyWithHTML(
    `<b>📢 Broadcasting...</b>\n👥 ${users.length} users\n✅ 0 | ❌ 0`
  );

  for (const user of users) {
    try {
      const msg = ctx.message;
      if (msg.text) {
        await ctx.telegram.sendMessage(user.id, msg.text, { parse_mode: 'HTML' });
      } else if (msg.photo) {
        await ctx.telegram.sendPhoto(user.id, msg.photo[msg.photo.length - 1].file_id, { caption: msg.caption });
      } else if (msg.video) {
        await ctx.telegram.sendVideo(user.id, msg.video.file_id, { caption: msg.caption });
      } else if (msg.document) {
        await ctx.telegram.sendDocument(user.id, msg.document.file_id, { caption: msg.caption });
      }
      sent++;
    } catch { failed++; }

    if ((sent + failed) % 10 === 0) {
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id, status.message_id, null,
          `<b>📢 Broadcasting...</b>\n👥 ${users.length} users\n✅ ${sent} | ❌ ${failed}`,
          { parse_mode: 'HTML' }
        );
      } catch {}
    }
    await new Promise(r => setTimeout(r, 50));
  }

  await ctx.telegram.editMessageText(
    ctx.chat.id, status.message_id, null,
    `<b>✅ Broadcast Complete!</b>\n👥 ${users.length} users\n✅ ${sent} sent | ❌ ${failed} failed`,
    { parse_mode: 'HTML' }
  );
}

// ─── BOT STATS ─────────────────────────────────
async function handleBotStats(ctx) {
  if (!isOwnerCtx(ctx)) return ctx.answerCbQuery('🔒 Owner only!', { show_alert: true });
  await ctx.answerCbQuery();

  const stats = db.getStats();
  const users = db.getAllUsers();
  const owners = db.getOwners();

  let uptimeStr = 'N/A';
  let memStr = 'N/A';
  try {
    const up = process.uptime();
    const d = Math.floor(up / 86400);
    const h = Math.floor((up % 86400) / 3600);
    const m = Math.floor((up % 3600) / 60);
    uptimeStr = d + 'd ' + h + 'h ' + m + 'm';
  } catch {}
  try {
    memStr = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + ' MB';
  } catch {}

  const active24h = users.filter(u => {
    try { return (Date.now() - new Date(u.lastActivity).getTime()) < 86400000; }
    catch { return false; }
  }).length;

  const txt = `
╔═══════════════════════════════════╗
║       📊 BOT STATISTICS           ║
╚═══════════════════════════════════╝

👥 <b>Users</b>
   Total: ${stats.totalUsers}
   Verified: ${stats.verifiedUsers}
   Active (24h): ${active24h}

📈 <b>Activity</b>
   Total Scrapes: ${stats.totalScrapes}

🔰 <b>Owners</b> (${owners.length})
${owners.map(o => '   • ' + o).join('\n') || '   None'}

🤖 <b>Clone Bots</b>: ${stats.totalClones}

⚡ <b>System</b>
   Uptime: ${uptimeStr}
   Memory: ${memStr}
   Node: ${process.version}`;

  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Refresh', 'bot_stats')],
    [Markup.button.callback('🏠 Back', 'main_menu')]
  ]);

  try {
    await ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb });
  } catch {
    await ctx.replyWithHTML(txt, kb);
  }
}

// ─── USER LIST ─────────────────────────────────
async function handleUserList(ctx) {
  if (!isOwnerCtx(ctx)) return ctx.answerCbQuery('🔒 Owner only!', { show_alert: true });
  await ctx.answerCbQuery();

  const users = db.getAllUsers();
  if (users.length === 0) {
    try {
      return ctx.editMessageText('👥 No users.', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back', 'owner_menu')]]) });
    } catch { return ctx.replyWithHTML('👥 No users.'); }
  }

  const display = users.slice(0, 20);
  let text = `
╔═══════════════════════════════════╗
║         👥 USER LIST              ║
╚═══════════════════════════════════╝

Total: <b>${users.length}</b> users\n\n`;

  for (let i = 0; i < display.length; i++) {
    const u = display[i];
    const name = u.firstName || u.username || 'Unknown';
    const status = u.verified ? '✅' : '⏳';
    text += `${i + 1}. ${status} <code>${u.id}</code> — ${name}\n`;
  }
  if (users.length > 20) text += '\n... +' + (users.length - 20) + ' more';

  try {
    await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard([
      [Markup.button.callback('📥 Export CSV', 'export_users')],
      [Markup.button.callback('⬅️ Back', 'owner_menu')]
    ])});
  } catch {
    await ctx.replyWithHTML(text, Markup.inlineKeyboard([
      [Markup.button.callback('📥 Export CSV', 'export_users')],
      [Markup.button.callback('⬅️ Back', 'owner_menu')]
    ]));
  }
}

// ─── EXPORT USERS ──────────────────────────────
async function handleExportUsers(ctx) {
  if (!isOwnerCtx(ctx)) return ctx.answerCbQuery('🔒 Owner only!', { show_alert: true });
  await ctx.answerCbQuery();

  const users = db.getAllUsers();
  const lines = ['ID,Username,FirstName,Verified,JoinedAt,Scrapes'];
  for (const u of users) {
    lines.push(`${u.id},${(u.username || '').replace(/,/g, '')},${(u.firstName || '').replace(/,/g, '')},${u.verified},${u.joinedAt},${u.scrapesCount || 0}`);
  }

  const dir = path.join(__dirname, '../../data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const fpath = path.join(dir, 'users_' + Date.now() + '.csv');
  fs.writeFileSync(fpath, lines.join('\n'));

  await ctx.replyWithDocument(
    { source: fpath, filename: 'users_list.csv' },
    { caption: `📥 ${users.length} users exported` }
  );
}

// ─── ADD OWNER ─────────────────────────────────
async function handleAddOwner(ctx) {
  if (!isOwnerCtx(ctx)) return ctx.answerCbQuery('🔒 Owner only!', { show_alert: true });
  await ctx.answerCbQuery();

  const txt = `
╔═══════════════════════════════════╗
║        ➕ ADD OWNER               ║
╚═══════════════════════════════════╝

Send the User ID to make them owner.
Get ID from @userinfobot

Send /cancel to abort.`;

  try {
    await ctx.editMessageText(txt, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'owner_menu')]]) });
  } catch {
    await ctx.replyWithHTML(txt, Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'owner_menu')]]));
  }
  sessions.set(ctx.from.id, { action: 'add_owner' });
}

async function processAddOwner(ctx, text) {
  const uid = ctx.from.id;
  const s = sessions.get(uid);
  if (!s || s.action !== 'add_owner') return;
  sessions.delete(uid);

  const newId = parseInt(text.trim());
  if (isNaN(newId)) return ctx.reply('❌ Invalid! Send a numeric User ID.');

  if (db.addOwner(newId)) {
    await ctx.replyWithHTML(`✅ <b>Owner Added!</b>\n\n🆔 <code>${newId}</code> can now use Owner Menu.`);
    try {
      await ctx.telegram.sendMessage(newId, '<b>🎉 You are now an Owner!</b>\n\nUse /menu to access Owner Menu.', { parse_mode: 'HTML' });
    } catch {}
  } else {
    await ctx.reply('Already an owner.');
  }
}

// ─── ADD BOT TOKEN ─────────────────────────────
async function handleAddBotToken(ctx) {
  if (!isOwnerCtx(ctx)) return ctx.answerCbQuery('🔒 Owner only!', { show_alert: true });
  await ctx.answerCbQuery();

  const txt = `
╔═══════════════════════════════════╗
║      🤖 ADD BOT TOKEN             ║
╚═══════════════════════════════════╝

Send a bot token from @BotFather.
A clone bot will be created instantly!

<code>Format: 123456:ABCdef...</code>

Send /cancel to abort.`;

  try {
    await ctx.editMessageText(txt, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'owner_menu')]]) });
  } catch {
    await ctx.replyWithHTML(txt, Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'owner_menu')]]));
  }
  sessions.set(ctx.from.id, { action: 'add_token' });
}

async function processAddToken(ctx, token) {
  const uid = ctx.from.id;
  const s = sessions.get(uid);
  if (!s || s.action !== 'add_token') return;
  sessions.delete(uid);

  const t = token.trim();
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(t)) return ctx.reply('❌ Invalid token format!');

  await ctx.reply('🔍 Verifying token...');

  try {
    const res = await axios.get('https://api.telegram.org/bot' + t + '/getMe', { timeout: 10000 });
    if (!res.data || !res.data.ok) throw new Error('Invalid token');

    const info = res.data.result;
    if (db.addBotToken(t, uid)) {
      startCloneBot(t, info);
      await ctx.replyWithHTML(
        `✅ <b>Clone Bot Online!</b>\n\n🤖 ${info.first_name}\n🔗 @${info.username}\n🆔 <code>${info.id}</code>`
      );
    } else {
      await ctx.reply('Token already added.');
    }
  } catch (err) {
    await ctx.replyWithHTML(`❌ <b>Failed!</b>\n\n${err.message}\n\nCheck token and try again.`);
  }
}

// ─── CLONE BOT SYSTEM ──────────────────────────
function startCloneBot(token, info) {
  try {
    const { Telegraf } = require('telegraf');
    const cmds = require('./commands');
    const scrp = require('./scraper');
    const own = require('./owner');

    const bot = new Telegraf(token);

    // Commands
    bot.command('start', cmds.handleStart);
    bot.command('menu', cmds.sendIntro);
    bot.command('scrape', scrp.handleScrapeNew);
    bot.command('mystats', cmds.handleMyStats);
    bot.command('myscrapes', scrp.handleMyScrapes);

    // Actions
    bot.action('verify_join', cmds.handleVerify);
    bot.action('user_menu', cmds.handleUserMenu);
    bot.action('owner_menu', cmds.handleOwnerMenu);
    bot.action('main_menu', cmds.handleMainMenu);
    bot.action('my_stats', cmds.handleMyStats);
    bot.action('scrape_new', scrp.handleScrapeNew);
    bot.action('my_scrapes', scrp.handleMyScrapes);
    bot.action(/^detail_(.+)$/, (c) => scrp.handleDetail(c, c.match[1]));

    bot.action('broadcast', handleBroadcast);
    bot.action('bot_stats', handleBotStats);
    bot.action('user_list', handleUserList);
    bot.action('export_users', handleExportUsers);
    bot.action('add_owner', handleAddOwner);
    bot.action('add_bot_token', handleAddBotToken);

    // Text handler
    bot.on('text', async (c, next) => {
      const id = c.from.id;
      const txt = c.message.text;

      if (scrp.active.has(id)) {
        if (txt === '/cancel') return scrp.handleCancel(c);
        return scrp.processUrl(c, txt);
      }

      const ses = sessions.get(id);
      if (ses) {
        if (txt === '/cancel') { sessions.delete(id); return c.reply('Cancelled.'); }
        if (ses.action === 'broadcast') return processBroadcast(c);
        if (ses.action === 'add_owner') return processAddOwner(c, txt);
        if (ses.action === 'add_token') return processAddToken(c, txt);
      }

      return next();
    });

    bot.launch({ dropPendingUpdates: true });
    cloneBots.set(token, { bot, info, startedAt: new Date().toISOString() });
    console.log('Clone @' + info.username + ' started');
  } catch (err) {
    console.error('Clone failed:', err.message);
  }
}

// ─── LOAD CLONES ───────────────────────────────
async function loadClones() {
  const tokens = db.getBotTokens();
  console.log('Loading ' + tokens.length + ' clone bots...');
  for (const item of tokens) {
    try {
      const res = await axios.get('https://api.telegram.org/bot' + item.token + '/getMe', { timeout: 10000 });
      if (res.data && res.data.ok) {
        startCloneBot(item.token, res.data.result);
      } else {
        db.removeBotToken(item.token);
      }
    } catch {
      db.removeBotToken(item.token);
    }
  }
}

module.exports = {
  isOwner,
  isOwnerCtx,
  handleBroadcast,
  processBroadcast,
  handleBotStats,
  handleUserList,
  handleExportUsers,
  handleAddOwner,
  processAddOwner,
  handleAddBotToken,
  processAddToken,
  loadClones,
  sessions
};
