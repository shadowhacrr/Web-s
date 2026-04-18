const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { URL } = require('url');

// ╔══════════════════════════════════════════╗
// ║      SCRAPER ENGINE                      ║
// ╚══════════════════════════════════════════╝

const OUT = path.join(__dirname, '../../scraped_data');

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

function validUrl(s) {
  try { new URL(s); return true; } catch { return false; }
}

function getDomain(s) {
  try { return new URL(s).hostname.replace(/[^a-z0-9]/gi, '_'); } catch { return 'unknown'; }
}

function fmt(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function scrapeWebsite(url, onProgress) {
  const start = Date.now();
  try {
    if (!validUrl(url)) throw new Error('Invalid URL');

    const domain = getDomain(url);
    const id = domain + '_' + Date.now();
    const dir = path.join(OUT, id);
    fs.mkdirSync(dir, { recursive: true });

    if (onProgress) await onProgress('Fetching website...');

    // Fetch
    const res = await axios.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,*/*'
      },
      maxContentLength: 50 * 1024 * 1024
    });

    const html = res.data;
    const $ = cheerio.load(html);
    const title = $('title').text() || 'Untitled';

    if (onProgress) await onProgress('Parsing HTML...');

    const files = [];

    // Save HTML
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    files.push({ type: 'HTML', name: 'index.html' });

    // CSS
    if (onProgress) await onProgress('Extracting CSS...');
    const cssDir = path.join(dir, 'css');
    fs.mkdirSync(cssDir, { recursive: true });

    const cssLinks = $('link[rel="stylesheet"]');
    let ci = 0;
    for (let i = 0; i < cssLinks.length; i++) {
      const href = $(cssLinks[i]).attr('href');
      if (href) {
        try {
          const cu = new URL(href, url).href;
          const cr = await axios.get(cu, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
          const cn = 'style_' + (ci || 'main') + '.css';
          fs.writeFileSync(path.join(cssDir, cn), cr.data);
          files.push({ type: 'CSS', name: cn });
          ci++;
        } catch {}
      }
    }

    // Inline CSS
    const inlineCss = $('style').map((_, el) => $(el).html()).get().join('\n');
    if (inlineCss) {
      fs.writeFileSync(path.join(cssDir, 'inline.css'), inlineCss);
      files.push({ type: 'CSS', name: 'inline.css' });
    }

    // JS
    if (onProgress) await onProgress('Extracting JavaScript...');
    const jsDir = path.join(dir, 'js');
    fs.mkdirSync(jsDir, { recursive: true });

    const scripts = $('script[src]');
    let ji = 0;
    for (let i = 0; i < scripts.length; i++) {
      const src = $(scripts[i]).attr('src');
      if (src) {
        try {
          const ju = new URL(src, url).href;
          const jr = await axios.get(ju, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
          const jn = 'script_' + (ji || 'main') + '.js';
          fs.writeFileSync(path.join(jsDir, jn), jr.data);
          files.push({ type: 'JS', name: jn });
          ji++;
        } catch {}
      }
    }

    // Inline JS
    const inlineJs = $('script:not([src])').map((_, el) => $(el).html()).get().join('\n');
    if (inlineJs) {
      fs.writeFileSync(path.join(jsDir, 'inline.js'), inlineJs);
      files.push({ type: 'JS', name: 'inline.js' });
    }

    // Metadata
    if (onProgress) await onProgress('Analyzing site info...');

    const meta = { scrapedUrl: url, domain, title, scrapedAt: new Date().toISOString() };
    meta.stats = {
      htmlSize: Buffer.byteLength(html),
      cssFiles: cssLinks.length,
      jsFiles: scripts.length,
      images: $('img').length,
      links: $('a').length,
      forms: $('form').length,
      tables: $('table').length
    };

    meta.metaTags = {};
    $('meta').each((_, el) => {
      const n = $(el).attr('name') || $(el).attr('property');
      const c = $(el).attr('content');
      if (n && c) meta.metaTags[n] = c;
    });

    meta.forms = [];
    $('form').each((i, el) => {
      meta.forms.push({
        id: $(el).attr('id') || 'form_' + i,
        action: $(el).attr('action') || '',
        method: $(el).attr('method') || 'GET'
      });
    });

    fs.writeFileSync(path.join(dir, 'site_info.json'), JSON.stringify(meta, null, 2));
    files.push({ type: 'INFO', name: 'site_info.json' });

    // Report
    const report = [
      'SHADOW WEB SCRAPER - REPORT',
      '===========================',
      '',
      'URL: ' + url,
      'Title: ' + title,
      'Domain: ' + domain,
      'Duration: ' + ((Date.now() - start) / 1000).toFixed(2) + 's',
      '',
      'FILES:',
      ...files.map(f => '  [' + f.type + '] ' + f.name),
      '',
      'STATS:',
      '  HTML Size: ' + fmt(meta.stats.htmlSize),
      '  CSS Files: ' + meta.stats.cssFiles,
      '  JS Files: ' + meta.stats.jsFiles,
      '  Images: ' + meta.stats.images,
      '  Links: ' + meta.stats.links,
      '  Forms: ' + meta.stats.forms,
      '  Tables: ' + meta.stats.tables
    ].join('\n');

    fs.writeFileSync(path.join(dir, 'REPORT.txt'), report);
    files.push({ type: 'REPORT', name: 'REPORT.txt' });

    // ZIP
    if (onProgress) await onProgress('Creating ZIP...');
    const zipName = id + '.zip';
    const zipPath = path.join(OUT, zipName);
    await makeZip(dir, zipPath);

    const st = fs.statSync(zipPath);

    return {
      success: true,
      url, domain, title,
      zipPath, zipName,
      size: fmt(st.size),
      sizeBytes: st.size,
      files, stats: meta.stats,
      duration: ((Date.now() - start) / 1000).toFixed(2)
    };

  } catch (err) {
    console.error('Scrape error:', err.message);
    return { success: false, error: err.message, url };
  }
}

function makeZip(src, dest) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    const arc = archiver('zip', { zlib: { level: 9 } });
    out.on('close', resolve);
    arc.on('error', reject);
    arc.pipe(out);
    arc.directory(src, false);
    arc.finalize();
  });
}

function cleanup() {
  try {
    const now = Date.now();
    const files = fs.readdirSync(OUT);
    for (const f of files) {
      const p = path.join(OUT, f);
      const st = fs.statSync(p);
      if (now - st.mtimeMs > 24 * 60 * 60 * 1000) {
        fs.rmSync(p, { recursive: true, force: true });
      }
    }
  } catch (e) {
    console.error('Cleanup error:', e.message);
  }
}

module.exports = {
  scrapeWebsite,
  validUrl,
  fmt,
  cleanup
};
