require('dotenv').config();

// ╔══════════════════════════════════════════╗
// ║      SHADOW WEB SCRAPER - CONFIG         ║
// ╚══════════════════════════════════════════╝

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN || '',

  OWNER_IDS: process.env.OWNER_IDS
    ? process.env.OWNER_IDS.split(',').map(id => parseInt(id.trim()))
    : [],

  // Channels users must join
  CHANNELS: {
    TELEGRAM: process.env.TELEGRAM_CHANNEL || 'https://t.me/shadowtechhub',
    YOUTUBE: process.env.YOUTUBE_CHANNEL || 'https://youtube.com/@shadowtech',
    WHATSAPP: process.env.WHATSAPP_CHANNEL || 'https://whatsapp.com/channel/shadowtech'
  },

  REQUIRED_CHANNEL_ID: process.env.REQUIRED_CHANNEL_ID || '@shadowtechhub',

  // Developer Info - Social Media
  DEVELOPER: {
    NAME: process.env.DEV_NAME || 'Shadow Developer',
    USERNAME: process.env.DEV_USERNAME || '@shadowdeveloper',
    BIO: process.env.DEV_BIO || 'Full Stack Developer | Bot Creator | Web Scraping Expert',
    SKILLS: process.env.DEV_SKILLS || 'Node.js | Python | React | Telegram Bots | Web Scraping',
    EXPERIENCE: process.env.DEV_EXPERIENCE || '5+ Years',
    // Social Media Links
    TELEGRAM: process.env.DEV_TELEGRAM || 'https://t.me/shadowdeveloper',
    GITHUB: process.env.DEV_GITHUB || 'https://github.com/shadowdeveloper',
    INSTAGRAM: process.env.DEV_INSTAGRAM || 'https://instagram.com/shadowdeveloper',
    TIKTOK: process.env.DEV_TIKTOK || 'https://tiktok.com/@shadowdeveloper',
    WHATSAPP_CHANNEL: process.env.DEV_WHATSAPP_CHANNEL || 'https://whatsapp.com/channel/shadowdev',
    WHATSAPP_CONTACT: process.env.DEV_WHATSAPP_CONTACT || 'https://wa.me/1234567890',
    TWITTER: process.env.DEV_TWITTER || 'https://twitter.com/shadowdeveloper'
  },

  BOT: {
    NAME: 'Shadow Web Scraper',
    VERSION: '2.0',
    DESCRIPTION: 'Professional Website Scraping Tool'
  },

  SCRAPE_CONFIG: {
    TIMEOUT: 60000,
    MAX_FILE_SIZE: 50,
    RETRY_ATTEMPTS: 3
  }
};
