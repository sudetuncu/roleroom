const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const https = require('https');

const DRIVE_FOLDERS = {
  backgrounds: '1lDPVVbizIqSKr4DJPDU99rCs1LoaBNIh',
  narratorAvatars: '1xLACgov5p09U8vK9q1JOFUezhLX6oI2s',
};
const DRIVE_CACHE_TTL_MS = 5 * 60 * 1000;
const driveCache = new Map();

function getAvatars() {
  let avatars = [];
  try {
    const avatarDir = path.join(__dirname, '../Avatars/Avatar');
    if (fs.existsSync(avatarDir)) {
      const files = fs.readdirSync(avatarDir);
      avatars = files.filter(f => f.match(/\.(png|jpe?g|gif|webp)$/i));
    }
  } catch(e) {
    console.error('Could not load avatars:', e);
  }
  return avatars;
}

function fetchText(url) {
  if (typeof fetch === 'function') {
    return fetch(url).then((res) => {
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return res.text();
    });
  }
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Request failed (${res.statusCode})`));
          return;
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      })
      .on('error', reject);
  });
}

function extractDriveFileIds(html) {
  const ids = new Set();
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]{10,})/g,
    /"id":"([a-zA-Z0-9_-]{10,})"/g,
    /data-id="([a-zA-Z0-9_-]{10,})"/g,
  ];
  for (const pattern of patterns) {
    let match = null;
    while ((match = pattern.exec(html)) !== null) {
      ids.add(match[1]);
    }
  }
  return [...ids];
}

async function getDriveFolderImages(folderId) {
  const cacheKey = `folder:${folderId}`;
  const now = Date.now();
  const cached = driveCache.get(cacheKey);
  if (cached && now - cached.at < DRIVE_CACHE_TTL_MS) {
    return cached.items;
  }

  const url = `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
  try {
    const html = await fetchText(url);
    const ids = extractDriveFileIds(html);
    const items = ids.map((id) => ({
      id,
      thumbnailUrl: `https://drive.google.com/thumbnail?id=${id}&sz=w1200`,
      downloadUrl: `https://drive.google.com/uc?export=download&id=${id}`,
      proxyUrl: `/api/drive-image/${id}`,
    }));
    driveCache.set(cacheKey, { at: now, items });
    return items;
  } catch (error) {
    console.error(`Could not load Google Drive folder ${folderId}:`, error?.message || error);
    return [];
  }
}

router.get('/api/drive-image/:id', async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id || !/^[a-zA-Z0-9_-]{10,}$/.test(id)) {
    res.status(400).send('Invalid file id');
    return;
  }

  const targetUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
  try {
    if (typeof fetch === 'function') {
      const response = await fetch(targetUrl);
      if (!response.ok) {
        res.status(502).send('Upstream image fetch failed');
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=300');
      const contentType = response.headers.get('content-type');
      if (contentType) res.setHeader('Content-Type', contentType);
      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
      return;
    }

    https
      .get(targetUrl, (upstream) => {
        if ((upstream.statusCode || 500) >= 400) {
          res.status(502).send('Upstream image fetch failed');
          return;
        }
        res.setHeader('Cache-Control', 'public, max-age=300');
        if (upstream.headers['content-type']) {
          res.setHeader('Content-Type', upstream.headers['content-type']);
        }
        upstream.pipe(res);
      })
      .on('error', () => {
        res.status(502).send('Upstream image fetch failed');
      });
  } catch (error) {
    console.error(`Could not proxy Google Drive image ${id}:`, error?.message || error);
    res.status(502).send('Image proxy error');
  }
});

router.get('/api/avatars', (req, res) => {
  res.json(getAvatars());
});

router.get('/api/assets', async (req, res) => {
  const [backgrounds, narratorAvatars] = await Promise.all([
    getDriveFolderImages(DRIVE_FOLDERS.backgrounds),
    getDriveFolderImages(DRIVE_FOLDERS.narratorAvatars),
  ]);

  res.json({
    avatars: getAvatars(),
    backgrounds,
    narratorAvatars,
  });
});

module.exports = router;
