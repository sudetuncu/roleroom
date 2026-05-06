/**
 * RoleRoom — Express + Socket.io + SQLite
 * Real-time chat with random roles, keyword scoring, scoreboard, and round timer.
 */

const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
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
/** Max public chat messages per round (whispers excluded). Reaching this ends the round like the timer. */
const ROUND_MESSAGE_LIMIT = (() => {
  const n = parseInt(process.env.ROUND_MESSAGE_LIMIT || '40', 10);
  if (!Number.isFinite(n)) return 40;
  return Math.min(200, Math.max(5, n));
})();
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
  cors: { origin: '*' },
});

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(express.static(path.join(__dirname, 'client/dist')));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/avatars', express.static(path.join(__dirname, 'Avatars/Avatar')));

// Use indexRoutes for API
app.use('/', indexRoutes);

// Catch-all route to serve React app for non-API requests
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/dist', 'index.html'));
});

db.init();

const ROUND_TOTAL = 10;
const DYNAMIC_EVENT_DURATION_MS = 30_000;
const DYNAMIC_EVENT_CHANCE = 0.25; // 25% chance per 15s tick

const rooms = new Map();

function getRoomState(roomCode) {
  if (!rooms.has(roomCode)) {
    rooms.set(roomCode, {
      roundEndsAt: Date.now() + ROUND_MS,
      roundNumber: 1,
      currentScenario: '',
      currentRoundRoles: [...db.ROLES],
      roundMessages: [],
      roundLifecycleRunning: false,
      dynamicEventActive: false,
      dynamicEventText: '',
      dynamicEventEndsAt: 0,
      secretQuests: new Map(),
      votingActive: false,
      votes: new Map()
    });
  }
  return rooms.get(roomCode);
}

const SECRET_QUEST_POOL = {
  Detective: [
    'Accuse someone of being suspicious in chat',
    'Mention a "clue" you found near the door',
    'Ask two different players where they were last night',
  ],
  Doctor: [
    'Offer to heal someone by name',
    'Mention a rare disease or ailment',
    'Warn everyone about a health hazard',
  ],
  Killer: [
    'Subtly threaten another player without being obvious',
    'Mention something about shadows or darkness',
    'Try to turn two players against each other',
  ],
  Spy: [
    'Claim to have overheard a secret conversation',
    'Send a mysterious coded message',
    'Pretend to be a different role for at least one message',
  ],
};

function secondsLeftInRound(roomCode) {
  const state = getRoomState(roomCode);
  return Math.max(0, Math.ceil((state.roundEndsAt - Date.now()) / 1000));
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
function buildUsersPayload(roomCode) {
  return db.getActiveUsersOrderedByScore(roomCode).map((row) => ({
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

async function generateScenarioFromAI(roomCode) {
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

function assignRolesForCurrentRound(roomCode) {
  const state = getRoomState(roomCode);
  const users = db.getActiveUsersOrderedByScore(roomCode);
  if (users.length === 0) return;
  const shuffledRoles = [...state.currentRoundRoles].sort(() => Math.random() - 0.5);
  for (let i = 0; i < users.length; i += 1) {
    const role = shuffledRoles[i % shuffledRoles.length];
    db.setRole(users[i].id, role);
  }
}

/** Assign a secret quest to each active player */
function assignSecretQuests(roomCode) {
  const state = getRoomState(roomCode);
  state.secretQuests.clear();
  const users = db.getActiveUsersOrderedByScore(roomCode);
  for (const u of users) {
    const pool = SECRET_QUEST_POOL[u.role] || SECRET_QUEST_POOL.Spy;
    const quest = pool[Math.floor(Math.random() * pool.length)];
    state.secretQuests.set(u.username, { quest, completed: false });
  }
}

/** Fallback dynamic events (used when no AI) */
const FALLBACK_EVENTS = [
  '🌪️ A sudden storm shakes the building! The lights flicker and go out for a moment...',
  '🚪 A mysterious stranger appears at the door with a sealed letter!',
  '💀 A scream echoes from the basement! Someone must investigate...',
  '🔔 The town bell rings unexpectedly — is it a warning or a trap?',
  '🗝️ A hidden compartment opens in the wall, revealing an old key!',
  '🌙 An eclipse darkens the sky — strange things happen in the dark...',
  '📜 A cryptic note is found pinned to the wall: "Trust no one."',
];

async function generateDynamicEvent(roomCode) {
  const state = getRoomState(roomCode);
  if (!openai) {
    return FALLBACK_EVENTS[Math.floor(Math.random() * FALLBACK_EVENTS.length)];
  }
  try {
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      temperature: 0.9,
      messages: [
        { role: 'system', content: 'You are a dramatic game narrator. Generate a single short dramatic event (1-2 sentences) that just happened in the game world. Use an emoji at the start. Be creative and surprising.' },
        { role: 'user', content: `Current scenario: ${state.currentScenario}. Generate a sudden dramatic event that changes the situation.` },
      ],
    });
    return normalizeScenario(completion.choices?.[0]?.message?.content) || FALLBACK_EVENTS[0];
  } catch {
    return FALLBACK_EVENTS[Math.floor(Math.random() * FALLBACK_EVENTS.length)];
  }
}

/** Try to trigger a dynamic event */
async function maybeTriggerDynamicEvent(roomCode) {
  const state = getRoomState(roomCode);
  // Check if room has active clients
  const activeClients = io.sockets.adapter.rooms.get(roomCode)?.size || 0;
  if (state.dynamicEventActive || activeClients === 0) return;
  if (Math.random() > DYNAMIC_EVENT_CHANCE) return;
  
  state.dynamicEventActive = true;
  state.dynamicEventText = await generateDynamicEvent(roomCode);
  state.dynamicEventEndsAt = Date.now() + DYNAMIC_EVENT_DURATION_MS;
  
  io.to(roomCode).emit('dynamic_event', { 
    event: state.dynamicEventText, 
    durationSeconds: DYNAMIC_EVENT_DURATION_MS / 1000 
  });
  io.to(roomCode).emit('chat', {
    username: 'Narrator',
    role: 'System',
    message: `⚡ EVENT: ${state.dynamicEventText}`,
    pointsDelta: 0,
  });
}

/** Resolve voting results */
function resolveVotes(roomCode) {
  const state = getRoomState(roomCode);
  if (state.votes.size === 0) return null;
  const tally = new Map();
  for (const target of state.votes.values()) {
    tally.set(target, (tally.get(target) || 0) + 1);
  }
  let maxVotes = 0, eliminated = '';
  for (const [name, count] of tally) {
    if (count > maxVotes) { maxVotes = count; eliminated = name; }
  }
  state.votes.clear();
  state.votingActive = false;
  return { eliminated, voteCount: maxVotes, tally: Object.fromEntries(tally) };
}

async function evaluateRoundWithAI(roomCode) {
  const state = getRoomState(roomCode);
  const users = db.getActiveUsersOrderedByScore(roomCode);
  if (users.length === 0) return null;

  const roleMapLines = users.map((u) => `- ${u.username}: ${u.role}`).join('\n');
  const messageLines = state.roundMessages.length
    ? state.roundMessages.map((m) => `${m.username} (${m.role}): ${m.message}`).join('\n')
    : 'No roleplay messages were sent in this round.';

  if (!openai) {
    console.warn('RoleRoom: OPENAI_API_KEY not set — round winner picked from current scoreboard.');
    const fallbackWinner = users[0].username;
    return {
      winner: fallbackWinner,
      reason:
        'This round was decided from the live scoreboard (highest score). Connect an AI narrator later for story-based judging.',
      scores: users.map((u) => ({ username: u.username, score: 5 })),
    };
  }

  const prompt = `You are a game narrator. Evaluate the following roleplay conversation.
Each player has a role and must act according to it.
Choose the player who best played their role.

Scenario:
${state.currentScenario}

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
      reason:
        'Automated judging was unavailable this round, so the winner was taken from the current scoreboard.',
      scores: users.map((u) => ({ username: u.username, score: 5 })),
    };
  }
}

function applyRoundEvaluation(result, roomCode) {
  if (!result) return;
  const state = getRoomState(roomCode);
  const users = db.getActiveUsersOrderedByScore(roomCode);
  const byUsername = new Map(users.map((u) => [u.username, u]));

  for (const item of result.scores || []) {
    const user = byUsername.get(item.username);
    if (!user) continue;
    db.addScore(user.id, clampScore(item.score));
    // Award XP based on AI score
    db.addXP(item.username, clampScore(item.score) * 5);
  }

  const winner = byUsername.get(result.winner);
  if (winner) {
    db.addScore(winner.id, WINNER_BONUS);
    db.addXP(result.winner, 50); // Bonus XP for winning
    db.recordGameWin(result.winner);
  }

  // Record game played and update best scores for all
  for (const u of users) {
    db.recordGamePlayed(u.username);
    db.updateBestScore(u.username, u.score);
  }

  // Award quest completion bonus
  for (const [uname, q] of state.secretQuests) {
    if (q.completed) {
      const user = byUsername.get(uname);
      if (user) {
        db.addScore(user.id, 15);
        db.addXP(uname, 30);
      }
    }
  }
}

async function startRound(roomCode) {
  const state = getRoomState(roomCode);
  state.currentScenario = await generateScenarioFromAI(roomCode);
  state.currentRoundRoles = [...db.ROLES];
  assignRolesForCurrentRound(roomCode);
  assignSecretQuests(roomCode);
  state.roundMessages = [];
  state.roundEndsAt = Date.now() + ROUND_MS;
  state.dynamicEventActive = false;
  state.dynamicEventText = '';
  state.votingActive = false;
  state.votes.clear();

  io.to(roomCode).emit('narrator_scenario', {
    scenario: state.currentScenario,
    roundCurrent: state.roundNumber,
    roundTotal: ROUND_TOTAL,
  });
  io.to(roomCode).emit('chat', {
    username: 'Narrator',
    role: 'System',
    message: state.currentScenario,
    pointsDelta: 0,
  });

  // Send secret quests to each player in the room
  for (const sock of io.sockets.adapter.rooms.get(roomCode) || []) {
    const socket = io.sockets.sockets.get(sock);
    if (!socket) continue;
    const me = db.getUserBySocket(socket.id);
    if (me && state.secretQuests.has(me.username)) {
      socket.emit('secret_quest', { quest: state.secretQuests.get(me.username).quest });
    }
  }

  broadcastState(roomCode);
}

async function finishRoundAndStartNext(roomCode) {
  const state = getRoomState(roomCode);
  if (state.roundLifecycleRunning) return;
  state.roundLifecycleRunning = true;
  try {
    // Start voting phase
    state.votingActive = true;
    io.to(roomCode).emit('voting_start', { durationSeconds: 15 });
    io.to(roomCode).emit('chat', { username: 'Narrator', role: 'System', message: '⚖️ VOTING TIME! You have 15 seconds to vote for who you think is the Killer or Spy!', pointsDelta: 0 });
    
    // Wait 15 seconds for votes
    await new Promise(r => setTimeout(r, 15000));
    
    // Resolve votes
    const voteResult = resolveVotes(roomCode);
    if (voteResult) {
      io.to(roomCode).emit('voting_result', voteResult);
      io.to(roomCode).emit('chat', { username: 'Narrator', role: 'System', message: `⚖️ The village voted! ${voteResult.eliminated} received ${voteResult.voteCount} vote(s).`, pointsDelta: 0 });
      // Penalize voted player
      const users = db.getActiveUsersOrderedByScore(roomCode);
      const votedUser = users.find(u => u.username === voteResult.eliminated);
      if (votedUser) db.addScore(votedUser.id, -10);
    }

    const result = await evaluateRoundWithAI(roomCode);
    applyRoundEvaluation(result, roomCode);
    io.to(roomCode).emit('round_result', {
      winner: result?.winner || '',
      reason: result?.reason || '',
      scores: result?.scores || [],
      winnerBonus: WINNER_BONUS,
    });
    io.to(roomCode).emit('chat', {
      username: 'Narrator',
      role: 'System',
      message: `Round winner: ${result?.winner || 'N/A'}${result?.reason ? ` — ${result.reason}` : ''}`,
      pointsDelta: 0,
    });
    state.roundNumber = state.roundNumber >= ROUND_TOTAL ? 1 : state.roundNumber + 1;
    await startRound(roomCode);
  } finally {
    state.roundLifecycleRunning = false;
  }
}

/** Strip other players' roles for a given viewer (hidden-role UX). */
function usersPayloadForViewer(usersFull, viewerUsername) {
  if (!viewerUsername) return usersFull;
  return usersFull.map((u) =>
    u.username === viewerUsername ? u : { ...u, role: null }
  );
}

/**
 * Emit refreshed leaderboard + optional per-socket "your role" hint.
 */
function broadcastState(roomCode) {
  const state = getRoomState(roomCode);
  const usersFull = buildUsersPayload(roomCode);
  const topSocketId = usersFull[0]?.socketId || null;
  for (const sock of io.sockets.adapter.rooms.get(roomCode) || []) {
    const socket = io.sockets.sockets.get(sock);
    if (!socket) continue;
    const me = db.getUserBySocket(socket.id);
    const users = usersPayloadForViewer(usersFull, me?.username || null);
    const myQuest = me ? state.secretQuests.get(me.username) : null;
    const myStats = me ? db.getPlayerStats(me.username) : null;
    socket.emit('state', {
      users,
      topSocketId,
      myRole: me ? me.role : '—',
      keywordHint: me ? keywordHintForRole(me.role) : '',
      scenario: state.currentScenario,
      roundSecondsLeft: secondsLeftInRound(roomCode),
      roundCurrent: state.roundNumber,
      roundTotal: ROUND_TOTAL,
      roundMessageCount: state.roundMessages.length,
      roundMessageLimit: ROUND_MESSAGE_LIMIT,
      dynamicEvent: state.dynamicEventActive ? state.dynamicEventText : null,
      secretQuest: myQuest ? myQuest.quest : null,
      questCompleted: myQuest ? myQuest.completed : false,
      votingActive: state.votingActive,
      myStats: myStats ? { level: myStats.level, totalXP: myStats.total_xp, gamesPlayed: myStats.games_played, gamesWon: myStats.games_won } : null,
    });
  }
}

// Room-based intervals
setInterval(() => {
  if (io.engine.clientsCount === 0) return;
  for (const [roomCode, state] of rooms.entries()) {
    if (state.dynamicEventActive && Date.now() >= state.dynamicEventEndsAt) {
      state.dynamicEventActive = false;
      state.dynamicEventText = '';
      io.to(roomCode).emit('dynamic_event_end');
    }
    maybeTriggerDynamicEvent(roomCode).catch(console.error);
  }
}, 15000);

setInterval(() => {
  if (io.engine.clientsCount === 0) return;
  for (const [roomCode, state] of rooms.entries()) {
    if (Date.now() >= state.roundEndsAt) {
      finishRoundAndStartNext(roomCode).catch((err) => {
        console.error('Round lifecycle error:', err?.message || err);
      });
      continue;
    }
    broadcastState(roomCode);
  }
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

    const rawRoom =
      (payload && typeof payload.room === 'string' && payload.room) ||
      socket.handshake.query?.room ||
      'global';
    const roomCode = String(rawRoom)
      .trim()
      .slice(0, 32)
      .replace(/[<>"']/g, '') || 'global';

    socket.join(roomCode);

    if (!username) {
      socket.emit('error_msg', 'Invalid username.');
      return;
    }

    const existing = db.getUserBySocket(socket.id);
    if (existing) {
      broadcastState(roomCode);
      return;
    }

    const state = getRoomState(roomCode);
    const role = state.currentRoundRoles[Math.floor(Math.random() * state.currentRoundRoles.length)] || db.randomRole();

    // One logical player per username: close other tabs, merge duplicate DB rows
    const oldSocketIds = db.getActiveSocketIdsByUsername(username, roomCode);
    for (const sid of oldSocketIds) {
      if (!sid || sid === socket.id) continue;
      const oldSock = io.sockets.sockets.get(sid);
      if (oldSock) {
        oldSock.emit(
          'error_msg',
          'The same username joined from another window — this session was closed.'
        );
        oldSock.disconnect(true);
      }
    }
    db.clearAllSocketsForUsername(username, roomCode);
    db.consolidateUsersByUsername(username, roomCode);
    const row = db.getUserRowByUsername(username, roomCode);
    if (row) {
      db.attachSocketToUser(row.id, socket.id, avatar, row.role);
    } else {
      try {
        db.createUser(username, role, socket.id, avatar, roomCode);
      } catch (err) {
        socket.emit('error_msg', 'Could not join — try again.');
        return;
      }
    }

    if (!state.currentScenario) {
      startRound(roomCode).catch((err) => {
        console.error('Initial round start failed:', err?.message || err);
        broadcastState(roomCode);
      });
    } else {
      broadcastState(roomCode);
      socket.emit('narrator_scenario', {
        scenario: state.currentScenario,
        roundCurrent: state.roundNumber,
        roundTotal: ROUND_TOTAL,
      });
    }

    // Send recent history so new joiners see context
    const history = db.getRecentMessages(roomCode, 50);
    for (const row of history) {
      socket.emit('chat', {
        username: row.username,
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
    let message = String(payload?.message || '').trim().slice(0, 500);
    if (!message) return;
    
    // Determine user's room code
    const roomCodeArray = Array.from(socket.rooms);
    const roomCode = roomCodeArray.find(r => r !== socket.id) || 'global';
    const state = getRoomState(roomCode);

    // Check for whisper command: /w username message
    const whisperMatch = message.match(/^\/w\s+(\S+)\s+(.+)/i);
    if (whisperMatch) {
      const targetName = whisperMatch[1];
      const whisperMsg = whisperMatch[2];
      const users = db.getActiveUsersOrderedByScore(roomCode);
      const target = users.find(u => u.username.toLowerCase() === targetName.toLowerCase());
      if (!target) {
        socket.emit('error_msg', `Player "${targetName}" not found.`);
        return;
      }
      // Sender sees own role; recipient does not (hidden-role)
      const whisperBase = {
        username: me.username,
        message: whisperMsg,
        isWhisper: true,
        whisperTo: target.username,
      };
      socket.emit('whisper', { ...whisperBase, role: me.role });
      const targetSocket = [...io.sockets.sockets.values()].find(s => {
        const u = db.getUserBySocket(s.id);
        return u && u.username === target.username;
      });
      if (targetSocket) targetSocket.emit('whisper', { ...whisperBase, role: null });
      return;
    }

    const delta = pointsForMessage(me.role, message);
    const newScore = me.score + delta;
    db.setScore(me.id, newScore);
    db.saveMessage(me.username, me.role, message, delta, roomCode);
    state.roundMessages.push({ username: me.username, role: me.role, message });

    // Award small XP for chatting
    db.addXP(me.username, delta > 0 ? 5 : 1);

    io.to(roomCode).emit('chat', {
      username: me.username,
      message,
      pointsDelta: delta,
      avatar: me.avatar || '',
    });
    broadcastState(roomCode);

    if (state.roundMessages.length >= ROUND_MESSAGE_LIMIT && !state.roundLifecycleRunning) {
      state.roundEndsAt = Date.now();
      io.to(roomCode).emit('chat', {
        username: 'Narrator',
        role: 'System',
        message: `Message limit for this round reached (${ROUND_MESSAGE_LIMIT}). The round is ending!`,
        pointsDelta: 0,
      });
      finishRoundAndStartNext(roomCode).catch((err) => {
        console.error('Round lifecycle error (message cap):', err?.message || err);
      });
    }
  });

  /** Vote for a player */
  socket.on('vote', (payload) => {
    if (!votingActive) return;
    const me = db.getUserBySocket(socket.id);
    if (!me) return;
    const target = String(payload?.target || '').trim();
    if (!target || target === me.username) return;
    votes.set(me.username, target);
    socket.emit('vote_confirmed', { target });
  });

  /** Mark quest as completed */
  socket.on('quest_complete', () => {
    const me = db.getUserBySocket(socket.id);
    if (!me) return;
    const quest = secretQuests.get(me.username);
    if (quest && !quest.completed) {
      quest.completed = true;
      socket.emit('quest_completed', { bonus: 15 });
    }
  });

  /** Get global leaderboard */
  socket.on('get_leaderboard', () => {
    const leaderboard = db.getGlobalLeaderboard(20);
    socket.emit('global_leaderboard', { leaderboard });
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

// API: Global leaderboard
app.get('/api/leaderboard', (req, res) => {
  res.json(db.getGlobalLeaderboard(20));
});

server.listen(PORT, () => {
  console.log(`RoleRoom listening at http://localhost:${PORT}`);
});
