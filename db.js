/**
 * db.js — SQLite persistence for RoleRoom
 * Uses Node.js built-in `node:sqlite` (Node 22.5+) so no native addons
 * need to match your installed Node version (avoids NODE_MODULE_VERSION errors).
 */

const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, 'roleroom.db');

let db;

/** Role options used across the app (must match server logic). */
const ROLES = ['Detective', 'Doctor', 'Killer', 'Spy'];

function init() {
  db = new DatabaseSync(DB_PATH);
  // WAL improves concurrent read/write behavior for the chat log.
  db.exec(`PRAGMA journal_mode = WAL;`);

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

    CREATE INDEX IF NOT EXISTS idx_users_socket ON users(socket_id);
    CREATE INDEX IF NOT EXISTS idx_users_score ON users(score DESC);
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

module.exports = {
  init,
  ROLES,
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
};
