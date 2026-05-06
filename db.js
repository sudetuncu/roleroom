/**
 * db.js — SQLite persistence for RoleRoom
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'roleroom.db');

let db;

/** Role options used across the app (must match server logic). */
const ROLES = ['Detective', 'Doctor', 'Killer', 'Spy'];

/** XP thresholds per level */
const LEVEL_THRESHOLDS = [0, 50, 150, 300, 500, 800, 1200, 1800, 2500, 3500];

function getLevelForXP(xp) {
  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) { level = i + 1; break; }
  }
  return Math.min(level, LEVEL_THRESHOLDS.length);
}

function getXPForNextLevel(level) {
  if (level >= LEVEL_THRESHOLDS.length) return null; // max level
  return LEVEL_THRESHOLDS[level]; // next threshold
}

function init() {
  db = new Database(DB_PATH);
  // WAL improves concurrent read/write behavior for the chat log.
  db.pragma(`journal_mode = WAL`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      role TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      socket_id TEXT UNIQUE,
      avatar TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      role TEXT NOT NULL,
      message TEXT NOT NULL,
      points_delta INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS player_stats (
      username TEXT PRIMARY KEY,
      total_xp INTEGER NOT NULL DEFAULT 0,
      games_played INTEGER NOT NULL DEFAULT 0,
      games_won INTEGER NOT NULL DEFAULT 0,
      best_score INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_users_socket ON users(socket_id);
    CREATE INDEX IF NOT EXISTS idx_users_score ON users(score DESC);
    CREATE INDEX IF NOT EXISTS idx_player_stats_xp ON player_stats(total_xp DESC);
  `);

  try {
    db.exec(`ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT ''`);
  } catch (e) {
    // Ignore error if column already exists
  }
}

function randomRole() {
  return ROLES[Math.floor(Math.random() * ROLES.length)];
}

/**
 * Register a connected player. Each socket gets its own DB row
 * so scores and roles stay consistent for that session.
 */
function createUser(username, role, socketId, avatar = '') {
  const stmt = db.prepare(`
    INSERT INTO users (username, role, score, socket_id, avatar)
    VALUES (?, ?, 0, ?, ?)
  `);
  const info = stmt.run(username, role, socketId, String(avatar).slice(0, 200));
  const rid = info.lastInsertRowid;
  
  // Ensure player_stats row exists
  db.prepare(`INSERT OR IGNORE INTO player_stats (username) VALUES (?)`).run(username);
  
  return typeof rid === 'bigint' ? Number(rid) : rid;
}

function setScore(userId, score) {
  db.prepare(`UPDATE users SET score = ? WHERE id = ?`).run(score, userId);
}

function setRole(userId, role) {
  db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, userId);
}

function addScore(userId, delta) {
  db.prepare(`UPDATE users SET score = score + ? WHERE id = ?`).run(delta, userId);
}

/** Active players: rows that currently have a non-null socket_id. */
function getActiveUsersOrderedByScore() {
  return db
    .prepare(
      `SELECT id, username, role, score, socket_id, avatar
       FROM users
       WHERE socket_id IS NOT NULL
       ORDER BY score DESC, username ASC`
    )
    .all();
}

function disconnectUserBySocket(socketId) {
  db.prepare(`UPDATE users SET socket_id = NULL WHERE socket_id = ?`).run(socketId);
}

function saveMessage(username, role, message, pointsDelta) {
  db.prepare(
    `INSERT INTO messages (username, role, message, points_delta)
     VALUES (?, ?, ?, ?)`
  ).run(username, role, message, pointsDelta);
}

function getRecentMessages(limit = 100) {
  const rows = db
    .prepare(
      `SELECT username, role, message, points_delta, created_at
       FROM messages
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(limit);
  return rows.reverse();
}

/** Reassign random roles and reset scores for all still-connected users. */
function resetGameForActiveUsers() {
  const rows = getActiveUsersOrderedByScore();
  const update = db.prepare(`UPDATE users SET role = ?, score = 0 WHERE id = ?`);
  for (const row of rows) {
    update.run(randomRole(), row.id);
  }
}

function getUserBySocket(socketId) {
  return db.prepare(`SELECT id, username, role, score, avatar FROM users WHERE socket_id = ?`).get(socketId);
}

/** Add XP to a player's persistent stats */
function addXP(username, xp) {
  db.prepare(`
    UPDATE player_stats 
    SET total_xp = total_xp + ?, updated_at = datetime('now')
    WHERE username = ?
  `).run(xp, username);
}

/** Record a game win */
function recordGameWin(username) {
  db.prepare(`
    UPDATE player_stats 
    SET games_won = games_won + 1, updated_at = datetime('now')
    WHERE username = ?
  `).run(username);
}

/** Record a game played */
function recordGamePlayed(username) {
  db.prepare(`
    UPDATE player_stats 
    SET games_played = games_played + 1, updated_at = datetime('now')
    WHERE username = ?
  `).run(username);
}

/** Update best score if current is higher */
function updateBestScore(username, score) {
  db.prepare(`
    UPDATE player_stats 
    SET best_score = MAX(best_score, ?), updated_at = datetime('now')
    WHERE username = ?
  `).run(score, username);
}

/** Get player stats */
function getPlayerStats(username) {
  const row = db.prepare(`SELECT * FROM player_stats WHERE username = ?`).get(username);
  if (!row) return { username, total_xp: 0, games_played: 0, games_won: 0, best_score: 0, level: 1 };
  return { ...row, level: getLevelForXP(row.total_xp) };
}

/** Get global leaderboard (top players by XP) */
function getGlobalLeaderboard(limit = 20) {
  return db.prepare(`
    SELECT username, total_xp, games_played, games_won, best_score
    FROM player_stats
    ORDER BY total_xp DESC
    LIMIT ?
  `).all(limit).map(row => ({
    ...row,
    level: getLevelForXP(row.total_xp)
  }));
}

/** Socket ids currently bound to this username (other tabs / stale sessions). */
function getActiveSocketIdsByUsername(username) {
  return db
    .prepare(`SELECT socket_id FROM users WHERE username = ? AND socket_id IS NOT NULL`)
    .all(username)
    .map((r) => r.socket_id)
    .filter(Boolean);
}

function clearAllSocketsForUsername(username) {
  db.prepare(`UPDATE users SET socket_id = NULL WHERE username = ?`).run(username);
}

/**
 * Same username may have multiple rows (legacy duplicate joins). Keep the best-scoring row, delete others.
 */
function consolidateUsersByUsername(username) {
  const rows = db.prepare(`SELECT id FROM users WHERE username = ? ORDER BY score DESC, id ASC`).all(username);
  if (rows.length <= 1) return rows[0]?.id ?? null;
  const keepId = rows[0].id;
  const del = db.prepare(`DELETE FROM users WHERE username = ? AND id != ?`);
  del.run(username, keepId);
  return keepId;
}

function attachSocketToUser(userId, socketId, avatar, role) {
  db.prepare(`UPDATE users SET socket_id = ?, avatar = ?, role = ? WHERE id = ?`).run(
    socketId,
    String(avatar).slice(0, 200),
    role,
    userId
  );
  return userId;
}

function getUserRowByUsername(username) {
  return db.prepare(`SELECT * FROM users WHERE username = ? LIMIT 1`).get(username);
}

/** Dev / full reset: empty game tables (player_stats optional for true XP wipe). */
function wipeAllGameData({ clearPersistentStats = false } = {}) {
  db.exec('DELETE FROM messages;');
  db.exec('DELETE FROM users;');
  if (clearPersistentStats) {
    db.exec('DELETE FROM player_stats;');
  }
  try {
    db.exec('VACUUM;');
  } catch {
    // ignore if vacuum unsupported in context
  }
}

module.exports = {
  init,
  ROLES,
  LEVEL_THRESHOLDS,
  getLevelForXP,
  getXPForNextLevel,
  randomRole,
  createUser,
  setScore,
  setRole,
  addScore,
  getActiveUsersOrderedByScore,
  disconnectUserBySocket,
  saveMessage,
  getRecentMessages,
  resetGameForActiveUsers,
  getUserBySocket,
  addXP,
  recordGameWin,
  recordGamePlayed,
  updateBestScore,
  getPlayerStats,
  getGlobalLeaderboard,
  getActiveSocketIdsByUsername,
  clearAllSocketsForUsername,
  consolidateUsersByUsername,
  attachSocketToUser,
  getUserRowByUsername,
  wipeAllGameData,
};

