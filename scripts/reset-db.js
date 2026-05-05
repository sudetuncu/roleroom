/**
 * Stop the server first (SQLite file may be locked while RoleRoom is running).
 * Usage:
 *   node scripts/reset-db.js           — clears users + messages (keeps XP / player_stats)
 *   node scripts/reset-db.js --stats   — also clears player_stats (full wipe)
 */
const path = require('path');
const db = require(path.join(__dirname, '..', 'db'));

const clearStats = process.argv.includes('--stats');

try {
  db.init();
  db.wipeAllGameData({ clearPersistentStats: clearStats });
  console.log(
    clearStats
      ? 'RoleRoom: messages, users, and player_stats deleted. Restart npm start.'
      : 'RoleRoom: messages and users deleted (XP kept). Restart npm start.'
  );
} catch (e) {
  console.error('Reset failed:', e.message || e);
  process.exit(1);
}
