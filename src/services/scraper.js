const axios = require('axios');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const cheerio = require('cheerio');

// ╔══════════════════════════════════════════╗
// ║      REAL SCRAPER ENGINE                 ║
// ║  Downloads ALL resources, saves mirror   ║
// ╚══════════════════════════════════════════╝

const OUT = path.join(__dirname, '../../scraped_data');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://www.google.com/'
};

let downloaded = new Set();
let stats = { css: 0, js: 0, img: 0, font: 0, other: 0, failed: 0 };

function validUrl(s) {
  try { new URL(s); return true; } catch { return false; }
}

function getDomain(s) {
  try { return new URL(s).hostname.replace(/[^a-z0-9]/gi, '_'); } catch { return 'unknown'; }
}

function fmtSize(bytes) {
  if (!bytes) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + ['B', 'KB', 'MB', 'GB'][i];
}

function resolveUrl(url, base) {
  try {
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('http')) return url;
    if (url.startsWith('/')) {
      const b = new URL(base);
      return b.protocol + '//' + b.host + url;
    }
    return new URL(url, base).href;
  } catch { return null; }
}

function urlToPath(urlStr, baseDomain) {
  try {
    const u = new URL(urlStr);
    let p = u.pathname;
    if (!p || p === '/') p = '/index_resource';
    // Remove leading slash and sanitize
    p = p.replace(/^\//, '').replace(/\//g, '_');
    // Add extension if missing
    if (!path.extname(p)) {
      if (urlStr.match(/\.(css|js|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot|ico)/)) {
        // already has extension in query or path
      } else {
        p += '.txt';
      }
    }
    // Limit filename length
    if (p.length > 100) p = p.substring(0, 100);
    return path.join(baseDomain, p);
  } catch {
    // For data URIs or invalid URLs
    return null;
  }
}

async function downloadFile(url, outputPath, baseUrl) {
  const fullUrl = resolveUrl(url, baseUrl);
  if (!fullUrl) return null;
  if (downloaded.has(fullUrl)) return downloaded.get(fullUrl);
  if (fullUrl.startsWith('data:')) return null;

  try {
    const isBinary = fullUrl.match(/\.(png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot|mp3|mp4|pdf|zip)$/i);
    const res = await axios.get(fullUrl, {
      timeout: 20000,
      headers: { ...HEADERS, Referer: baseUrl },
      responseType: isBinary ? 'arraybuffer' : 'text',
      maxContentLength: 20 * 1024 * 1024,
      maxRedirects: 5
    });

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(outputPath, res.data);
    const savedPath = path.basename(path.dirname(outputPath)) + '/' + path.basename(outputPath);
    downloaded.set(fullUrl, savedPath);
    return savedPath;
  } catch (e) {
    stats.failed++;
    return null;
  }
}

function fixCssUrls(css, baseUrl, domain) {
  // Fix @import
  css = css.replace(/@import\s+(?:url\()?['"]?([^'"\)]+)['"]?\)?/gi, (match, url) => {
    const full = resolveUrl(url.trim(), baseUrl);
    if (!full) return match;
    const local = urlToPath(full, domain);
    if (!local) return match;
    const out = path.join(OUT, domain + '_tmp', local);
    downloadFile(url, out, baseUrl).catch(() => {});
    return '@import url("' + local.replace(domain + '/', '') + '")';
  });

  // Fix url() references
  css = css.replace(/url\(['"]?([^'"\)]+)['"]?\)/gi, (match, url) => {
    const clean = url.trim();
    if (clean.startsWith('data:') || clean.startsWith('#')) return match;
    const full = resolveUrl(clean, baseUrl);
    if (!full) return match;
    const local = urlToPath(full, domain);
    if (!local) return match;
    const out = path.join(OUT, domain + '_tmp', local);
    downloadFile(clean, out, baseUrl).catch(() => {});
    return 'url("' + local.replace(domain + '/', '') + '")';
  });

  return css;
}

async function scrapeWebsite(url, onProgress) {
  const start = Date.now();
  downloaded = new Set();
  stats = { css: 0, js: 0, img: 0, font: 0, other: 0, failed: 0 };

  try {
    if (!url.startsWith('http')) url = 'https://' + url;
    if (!validUrl(url)) throw new Error('Invalid URL');

    const domain = getDomain(url);
    const baseDir = path.join(OUT, domain + '_tmp');
    if (fs.existsSync(baseDir)) fs.rmSync(baseDir, { recursive: true, force: true });
    fs.mkdirSync(baseDir, { recursive: true });

    if (onProgress) await onProgress('Fetching main page...');

    // 1. Fetch main HTML
    const res = await axios.get(url, {
      timeout: 30000,
      headers: HEADERS,
      maxContentLength: 50 * 1024 * 1024,
      maxRedirects: 10
    });

    let html = res.data;
    const $ = cheerio.load(html, { decodeEntities: false });
    const title = $('title').text() || 'Untitled';

    if (onProgress) await onProgress('Downloading CSS files...');

    // 2. Download & fix CSS
    const cssLinks = $('link[rel="stylesheet"]');
    for (let i = 0; i < cssLinks.length; i++) {
      const href = $(cssLinks[i]).attr('href');
      if (!href) continue;
      const full = resolveUrl(href, url);
      if (!full) continue;
      const local = urlToPath(full, domain);
      if (!local) continue;
      const out = path.join(baseDir, local);

      let css = null;
      try {
        const r = await axios.get(full, { timeout: 15000, headers: HEADERS, responseType: 'text' });
        css = r.data;
      } catch { continue; }

      if (css) {
        css = fixCssUrls(css, full, domain);
        const dir = path.dirname(out);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(out, css);
        $(cssLinks[i]).attr('href', local.replace(domain + '/', './'));
        stats.css++;
      }
    }

    if (onProgress) await onProgress('Downloading JS files... (' + stats.css + ' CSS done)');

    // 3. Download JS
    const scripts = $('script[src]');
    for (let i = 0; i < scripts.length; i++) {
      const src = $(scripts[i]).attr('src');
      if (!src) continue;
      const full = resolveUrl(src, url);
      if (!full) continue;
      const local = urlToPath(full, domain);
      if (!local) continue;
      const out = path.join(baseDir, local);
      const saved = await downloadFile(src, out, url);
      if (saved) {
        $(scripts[i]).attr('src', local.replace(domain + '/', './'));
        stats.js++;
      }
    }

    if (onProgress) await onProgress('Downloading images... (' + stats.js + ' JS done)');

    // 4. Download images
    const images = $('img');
    for (let i = 0; i < images.length; i++) {
      const src = $(images[i]).attr('src');
      if (!src || src.startsWith('data:')) continue;
      const full = resolveUrl(src, url);
      if (!full) continue;
      const local = urlToPath(full, domain);
      if (!local) continue;
      const out = path.join(baseDir, local);
      const saved = await downloadFile(src, out, url);
      if (saved) {
        $(images[i]).attr('src', local.replace(domain + '/', './'));
        stats.img++;
      }
    }

    // Background images in inline styles
    $('[style*="url("]').each((_, el) => {
      const style = $(el).attr('style');
      if (!style) return;
      const newStyle = style.replace(/url\(['"]?([^'"\)]+)['"]?\)/gi, (match, imgUrl) => {
        const full = resolveUrl(imgUrl.trim(), url);
        if (!full) return match;
        const local = urlToPath(full, domain);
        if (!local) return match;
        const out = path.join(baseDir, local);
        downloadFile(imgUrl, out, url).catch(() => {});
        return 'url(./' + local.replace(domain + '/', '') + ')';
      });
      $(el).attr('style', newStyle);
    });

    if (onProgress) await onProgress('Downloading fonts & favicon...');

    // 5. Download favicon
    const favicon = $('link[rel*="icon"]').attr('href');
    if (favicon) {
      const out = path.join(baseDir, 'favicon.ico');
      await downloadFile(favicon, out, url);
      $('link[rel*="icon"]').attr('href', './favicon.ico');
    }

    // 6. Download fonts referenced in CSS
    const fontRegex = /url\(['"]?([^'"\)]+\.(?:woff2?|ttf|eot|otf))['"]?\)/gi;
    const cssFiles = fs.readdirSync(baseDir, { recursive: true });
    for (const f of cssFiles) {
      if (typeof f === 'string' && f.endsWith('.css')) {
        const fp = path.join(baseDir, f);
        if (fs.statSync(fp).isFile()) {
          let css = fs.readFileSync(fp, 'utf8');
          let m;
          while ((m = fontRegex.exec(css)) !== null) {
            const fontUrl = m[1];
            const full = resolveUrl(fontUrl, url);
            if (full) {
              const local = urlToPath(full, domain);
              if (local) {
                const out = path.join(baseDir, local);
                await downloadFile(fontUrl, out, url);
                stats.font++;
              }
            }
          }
        }
      }
    }

    if (onProgress) await onProgress('Saving final HTML...');

    // 7. Fix base tag
    $('base').remove();
    $('head').prepend('<base href="./">');

    // Remove noscript
    $('noscript').remove();

    // Save final HTML
    const finalHtml = $.html();
    fs.writeFileSync(path.join(baseDir, 'index.html'), finalHtml, 'utf8');

    // Also save original
    fs.writeFileSync(path.join(baseDir, 'original.html'), html, 'utf8');

    // Save site info
    const info = {
      url, domain, title,
      scrapedAt: new Date().toISOString(),
      stats: { ...stats },
      duration: ((Date.now() - start) / 1000).toFixed(2)
    };
    fs.writeFileSync(path.join(baseDir, 'site_info.json'), JSON.stringify(info, null, 2));

    // Create ZIP
    if (onProgress) await onProgress('Creating ZIP...');
    const zipName = domain + '_' + Date.now() + '.zip';
    const zipPath = path.join(OUT, zipName);
    await makeZip(baseDir, zipPath);

    // Cleanup temp dir
    setTimeout(() => {
      try { fs.rmSync(baseDir, { recursive: true, force: true }); } catch {}
    }, 5000);

    const zipStat = fs.statSync(zipPath);

    return {
      success: true,
      url, domain, title,
      zipPath, zipName,
      size: fmtSize(zipStat.size),
      sizeBytes: zipStat.size,
      files: [
        'index.html (final - fixed paths)',
        'original.html (original HTML)',
        'site_info.json',
        stats.css + ' CSS files',
        stats.js + ' JS files',
        stats.img + ' images',
        stats.font + ' fonts'
      ],
      inlined: stats,
      stats: { css: stats.css, js: stats.js, img: stats.img, font: stats.font },
      duration: info.duration
    };

  } catch (err) {
    console.error('Scrape error:', err.message);
    return { success: false, error: err.message, url };
  }
}

function makeZip(src, dest) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    const arc = archiver('zip', { zlib: { level: 6 } });
    out.on('close', resolve);
    arc.on('error', reject);
    arc.pipe(out);
    arc.directory(src, false);
    arc.finalize();
  });
}

function cleanup() {
  try {
    const files = fs.readdirSync(OUT);
    const now = Date.now();
    for (const f of files) {
      const p = path.join(OUT, f);
      const st = fs.statSync(p);
      if (now - st.mtimeMs > 24 * 60 * 60 * 1000) {
        fs.rmSync(p, { recursive: true, force: true });
      }
    }
  } catch (e) { console.error('Cleanup error:', e.message); }
}

module.exports = {
  scrapeWebsite,
  validUrl,
  fmtSize,
  cleanup
};
