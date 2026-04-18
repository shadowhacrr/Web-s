const { Markup } = require('telegraf');
const config = require('../config');
const db = require('../services/database');
const scraper = require('../services/scraper');

// ╔══════════════════════════════════════════╗
// ║      SCRAPER HANDLERS                    ║
// ╚══════════════════════════════════════════╝

const active = new Map();

// ─── SCRAPE NEW ────────────────────────────────
async function handleScrapeNew(ctx) {
  const uid = ctx.from.id;
  if (active.has(uid)) {
    return ctx.answerCbQuery('Wait for current scrape to finish!', { show_alert: true });
  }
  await ctx.answerCbQuery();

  try {
    await ctx.editMessageText(
      '<b>🌐 Website Scraper</b>\n\nSend me the website URL.\n\n<code>Example: https://example.com</code>\n\nSend /cancel to abort.',
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'main_menu')]]) }
    );
  } catch (e) {
    await ctx.replyWithHTML(
      '<b>🌐 Website Scraper</b>\n\nSend me the website URL.\n\n<code>Example: https://example.com</code>\n\nSend /cancel to abort.',
      Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'main_menu')]])
    );
  }

  active.set(uid, { status: 'waiting' });
}

// ─── PROCESS URL ───────────────────────────────
async function processUrl(ctx, url) {
  const uid = ctx.from.id;
  const session = active.get(uid);
  if (!session || session.status !== 'waiting') return;

  // Validate
  let checkUrl = url;
  if (!url.startsWith('http')) checkUrl = 'https://' + url;
  try { new URL(checkUrl); } catch {
    return ctx.reply('❌ Invalid URL! Send like: https://example.com');
  }

  active.set(uid, { status: 'scraping', url: checkUrl });

  const status = await ctx.replyWithHTML(
    `<b>🔍 Starting Scrape...</b>\n\n🌐 URL: ${checkUrl}\n⏳ Status: Initializing...`
  );

  const update = async (text) => {
    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id, status.message_id, null,
        `<b>🔍 Scraping in Progress...</b>\n\n🌐 URL: ${checkUrl}\n⏳ Status: ${text}`,
        { parse_mode: 'HTML' }
      );
    } catch {}
  };

  try {
    const result = await scraper.scrapeWebsite(checkUrl, update);

    if (!result.success) {
      await ctx.telegram.editMessageText(
        ctx.chat.id, status.message_id, null,
        `❌ <b>Scraping Failed!</b>\n\nError: ${result.error}`,
        { parse_mode: 'HTML' }
      );
      active.delete(uid);
      return;
    }

    await ctx.telegram.editMessageText(
      ctx.chat.id, status.message_id, null,
      `✅ <b>Scrape Complete!</b>\n\n📌 ${result.title}\n🌐 ${result.domain}\n⏱️ ${result.duration}s\n📦 ${result.size}\n📄 ${result.files.length} files\n\nSending ZIP...`,
      { parse_mode: 'HTML' }
    );

    // Send ZIP
    await ctx.replyWithDocument(
      { source: result.zipPath, filename: result.zipName },
      {
        caption: `📦 <b>${config.BOT.NAME}</b>\n\n📌 ${result.title}\n🌐 ${result.url}\n📦 ${result.size}\n⏱️ ${result.duration}s`,
        parse_mode: 'HTML'
      }
    );

    // Save
    db.addScrape(uid, {
      url: result.url,
      domain: result.domain,
      title: result.title,
      files: result.files.map(f => f.name),
      zipPath: result.zipPath,
      size: result.size
    });
    db.incrementScrapes(uid);
    db.updateActivity(uid);

    // Summary
    const summary = `✅ <b>Done!</b>\n\n📊 Summary:\n• HTML: ${scraper.fmt(result.stats.htmlSize)}\n• CSS: ${result.stats.cssFiles}\n• JS: ${result.stats.jsFiles}\n• Images: ${result.stats.images}\n• Links: ${result.stats.links}`;

    await ctx.replyWithHTML(summary, Markup.inlineKeyboard([
      [Markup.button.callback('🌐 Scrap Another', 'scrape_new')],
      [Markup.button.callback('🏠 Main Menu', 'main_menu')]
    ]));

  } catch (err) {
    console.error('Scrape error:', err.message);
    await ctx.reply('❌ Error occurred. Please try again.');
  }

  active.delete(uid);
}

// ─── MY SCRAPES ────────────────────────────────
async function handleMyScrapes(ctx) {
  const uid = ctx.from.id;
  const scrapes = db.getUserScrapes(uid);

  if (scrapes.length === 0) {
    const txt = '📦 <b>My Scraped Websites</b>\n\nNo scrapes yet. Click "Scrap New Website"!';
    try {
      return ctx.editMessageText(txt, { parse_mode: 'HTML', ...Markup.inlineKeyboard([
        [Markup.button.callback('🌐 Scrap New', 'scrape_new')],
        [Markup.button.callback('🏠 Main Menu', 'main_menu')]
      ])});
    } catch { return ctx.replyWithHTML(txt); }
  }

  let text = `📦 <b>My Scraped Websites</b>\n\nTotal: ${scrapes.length}\n\n`;
  const recent = scrapes.slice(0, 10);
  const buttons = recent.map((s, i) => {
    const t = s.title.length > 25 ? s.title.substring(0, 25) + '...' : s.title;
    return [Markup.button.callback(`${i + 1}. ${t} (${s.size})`, `detail_${s.id}`)];
  });
  buttons.push([Markup.button.callback('🏠 Main Menu', 'main_menu')]);

  try {
    await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
  } catch {
    await ctx.replyWithHTML(text, Markup.inlineKeyboard(buttons));
  }
}

// ─── SCRAPE DETAIL ─────────────────────────────
async function handleDetail(ctx, scrapeId) {
  const uid = ctx.from.id;
  const scrapes = db.getUserScrapes(uid);
  const s = scrapes.find(x => x.id === scrapeId);
  if (!s) return ctx.answerCbQuery('Not found!');

  await ctx.answerCbQuery();
  const txt = `📌 <b>${s.title}</b>\n\n🌐 <code>${s.url}</code>\n🏷️ ${s.domain}\n📦 ${s.size}\n📅 ${new Date(s.scrapedAt).toLocaleString()}`;

  try {
    await ctx.editMessageText(txt, { parse_mode: 'HTML', ...Markup.inlineKeyboard([
      [Markup.button.callback('⬅️ Back', 'my_scrapes')],
      [Markup.button.callback('🏠 Main Menu', 'main_menu')]
    ])});
  } catch {
    await ctx.replyWithHTML(txt, Markup.inlineKeyboard([
      [Markup.button.callback('⬅️ Back', 'my_scrapes')],
      [Markup.button.callback('🏠 Main Menu', 'main_menu')]
    ]));
  }
}

// ─── CANCEL ────────────────────────────────────
async function handleCancel(ctx) {
  active.delete(ctx.from.id);
  await ctx.reply('❌ Cancelled.');
}

module.exports = {
  handleScrapeNew,
  processUrl,
  handleMyScrapes,
  handleDetail,
  handleCancel,
  active
};
