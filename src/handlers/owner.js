const { Markup } = require('telegraf');
const { Telegraf } = require('telegraf');
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

const sb = '━━━━━━━━━━━━━━━━━━━━━━';

// ─── IS OWNER ──────────────────────────────────
function isOwner(ctx) {
  const uid = ctx.from && ctx.from.id;
  if (!uid) return false;
  if (config.OWNER_IDS.includes(uid)) return true;
  return db.isOwner(uid);
}

// ─── BROADCAST ─────────────────────────────────
async function handleBroadcast(ctx) {
  if (!isOwner(ctx)) return ctx.answerCbQuery('Owner only!', { show_alert: true });
  await ctx.answerCbQuery();

  try {
    await ctx.editMessageText(
      '<b>📢 BROADCAST</b>\n\nSend message to broadcast to all users.\n\nSend /cancel to abort.',
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'owner_menu')]]) }
    );
  } catch {
    await ctx.replyWithHTML(
      '<b>📢 BROADCAST</b>\n\nSend message to broadcast to all users.\n\nSend /cancel to abort.',
      Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'owner_menu')]])
    );
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
    `<b>📢 Broadcasting...</b>\n\n👥 Total: ${users.length}\n✅ Sent: ${sent}\n❌ Failed: ${failed}`
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
    } catch {
      failed++;
    }

    if ((sent + failed) % 10 === 0) {
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id, status.message_id, null,
          `<b>📢 Broadcasting...</b>\n\n👥 Total: ${users.length}\n✅ Sent: ${sent}\n❌ Failed: ${failed}`,
          { parse_mode: 'HTML' }
        );
      } catch {}
    }
    await new Promise(r => setTimeout(r, 50));
  }

  await ctx.telegram.editMessageText(
    ctx.chat.id, status.message_id, null,
    `<b>✅ Broadcast Complete!</b>\n\n👥 Total: ${users.length}\n✅ Sent: ${sent}\n❌ Failed: ${failed}`,
    { parse_mode: 'HTML' }
  );
}

// ─── BOT STATS ─────────────────────────────────
async function handleBotStats(ctx) {
  if (!isOwner(ctx)) return ctx.answerCbQuery('Owner only!', { show_alert: true });
  await ctx.answerCbQuery();

  const stats = db.getStats();
  const users = db.getAllUsers();
  const owners = db.getOwners();
  const bots = db.getBotTokens();

  const uptime = process.uptime ? process.uptime() : 0;
  const upStr = fmtUptime(uptime);

  let memStr = 'N/A';
  try {
    const mem = process.memoryUsage();
    memStr = (mem.heapUsed / 1024 / 1024).toFixed(2) + ' MB';
  } catch {}

  const txt = `
${sb}
<b>📊 BOT STATISTICS</b>
${sb}

<b>👥 Users</b>
Total: ${stats.totalUsers}
Verified: ${stats.verifiedUsers}
Pending: ${stats.totalUsers - stats.verifiedUsers}

<b>📈 Activity</b>
Total Scrapes: ${stats.totalScrapes}
Active (24h): ${users.filter(u => {
  try { return (Date.now() - new Date(u.lastActivity).getTime()) < 86400000; }
  catch { return false; }
}).length}

<b>🔰 Owners</b>
Count: ${owners.length}
${owners.map(o => '• ' + o).join('\n') || 'None'}

<b>🤖 Clones</b>
Active: ${stats.totalClones}

<b>⚡ System</b>
Uptime: ${upStr}
Memory: ${memStr}
Node: ${process.version || 'N/A'}

${sb}`;

  try {
    await ctx.editMessageText(txt, { parse_mode: 'HTML', ...Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Refresh', 'bot_stats')],
      [Markup.button.callback('⬅️ Owner Menu', 'owner_menu')]
    ])});
  } catch {
    await ctx.replyWithHTML(txt, Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Refresh', 'bot_stats')],
      [Markup.button.callback('⬅️ Owner Menu', 'owner_menu')]
    ]));
  }
}

function fmtUptime(s) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return d + 'd ' + h + 'h ' + m + 'm ' + sec + 's';
}

// ─── USER LIST ─────────────────────────────────
async function handleUserList(ctx) {
  if (!isOwner(ctx)) return ctx.answerCbQuery('Owner only!', { show_alert: true });
  await ctx.answerCbQuery();

  const users = db.getAllUsers();
  if (users.length === 0) {
    try {
      return ctx.editMessageText('👥 No users found.', { parse_mode: 'HTML', ...Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Owner Menu', 'owner_menu')]
      ])});
    } catch { return ctx.replyWithHTML('👥 No users found.'); }
  }

  const display = users.slice(0, 20);
  let text = `👥 <b>USER LIST</b>\n\nTotal: ${users.length}\n\n`;

  for (let i = 0; i < display.length; i++) {
    const u = display[i];
    const name = u.firstName || u.username || 'Unknown';
    const status = u.verified ? '✅' : '⏳';
    text += `${i + 1}. ${status} <code>${u.id}</code> - ${name}\n`;
    text += `   Scrapes: ${u.scrapesCount || 0}\n`;
  }

  if (users.length > 20) text += `\n... and ${users.length - 20} more`;

  try {
    await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard([
      [Markup.button.callback('📥 Export CSV', 'export_users')],
      [Markup.button.callback('⬅️ Owner Menu', 'owner_menu')]
    ])});
  } catch {
    await ctx.replyWithHTML(text, Markup.inlineKeyboard([
      [Markup.button.callback('📥 Export CSV', 'export_users')],
      [Markup.button.callback('⬅️ Owner Menu', 'owner_menu')]
    ]));
  }
}

// ─── EXPORT USERS ──────────────────────────────
async function handleExportUsers(ctx) {
  if (!isOwner(ctx)) return ctx.answerCbQuery('Owner only!', { show_alert: true });
  await ctx.answerCbQuery();

  const users = db.getAllUsers();
  const lines = ['ID,Username,FirstName,Verified,JoinedAt,ScrapesCount'];
  for (const u of users) {
    lines.push(`${u.id},${(u.username || '').replace(/,/g, '')},${(u.firstName || '').replace(/,/g, '')},${u.verified},${u.joinedAt},${u.scrapesCount || 0}`);
  }

  const dir = path.join(__dirname, '../../data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const fpath = path.join(dir, 'users_' + Date.now() + '.csv');
  fs.writeFileSync(fpath, lines.join('\n'));

  await ctx.replyWithDocument(
    { source: fpath, filename: 'users_list.csv' },
    { caption: `📥 Exported ${users.length} users` }
  );
}

// ─── ADD OWNER ─────────────────────────────────
async function handleAddOwner(ctx) {
  if (!isOwner(ctx)) return ctx.answerCbQuery('Owner only!', { show_alert: true });
  await ctx.answerCbQuery();

  try {
    await ctx.editMessageText(
      '<b>➕ ADD OWNER</b>\n\nSend the User ID to make owner.\nGet ID from @userinfobot\n\nSend /cancel to abort.',
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'owner_menu')]]) }
    );
  } catch {
    await ctx.replyWithHTML(
      '<b>➕ ADD OWNER</b>\n\nSend the User ID to make owner.\nGet ID from @userinfobot\n\nSend /cancel to abort.',
      Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'owner_menu')]])
    );
  }

  sessions.set(ctx.from.id, { action: 'add_owner' });
}

async function processAddOwner(ctx, text) {
  const uid = ctx.from.id;
  const s = sessions.get(uid);
  if (!s || s.action !== 'add_owner') return;
  sessions.delete(uid);

  const newId = parseInt(text.trim());
  if (isNaN(newId)) return ctx.reply('❌ Invalid User ID. Send a number.');

  if (db.addOwner(newId)) {
    await ctx.replyWithHTML(
      `✅ <b>Owner Added!</b>\n\nNew Owner ID: <code>${newId}</code>`
    );
    try {
      await ctx.telegram.sendMessage(newId,
        `<b>🎉 You are now an Owner!</b>\n\nYou have access to the Owner Menu.`,
        { parse_mode: 'HTML' }
      );
    } catch {}
  } else {
    await ctx.reply('Already an owner.');
  }
}

// ─── ADD BOT TOKEN ─────────────────────────────
async function handleAddBotToken(ctx) {
  if (!isOwner(ctx)) return ctx.answerCbQuery('Owner only!', { show_alert: true });
  await ctx.answerCbQuery();

  try {
    await ctx.editMessageText(
      '<b>🤖 ADD BOT TOKEN</b>\n\nSend bot token from @BotFather.\nClone bot will work identically!\n\n<code>Format: 123456:ABCdef</code>\n\nSend /cancel to abort.',
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'owner_menu')]]) }
    );
  } catch {
    await ctx.replyWithHTML(
      '<b>🤖 ADD BOT TOKEN</b>\n\nSend bot token from @BotFather.\n\nSend /cancel to abort.',
      Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'owner_menu')]])
    );
  }

  sessions.set(ctx.from.id, { action: 'add_token' });
}

async function processAddToken(ctx, token) {
  const uid = ctx.from.id;
  const s = sessions.get(uid);
  if (!s || s.action !== 'add_token') return;
  sessions.delete(uid);

  const t = token.trim();
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(t)) {
    return ctx.reply('❌ Invalid token format!');
  }

  await ctx.reply('🔍 Verifying token...');

  try {
    const res = await axios.get('https://api.telegram.org/bot' + t + '/getMe', { timeout: 10000 });
    if (!res.data || !res.data.ok) throw new Error('Invalid token');

    const info = res.data.result;
    if (db.addBotToken(t, uid)) {
      startCloneBot(t, info);
      await ctx.replyWithHTML(
        `✅ <b>Clone Bot Online!</b>\n\n🤖 ${info.first_name}\n🔗 @${info.username}\n🆔 <code>${info.id}</code>\n\nUsers can now use @${info.username}`
      );
    } else {
      await ctx.reply('Token already added.');
    }
  } catch (err) {
    await ctx.replyWithHTML(
      `❌ <b>Failed!</b>\n\n${err.message}\n\nCheck:\n• Token is correct\n• Bot not already running`
    );
  }
}

// ─── CLONE BOT SYSTEM ──────────────────────────
function startCloneBot(token, info) {
  try {
    const bot = new Telegraf(token);
    setupClone(bot);
    bot.launch({ dropPendingUpdates: true });
    cloneBots.set(token, { bot, info, startedAt: new Date().toISOString() });
    console.log('Clone bot @' + info.username + ' started');
  } catch (err) {
    console.error('Clone start failed:', err.message);
  }
}

function setupClone(bot) {
  const cmds = require('./commands');
  const scrp = require('./scraper');

  bot.command('start', cmds.handleStart);
  bot.action('verify_join', cmds.handleVerify);
  bot.action('user_menu', cmds.handleUserMenu);
  bot.action('owner_menu', handleOwnerMenu);
  bot.action('main_menu', cmds.handleMainMenu);
  bot.action('my_stats', cmds.handleMyStats);
  bot.action('scrape_new', scrp.handleScrapeNew);
  bot.action('my_scrapes', scrp.handleMyScrapes);
  bot.action(/^detail_(.+)$/, (ctx) => scrp.handleDetail(ctx, ctx.match[1]));

  bot.action('broadcast', handleBroadcast);
  bot.action('bot_stats', handleBotStats);
  bot.action('user_list', handleUserList);
  bot.action('add_owner', handleAddOwner);
  bot.action('add_bot_token', handleAddBotToken);
  bot.action('export_users', handleExportUsers);

  bot.on('text', async (ctx, next) => {
    const uid = ctx.from.id;
    const txt = ctx.message.text;

    if (scrp.active.has(uid)) {
      if (txt === '/cancel') return scrp.handleCancel(ctx);
      return scrp.processUrl(ctx, txt);
    }

    const ses = sessions.get(uid);
    if (ses) {
      if (txt === '/cancel') { sessions.delete(uid); return ctx.reply('Cancelled.'); }
      if (ses.action === 'broadcast') return processBroadcast(ctx);
      if (ses.action === 'add_owner') return processAddOwner(ctx, txt);
      if (ses.action === 'add_token') return processAddToken(ctx, txt);
    }

    return next();
  });
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
