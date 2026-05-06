import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function FeatureRow({ icon, title, desc }) {
  return (
    <div className="flex items-center gap-4 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] mb-2.5 hover:bg-white/[0.04] transition-colors">
      <div className="w-10 h-10 rounded-xl bg-[#231b32] border border-[#3d2e52] flex items-center justify-center text-xl shrink-0 shadow-inner">
        {icon}
      </div>
      <div>
        <h4 className="text-[#e2d4b7] font-semibold text-sm">{title}</h4>
        <p className="text-[#9ca3af] text-[10px] mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

export default function JoinScreen() {
  const [avatars, setAvatars] = useState([]);
  const [selectedAvatar, setSelectedAvatar] = useState('');
  const [username, setUsername] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    document.body.className = 'rr-page';
    document.body.style.removeProperty('--rr-custom-bg-image');
    document.body.style.removeProperty('background-image');
    
    const fallbackAvatars = [
      "Başlıksız786_20260430191709.png", "Başlıksız787_20260430191651.png", "Başlıksız788_20260430191805.png",
      "Başlıksız788_20260430191820.png", "Başlıksız788_20260430191836.png", "Başlıksız788_20260430191852.png",
      "Başlıksız788_20260430191907.png", "Başlıksız788_20260430191923.png", "Başlıksız788_20260501205830.png",
      "Başlıksız788_20260501205853.png", "Başlıksız788_20260501205912.png", "Başlıksız788_20260501205927.png",
      "Başlıksız788_20260501205944.png", "Başlıksız788_20260501210433.png", "Başlıksız789_20260430191630.png",
      "Başlıksız790_20260430191612.png"
    ];

    fetch('/api/avatars')
      .then(res => {
        if (!res.ok) throw new Error('API failed');
        return res.json();
      })
      .then(data => {
        const avatarList = Array.isArray(data) ? data : fallbackAvatars;
        setAvatars(avatarList);
        if (avatarList.length > 0) setSelectedAvatar(avatarList[0]);
      })
      .catch(err => {
        console.error('Error fetching avatars, using fallback:', err);
        setAvatars(fallbackAvatars);
        setSelectedAvatar(fallbackAvatars[0]);
      });
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!username.trim() || username.length > 32) {
      setError('Please enter a valid username.');
      return;
    }
    
    // Pass roomCode to the chat if provided, otherwise it's just a general room
    const roomParam = roomCode.trim() ? `&room=${encodeURIComponent(roomCode.trim())}` : '';
    navigate(`/chat?username=${encodeURIComponent(username)}&avatar=${encodeURIComponent(selectedAvatar)}${roomParam}`);
  };

  const handleCreateRoom = () => {
    if (!username.trim() || username.length > 32) {
      setError('Please enter a valid username before creating a room.');
      return;
    }
    // Generate a random 6-character room code
    const newRoomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    navigate(`/chat?username=${encodeURIComponent(username)}&avatar=${encodeURIComponent(selectedAvatar)}&room=${newRoomCode}`);
  };

  return (
    <div className="min-h-screen text-slate-200 font-sans relative flex items-center justify-center p-4 sm:p-6">
      
      {/* Main Glassmorphism Panel */}
      <div className="w-full max-w-[800px] bg-[#120d1d]/85 backdrop-blur-xl border border-[#c8aa6e]/25 rounded-[2rem] shadow-[0_0_60px_rgba(0,0,0,0.8)] flex flex-col md:flex-row overflow-hidden relative z-10">
        
        {/* Left Column: Branding & Features */}
        <div className="flex-1 min-w-0 p-6 md:p-8 flex flex-col justify-between relative border-b md:border-b-0 md:border-r border-[#c8aa6e]/15">
          
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-full bg-[#241b35] border border-[#c8aa6e]/40 flex items-center justify-center shadow-[0_0_20px_rgba(200,170,110,0.15)]">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2 9L5 20H19L22 9L16 13L12 4L8 13L2 9Z" fill="#c8aa6e"/>
                  <path d="M7 15C7 16.1046 7.89543 17 9 17C10.1046 17 11 16.1046 11 15C11 13.8954 10.1046 13 9 13C7.89543 13 7 13.8954 7 15Z" fill="#120d1d"/>
                  <path d="M13 15C13 16.1046 13.8954 17 15 17C16.1046 17 17 16.1046 17 15C17 13.8954 16.1046 13 15 13C13.8954 13 13 13.8954 13 15Z" fill="#120d1d"/>
                </svg>
              </div>
              <div>
                <h1 className="font-cinzel text-3xl font-bold text-[#f4ecd8] tracking-wide">RoleRoom</h1>
                <h2 className="text-[#a397b4] text-xs tracking-widest uppercase mt-0.5">Live Action Roleplay</h2>
              </div>
            </div>
            
            <p className="text-[#d1c5e0] text-sm mt-4 mb-6 font-medium">
              Play your role. Hide your secrets. Win the round.
            </p>

            <div className="flex flex-col">
              <FeatureRow icon="🎲" title="Random Roles" desc="Get assigned as Detective, Doctor, Killer, or Spy." />
              <FeatureRow icon="🔑" title="Secret Keywords" desc="Use your hidden words in chat to earn bonus points." />
              <FeatureRow icon="🤖" title="AI Narrator" desc="An intelligent game master evaluates your roleplay." />
            </div>
          </div>

        </div>

        {/* Right Column: Join Form */}
        <div className="flex-1 min-w-0 p-6 md:p-8 flex flex-col bg-[#0d0914]/40">
          
          <div className="flex items-center justify-center gap-3 mb-6">
            <span className="text-[#c8aa6e]/60 text-lg">✧</span>
            <h3 className="font-cinzel text-xl font-bold text-[#f4ecd8]">Enter the Room</h3>
            <span className="text-[#c8aa6e]/60 text-lg">✧</span>
          </div>

          {/* Avatar Selection */}
          <div className="mb-5">
            <label className="block text-[11px] font-medium text-[#a397b4] mb-2.5">Choose an Avatar</label>
            <div className="flex gap-2.5 overflow-x-auto pb-2 scr">
              {avatars.length > 0 ? avatars.map((av, i) => (
                <button key={i} type="button" onClick={() => setSelectedAvatar(av)}
                  className={`relative w-[3.5rem] h-[3.5rem] shrink-0 rounded-2xl overflow-hidden border-[1.5px] transition-all duration-200 ${selectedAvatar === av ? 'border-[#9b7bcf] shadow-[0_0_15px_rgba(155,123,207,0.4)] scale-105' : 'border-[#3a2d4a] opacity-70 hover:opacity-100 hover:border-[#5c4a73] bg-[#151020]'}`}>
                  <img src={`/avatars/${av}`} className="w-full h-full object-cover" alt="avatar" />
                  {selectedAvatar === av && (
                    <div className="absolute top-1 right-1 w-3.5 h-3.5 bg-[#9b7bcf] rounded-full flex items-center justify-center shadow-md">
                      <span className="text-[8px] text-white font-bold leading-none">✓</span>
                    </div>
                  )}
                </button>
              )) : (
                <div className="w-full text-center text-sm text-slate-500 py-4">Loading avatars...</div>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 flex-1">
            <div>
              <label className="block text-[11px] font-medium text-[#a397b4] mb-1.5">Player Name</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6b5a82]">👤</span>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} required maxLength="32" placeholder="Enter your name..."
                  className="w-full bg-[#0a0710] border border-[#2d223a] rounded-xl pl-10 pr-4 py-2.5 text-[#e2d5b5] placeholder-[#4a3b5c] focus:outline-none focus:border-[#c8aa6e]/50 focus:ring-1 focus:ring-[#c8aa6e]/30 transition-all text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#a397b4] mb-1.5">Room Code (Optional)</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6b5a82]">#</span>
                <input type="text" value={roomCode} onChange={e => setRoomCode(e.target.value)} placeholder="Enter room code..."
                  className="w-full bg-[#0a0710] border border-[#2d223a] rounded-xl pl-10 pr-4 py-2.5 text-[#e2d5b5] placeholder-[#4a3b5c] focus:outline-none focus:border-[#c8aa6e]/50 focus:ring-1 focus:ring-[#c8aa6e]/30 transition-all text-sm" />
              </div>
            </div>

            {error && <div className="text-red-400 text-xs font-medium bg-red-500/10 p-2 rounded-lg border border-red-500/20 text-center">{error}</div>}

            <div className="flex flex-col gap-2.5 mt-auto pt-3">
              <button type="submit" className="w-full bg-gradient-to-r from-[#7a5b9b] to-[#5b407a] hover:from-[#8b6cac] hover:to-[#6c4f8a] text-[#f4ecd8] font-medium py-3 rounded-xl transition-all shadow-[0_0_20px_rgba(122,91,155,0.3)] flex items-center justify-center gap-2 border border-[#9b7bcf]/30">
                Join Game <span className="text-lg leading-none">→</span>
              </button>
              <button type="button" onClick={handleCreateRoom} className="w-full bg-[#120d1d] hover:bg-[#1a1329] border border-[#2d223a] text-[#a397b4] hover:text-[#e2d5b5] font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2">
                👥 Create Room
              </button>
            </div>
          </form>

          {/* Role Chips */}
          <div className="mt-5 pt-4 border-t border-[#c8aa6e]/15">
            <p className="text-[9px] text-center text-[#8b7a9e] uppercase tracking-widest mb-2.5 font-semibold">Available Roles</p>
            <div className="flex flex-wrap justify-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-[#0a0710] border border-[#3b82f6]/30 text-[#60a5fa] text-[10px] font-medium flex items-center gap-1.5"><span className="text-sm">🔍</span> Detective</span>
              <span className="px-2.5 py-1 rounded-lg bg-[#0a0710] border border-[#22c55e]/30 text-[#4ade80] text-[10px] font-medium flex items-center gap-1.5"><span className="text-sm">✚</span> Doctor</span>
              <span className="px-2.5 py-1 rounded-lg bg-[#0a0710] border border-[#ef4444]/30 text-[#f87171] text-[10px] font-medium flex items-center gap-1.5"><span className="text-sm">🗡️</span> Killer</span>
              <span className="px-2.5 py-1 rounded-lg bg-[#0a0710] border border-[#a855f7]/30 text-[#c084fc] text-[10px] font-medium flex items-center gap-1.5"><span className="text-sm">🎭</span> Spy</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
