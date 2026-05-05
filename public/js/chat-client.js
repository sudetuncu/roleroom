/**
 * Socket.io client for RoleRoom — Fantasy Village Theme
 */
(function () {
  const root = document.getElementById('app-root');
  let username = '';
  let userAvatar = '';
  let currentRole = null;
  try { 
    username = decodeURIComponent(root?.dataset?.username || ''); 
    userAvatar = decodeURIComponent(root?.dataset?.avatar || '');
  }
  catch { 
    username = root?.dataset?.username || ''; 
    userAvatar = root?.dataset?.avatar || '';
  }
  username = String(username || '').trim();
  userAvatar = String(userAvatar || '').trim();
  let latestMyRole = null;

  /* ── DOM refs ── */
  const messagesEl      = document.getElementById('messages');
  const userListEl      = document.getElementById('user-list');
  const scoreboardEl    = document.getElementById('scoreboard');
  const form            = document.getElementById('chat-form');
  const input           = document.getElementById('message-input');
  const headerUsername   = document.getElementById('header-username');
  const headerRoleBadge = document.getElementById('header-role-badge');
  const headerScore     = document.getElementById('header-score');
  const headerAvatar    = document.getElementById('header-avatar');
  const topRound        = document.getElementById('top-round');
  const roundTimer      = document.getElementById('round-timer');
  const btnNewGame      = document.getElementById('btn-new-game');
  const playerCount     = document.getElementById('player-count');
  const roleIcon        = document.getElementById('role-icon');
  const myRole          = document.getElementById('my-role');
  const keywordHint     = document.getElementById('keyword-hint');
  const guideBtn        = document.getElementById('guide-btn');
  const infoRound       = document.getElementById('info-round');
  const infoTimer       = document.getElementById('info-timer');
  const infoRole        = document.getElementById('info-role');
  const infoRoleEmoji   = document.getElementById('info-role-emoji');
  const emojiToggle     = document.getElementById('emoji-toggle');
  const narratorScenario = document.getElementById('narrator-scenario');
  const winnerModal      = document.getElementById('winner-modal');
  const winnerName       = document.getElementById('winner-name');
  const winnerReason     = document.getElementById('winner-reason');
  const winnerClose      = document.getElementById('winner-close');

  const socket = io({ query: { username, avatar: userAvatar }, transports: ['websocket', 'polling'] });

  /* ── Role config ── */
  const ROLES = {
    Detective: { emoji: '🔍', color: '#60a5fa', bg: 'rgba(96,165,250,0.18)', keywords: ['clue','suspect','investigate'] },
    Doctor:    { emoji: '💊', color: '#4ade80', bg: 'rgba(74,222,128,0.18)', keywords: ['heal','patient','medicine'] },
    Killer:    { emoji: '🗡️', color: '#f87171', bg: 'rgba(248,113,113,0.18)', keywords: ['kill','attack','target'] },
    Spy:       { emoji: '🎭', color: '#c084fc', bg: 'rgba(192,132,252,0.22)', keywords: ['secret','mission','infiltrate'] },
  };

  const DEFAULT_ROLE = { emoji: '🎭', color: '#a78bfa', bg: 'rgba(167,139,250,0.18)', keywords: [] };
  function R(role) { return ROLES[role] || DEFAULT_ROLE; }

  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function now() { const n = new Date(); return n.getHours().toString().padStart(2,'0') + ':' + n.getMinutes().toString().padStart(2,'0'); }

  /* ── Audio Context for Roles ── */
  let audioCtx = null;
  function playRoleSound(role) {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } 
      catch (e) { return; }
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (role === 'Detective') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.1);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
      osc.start(t); osc.stop(t + 0.1);
    } else if (role === 'Doctor') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.exponentialRampToValueAtTime(1200, t + 0.5);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.2, t + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
      osc.start(t); osc.stop(t + 0.5);
    } else if (role === 'Killer') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(60, t);
      osc.frequency.exponentialRampToValueAtTime(20, t + 0.4);
      gain.gain.setValueAtTime(0.8, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
      osc.start(t); osc.stop(t + 0.4);
    } else if (role === 'Spy') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1200, t);
      osc.frequency.setValueAtTime(1600, t + 0.1);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.setValueAtTime(0, t + 0.15);
      osc.start(t); osc.stop(t + 0.15);
    }
  }

  /* ══════════════════════════════════════
     CHAT MESSAGES
     ══════════════════════════════════════ */
  function appendMessage(data) {
    const isSystem = data.username === 'Room' && data.role === 'System';
    const isNarrator = data.username === 'Narrator';

    const div = document.createElement('div');

    if (isSystem) {
      div.className = 'msg-anim w-full';
      div.innerHTML = `
        <div class="flex items-center gap-3 py-2 px-3 rounded-xl bg-purple-500/8 border border-purple-400/15 text-[12px] text-purple-300 italic w-full">
          📢 ${esc(data.message)}
        </div>`;
    } else if (isNarrator) {
      div.className = 'msg-anim w-full';
      div.innerHTML = `
        <div class="flex gap-3 px-3 py-3 border-b border-indigo-400/[0.15] bg-indigo-500/[0.04] w-full">
          <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5 relative overflow-hidden border-2 border-indigo-400/50 shadow-[0_0_10px_rgba(99,102,241,0.2)]">
            <img src="/images/narrator.png" alt="Narrator" class="w-full h-full object-cover">
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1 flex-wrap pr-1">
              <span class="text-sm font-bold text-indigo-200">Narrator</span>
              <span class="ml-auto text-[11px] font-mono text-indigo-400/70 tabular-nums">${now()}</span>
            </div>
            <p class="text-sm text-indigo-100/95 leading-relaxed break-words italic">${esc(data.message)}</p>
          </div>
        </div>`;
    } else {
      let pts = '';
      if (data.pointsDelta > 0) pts = `<span class="text-[10px] font-bold text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded">+${data.pointsDelta}</span>`;
      else if (data.pointsDelta < 0) pts = `<span class="text-[10px] font-bold text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded">${data.pointsDelta}</span>`;

      const uname = String(data.username || '').trim();
      const isMine = uname === username;
      const roleForUi = isMine ? (data.role || latestMyRole || '') : '';
      const r = R(roleForUi || undefined);
      const avatarHtml = data.avatar 
        ? `<img src="/avatars/${esc(data.avatar)}" class="w-full h-full object-cover rounded-full">`
        : r.emoji;
      const roleBadge = roleForUi
        ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-md border" style="color:${r.color};background:${r.bg};border-color:${r.color}44;">${esc(roleForUi)}</span>`
        : '';

      const bubbleDir = isMine ? 'flex-row-reverse' : 'flex-row';
      const bubbleTone = isMine
        ? 'bg-purple-600/18 border-purple-400/28 hover:bg-purple-600/22'
        : 'bg-slate-900/35 border-purple-400/12 hover:bg-white/[0.03]';
      div.className = `msg-anim w-full flex ${isMine ? 'justify-end' : 'justify-start'}`;
      div.innerHTML = `
        <div class="flex ${bubbleDir} gap-3 px-3 py-3 rounded-2xl border transition-colors max-w-[min(88%,520px)] ${bubbleTone}">
          <div class="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 mt-0.5 relative overflow-hidden" style="border:2px solid ${r.color};background:${r.bg};">
            ${avatarHtml}
          </div>
          <div class="flex-1 min-w-0 ${isMine ? 'text-right' : ''}">
            <div class="flex items-center gap-2 mb-1 flex-wrap pr-1 ${isMine ? 'justify-end' : ''}">
              <span class="text-sm font-bold text-slate-100">${esc(data.username)}</span>
              ${roleBadge}
              ${pts}
              <span class="${isMine ? '' : 'ml-auto'} text-[11px] font-mono text-slate-500 tabular-nums">${now()}</span>
            </div>
            <p class="text-sm text-slate-300/95 leading-relaxed break-words">${esc(data.message)}</p>
          </div>
        </div>`;
    }
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  /* ══════════════════════════════════════
     PLAYER LIST
     ══════════════════════════════════════ */
  function renderUsers(users) {
    userListEl.innerHTML = '';
    users.forEach(u => {
      const me = u.username === username;
      const effRole = me ? (u.role || latestMyRole || '') : '';
      const r = R(effRole || undefined);
      const roleLabel = me ? (effRole || '…') : '???';
      const avatarHtml = u.avatar 
        ? `<img src="/avatars/${esc(u.avatar)}" class="w-full h-full object-cover rounded-full">`
        : r.emoji;
      const li = document.createElement('li');
      li.className = `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 hover:bg-purple-500/8 ${me ? 'bg-purple-500/10 ring-1 ring-purple-400/20' : ''}`;
      li.innerHTML = `
        <div class="relative w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0" style="border:2px solid ${r.color};background:${r.bg};">
          ${avatarHtml}
          <span class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#0f0a18] shadow-[0_0_6px_rgba(52,211,153,0.75)]" title="Online"></span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-[13px] font-bold text-slate-200 truncate">${esc(u.username)}</p>
          <span class="text-[9px] font-bold px-2 py-0.5 rounded-md inline-block mt-0.5 border border-slate-500/30" style="color:${r.color};background:${r.bg};border-color:${r.color}44;">${esc(roleLabel)}</span>
        </div>
        <span class="text-sm font-bold text-amber-300 shrink-0 flex items-center gap-1"><span class="text-base leading-none" aria-hidden="true">🪙</span>${u.score}</span>`;
      userListEl.appendChild(li);
    });
    if (playerCount) playerCount.textContent = `${users.length}/10`;
  }

  /* ══════════════════════════════════════
     LEADERBOARD
     ══════════════════════════════════════ */
  function renderScoreboard(users) {
    scoreboardEl.innerHTML = '';
    const rankColors = ['#ca8a04', '#64748b', '#c2410c', '#52525b'];
    users.forEach((u, i) => {
      const me = u.username === username;
      const effRole = me ? (u.role || latestMyRole || '') : '';
      const r = R(effRole || undefined);
      const roleLabel = me ? (effRole || '…') : '???';
      const rc = rankColors[i] || rankColors[3];
      const li = document.createElement('li');
      li.className = `flex items-center gap-3 px-3 py-2 rounded-xl transition-all hover:bg-purple-500/8 ${i === 0 ? 'bg-amber-500/8 ring-1 ring-amber-400/20' : ''} ${me && i !== 0 ? 'bg-purple-500/6 ring-1 ring-purple-400/15' : ''}`;
      li.innerHTML = `
        <span class="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-white shrink-0" style="background:${rc};">${i+1}</span>
        <span class="flex-1 text-[13px] font-semibold text-slate-200 truncate">${esc(u.username)}${me?' <span class="text-purple-400">(You)</span>':''}</span>
        <span class="text-[9px] font-bold px-1.5 py-0.5 rounded" style="background:${r.color};color:#fff;">${esc(roleLabel)}</span>
        <span class="text-xs font-bold text-amber-300 shrink-0 flex items-center gap-0.5"><span aria-hidden="true">🪙</span>${u.score}</span>`;
      scoreboardEl.appendChild(li);
    });
  }

  /* ══════════════════════════════════════
     STATE UPDATE
     ══════════════════════════════════════ */
  function renderState(payload) {
    if (payload.myRole && payload.myRole !== '—') {
      latestMyRole = payload.myRole;
    }
    const role = payload.myRole && payload.myRole !== '—' ? payload.myRole : null;
    if (role) {
      if (currentRole !== role) {
        currentRole = role;
        playRoleSound(role);
      }
      
      const r = R(role);
      
      // Update body theme class
      document.body.className = `rr-page h-screen font-sans text-slate-200 overflow-hidden flex flex-col relative theme-${role.toLowerCase()}`;

      const me = (payload.users || []).find(u => u.username === username);
      const myAvatarHtml = me && me.avatar 
        ? `<img src="/avatars/${esc(me.avatar)}" class="w-full h-full object-cover rounded-full">`
        : r.emoji;

      // Header
      headerRoleBadge.textContent = role;
      headerRoleBadge.style.color = r.color;
      headerRoleBadge.style.background = r.bg;
      headerAvatar.innerHTML = `${myAvatarHtml}<span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-[#140e28]"></span>`;
      headerAvatar.style.borderColor = r.color;
      headerAvatar.style.background = r.bg;

      // Left panel
      myRole.textContent = role;
      myRole.style.color = r.color;
      roleIcon.innerHTML = myAvatarHtml;
      roleIcon.style.borderColor = r.color;
      roleIcon.style.background = r.bg;

      // Right panel
      infoRole.textContent = role;
      infoRole.style.color = r.color;
      infoRoleEmoji.textContent = r.emoji;

      // Hint
      keywordHint.textContent = `Use ${r.keywords.join(', ')} in your messages to gain points.`;
    }

    // Timer
    if (typeof payload.roundSecondsLeft === 'number') {
      const m = Math.floor(payload.roundSecondsLeft / 60);
      const s = payload.roundSecondsLeft % 60;
      const t = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      roundTimer.textContent = t;
      infoTimer.textContent = t;
    }

    if (typeof payload.roundCurrent === 'number' && typeof payload.roundTotal === 'number') {
      const rtxt = `${payload.roundCurrent}/${payload.roundTotal}`;
      if (topRound) topRound.textContent = rtxt;
      if (infoRound) infoRound.textContent = rtxt;
    }

    if (typeof payload.roundMessageCount === 'number' && typeof payload.roundMessageLimit === 'number') {
      const mtxt = `${payload.roundMessageCount}/${payload.roundMessageLimit}`;
      const topMsgs = document.getElementById('top-msgs');
      const infoMsgs = document.getElementById('info-msgs');
      const msgPill = document.getElementById('stat-pill-msgs');
      if (topMsgs) {
        topMsgs.textContent = mtxt;
        const atCap = payload.roundMessageLimit > 0 && payload.roundMessageCount >= payload.roundMessageLimit;
        topMsgs.classList.toggle('text-amber-200', atCap);
        topMsgs.classList.toggle('text-violet-100', !atCap);
      }
      if (infoMsgs) infoMsgs.textContent = mtxt;
      if (msgPill) {
        const atCap = payload.roundMessageLimit > 0 && payload.roundMessageCount >= payload.roundMessageLimit;
        msgPill.classList.toggle('msg-at-cap', atCap);
      }
    }

    if (typeof payload.scenario === 'string' && narratorScenario && payload.scenario.trim()) {
      narratorScenario.textContent = payload.scenario;
    }

    // Users
    if (Array.isArray(payload.users)) {
      renderUsers(payload.users);
      renderScoreboard(payload.users);
      const me = payload.users.find(u => u.username === username);
      if (me) headerScore.textContent = me.score;
    }
  }

  /* ── Socket ── */
  socket.on('connect', () => socket.emit('join', { username }));
  socket.on('state', renderState);
  socket.on('chat', appendMessage);
  socket.on('narrator_scenario', (payload) => {
    if (narratorScenario && payload?.scenario) {
      narratorScenario.textContent = payload.scenario;
    }
  });
  socket.on('round_result', (payload) => {
    if (!winnerModal) return;
    winnerName.textContent = payload?.winner || 'No winner';
    winnerReason.textContent = payload?.reason || 'Round evaluation completed.';
    winnerModal.classList.remove('hidden');
    winnerModal.classList.add('flex');
  });
  socket.on('error_msg', msg => {
    const d = document.createElement('div');
    d.className = 'msg-anim w-full';
    d.innerHTML = `<div class="w-full px-4 py-2 rounded-xl bg-red-500/10 border border-red-400/20 text-[12px] text-red-300">⚠️ ${esc(msg)}</div>`;
    messagesEl.appendChild(d);
  });

  const quickEmojis = ['😀', '🎭', '👍', '🔥', '🤫', '😈', '💀', '🕯️'];
  let quickEmojiIndex = 0;
  emojiToggle?.addEventListener('click', () => {
    const ch = quickEmojis[quickEmojiIndex % quickEmojis.length];
    quickEmojiIndex += 1;
    input.focus();
    input.value = (input.value || '') + ch;
  });

  form?.addEventListener('submit', e => { e.preventDefault(); const t = (input.value||'').trim(); if (!t) return; socket.emit('chat',{message:t}); input.value=''; input.focus(); });
  btnNewGame?.addEventListener('click', () => socket.emit('new_game'));
  winnerClose?.addEventListener('click', () => {
    winnerModal?.classList.add('hidden');
    winnerModal?.classList.remove('flex');
  });
  guideBtn?.addEventListener('click', () => {
    const role = myRole?.textContent;
    if (role && role !== '…') { const r = R(role); alert(`🎭 ${role} Guide\n\nKeywords: ${r.keywords.join(', ')}\n\n+10 pts for using keywords\n-5 pts without keywords`); }
  });
})();
