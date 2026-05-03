/**
 * HTTP routes for RoleRoom — home page and chat entry.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const MAX_USERNAME = 32;

function sanitizeUsername(raw) {
  if (typeof raw !== 'string') return '';
  const t = raw.trim().slice(0, MAX_USERNAME);
  return t.replace(/[<>"']/g, '');
}

/** Landing page: username form. */
router.get('/', (req, res) => {
  let avatars = [];
  try {
    const avatarDir = path.join(__dirname, '../Avatars/Avatar');
    const files = fs.readdirSync(avatarDir);
    avatars = files.filter(f => f.match(/\.(png|jpe?g|gif|webp)$/i));
  } catch(e) {
    console.error('Could not load avatars:', e);
  }
  res.render('index', { title: 'RoleRoom', error: null, avatars });
});

/**
 * Accept username from form POST, validate, redirect into the chatroom.
 * No password — project requirement is "no authentication".
 */
router.post('/join', (req, res) => {
  const username = sanitizeUsername(req.body?.username || '');
  const avatar = String(req.body?.avatar || '').trim().slice(0, 200).replace(/[<>"']/g, '');
  
  if (!username) {
    let avatars = [];
    try {
      const avatarDir = path.join(__dirname, '../Avatars/Avatar');
      const files = fs.readdirSync(avatarDir);
      avatars = files.filter(f => f.match(/\.(png|jpe?g|gif|webp)$/i));
    } catch(e) {}
    return res.status(400).render('index', {
      title: 'RoleRoom',
      error: 'Please enter a username (letters/numbers, max 32 characters).',
      avatars
    });
  }
  res.redirect(`/chat?username=${encodeURIComponent(username)}&avatar=${encodeURIComponent(avatar)}`);
});

/** Chat UI — username comes from query (set only via /join redirect). */
router.get('/chat', (req, res) => {
  const username = sanitizeUsername(req.query.username || '');
  const avatar = String(req.query.avatar || '').trim().slice(0, 200).replace(/[<>"']/g, '');
  if (!username) {
    return res.redirect('/');
  }
  res.render('chatroom', { title: 'RoleRoom — Chat', username, avatar });
});

module.exports = router;
