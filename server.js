/**
 * RoleRoom — Express + Socket.io + SQLite
 * Real-time chat with random roles, keyword scoring, scoreboard, and round timer.
 */

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const OpenAI = require('openai');

const db = require('./db');
const indexRoutes = require('./routes/index');

const PORT = process.env.PORT || 3000;

/** Keywords per role: case-insensitive substring match → +10, else -5 */
const ROLE_KEYWORDS = {
  Detective: ['clue', 'suspect', 'investigate'],
  Doctor: ['heal', 'patient', 'medicine'],
  Killer: ['kill', 'attack', 'target'],
  Spy: ['secret', 'mission', 'infiltrate'],
};

const ROUND_MS = 2 * 60 * 1000; // 2 minutes per round (requirement #9)
const WINNER_BONUS = 10;
const AI_SCORE_MIN = 1;
const AI_SCORE_MAX = 10;
const AI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: false },
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/avatars', express.static(path.join(__dirname, 'Avatars/Avatar')));

app.use('/', indexRoutes);

db.init();

/** Server-side round end timestamp (ms). Resets on new game or first connection batch. */
let roundEndsAt = Date.now() + ROUND_MS;

/** Display round index 1..ROUND_TOTAL (increments when each timed window ends). */
const ROUND_TOTAL = 10;
let roundNumber = 1;
let currentScenario = '';
let currentRoundRoles = [...db.ROLES];
let roundMessages = [];
let roundLifecycleRunning = false;

function secondsLeftInRound() {
  return Math.max(0, Math.ceil((roundEndsAt - Date.now()) / 1000));
}

/**
 * Check message against the player's role keywords.
 * @returns {boolean} true if at least one keyword appears (substring, case-insensitive)
 */
function messageMatchesRole(role, message) {
  const keywords = ROLE_KEYWORDS[role];
  if (!keywords) return false;
  const lower = String(message).toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

function pointsForMessage(role, message) {
  return messageMatchesRole(role, message) ? 10 : -5;
}

function keywordHintForRole(role) {
  const kws = ROLE_KEYWORDS[role];
  if (!kws) return '';
  return `Your keywords (${role}): ${kws.join(', ')} — use one in a message for +10 points, or lose 5.`;
}

/** Build payload of active users for clients (top player = first in sort order from DB). */
function buildUsersPayload() {
  return db.getActiveUsersOrderedByScore().map((row) => ({
    id: row.id,
    username: row.username,
    role: row.role,
    score: row.score,
    socketId: row.socket_id,
    avatar: row.avatar,
  }));
}

function fallbackScenario() {
  return [
    'A foggy midnight settles over Ravenhill, and the town square goes silent.',
    'Detective searches for hidden clues while Doctor tries to keep everyone calm.',
    'Killer moves in the shadows, waiting for the perfect moment to strike.',
    'Spy listens to every whisper, collecting secrets that could change the night.',
  ].join(' ');
}

function normalizeScenario(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 800);
}

function clampScore(value) {
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) return AI_SCORE_MIN;
  return Math.max(AI_SCORE_MIN, Math.min(AI_SCORE_MAX, Math.round(asNumber)));
}

function safeJsonParse(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (!fenced) return null;
    try {
      return JSON.parse(fenced[1]);
    } catch {
      return null;
    }
  }
}

async function generateScenarioFromAI() {
  if (!openai) return fallbackScenario();
  try {
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      temperature: 0.8,
      messages: [
        {
          role: 'system',
          content:
            'You are a game narrator. Create a short roleplay scenario in 3-5 sentences. Include all four roles exactly once: Detective, Doctor, Killer, Spy.',
        },
        {
          role: 'user',
          content:
            'Generate a dramatic but clear opening scenario for one game round. Keep it concise and easy to read.',
        },
      ],
    });
    const text = completion.choices?.[0]?.message?.content;
    return normalizeScenario(text) || fallbackScenario();
  } catch (err) {
    console.error('Scenario generation failed:', err?.message || err);
    return fallbackScenario();
  }
}

function assignRolesForCurrentRound() {
  const users = db.getActiveUsersOrderedByScore();
  if (users.length === 0) return;
  const shuffledRoles = [...currentRoundRoles].sort(() => Math.random() - 0.5);
  for (let i = 0; i < users.length; i += 1) {
    const role = shuffledRoles[i % shuffledRoles.length];
    db.setRole(users[i].id, role);
  }
}

async function evaluateRoundWithAI() {
  const users = db.getActiveUsersOrderedByScore();
  if (users.length === 0) return null;

  const roleMapLines = users.map((u) => `- ${u.username}: ${u.role}`).join('\n');
  const messageLines = roundMessages.length
    ? roundMessages.map((m) => `${m.username} (${m.role}): ${m.message}`).join('\n')
    : 'No roleplay messages were sent in this round.';

  if (!openai) {
    const fallbackWinner = users[0].username;
    return {
      winner: fallbackWinner,
      reason: 'OpenAI API key is not set. Winner selected by current score.',
      scores: users.map((u) => ({ username: u.username, score: 5 })),
    };
  }

  const prompt = `You are a game narrator. Evaluate the following roleplay conversation.
Each player has a role and must act according to it.
Choose the player who best played their role.

Scenario:
${currentScenario}

Roles:
${roleMapLines}

Messages:
${messageLines}

Return ONLY valid JSON in this exact format:
{
  "winner": "username",
  "reason": "why this player performed best",
  "scores": [
    { "username": "...", "score": 8 }
  ]
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You are a strict JSON generator. Respond with valid JSON only, no markdown, no extra keys.',
        },
        { role: 'user', content: prompt },
      ],
    });
    const content = completion.choices?.[0]?.message?.content || '';
    const parsed = safeJsonParse(content);
    if (!parsed || !Array.isArray(parsed.scores)) {
      throw new Error('Could not parse AI evaluation JSON.');
    }

    const activeByName = new Map(users.map((u) => [u.username, u]));
    const scores = parsed.scores
      .filter((s) => s && activeByName.has(String(s.username)))
      .map((s) => ({
        username: String(s.username),
        score: clampScore(s.score),
      }));

    const winner = String(parsed.winner || '').trim();
    if (!activeByName.has(winner)) {
      throw new Error('Winner is not an active player.');
    }

    return {
      winner,
      reason: String(parsed.reason || 'Best roleplay performance in this round.').slice(0, 280),
      scores,
    };
  } catch (err) {
    console.error('Round evaluation failed:', err?.message || err);
    return {
      winner: users[0].username,
      reason: 'AI evaluation failed, so winner selected by current score ranking.',
      scores: users.map((u) => ({ username: u.username, score: 5 })),
    };
  }
}

function applyRoundEvaluation(result) {
  if (!result) return;
  const users = db.getActiveUsersOrderedByScore();
  const byUsername = new Map(users.map((u) => [u.username, u]));

  for (const item of result.scores || []) {
    const user = byUsername.get(item.username);
    if (!user) continue;
    db.addScore(user.id, clampScore(item.score));
  }

  const winner = byUsername.get(result.winner);
  if (winner) {
    db.addScore(winner.id, WINNER_BONUS);
  }
}

async function startRound() {
  currentScenario = await generateScenarioFromAI();
  currentRoundRoles = [...db.ROLES];
  assignRolesForCurrentRound();
  roundMessages = [];
  roundEndsAt = Date.now() + ROUND_MS;

  io.emit('narrator_scenario', {
    scenario: currentScenario,
    roundCurrent: roundNumber,
    roundTotal: ROUND_TOTAL,
  });
  io.emit('chat', {
    username: 'Narrator',
    role: 'System',
    message: currentScenario,
    pointsDelta: 0,
  });
  broadcastState();
}

async function finishRoundAndStartNext() {
  if (roundLifecycleRunning) return;
  roundLifecycleRunning = true;
  try {
    const result = await evaluateRoundWithAI();
    applyRoundEvaluation(result);
    io.emit('round_result', {
      winner: result?.winner || '',
      reason: result?.reason || '',
      scores: result?.scores || [],
      winnerBonus: WINNER_BONUS,
    });
    io.emit('chat', {
      username: 'Narrator',
      role: 'System',
      message: `Round winner: ${result?.winner || 'N/A'}${result?.reason ? ` — ${result.reason}` : ''}`,
      pointsDelta: 0,
    });
    roundNumber = roundNumber >= ROUND_TOTAL ? 1 : roundNumber + 1;
    await startRound();
  } finally {
    roundLifecycleRunning = false;
  }
}

/**
 * Emit refreshed leaderboard + optional per-socket "your role" hint.
 * Each socket gets `state` with full list and their own role line.
 */
function broadcastState() {
  const users = buildUsersPayload();
  const topSocketId = users[0]?.socketId || null;
  for (const sock of io.sockets.sockets.values()) {
    const me = db.getUserBySocket(sock.id);
    sock.emit('state', {
      users,
      topSocketId,
      myRole: me ? me.role : '—',
      keywordHint: me ? keywordHintForRole(me.role) : '',
      scenario: currentScenario,
      roundSecondsLeft: secondsLeftInRound(),
      roundCurrent: roundNumber,
      roundTotal: ROUND_TOTAL,
    });
  }
}

// Timer tick: broadcast state and move to next round when time ends.
setInterval(() => {
  if (io.engine.clientsCount === 0) return;
  if (Date.now() >= roundEndsAt) {
    finishRoundAndStartNext().catch((err) => {
      console.error('Round lifecycle error:', err?.message || err);
    });
    return;
  }
  broadcastState();
}, 1000);

io.on('connection', (socket) => {
  /**
   * Client must emit `join` with username after connect.
   * We read username from handshake query as fallback (set by client).
   */
  socket.on('join', (payload) => {
    const raw =
      (payload && typeof payload.username === 'string' && payload.username) ||
      socket.handshake.query?.username ||
      '';
    const username = String(raw)
      .trim()
      .slice(0, 32)
      .replace(/[<>"']/g, '');

    const avatarRaw =
      (payload && typeof payload.avatar === 'string' && payload.avatar) ||
      socket.handshake.query?.avatar ||
      '';
    const avatar = String(avatarRaw).trim().slice(0, 200).replace(/[<>"']/g, '');

    if (!username) {
      socket.emit('error_msg', 'Invalid username.');
      return;
    }

    const existing = db.getUserBySocket(socket.id);
    if (existing) {
      broadcastState();
      return;
    }

    const role = currentRoundRoles[Math.floor(Math.random() * currentRoundRoles.length)] || db.randomRole();
    try {
      db.createUser(username, role, socket.id, avatar);
    } catch (e) {
      db.disconnectUserBySocket(socket.id);
      try {
        db.createUser(username, role, socket.id, avatar);
      } catch (err) {
        socket.emit('error_msg', 'Could not join — try again.');
        return;
      }
    }

    if (!currentScenario) {
      startRound().catch((err) => {
        console.error('Initial round start failed:', err?.message || err);
        broadcastState();
      });
    } else {
      broadcastState();
      socket.emit('narrator_scenario', {
        scenario: currentScenario,
        roundCurrent: roundNumber,
        roundTotal: ROUND_TOTAL,
      });
    }

    // Send recent history so new joiners see context
    const history = db.getRecentMessages(50);
    for (const row of history) {
      socket.emit('chat', {
        username: row.username,
        role: row.role,
        message: row.message,
        pointsDelta: row.points_delta,
      });
    }
  });

  socket.on('chat', (payload) => {
    const me = db.getUserBySocket(socket.id);
    if (!me) {
      socket.emit('error_msg', 'Join the room first.');
      return;
    }
    const message = String(payload?.message || '')
      .trim()
      .slice(0, 500);
    if (!message) return;

    const delta = pointsForMessage(me.role, message);
    const newScore = me.score + delta;
    db.setScore(me.id, newScore);
    db.saveMessage(me.username, me.role, message, delta);
    roundMessages.push({ username: me.username, role: me.role, message });

    io.emit('chat', {
      username: me.username,
      role: me.role,
      message,
      pointsDelta: delta,
    });
    broadcastState();
  });

  /** Reassign random roles and reset scores for everyone still connected. */
  socket.on('new_game', () => {
    db.resetGameForActiveUsers();
    roundEndsAt = Date.now() + ROUND_MS;
    roundNumber = 1;
    currentScenario = '';
    roundMessages = [];
    io.emit('chat', {
      username: 'Room',
      role: 'System',
      message: 'New game started — roles reshuffled and scores reset. Good luck!',
      pointsDelta: 0,
    });
    startRound().catch((err) => {
      console.error('New game round start failed:', err?.message || err);
      broadcastState();
    });
  });

  socket.on('disconnect', () => {
    db.disconnectUserBySocket(socket.id);
    broadcastState();
  });
});

server.listen(PORT, () => {
  console.log(`RoleRoom listening at http://localhost:${PORT}`);
});
