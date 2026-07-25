'use client';

import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Music, Volume2, VolumeX, Volume1 } from 'lucide-react';

interface YoutubePlayerProps {
  roomId: string;
  videoId: string | null;
  isPlaying: boolean;
  seekTime: number | null;
  playlistIdToLoad: string | null;
  isHost?: boolean;
  reactions?: { id: string, emoji: string }[];
  onPlayerStateChange: (state: 'PLAYING' | 'PAUSED', time: number) => void;
  onVideoEnded: () => void;
  onLocalSeek: (time: number) => void;
  onPlaylistLoaded: (videoIds: string[]) => void;
  onVideoTitleLoaded: (videoId: string, title: string) => void;
}

// Format seconds to mm:ss
function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function YoutubePlayer({
  roomId,
  videoId,
  isPlaying,
  reactions = [],
}: YoutubePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [isAutoplayBlocked, setIsAutoplayBlocked] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Icecast Stream URL based on roomId
  const icecastBaseUrl = process.env.NEXT_PUBLIC_ICECAST_URL || 'http://localhost:8000';
  const streamUrl = `${icecastBaseUrl}/${roomId}.mp3`;

  // Handle Play/Pause synchronization
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !videoId) return;

    let retryTimeout: NodeJS.Timeout;

    const attemptPlay = () => {
      // Always reset src to force browser to ignore cached 404s
      audio.src = streamUrl;
      audio.load();
      audio.play().then(() => {
        setIsAutoplayBlocked(false);
      }).catch((err) => {
        console.warn('[AudioPlayer] Playback blocked or failed:', err.message);
        if (err.name === 'NotAllowedError') {
          setIsAutoplayBlocked(true);
        } else {
          // Stream likely not ready yet (404), retry in 2 seconds
          retryTimeout = setTimeout(attemptPlay, 2000);
        }
      });
    };

    if (isPlaying) {
      attemptPlay();
    } else {
      audio.pause();
    }

    return () => {
      clearTimeout(retryTimeout);
    };
  }, [isPlaying, videoId, streamUrl]);

  // Handle Volume changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100;
    }
  }, [volume, isMuted]);

  // Local song progress simulation (since live stream duration is Infinity)
  useEffect(() => {
    if (isPlaying && videoId) {
      timerRef.current = setInterval(() => {
        setCurrentTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isPlaying, videoId]);

  // Reset local current time when song changes
  useEffect(() => {
    setCurrentTime(0);
  }, [videoId]);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setVolume(val);
    if (val > 0) setIsMuted(false);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <audio ref={audioRef} style={{ display: 'none' }} />

      <div className="flex justify-between items-center mb-2">
        <span className="text-xs text-muted flex items-center gap-1.5 font-semibold uppercase tracking-wider">
          <Music size={12} className="text-purple-400" />
          Đài Phát Nhạc (Icecast Stream)
        </span>
      </div>

      {/* VISUALIZER CONTAINER */}
      <div 
        className="relative w-full flex-1 min-h-0 rounded-xl overflow-hidden bg-black-60 border border-white-5 shadow-inner flex flex-col items-center justify-center p-6"
        style={{
          background: 'radial-gradient(circle, rgba(26,20,45,0.9) 0%, rgba(10,8,20,1) 100%)'
        }}
      >
        {/* Floating Reactions Overlay */}
        {reactions.map(reaction => (
          <div
            key={reaction.id}
            className="emoji-reaction"
            style={{
              left: `${15 + Math.random() * 70}%`,
              bottom: '10%'
            }}
          >
            {reaction.emoji}
          </div>
        ))}

        {/* Browser Autoplay Block Overlay */}
        {isAutoplayBlocked && isPlaying && (
          <div 
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-30 transition-all cursor-pointer animate-fade-in"
            onClick={() => {
              setIsAutoplayBlocked(false);
              if (audioRef.current) {
                audioRef.current.load();
                audioRef.current.play().catch(e => console.error(e));
              }
            }}
            title="Nhấn để tham gia phát nhạc"
          >
            <div className="w-16 h-16 rounded-full bg-purple-500/20 border border-purple-500/50 flex items-center justify-center mb-4 text-purple-400 animate-pulse">
               <Volume2 size={32} />
            </div>
            <h3 className="font-bold text-lg text-white mb-2">Bấm để tham gia nghe nhạc</h3>
            <p className="text-xs text-neutral-400 max-w-xs text-center leading-relaxed">
              Trình duyệt đã chặn phát âm thanh tự động. Nhấn vào đây để kết nối với luồng phát của phòng.
            </p>
          </div>
        )}

        {/* Empty Room State */}
        {!videoId ? (
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4 text-purple-400 animate-spin-slow">
              <Music size={28} />
            </div>
            <h3 className="font-bold text-lg text-white mb-1.5">Phòng Đang Trống Nhạc</h3>
            <p className="text-xs text-neutral-400 max-w-xs leading-relaxed">
              Gõ lệnh <code className="bg-white/5 px-1 py-0.5 rounded text-cyan-400">/play &lt;link&gt;</code> hoặc tìm kiếm nhạc phía trên để phát cùng mọi người!
            </p>
          </div>
        ) : (
          /* Active Playing State - Animated Premium Vinyl & Waveform Visualizer */
          <div className="flex flex-col items-center justify-center w-full h-full relative">
            
            {/* Spinning Vinyl Record */}
            <div className="relative mb-6 group">
              {/* Outer pulsing ring */}
              <div 
                className={`absolute inset-0 rounded-full blur-xl transition-all duration-1000 ${
                  isPlaying ? 'bg-purple-500/20 scale-125 opacity-100' : 'bg-transparent scale-100 opacity-0'
                }`}
              />
              
              {/* Vinyl Plate */}
              <div 
                className={`w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-[#08070e] border-4 border-[#242135] shadow-2xl flex items-center justify-center relative overflow-hidden ${
                  isPlaying ? 'animate-spin-slow' : ''
                }`}
                style={{
                  boxShadow: '0 0 40px rgba(139, 92, 246, 0.15), inset 0 0 20px rgba(0,0,0,0.8)'
                }}
              >
                {/* Vinyl grooving texture */}
                <div className="absolute inset-2 rounded-full border border-neutral-800/40 opacity-50" />
                <div className="absolute inset-6 rounded-full border border-neutral-800/40 opacity-50" />
                <div className="absolute inset-10 rounded-full border border-neutral-800/40 opacity-50" />
                <div className="absolute inset-14 rounded-full border border-neutral-800/40 opacity-50" />
                
                {/* Center Label (Decorative Music Icon) */}
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-purple-600 to-pink-500 flex items-center justify-center border-2 border-[#08070e] z-10">
                  <Music size={16} className="text-white animate-pulse" />
                </div>
              </div>
            </div>

            {/* Simulated Animated Waveform Bars */}
            <div className="flex items-end gap-1 h-12 mt-2 w-full justify-center max-w-sm px-4">
              {Array.from({ length: 24 }).map((_, i) => {
                // Generate random animation delays and heights for a natural equalizer look
                const delay = `${(i * 0.08).toFixed(2)}s`;
                const duration = `${(0.5 + Math.random() * 0.8).toFixed(2)}s`;
                return (
                  <div
                    key={i}
                    className={`w-1 rounded-full transition-all duration-300 ${
                      isPlaying 
                        ? 'bg-gradient-to-t from-purple-500 to-cyan-400' 
                        : 'bg-neutral-800 h-1'
                    }`}
                    style={isPlaying ? {
                      height: `${15 + Math.random() * 85}%`,
                      animation: `equalize ${duration} ease-in-out infinite alternate`,
                      animationDelay: delay
                    } : {}}
                  />
                );
              })}
            </div>
            
            <p className="text-[11px] text-neutral-400 font-mono tracking-wider mt-4 flex items-center gap-1.5 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20">
              <span className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              {isPlaying ? 'ON AIR' : 'PAUSED'}
            </p>
          </div>
        )}
      </div>

      {/* CUSTOM CONTROL BAR */}
      {videoId && (
        <div className="flex flex-row items-center justify-between gap-4 p-3 bg-white-02 border border-white-5 rounded-xl flex-shrink-0">
          
          {/* CỘT TRÁI: TIẾN TRÌNH & THỜI GIAN */}
          <div className="flex-1 flex items-center gap-3 min-w-0">
            {/* Trạng thái play/pause */}
            <div className="flex items-center justify-center flex-shrink-0">
              {isPlaying ? (
                <div className="flex items-end gap-0.5 h-3" title="Đang phát">
                  <span className="rounded-sm animate-pulse w-0.5 h-2 bg-cyan-400"></span>
                  <span className="rounded-sm animate-pulse w-0.5 h-3 bg-purple-400" style={{ animationDelay: '0.15s' }}></span>
                  <span className="rounded-sm animate-pulse w-0.5 h-2.5 bg-cyan-400" style={{ animationDelay: '0.3s' }}></span>
                </div>
              ) : (
                <div className="w-2 h-2 rounded-full bg-amber-500" title="Tạm dừng" />
              )}
            </div>

            {/* Chỉ số thời gian đã trôi qua */}
            <span className="text-xs text-muted font-mono whitespace-nowrap flex-shrink-0" style={{ fontSize: '11px' }}>
              Thời lượng đã phát: {formatTime(currentTime)}
            </span>
          </div>

          {/* CỘT PHẢI: ÂM LƯỢNG */}
          <div className="flex items-center gap-2.5 flex-shrink-0 w-32 sm:w-40 border-l border-white-10 pl-3">
            <button
              onClick={toggleMute}
              className="flex items-center justify-center text-muted w-7 h-7 rounded-lg transition-colors hover:text-white"
              style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.05)' }}
              title={isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX size={14} />
              ) : volume < 50 ? (
                <Volume1 size={14} />
              ) : (
                <Volume2 size={14} />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="flex-1 rounded-full appearance-none outline-none"
              style={{
                cursor: 'pointer',
                height: '4px',
                background: `linear-gradient(to right, #a855f7 ${isMuted ? 0 : volume}%, rgba(255,255,255,0.1) ${isMuted ? 0 : volume}%)`,
                accentColor: '#a855f7',
              }}
              title={`Âm lượng: ${isMuted ? 0 : volume}%`}
            />
            <span className="text-xs text-muted font-mono text-right flex-shrink-0" style={{ fontSize: '10px', width: '36px' }}>
              {isMuted ? 0 : volume}%
            </span>
          </div>

        </div>
      )}
    </div>
  );
}
