const fs = require('fs');
const path = require('path');

// ╔══════════════════════════════════════════╗
// ║      JSON DATABASE - NO EXTERNAL DB      ║
// ╚══════════════════════════════════════════╝

const DATA_DIR = path.join(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let data = null;

function load() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } else {
      data = { users: {}, owners: [], botTokens: [], scrapes: {}, stats: { totalScrapes: 0 } };
      save();
    }
  } catch (e) {
    console.error('DB load error:', e.message);
    data = { users: {}, owners: [], botTokens: [], scrapes: {}, stats: { totalScrapes: 0 } };
  }
}

function save() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('DB save error:', e.message);
  }
}

// ─── USERS ─────────────────────────────────────
function getUser(userId) {
  return data.users[userId.toString()] || null;
}

function addUser(userId, userInfo) {
  const id = userId.toString();
  if (!data.users[id]) {
    data.users[id] = {
      id: userId,
      username: userInfo.username || '',
      firstName: userInfo.firstName || '',
      lastName: userInfo.lastName || '',
      joinedAt: new Date().toISOString(),
      verified: false,
      scrapesCount: 0,
      lastActivity: new Date().toISOString()
    };
    save();
    return true;
  }
  return false;
}

function verifyUser(userId) {
  const id = userId.toString();
  if (data.users[id]) {
    data.users[id].verified = true;
    data.users[id].verifiedAt = new Date().toISOString();
    save();
    return true;
  }
  return false;
}

function updateActivity(userId) {
  const id = userId.toString();
  if (data.users[id]) {
    data.users[id].lastActivity = new Date().toISOString();
    save();
  }
}

function incrementScrapes(userId) {
  const id = userId.toString();
  if (data.users[id]) {
    data.users[id].scrapesCount = (data.users[id].scrapesCount || 0) + 1;
    save();
  }
}

function getAllUsers() {
  return Object.values(data.users);
}

function getVerifiedUsers() {
  return Object.values(data.users).filter(u => u.verified);
}

// ─── OWNERS ────────────────────────────────────
function isOwner(userId) {
  return data.owners.includes(userId.toString());
}

function addOwner(userId) {
  const id = userId.toString();
  if (!data.owners.includes(id)) {
    data.owners.push(id);
    save();
    return true;
  }
  return false;
}

function getOwners() {
  return data.owners;
}

// ─── SCRAPES ───────────────────────────────────
function addScrape(userId, scrapeData) {
  const id = userId.toString();
  if (!data.scrapes[id]) {
    data.scrapes[id] = [];
  }
  data.scrapes[id].unshift({
    id: Date.now().toString(),
    url: scrapeData.url,
    domain: scrapeData.domain,
    title: scrapeData.title,
    files: scrapeData.files,
    zipPath: scrapeData.zipPath,
    size: scrapeData.size,
    scrapedAt: new Date().toISOString()
  });
  if (data.scrapes[id].length > 50) {
    data.scrapes[id] = data.scrapes[id].slice(0, 50);
  }
  data.stats.totalScrapes++;
  save();
}

function getUserScrapes(userId) {
  return data.scrapes[userId.toString()] || [];
}

// ─── BOT TOKENS ────────────────────────────────
function addBotToken(token, addedBy) {
  if (!data.botTokens.find(b => b.token === token)) {
    data.botTokens.push({
      token: token,
      addedBy: addedBy.toString(),
      addedAt: new Date().toISOString(),
      active: true
    });
    save();
    return true;
  }
  return false;
}

function getBotTokens() {
  return data.botTokens.filter(b => b.active);
}

function removeBotToken(token) {
  const bot = data.botTokens.find(b => b.token === token);
  if (bot) {
    bot.active = false;
    save();
    return true;
  }
  return false;
}

// ─── STATS ─────────────────────────────────────
function getStats() {
  return {
    totalUsers: Object.keys(data.users).length,
    verifiedUsers: getVerifiedUsers().length,
    totalScrapes: data.stats.totalScrapes,
    totalOwners: data.owners.length,
    totalClones: data.botTokens.filter(b => b.active).length
  };
}

// Init
load();

module.exports = {
  getUser,
  addUser,
  verifyUser,
  updateActivity,
  incrementScrapes,
  getAllUsers,
  getVerifiedUsers,
  isOwner,
  addOwner,
  getOwners,
  addScrape,
  getUserScrapes,
  addBotToken,
  getBotTokens,
  removeBotToken,
  getStats
};
