#!/usr/bin/env node

// ╔══════════════════════════════════════════════════════════════╗
// ║           ★ SHADOW WEB SCRAPER BOT v2 ★                    ║
// ╚══════════════════════════════════════════════════════════════╝

const { Telegraf } = require('telegraf');
const config = require('./src/config');
const db = require('./src/services/database');
const cmds = require('./src/handlers/commands');
const scrp = require('./src/handlers/scraper');
const owner = require('./src/handlers/owner');
const scraper = require('./src/services/scraper');

// ─── CHECK TOKEN ───────────────────────────────
if (!config.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN missing!');
  process.exit(1);
}

// ─── INIT BOT ──────────────────────────────────
const bot = new Telegraf(config.BOT_TOKEN);

// ─── MIDDLEWARE ────────────────────────────────
bot.use(async (ctx, next) => {
  if (ctx.from) {
    await db.addUser(ctx.from.id, {
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name
    });
  }
  try {
    await next();
  } catch (err) {
    console.error('Error:', err.message);
  }
});

// ════════════════════════════════════════════════
// COMMANDS
// ════════════════════════════════════════════════

bot.command('start', cmds.handleStart);

bot.command('help', async (ctx) => {
  await ctx.replyWithHTML(`
╔═══════════════════════════════════╗
║         📋 COMMANDS               ║
╚═══════════════════════════════════╝

/start — Start bot
/help — This menu
/menu — Main menu
/scrape — Scrap a website
/mystats — Your statistics
/myscrapes — Your scrapes

🔰 Owner:
/broadcast — Message all users
/stats — Bot statistics
/users — User list
/addowner — Add owner
/addbot — Add clone bot`);
});

bot.command('menu', cmds.sendIntro);
bot.command('scrape', scrp.handleScrapeNew);
bot.command('mystats', cmds.handleMyStats);
bot.command('myscrapes', scrp.handleMyScrapes);

// Owner commands
bot.command('broadcast', owner.handleBroadcast);
bot.command('stats', owner.handleBotStats);
bot.command('users', owner.handleUserList);
bot.command('addowner', owner.handleAddOwner);
bot.command('addbot', owner.handleAddBotToken);

// ════════════════════════════════════════════════
// CALLBACK ACTIONS
// ════════════════════════════════════════════════

bot.action('verify_join', cmds.handleVerify);
bot.action('user_menu', cmds.handleUserMenu);
bot.action('owner_menu', cmds.handleOwnerMenu);
bot.action('main_menu', cmds.handleMainMenu);
bot.action('my_stats', cmds.handleMyStats);

// Scraper
bot.action('scrape_new', scrp.handleScrapeNew);
bot.action('my_scrapes', scrp.handleMyScrapes);
bot.action(/^detail_(.+)$/, (ctx) => scrp.handleDetail(ctx, ctx.match[1]));

// Owner
bot.action('broadcast', owner.handleBroadcast);
bot.action('bot_stats', owner.handleBotStats);
bot.action('user_list', owner.handleUserList);
bot.action('export_users', owner.handleExportUsers);
bot.action('add_owner', owner.handleAddOwner);
bot.action('add_bot_token', owner.handleAddBotToken);

// ════════════════════════════════════════════════
// TEXT MESSAGES
// ════════════════════════════════════════════════

bot.on('text', async (ctx) => {
  const uid = ctx.from.id;
  const txt = ctx.message.text;

  // /cancel
  if (txt === '/cancel') {
    if (scrp.active.has(uid)) {
      scrp.active.delete(uid);
      return ctx.reply('❌ Cancelled.');
    }
    if (owner.sessions.has(uid)) {
      owner.sessions.delete(uid);
      return ctx.reply('❌ Cancelled.');
    }
    return ctx.reply('Nothing to cancel.');
  }

  // Scraper URL input
  if (scrp.active.has(uid)) {
    const s = scrp.active.get(uid);
    if (s && s.status === 'waiting') return scrp.processUrl(ctx, txt);
  }

  // Owner input
  if (owner.sessions.has(uid) && owner.isOwner(uid)) {
    const ses = owner.sessions.get(uid);
    if (ses.action === 'broadcast') return owner.processBroadcast(ctx);
    if (ses.action === 'add_owner') return owner.processAddOwner(ctx, txt);
    if (ses.action === 'add_token') return owner.processAddToken(ctx, txt);
  }
});

// ════════════════════════════════════════════════
// START
// ════════════════════════════════════════════════

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   ★ SHADOW WEB SCRAPER BOT v2 ★    ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');

  try {
    const me = await bot.telegram.getMe();
    console.log('✅ Bot: @' + me.username);
    console.log('👑 Owners: ' + config.OWNER_IDS.join(', '));
  } catch {
    console.error('❌ Invalid BOT_TOKEN');
    process.exit(1);
  }

  await owner.loadClones();

  bot.launch({
    dropPendingUpdates: true,
    polling: { timeout: 30, limit: 100 }
  });

  console.log('✅ Bot is running!');
  console.log('');
}

// Cleanup
const cron = require('node-cron');
cron.schedule('0 */6 * * *', () => {
  console.log('🧹 Cleanup...');
  scraper.cleanup();
});

// Shutdown
process.once('SIGINT', () => { bot.stop('SIGINT'); process.exit(0); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); process.exit(0); });
process.on('uncaughtException', (e) => console.error('Exception:', e.message));
process.on('unhandledRejection', (e) => console.error('Rejection:', e.message));

main();
