const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { URL } = require('url');

// ╔══════════════════════════════════════════╗
// ║      SCRAPER ENGINE - INLINE HTML        ║
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
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function fetchResource(url, baseUrl) {
  try {
    const fullUrl = new URL(url, baseUrl).href;
    const res = await axios.get(fullUrl, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
      maxContentLength: 10 * 1024 * 1024,
      responseType: url.match(/\.(png|jpg|jpeg|gif|webp|ico|svg|woff|woff2|ttf|eot)$/) ? 'arraybuffer' : 'text'
    });
    return res.data;
  } catch (e) {
    return null;
  }
}

async function scrapeWebsite(url, onProgress) {
  const startTime = Date.now();
  try {
    if (!url.startsWith('http')) url = 'https://' + url;
    if (!validUrl(url)) throw new Error('Invalid URL');

    const domain = getDomain(url);
    const scrapeId = domain + '_' + Date.now();
    const scrapeDir = path.join(OUT, scrapeId);
    fs.mkdirSync(scrapeDir, { recursive: true });

    if (onProgress) await onProgress('Fetching website...');

    // Step 1: Fetch main HTML
    const res = await axios.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      maxContentLength: 50 * 1024 * 1024
    });

    let html = res.data;
    const $ = cheerio.load(html, { decodeEntities: false });
    const title = $('title').text() || 'Untitled Page';

    const filesList = [];
    let cssCount = 0, jsCount = 0, imgCount = 0;

    // Step 2: Inline all CSS
    if (onProgress) await onProgress('Inlining CSS...');
    const cssLinks = $('link[rel="stylesheet"]');
    let inlineCss = '';

    for (let i = 0; i < cssLinks.length; i++) {
      const href = $(cssLinks[i]).attr('href');
      if (href) {
        const css = await fetchResource(href, url);
        if (css) {
          inlineCss += '/* === Source: ' + href + ' === */\n' + css + '\n\n';
          cssCount++;
        }
      }
    }
    // Remove external CSS links
    $('link[rel="stylesheet"]').remove();
    // Remove old inline style tags (will re-add combined)
    $('style').remove();
    // Add combined CSS
    if (inlineCss) {
      $('head').append('<style>' + inlineCss + '</style>');
    }

    // Step 3: Inline all JavaScript
    if (onProgress) await onProgress('Inlining JavaScript...');
    const scripts = $('script[src]');
    let inlineJs = '';

    for (let i = 0; i < scripts.length; i++) {
      const src = $(scripts[i]).attr('src');
      if (src) {
        const js = await fetchResource(src, url);
        if (js) {
          inlineJs += '// === Source: ' + src + ' ===\n' + js + '\n\n';
          jsCount++;
        }
      }
    }
    // Remove external scripts
    $('script[src]').remove();
    // Remove old inline scripts (will re-add combined)
    $('script:not([src])').remove();
    // Add combined JS at end of body
    if (inlineJs) {
      $('body').append('<script>' + inlineJs + '</script>');
    }

    // Step 4: Inline images (convert to base64 for small images)
    if (onProgress) await onProgress('Processing images...');
    const images = $('img');
    for (let i = 0; i < images.length; i++) {
      const src = $(images[i]).attr('src');
      if (src && !src.startsWith('data:') && !src.startsWith('blob:')) {
        try {
          const imgData = await fetchResource(src, url);
          if (imgData && Buffer.isBuffer(imgData) && imgData.length < 500 * 1024) {
            const ext = path.extname(new URL(src, url).pathname).replace('.', '') || 'png';
            const mime = ext === 'svg' ? 'image/svg+xml' : 'image/' + ext;
            const base64 = Buffer.from(imgData).toString('base64');
            $(images[i]).attr('src', 'data:' + mime + ';base64,' + base64);
            imgCount++;
          }
        } catch {}
      }
    }

    // Step 5: Fix relative links to absolute
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('javascript:')) {
        try { $(el).attr('href', new URL(href, url).href); } catch {}
      }
    });

    // Step 6: Remove noscript tags
    $('noscript').remove();

    // Step 7: Generate final inline HTML
    if (onProgress) await onProgress('Building final HTML...');
    let finalHtml = $.html();

    // Add banner comment at top
    const banner = '<!--\n========================================\n  Scraped by Shadow Web Scraper Bot\n  URL: ' + url + '\n  Date: ' + new Date().toISOString() + '\n========================================\n-->\n';
    finalHtml = banner + finalHtml;

    // Save the single index.html
    const indexPath = path.join(scrapeDir, 'index.html');
    fs.writeFileSync(indexPath, finalHtml, 'utf8');
    filesList.push('index.html (self-contained)');

    // Also save a backup original
    fs.writeFileSync(path.join(scrapeDir, 'index_original.html'), html, 'utf8');
    filesList.push('index_original.html (original)');

    // Save site info JSON
    const siteInfo = {
      url: url,
      domain: domain,
      title: title,
      scrapedAt: new Date().toISOString(),
      inlined: {
        cssFiles: cssCount,
        jsFiles: jsCount,
        imagesBase64: imgCount
      },
      stats: {
        htmlSize: Buffer.byteLength(html),
        finalHtmlSize: Buffer.byteLength(finalHtml),
        cssFiles: cssCount,
        jsFiles: jsCount,
        imagesProcessed: imgCount,
        totalLinks: $('a').length,
        totalForms: $('form').length,
        totalImages: $('img').length
      }
    };
    fs.writeFileSync(path.join(scrapeDir, 'site_info.json'), JSON.stringify(siteInfo, null, 2));
    filesList.push('site_info.json');

    // Save REPORT.txt
    const report = [
      'SHADOW WEB SCRAPER - REPORT',
      '===========================',
      '',
      'URL: ' + url,
      'Title: ' + title,
      'Domain: ' + domain,
      'Time: ' + new Date().toLocaleString(),
      'Duration: ' + ((Date.now() - startTime) / 1000).toFixed(2) + 's',
      '',
      'INLINED RESOURCES:',
      '  CSS Files: ' + cssCount,
      '  JS Files: ' + jsCount,
      '  Images (base64): ' + imgCount,
      '',
      'OUTPUT: Single index.html with everything inlined!',
      'Just open index.html in any browser.',
      '',
      'STATS:',
      '  Original HTML: ' + fmt(siteInfo.stats.htmlSize),
      '  Final HTML: ' + fmt(siteInfo.stats.finalHtmlSize),
      '  Total Links: ' + siteInfo.stats.totalLinks,
      '  Total Forms: ' + siteInfo.stats.totalForms,
      '  Total Images: ' + siteInfo.stats.totalImages,
      '',
      'Scraped by Shadow Web Scraper Bot'
    ].join('\n');
    fs.writeFileSync(path.join(scrapeDir, 'REPORT.txt'), report);
    filesList.push('REPORT.txt');

    // Create ZIP
    if (onProgress) await onProgress('Creating ZIP...');
    const zipName = scrapeId + '.zip';
    const zipPath = path.join(OUT, zipName);
    await makeZip(scrapeDir, zipPath);

    const zipStat = fs.statSync(zipPath);

    return {
      success: true,
      url: url,
      domain: domain,
      title: title,
      zipPath: zipPath,
      zipName: zipName,
      size: fmt(zipStat.size),
      sizeBytes: zipStat.size,
      files: filesList,
      inlined: { css: cssCount, js: jsCount, images: imgCount },
      stats: siteInfo.stats,
      duration: ((Date.now() - startTime) / 1000).toFixed(2)
    };

  } catch (err) {
    console.error('Scrape error:', err.message);
    return { success: false, error: err.message, url: url };
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
