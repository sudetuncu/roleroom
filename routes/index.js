const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

router.get('/api/avatars', (req, res) => {
  let avatars = [];
  try {
    const avatarDir = path.join(__dirname, '../Avatars/Avatar');
    const files = fs.readdirSync(avatarDir);
    avatars = files.filter(f => f.match(/\.(png|jpe?g|gif|webp)$/i));
  } catch(e) {
    console.error('Could not load avatars:', e);
  }
  res.json(avatars);
});

module.exports = router;
