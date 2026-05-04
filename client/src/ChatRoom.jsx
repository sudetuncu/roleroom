import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';

const ROLES = {
  Detective: { emoji: '🔍', color: '#60a5fa', bg: 'rgba(96,165,250,0.18)', keywords: ['clue','suspect','investigate'] },
  Doctor:    { emoji: '💊', color: '#4ade80', bg: 'rgba(74,222,128,0.18)', keywords: ['heal','patient','medicine'] },
  Killer:    { emoji: '🗡️', color: '#f87171', bg: 'rgba(248,113,113,0.18)', keywords: ['kill','attack','target'] },
  Spy:       { emoji: '🎭', color: '#c084fc', bg: 'rgba(192,132,252,0.22)', keywords: ['secret','mission','infiltrate'] },
};
const DEFAULT_ROLE = { emoji: '🎭', color: '#a78bfa', bg: 'rgba(167,139,250,0.18)', keywords: [] };
const R = (role) => ROLES[role] || DEFAULT_ROLE;

function now() {
  const n = new Date();
  return n.getHours().toString().padStart(2,'0') + ':' + n.getMinutes().toString().padStart(2,'0');
}

export default function ChatRoom() {
  const location = useLocation();
  const navigate = useNavigate();
  const [socket, setSocket] = useState(null);

  const [gameState, setGameState] = useState({
    users: [],
    myRole: '—',
    keywordHint: '',
    scenario: '',
    roundSecondsLeft: 0,
    roundCurrent: 1,
    roundTotal: 10
  });
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [winnerModal, setWinnerModal] = useState(null);
  const messagesEndRef = useRef(null);

  const queryParams = new URLSearchParams(location.search);
  const username = queryParams.get('username') || '';
  const avatar = queryParams.get('avatar') || '';

  useEffect(() => {
    if (!username) {
      navigate('/');
      return;
    }

    const newSocket = io('http://localhost:3000', {
      query: { username, avatar },
      transports: ['websocket', 'polling']
    });
    
    newSocket.on('connect', () => {
      newSocket.emit('join', { username, avatar });
    });

    newSocket.on('state', (stateData) => {
      setGameState(prev => ({
        ...prev,
        ...stateData
      }));
    });

    newSocket.on('chat', (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    newSocket.on('narrator_scenario', (payload) => {
      if (payload?.scenario) {
        setGameState(prev => ({ ...prev, scenario: payload.scenario }));
      }
    });

    newSocket.on('round_result', (payload) => {
      setWinnerModal({
        winner: payload?.winner || 'No winner',
        reason: payload?.reason || 'Round evaluation completed.'
      });
    });

    newSocket.on('error_msg', (msg) => {
      setMessages(prev => [...prev, { username: 'System', role: 'System', message: `Error: ${msg}`, isError: true }]);
    });

    setSocket(newSocket);

    return () => newSocket.disconnect();
  }, [username, avatar, navigate]);

  useEffect(() => {
    if (gameState.myRole && gameState.myRole !== '—') {
      document.body.className = `rr-page h-screen font-sans text-slate-200 overflow-hidden flex flex-col relative theme-${gameState.myRole.toLowerCase()}`;
    } else {
      document.body.className = `rr-page h-screen font-sans text-slate-200 overflow-hidden flex flex-col relative`;
    }
  }, [gameState.myRole]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!inputMsg.trim() || !socket) return;
    socket.emit('chat', { message: inputMsg.trim() });
    setInputMsg('');
  };

  const startNewGame = () => {
    if (socket) socket.emit('new_game');
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };

  const myRoleData = R(gameState.myRole);
  const myUser = gameState.users.find(u => u.username === username);

  return (
    <>
      <div className="atmosphere-layer"></div>
      
      <header className="relative z-30 shrink-0 flex items-center justify-between px-4 sm:px-5 py-3 glass-strong border-b border-purple-400/15">
        <div className="flex items-center gap-3 glass rounded-xl px-3 py-2 panel-glow max-w-[min(100%,220px)] sm:max-w-none">
          <div className="w-10 h-10 rounded-full border-2 flex items-center justify-center text-lg relative shrink-0 overflow-hidden"
               style={{ borderColor: myRoleData.color, background: myRoleData.bg }}>
            {myUser && myUser.avatar ? 
              <img src={`http://localhost:3000/avatars/${myUser.avatar}`} alt="" className="w-full h-full object-cover" /> : myRoleData.emoji}
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#0f0a18] shadow-[0_0_6px_rgba(52,211,153,0.6)]"></span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-100 truncate">{username}</p>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md inline-block mt-0.5"
                  style={{ color: myRoleData.color, background: myRoleData.bg }}>{gameState.myRole}</span>
          </div>
          <div className="ml-1 sm:ml-2 text-sm font-bold text-amber-300 flex items-center gap-1 shrink-0">
            <span className="text-base leading-none">🪙</span><span>{myUser ? myUser.score : 0}</span>
          </div>
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none select-none">
          <div className="flex flex-col items-center gap-0 text-amber-400/95 mb-0.5 drop-shadow-[0_0_14px_rgba(251,191,36,0.35)]">
            <span className="text-base leading-none">👑</span>
            <span className="text-lg leading-none -mt-0.5">⚔️</span>
          </div>
          <h1 className="font-display text-[1.35rem] sm:text-2xl shimmer-text tracking-wider leading-tight">RoleRoom</h1>
          <span className="text-[8px] sm:text-[9px] tracking-[0.22em] text-purple-300/65 mt-1 font-semibold">LIVE ACTION ROLEPLAY</span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end max-w-[42%] sm:max-w-none">
          <div className="stat-pill rounded-lg px-2.5 sm:px-3 py-2 flex items-center gap-1.5 text-[10px] sm:text-xs">
            <span className="text-purple-300 shrink-0">⚔️</span>
            <span className="text-slate-500 hidden sm:inline">Round</span>
            <span className="font-bold text-purple-100 tabular-nums">{gameState.roundCurrent}/{gameState.roundTotal}</span>
          </div>
          <div className="stat-pill rounded-lg px-2.5 sm:px-3 py-2 flex items-center gap-1.5 text-[10px] sm:text-xs">
            <span className="text-amber-400/90 shrink-0">⏳</span>
            <span className="text-slate-500 hidden sm:inline">Time</span>
            <span className="font-bold font-mono text-sky-300 tabular-nums">{formatTime(gameState.roundSecondsLeft)}</span>
          </div>
          <button onClick={startNewGame} className="rounded-lg px-2.5 sm:px-4 py-2 text-[10px] sm:text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-violet-700 border border-purple-400/45 shadow-md hover:shadow-lg hover:scale-[1.03] transition-all flex items-center gap-1">
            <span>⚔️</span><span className="hidden sm:inline">Start New Game</span><span className="sm:hidden">New</span>
          </button>
          <button onClick={() => navigate('/')} className="rounded-lg px-2.5 sm:px-4 py-2 text-[10px] sm:text-xs font-bold text-red-200/95 bg-red-950/55 border border-red-500/30 hover:bg-red-900/45 hover:border-red-400/40 transition-all flex items-center gap-1 shadow-inner">
            <span>🚪</span><span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </header>

      <main className="flex-1 flex gap-3 sm:gap-4 p-3 sm:p-4 overflow-hidden min-h-0 relative z-10">
        <aside className="w-[240px] sm:w-[260px] shrink-0 flex flex-col gap-3 sm:gap-4 min-h-0">
          <div className="glass panel-glow rounded-2xl flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-purple-400/15 flex items-center justify-between">
              <h2 className="text-[11px] font-extrabold tracking-[0.2em] text-slate-200 uppercase">Players</h2>
              <span className="text-[10px] font-bold text-purple-200 bg-purple-950/50 border border-purple-500/25 px-2 py-0.5 rounded-full tabular-nums">{gameState.users.length}/10</span>
            </div>
            <ul className="flex-1 overflow-y-auto scr p-2.5 space-y-0.5">
              {gameState.users.map(u => {
                const r = R(u.role);
                const isMe = u.username === username;
                return (
                  <li key={u.username} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 hover:bg-purple-500/8 ${isMe ? 'bg-purple-500/10 ring-1 ring-purple-400/20' : ''}`}>
                    <div className="relative w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 overflow-hidden" style={{ border: `2px solid ${r.color}`, background: r.bg }}>
                      {u.avatar ? <img src={`http://localhost:3000/avatars/${u.avatar}`} className="w-full h-full object-cover" /> : r.emoji}
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#0f0a18]"></span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-slate-200 truncate">{u.username}</p>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-md inline-block mt-0.5 border" style={{ color: r.color, background: r.bg, borderColor: `${r.color}44` }}>{u.role}</span>
                    </div>
                    <span className="text-sm font-bold text-amber-300 shrink-0 flex items-center gap-1"><span>🪙</span>{u.score}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="glass panel-glow rounded-2xl p-4 sm:p-5 text-center relative overflow-hidden border-t-[3px] border-t-purple-500/55">
            <div className="absolute inset-0 bg-gradient-to-b from-purple-600/8 to-transparent pointer-events-none"></div>
            <p className="text-[10px] font-bold tracking-[0.18em] text-purple-200/90 uppercase mb-2 relative z-10">Your role</p>
            <div className="w-16 h-16 mx-auto rounded-full bg-purple-900/45 border-2 flex items-center justify-center text-3xl shadow-[0_0_28px_rgba(168,85,247,0.35)] mb-2 relative z-10 overflow-hidden" style={{ borderColor: myRoleData.color, background: myRoleData.bg }}>
              {myUser && myUser.avatar ? <img src={`http://localhost:3000/avatars/${myUser.avatar}`} className="w-full h-full object-cover" /> : myRoleData.emoji}
            </div>
            <p className="text-lg sm:text-xl font-bold relative z-10" style={{ color: myRoleData.color }}>{gameState.myRole}</p>
            <p className="text-[11px] text-slate-400/95 mt-2 leading-relaxed relative z-10 px-1">{gameState.keywordHint}</p>
            <button onClick={() => alert(`🎭 ${gameState.myRole} Guide\n\nKeywords: ${myRoleData.keywords.join(', ')}\n\n+10 pts for using keywords\n-5 pts without keywords`)} className="mt-4 w-full py-2.5 rounded-xl bg-purple-950/55 border border-purple-500/30 text-xs font-bold text-purple-100 hover:bg-purple-900/55 transition-colors relative z-10 flex items-center justify-center gap-2">
              <span>📖</span> View Role Guide
            </button>
          </div>
        </aside>

        <section className="flex-1 glass panel-glow rounded-2xl flex flex-col overflow-hidden min-w-0 relative">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-purple-400/40 to-transparent"></div>
          <div className="px-5 py-3 border-b border-purple-400/15 flex items-center justify-center">
            <h2 className="text-xs font-bold tracking-widest text-slate-300 uppercase flex items-center gap-2">
              <span className="text-base">💬</span> Live Chat
            </h2>
          </div>

          <div className="mx-4 sm:mx-5 mt-3 px-4 py-3 rounded-xl bg-indigo-500/10 border border-indigo-400/25 flex gap-3 items-center">
            <div className="w-12 h-12 rounded-full border-2 border-indigo-400/50 overflow-hidden shrink-0 shadow-[0_0_15px_rgba(99,102,241,0.3)]">
              <img src="http://localhost:3000/images/narrator.png" alt="Narrator" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-bold tracking-[0.14em] text-indigo-200 uppercase mb-1">Narrator says:</p>
              <p className="text-sm text-indigo-100/95 leading-relaxed">{gameState.scenario || 'Waiting for next scenario...'}</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scr p-5 space-y-4">
            {messages.map((msg, i) => {
              if (msg.role === 'System' && msg.username === 'Room') {
                return (
                  <div key={i} className="msg-anim flex items-center gap-3 py-2 px-3 rounded-xl bg-purple-500/8 border border-purple-400/15 text-[12px] text-purple-300 italic">
                    📢 {msg.message}
                  </div>
                );
              }
              if (msg.username === 'Narrator') {
                return (
                  <div key={i} className="msg-anim flex gap-3 px-3 py-3 border-b border-indigo-400/[0.15] bg-indigo-500/[0.04]">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5 overflow-hidden border-2 border-indigo-400/50">
                      <img src="http://localhost:3000/images/narrator.png" alt="Narrator" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-indigo-200">Narrator</span>
                      </div>
                      <p className="text-sm text-indigo-100/95 italic">{msg.message}</p>
                    </div>
                  </div>
                );
              }

              const r = R(msg.role);
              return (
                <div key={i} className="msg-anim flex gap-3 px-3 py-3 border-b border-purple-400/[0.08] hover:bg-white/[0.02] transition-colors">
                   <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 mt-0.5 overflow-hidden" style={{ border: `2px solid ${r.color}`, background: r.bg }}>
                     {msg.avatar ? <img src={`http://localhost:3000/avatars/${msg.avatar}`} className="w-full h-full object-cover" /> : r.emoji}
                   </div>
                   <div className="flex-1 min-w-0">
                     <div className="flex items-center gap-2 mb-1 flex-wrap">
                       <span className="text-sm font-bold text-slate-100">{msg.username}</span>
                       <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border" style={{ color: r.color, background: r.bg, borderColor: `${r.color}44` }}>{msg.role}</span>
                       {msg.pointsDelta > 0 && <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded">+{msg.pointsDelta}</span>}
                       {msg.pointsDelta < 0 && <span className="text-[10px] font-bold text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded">{msg.pointsDelta}</span>}
                     </div>
                     <p className="text-sm text-slate-300/95">{msg.message}</p>
                   </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className="px-4 sm:px-5 py-4 border-t border-purple-400/15 bg-[rgba(10,6,20,0.65)]">
            <form onSubmit={sendMessage} className="flex items-center gap-2 sm:gap-3">
              <div className="relative flex-1 flex items-center">
                <button type="button" onClick={() => setInputMsg(prev => prev + '😀')} className="absolute left-2.5 flex h-9 w-9 items-center justify-center text-lg text-slate-400 hover:text-slate-200 transition-colors">😊</button>
                <input
                  value={inputMsg}
                  onChange={e => setInputMsg(e.target.value)}
                  type="text"
                  maxLength="500"
                  autoComplete="off"
                  placeholder="Type your message... (use role keywords for +10!)"
                  className="w-full rounded-xl bg-[#0c0818]/90 border border-purple-400/22 pl-12 pr-4 py-3 text-sm text-slate-100 outline-none focus:border-purple-400/50"
                />
              </div>
              <button type="submit" className="rounded-xl bg-gradient-to-r from-purple-600 to-violet-700 border border-purple-400/35 px-4 sm:px-5 py-3 text-sm font-bold text-white hover:scale-[1.02] transition-all flex items-center gap-2">
                Send
              </button>
            </form>
          </div>
        </section>

        <aside className="w-[260px] sm:w-[280px] shrink-0 flex flex-col gap-3 sm:gap-4 min-h-0">
          <div className="glass panel-glow rounded-2xl p-4 sm:p-5">
            <h2 className="text-[11px] font-extrabold tracking-[0.18em] text-slate-200 uppercase flex items-center gap-2 mb-4 pb-2 border-b border-purple-400/15">
              <span className="text-purple-300">ℹ️</span> Game info
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between"><span className="text-xs text-slate-500">Round</span><span className="text-sm font-bold text-purple-300">{gameState.roundCurrent}/{gameState.roundTotal}</span></div>
              <div className="flex justify-between"><span className="text-xs text-slate-500">Time left</span><span className="text-sm font-bold font-mono text-sky-400">{formatTime(gameState.roundSecondsLeft)}</span></div>
              <div className="flex justify-between"><span className="text-xs text-slate-500">Your role</span><span className="text-sm font-bold" style={{ color: myRoleData.color }}>{gameState.myRole}</span></div>
            </div>
          </div>
          <div className="glass panel-glow rounded-2xl flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="px-4 sm:px-5 py-3 border-b border-purple-400/15">
              <h2 className="text-[11px] font-extrabold tracking-[0.18em] text-slate-200 uppercase flex items-center gap-2">
                <span className="text-amber-400 text-base">🏆</span> Leaderboard
              </h2>
            </div>
            <ol className="flex-1 overflow-y-auto scr p-3 space-y-2">
              {[...gameState.users].sort((a,b) => b.score - a.score).map((u, i) => {
                const isMe = u.username === username;
                const rc = ['#ca8a04', '#64748b', '#c2410c'][i] || '#52525b';
                return (
                  <li key={u.username} className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all hover:bg-purple-500/8 ${i === 0 ? 'bg-amber-500/8 ring-1 ring-amber-400/20' : ''} ${isMe && i !== 0 ? 'bg-purple-500/6 ring-1 ring-purple-400/15' : ''}`}>
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-white shrink-0" style={{ background: rc }}>{i+1}</span>
                    <span className="flex-1 text-[13px] font-semibold text-slate-200 truncate">{u.username}{isMe && <span className="text-purple-400 text-xs ml-1">(You)</span>}</span>
                    <span className="text-xs font-bold text-amber-300 shrink-0">🪙 {u.score}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </aside>
      </main>

      <div className="shrink-0 flex justify-center py-2 relative z-10 px-2">
        <div className="glass panel-glow rounded-full px-4 sm:px-6 py-2 flex items-center gap-2 text-[11px] sm:text-xs">
          <span className="text-amber-400">💡</span>
          <span className="text-slate-300/85">Tip: Use role-related keywords in your messages to earn more points!</span>
        </div>
      </div>

      {winnerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-300/30 bg-[#1a1230] p-5 shadow-2xl">
            <p className="text-[11px] font-bold tracking-[0.16em] text-amber-300 uppercase">Winner of the round</p>
            <h3 className="mt-2 text-2xl font-extrabold text-amber-100">{winnerModal.winner}</h3>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">{winnerModal.reason}</p>
            <button onClick={() => setWinnerModal(null)} className="mt-4 w-full rounded-xl bg-amber-500/20 border border-amber-300/35 px-4 py-2 text-sm font-bold text-amber-100 hover:bg-amber-500/30 transition-colors">
              Continue
            </button>
          </div>
        </div>
      )}
    </>
  );
}
