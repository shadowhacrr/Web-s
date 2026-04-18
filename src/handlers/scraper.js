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
    return ctx.answerCbQuery('Wait! Current scrape running...', { show_alert: true });
  }
  await ctx.answerCbQuery();

  const prompt = `
╔═══════════════════════════════════╗
║      🌐 WEBSITE SCRAPER           ║
╚═══════════════════════════════════╝

Send me any website URL.

I'll download:
✓ All HTML, CSS, JS files
✓ All images & fonts
✓ Complete website mirror

<code>Example: https://example.com</code>

Send /cancel to go back.`;

  try {
    await ctx.editMessageText(prompt, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'user_menu')]]) });
  } catch {
    await ctx.replyWithHTML(prompt, Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'user_menu')]]));
  }

  active.set(uid, { status: 'waiting' });
}

// ─── PROCESS URL ───────────────────────────────
async function processUrl(ctx, url) {
  const uid = ctx.from.id;
  const session = active.get(uid);
  if (!session || session.status !== 'waiting') return;

  let checkUrl = url.trim();
  if (!checkUrl.startsWith('http')) checkUrl = 'https://' + checkUrl;
  try { new URL(checkUrl); } catch {
    return ctx.reply('❌ Invalid URL! Example: https://google.com');
  }

  active.set(uid, { status: 'scraping', url: checkUrl });

  const statusMsg = await ctx.replyWithHTML(
    `<b>🔍 Starting...</b>\n\n🌐 ${checkUrl}\n⏳ Fetching...`
  );

  const update = async (text) => {
    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, null,
        `<b>🔍 Scraping...</b>\n\n🌐 ${checkUrl}\n⏳ ${text}`,
        { parse_mode: 'HTML' }
      );
    } catch {}
  };

  try {
    const result = await scraper.scrapeWebsite(checkUrl, update);

    if (!result.success) {
      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, null,
        `❌ <b>Failed!</b>\n\n${result.error}\n\nTry a different website.`,
        { parse_mode: 'HTML' }
      );
      active.delete(uid);
      return;
    }

    await ctx.telegram.editMessageText(
      ctx.chat.id, statusMsg.message_id, null,
      `✅ <b>Done!</b> | ⏱️ ${result.duration}s | 📦 ${result.size}`,
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
      files: result.files,
      zipPath: result.zipPath,
      size: result.size
    });
    db.incrementScrapes(uid);
    db.updateActivity(uid);

    // Summary
    const summary = `
╔═══════════════════════════════════╗
║       ✅ SCRAPE COMPLETE          ║
╚═══════════════════════════════════╝

📌 <b>${result.title}</b>

📊 Downloaded:
   CSS files: ${result.stats.css}
   JS files: ${result.stats.js}
   Images: ${result.stats.img}
   Fonts: ${result.stats.font}

📦 <b>Size:</b> ${result.size}
⏱️ <b>Time:</b> ${result.duration}s

📁 Files in ZIP:
${result.files.slice(0, 6).map(f => '   • ' + f).join('\n')}

Open <code>index.html</code> in browser!`;

    await ctx.replyWithHTML(summary, Markup.inlineKeyboard([
      [Markup.button.callback('🌐 Scrap Another', 'scrape_new')],
      [Markup.button.callback('👤 User Menu', 'user_menu')]
    ]));

  } catch (err) {
    console.error('Scrape error:', err.message);
    await ctx.reply('❌ Error. Please try again.');
  }

  active.delete(uid);
}

// ─── MY SCRAPES ────────────────────────────────
async function handleMyScrapes(ctx) {
  const uid = ctx.from.id;
  const scrapes = db.getUserScrapes(uid);

  if (scrapes.length === 0) {
    const txt = `
╔═══════════════════════════════════╗
║      📦 MY SCRAPED SITES          ║
╚═══════════════════════════════════╝

No scrapes yet. Start scraping now!`;
    try {
      return ctx.editMessageText(txt, { parse_mode: 'HTML', ...Markup.inlineKeyboard([
        [Markup.button.callback('🌐 Scrap Website', 'scrape_new')],
        [Markup.button.callback('👤 User Menu', 'user_menu')]
      ])});
    } catch { return ctx.replyWithHTML(txt); }
  }

  let text = `
╔═══════════════════════════════════╗
║      📦 MY SCRAPED SITES          ║
╚═══════════════════════════════════╝

Total: <b>${scrapes.length}</b>\n\n`;
  const recent = scrapes.slice(0, 10);
  const buttons = recent.map((s, i) => {
    const t = s.title.length > 22 ? s.title.substring(0, 22) + '..' : s.title;
    return [Markup.button.callback(`${i + 1}. ${t} (${s.size})`, `detail_${s.id}`)];
  });
  buttons.push([Markup.button.callback('👤 User Menu', 'user_menu')]);

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
  const txt = `
╔═══════════════════════════════════╗
║      📌 SCRAPE DETAILS            ║
╚═══════════════════════════════════╝

📌 <b>${s.title}</b>
🌐 <code>${s.url}</code>
🏷️ ${s.domain}
📦 ${s.size}
📅 ${new Date(s.scrapedAt).toLocaleString()}`;

  try {
    await ctx.editMessageText(txt, { parse_mode: 'HTML', ...Markup.inlineKeyboard([
      [Markup.button.callback('⬅️ Back', 'my_scrapes')],
      [Markup.button.callback('👤 User Menu', 'user_menu')]
    ])});
  } catch {
    await ctx.replyWithHTML(txt, Markup.inlineKeyboard([
      [Markup.button.callback('⬅️ Back', 'my_scrapes')],
      [Markup.button.callback('👤 User Menu', 'user_menu')]
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
