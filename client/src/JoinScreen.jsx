import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function JoinScreen() {
  const [avatars, setAvatars] = useState([]);
  const [selectedAvatar, setSelectedAvatar] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    document.body.className = 'rr-page';
    fetch('http://localhost:3000/api/avatars')
      .then(res => res.json())
      .then(data => {
        setAvatars(data);
        if (data.length > 0) setSelectedAvatar(data[0]);
      })
      .catch(err => console.error('Error fetching avatars:', err));
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!username.trim() || username.length > 32) {
      setError('Please enter a valid username (max 32 characters).');
      return;
    }
    navigate(`/chat?username=${encodeURIComponent(username)}&avatar=${encodeURIComponent(selectedAvatar)}`);
  };

  return (
    <div className="min-h-screen font-sans text-slate-100 flex items-center justify-center p-4 sm:p-6 relative">
      <div className="relative w-full max-w-5xl p-7 rounded-2xl bg-gradient-to-br from-[#201234f0] via-[#0c0618f5] to-[#120a24f2] border border-[#ba8cff6b] backdrop-blur-[22px] shadow-[0_0_0_1px_rgba(99,60,180,0.35),0_0_80px_rgba(124,58,237,0.28),0_20px_56px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.07)] z-10">
        <span className="absolute w-6 h-6 border-[#c0a0ff8c] top-3 left-3 border-t-2 border-l-2 rounded-tl-md pointer-events-none z-10"></span>
        <span className="absolute w-6 h-6 border-[#c0a0ff8c] top-3 right-3 border-t-2 border-r-2 rounded-tr-md pointer-events-none z-10"></span>
        <span className="absolute w-6 h-6 border-[#c0a0ff8c] bottom-3 left-3 border-b-2 border-l-2 rounded-bl-md pointer-events-none z-10"></span>
        <span className="absolute w-6 h-6 border-[#c0a0ff8c] bottom-3 right-3 border-b-2 border-r-2 rounded-br-md pointer-events-none z-10"></span>
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-300/50 to-transparent z-[4]"></div>

        <div className="relative z-10">
          <p className="font-cinzel text-[0.62rem] font-semibold tracking-[0.35em] uppercase text-center mb-3 bg-gradient-to-r from-[#a08040] via-[#f0d78c] to-[#a08040] bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(212,175,55,0.35)]">
            <span className="text-[#d4af78d9] text-[0.45rem]">◆</span> ENTER THE REALM <span className="text-[#d4af78d9] text-[0.45rem]">◆</span>
          </p>

          <div className="flex flex-col items-center mb-1">
            <div className="relative w-[5.5rem] h-[5.5rem] rounded-full flex items-center justify-center bg-[radial-gradient(circle_at_50%_40%,rgba(180,120,255,0.35)_0%,transparent_55%),radial-gradient(circle_at_50%_100%,rgba(20,8,40,0.95),rgba(6,2,14,1))] border-2 border-[#a878ff8c] shadow-[0_0_0_1px_rgba(251,191,36,0.2),0_0_32px_rgba(139,92,246,0.55),0_0_56px_rgba(91,33,182,0.35),inset_0_0_24px_rgba(0,0,0,0.45)]">
               <span className="text-3xl">🎭</span>
            </div>
          </div>

          <h1 className="font-display font-black text-[clamp(1.85rem,7vw,2.45rem)] leading-none flex items-baseline justify-center flex-wrap mt-1 mb-1 tracking-wider bg-gradient-to-r from-[#d8b4fe] via-[#fef3c7] to-[#c4b5fd] bg-clip-text text-transparent drop-shadow-[0_2px_12px_rgba(124,58,237,0.45)]">
            ROLEROOM
          </h1>
          <div className="font-cinzel text-[0.58rem] font-semibold tracking-[0.28em] uppercase text-[#f5f0ffe0] flex items-center justify-center gap-2 mt-1">
            <span className="flex-1 max-w-[3rem] h-px bg-gradient-to-r from-transparent to-[#c0a0ff8c]"></span>
            <span className="text-[#d4af78d9] text-[0.45rem]">◆</span>
            <span>LIVE ACTION ROLEPLAY</span>
            <span className="text-[#d4af78d9] text-[0.45rem]">◆</span>
            <span className="flex-1 max-w-[3rem] h-px bg-gradient-to-l from-transparent to-[#c0a0ff8c]"></span>
          </div>

          {error && (
            <div className="mt-5 rounded-xl bg-red-500/15 border border-red-400/35 px-4 py-3 text-sm text-red-300">
              ⚠️ {error}
            </div>
          )}

          <div className="mt-7 flex flex-col md:flex-row gap-8">
            <div className="flex-1 flex flex-col">
              <label className="font-cinzel text-[0.65rem] font-bold tracking-[0.2em] uppercase text-[#c4b5dce6] text-center mb-3">CHOOSE YOUR AVATAR</label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[320px] overflow-y-auto scr pr-2 flex-1">
                {avatars.length > 0 ? avatars.map((avatar, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedAvatar(avatar)}
                    className={`rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${selectedAvatar === avatar ? 'border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.5)] opacity-100' : 'border-transparent opacity-80 hover:border-purple-400/80 hover:opacity-100'}`}
                  >
                    <img src={`http://localhost:3000/avatars/${avatar}`} alt="Avatar" className="w-full h-auto object-cover aspect-square" />
                  </div>
                )) : (
                  <div className="col-span-4 text-center text-xs text-purple-300/50 py-10">Loading avatars...</div>
                )}
              </div>
            </div>

            <div className="flex-1 flex flex-col justify-center">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="font-cinzel text-[0.65rem] font-bold tracking-[0.2em] uppercase text-[#c4b5dce6] block mb-1" htmlFor="username">ADVENTURER NAME</label>
                  <div className="flex items-center gap-2 text-[#a88cd28c] rounded-xl bg-[#080412e0] border border-[#a078e666] px-3 py-2 shadow-[inset_0_0_20px_rgba(0,0,0,0.35),0_0_18px_rgba(124,58,237,0.12)] focus-within:border-[#c0a0ffe6] focus-within:shadow-[inset_0_0_20px_rgba(0,0,0,0.3),0_0_28px_rgba(139,92,246,0.28)] transition-all">
                    <span className="text-xl">👤</span>
                    <input
                      id="username"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      type="text"
                      maxLength="32"
                      autoComplete="off"
                      required
                      placeholder="Enter your name..."
                      className="flex-1 min-w-0 bg-transparent border-none outline-none text-[#f1edfa] text-sm py-1 placeholder-[#948caa]"
                    />
                  </div>
                </div>
                <button type="submit" className="w-full mt-1 rounded-full py-3 px-6 font-cinzel font-bold text-[0.68rem] tracking-[0.22em] uppercase relative shadow-[0_0_0_1px_rgba(212,175,55,0.45),0_0_24px_rgba(124,58,237,0.25),0_6px_20px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)] bg-gradient-to-b from-[#453070] via-[#2a1848] to-[#160c28] border-2 border-[#c9a44a] text-[#f8ecc8] text-shadow-[0_0_20px_rgba(212,175,55,0.35)] flex items-center justify-center gap-2 cursor-pointer hover:brightness-110 hover:shadow-[0_0_0_1px_rgba(255,230,160,0.55),0_0_36px_rgba(139,92,246,0.35),0_8px_28px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)] hover:-translate-y-0.5 active:translate-y-0 transition-all">
                  <span>⚔️ ENTER THE REALM</span>
                </button>
              </form>

              <div className="flex flex-wrap justify-center gap-2 mt-5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[0.58rem] font-semibold tracking-[0.06em] uppercase font-cinzel bg-[#080412bf] border border-[#60a5fa8c] text-[#93c5fd]">🔍 Detective</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[0.58rem] font-semibold tracking-[0.06em] uppercase font-cinzel bg-[#080412bf] border border-[#4ade8080] text-[#86efac]">💊 Doctor</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[0.58rem] font-semibold tracking-[0.06em] uppercase font-cinzel bg-[#080412bf] border border-[#f871718c] text-[#fca5a5]">🗡️ Killer</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[0.58rem] font-semibold tracking-[0.06em] uppercase font-cinzel bg-[#080412bf] border border-[#c084fc8c] text-[#e9d5ff]">🎭 Spy</span>
              </div>

              <div className="mt-6 p-4 rounded-xl bg-[#08041299] border border-purple-400/20 shadow-inner">
                <h3 className="text-[10px] font-bold tracking-widest text-amber-200/90 uppercase mb-2">How to Play</h3>
                <ul className="text-[11px] text-slate-300/90 space-y-1.5 list-disc pl-4">
                  <li>A random role is assigned to you upon joining.</li>
                  <li>Each role has secret keywords. Use them in your messages for <span className="text-emerald-400 font-bold">+10 pts</span>.</li>
                  <li>Failing to act your role loses you <span className="text-red-400 font-bold">-5 pts</span>.</li>
                  <li>At the end of each round, an AI Narrator will declare a winner!</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
