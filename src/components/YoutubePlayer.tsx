'use client';

import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Music, Volume2, VolumeX, Volume1 } from 'lucide-react';

interface YoutubePlayerProps {
  roomId: string;
  videoId: string | null;
  isPlaying: boolean;
  seekTime: number | null;
  duration?: string;
  reactions: { id: string; emoji: string; x: number }[];
  viewMode?: 'audio' | 'video';
  isWaitingForOthers?: boolean;
  waitingCount?: number;
  onPlayerStateChange: (state: 'PLAYING' | 'PAUSED', time: number) => void;
  onVideoEnded: () => void;
  onVideoTitleLoaded: (videoId: string, title: string) => void;
  onTimeUpdate?: (time: number) => void;
}

// Format seconds to mm:ss
function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

let youtubeApiPromise: Promise<any> | null = null;

function loadYoutubeAPI(): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('YouTube API requires a browser'));
  }

  const win = window as Window & {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  };

  if (win.YT?.Player) {
    return Promise.resolve(win.YT);
  }

  if (youtubeApiPromise) {
    return youtubeApiPromise;
  }

  youtubeApiPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]'
    );

    const timeout = window.setTimeout(() => {
      youtubeApiPromise = null;
      if (existingScript && existingScript.parentNode) {
        existingScript.parentNode.removeChild(existingScript);
      }
      reject(new Error('Timed out loading YouTube IFrame API'));
    }, 15000);

    const previousCallback = win.onYouTubeIframeAPIReady;

    win.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeout);
      previousCallback?.();

      if (!win.YT?.Player) {
        youtubeApiPromise = null;
        reject(new Error('YouTube API loaded without YT.Player'));
        return;
      }

      resolve(win.YT);
    };

    if (existingScript) {
      // Nếu script đã tồn tại trong DOM nhưng sự kiện ready chưa được gọi/hoặc bị lỡ (ví dụ do HMR/hot-reload),
      // thiết lập kiểm tra định kỳ để giải phóng Promise khi YT.Player khả dụng.
      const checkInterval = setInterval(() => {
        if (win.YT?.Player) {
          clearInterval(checkInterval);
          window.clearTimeout(timeout);
          resolve(win.YT);
        }
      }, 500);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;

    script.onerror = () => {
      window.clearTimeout(timeout);
      youtubeApiPromise = null;
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      reject(new Error('Failed to load YouTube IFrame API'));
    };

    document.head.appendChild(script);
  });

  return youtubeApiPromise;
}

export default function YoutubePlayer({
  roomId,
  videoId,
  isPlaying,
  seekTime,
  duration,
  reactions = [],
  viewMode = 'video',
  isWaitingForOthers = false,
  waitingCount = 0,
  onPlayerStateChange,
  onVideoEnded,
  onVideoTitleLoaded,
  onTimeUpdate,
}: YoutubePlayerProps) {
  const playerContainerId = `yt-player-${roomId}`;
  const playerRef = useRef<any>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [isAutoplayBlocked, setIsAutoplayBlocked] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [waitingSeconds, setWaitingSeconds] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [fetchedDuration, setFetchedDuration] = useState<string | undefined>(undefined);
  const endedTriggeredRef = useRef<string | null>(null);

  // Reset ended trigger when videoId changes
  useEffect(() => {
    endedTriggeredRef.current = null;
  }, [videoId]);

  // Use refs to store changing props to avoid stale closures in player callbacks
  const latestProps = useRef({
    videoId,
    isPlaying,
    seekTime,
    onPlayerStateChange,
    onVideoEnded,
    onVideoTitleLoaded,
    onTimeUpdate,
  });

  useEffect(() => {
    latestProps.current = {
      videoId,
      isPlaying,
      seekTime,
      onPlayerStateChange,
      onVideoEnded,
      onVideoTitleLoaded,
      onTimeUpdate,
    };
  }, [videoId, isPlaying, seekTime, onPlayerStateChange, onVideoEnded, onVideoTitleLoaded, onTimeUpdate]);

  // Convert duration string (e.g., "03:45" or "01:15:30") to seconds
  const parseDurationToSeconds = (durationStr?: string): number => {
    if (!durationStr) return 0;
    const parts = durationStr.split(':').map(Number);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  };

  // Try to fetch duration lazily if it was missing
  useEffect(() => {
    if (videoId && !duration) {
      fetch(`/api/video-info?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`)
        .then(res => res.json())
        .then(data => {
          if (data.duration) setFetchedDuration(data.duration);
        })
        .catch(() => {});
    } else {
      setFetchedDuration(undefined);
    }
  }, [videoId, duration]);

  const activeDuration = duration || fetchedDuration;
  const totalDurationSeconds = parseDurationToSeconds(activeDuration);

  const initialSeekRef = useRef<number | null>(null);

  // Initialize YouTube IFrame Player
  useEffect(() => {
    if (!roomId) return;

    let player: any = null;
    let cancelled = false;

    loadYoutubeAPI()
      .then((YT) => {
        if (cancelled) return;

        player = new YT.Player(playerContainerId, {
          height: '100%',
          width: '100%',
          videoId: latestProps.current.videoId || '',
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: latestProps.current.isPlaying ? 1 : 0,
            controls: 0,        // Hide native controls
            disablekb: 1,       // Disable keyboard controls
            fs: 0,              // Disable fullscreen button
            rel: 0,             // Don't show related videos
            showinfo: 0,
            iv_load_policy: 3,
            origin: typeof window !== 'undefined' ? window.location.origin : '',
          },
          events: {
            onReady: (event: any) => {
              if (cancelled) return;
              playerRef.current = event.target;
              setPlayerReady(true);
              event.target.setVolume(isMuted ? 0 : volume);
              
              const currentVideoId = latestProps.current.videoId;
              if (currentVideoId) {
                const currentSeekTime = latestProps.current.seekTime;
                if (initialSeekRef.current !== null) {
                  event.target.seekTo(initialSeekRef.current, true);
                  setCurrentTime(Math.floor(initialSeekRef.current));
                  initialSeekRef.current = null;
                } else if (currentSeekTime !== null && currentSeekTime !== undefined) {
                  event.target.seekTo(currentSeekTime, true);
                  setCurrentTime(Math.floor(currentSeekTime));
                }

                if (latestProps.current.isPlaying) {
                  event.target.playVideo();
                } else {
                  event.target.pauseVideo();
                }

                // Trigger video title loading
                if (typeof event.target.getVideoData === 'function') {
                  const videoData = event.target.getVideoData();
                  if (videoData && videoData.title) {
                    latestProps.current.onVideoTitleLoaded(currentVideoId, videoData.title);
                  }
                }
              }
            },
            onStateChange: (event: any) => {
              if (cancelled) return;
              
              const currentVideoId = latestProps.current.videoId;
              const current = event.target.getCurrentTime?.() ?? 0;
              
              if (event.data === YT.PlayerState.PLAYING) {
                setIsBuffering(false);
                setIsAutoplayBlocked(false);
                latestProps.current.onPlayerStateChange('PLAYING', current);
                
                // Revert manual play if app state is paused
                if (!latestProps.current.isPlaying) {
                  event.target.pauseVideo();
                }
                
                // Trigger title load if not loaded yet
                if (currentVideoId && typeof event.target.getVideoData === 'function') {
                  const videoData = event.target.getVideoData();
                  if (videoData && videoData.title) {
                    latestProps.current.onVideoTitleLoaded(currentVideoId, videoData.title);
                  }
                }
              } else if (event.data === YT.PlayerState.PAUSED) {
                setIsBuffering(false);
                latestProps.current.onPlayerStateChange('PAUSED', current);
                
                // Revert manual pause if app state is playing
                if (latestProps.current.isPlaying) {
                  event.target.playVideo();
                  setIsAutoplayBlocked(true); // Autoplay might be blocked by browser
                }
              } else if (event.data === YT.PlayerState.BUFFERING || event.data === YT.PlayerState.UNSTARTED) {
                setIsBuffering(true);
              } else if (event.data === YT.PlayerState.ENDED) {
                setIsBuffering(false);
                if (currentVideoId && endedTriggeredRef.current !== currentVideoId) {
                  endedTriggeredRef.current = currentVideoId;
                  latestProps.current.onVideoEnded();
                }
              }
            },
            onAutoplayBlocked: () => {
              if (cancelled) return;
              setIsAutoplayBlocked(true);
            },
            onError: (errEvent: any) => {
              console.error('YouTube player error:', errEvent.data);
            }
          },
        });
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load YouTube API:', err);
        }
      });

    return () => {
      cancelled = true;
      if (player && typeof player.destroy === 'function') {
        player.destroy();
      }
      playerRef.current = null;
    };
  }, [roomId]);

  // Handle videoId updates
  useEffect(() => {
    if (!playerReady || !playerRef.current) return;
    const player = playerRef.current;

    if (!videoId) {
      player.stopVideo();
      return;
    }

    const data = player.getVideoData?.();
    const currentVideoId = data?.video_id ?? '';

    if (currentVideoId !== videoId) {
      setIsBuffering(true); // Indicate loading for new video
      const startSeconds = seekTime ?? 0;
      if (isPlaying) {
        player.loadVideoById({
          videoId,
          startSeconds,
        });
      } else {
        player.cueVideoById({
          videoId,
          startSeconds,
        });
      }
    }
  }, [videoId, playerReady]);

  // Handle play/pause state change
  useEffect(() => {
    if (!playerReady || !playerRef.current || !videoId) return;
    const player = playerRef.current;
    if (isPlaying) {
      player.playVideo();
    } else {
      player.pauseVideo();
    }
  }, [isPlaying, videoId, playerReady]);

  // Handle seekTime updates
  useEffect(() => {
    if (seekTime !== null && seekTime !== undefined) {
      if (playerReady && playerRef.current && videoId) {
        playerRef.current.seekTo(seekTime, true);
        setCurrentTime(Math.floor(seekTime));
        if (isPlaying) {
          playerRef.current.playVideo();
        }
      } else {
        initialSeekRef.current = seekTime;
      }
    }
  }, [seekTime, videoId, playerReady, isPlaying]);

  // Handle volume/mute updates
  useEffect(() => {
    if (!playerReady || !playerRef.current) return;
    playerRef.current.setVolume(isMuted ? 0 : volume);
  }, [volume, isMuted, playerReady]);

  // Autoplay fallback check
  useEffect(() => {
    if (!playerReady || !isPlaying || !videoId) return;

    const checkTimeout = setTimeout(() => {
      if (playerRef.current) {
        const state = playerRef.current.getPlayerState?.();
        // If state is not PLAYING (1) and not BUFFERING (3), show autoplay block overlay
        if (state !== 1 && state !== 3) {
          setIsAutoplayBlocked(true);
        }
      }
    }, 2500);

    return () => clearTimeout(checkTimeout);
  }, [playerReady, isPlaying, videoId]);

  // Poll current time and trigger parent callback
  useEffect(() => {
    if (!playerReady || !playerRef.current || !isPlaying || !videoId) return;

    const interval = setInterval(() => {
      const player = playerRef.current;
      if (player && typeof player.getCurrentTime === 'function') {
        const time = player.getCurrentTime();
        setCurrentTime(Math.floor(time));
        latestProps.current.onTimeUpdate?.(time);

        // Fallback: If time reaches near the end but YouTube's ENDED event didn't trigger
        // (especially common in hidden iframe / Audio Only mode, or background tabs)
        const dur = player.getDuration() || totalDurationSeconds;
        if (dur > 0 && time >= dur - 1.5) {
          if (endedTriggeredRef.current !== videoId) {
            endedTriggeredRef.current = videoId;
            latestProps.current.onVideoEnded();
          }
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isPlaying, videoId, playerReady, totalDurationSeconds]);

  // Poll duration if missing
  useEffect(() => {
    if (!playerReady || !playerRef.current || !videoId) {
      setPlayerDuration(0);
      return;
    }

    const interval = setInterval(() => {
      const player = playerRef.current;
      if (player && typeof player.getDuration === 'function') {
        const dur = player.getDuration();
        if (dur > 0) {
          setPlayerDuration(dur);
          clearInterval(interval);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [videoId, playerReady]);

  // Track waiting time for UI countdown
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isWaitingForOthers) {
      setWaitingSeconds(0);
      interval = setInterval(() => {
        setWaitingSeconds(prev => prev + 1);
      }, 1000);
    } else {
      setWaitingSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isWaitingForOthers]);

  const activeDurationSeconds = totalDurationSeconds || playerDuration;
  const activeDurationFormatted = activeDuration || (activeDurationSeconds ? formatTime(activeDurationSeconds) : undefined);

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
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs text-muted flex items-center gap-2 font-semibold uppercase tracking-wider">
          <Music size={15} className="text-purple-400" />
          {viewMode === 'video' ? 'Phòng Chiếu Video (YouTube)' : 'Đài Phát Nhạc (Audio Only)'}
        </span>
      </div>

      {/* PLAYER / VISUALIZER CONTAINER */}
      <div 
        className="relative w-full flex-1 min-h-0 rounded-xl overflow-hidden bg-black-60 border border-white-5 shadow-inner flex flex-col items-center justify-center p-6"
        style={{
          background: 'radial-gradient(circle, rgba(26,20,45,0.9) 0%, rgba(10,8,20,1) 100%)'
        }}
      >
        {/* Browser Autoplay Block Overlay */}
        {isAutoplayBlocked && isPlaying && (
          <div 
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-30 transition-all cursor-pointer animate-fade-in"
            onClick={() => {
              setIsAutoplayBlocked(false);
              const player = playerRef.current;
              if (player && typeof player.playVideo === 'function') {
                player.playVideo();
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

        {/* Waiting For Others Overlay */}
        {isWaitingForOthers && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center z-30 animate-fade-in"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-4 text-4xl"
              style={{
                background: 'rgba(168,85,247,0.15)',
                border: '1.5px solid rgba(168,85,247,0.4)',
                animation: 'spin 2s linear infinite'
              }}
            >
              ⏳
            </div>
            <h3 className="font-bold text-base text-white mb-1">Đang chờ mọi người...</h3>
            <p className="text-xs text-neutral-400 text-center max-w-xs leading-relaxed">
              {waitingCount > 0
                ? `Còn ${waitingCount} người chưa nghe xong bài này.`
                : 'Tất cả đã nghe xong. Đang chuyển bài...'}
            </p>
            {waitingSeconds > 3 && (
              <p className="text-[11px] text-red-400/90 mt-2 font-mono bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                Sẽ tự động chuyển bài sau {Math.max(0, 15 - waitingSeconds)}s
              </p>
            )}
            <p className="text-[10px] text-purple-400 mt-3 font-mono">
              Timeline chung • Chờ người cuối cùng
            </p>
          </div>
        )}

        {/* Loading / Buffering Overlay */}
        {(isBuffering || (!playerReady && videoId)) && !isWaitingForOthers && !isAutoplayBlocked && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center z-25 animate-fade-in pointer-events-none"
            style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
          >
            <div className="w-12 h-12 rounded-full border-4 border-purple-500/30 border-t-purple-500 animate-spin mb-3"></div>
            <h3 className="font-semibold text-sm text-white">Đang tải nhạc...</h3>
          </div>
        )}

        {/* Floating Reactions Overlay */}
        {reactions.map(reaction => (
          <div
            key={reaction.id}
            className="emoji-reaction"
            style={{
              left: `${reaction.x}%`,
              bottom: '10%',
              zIndex: 30
            }}
          >
            {reaction.emoji}
          </div>
        ))}

        {/* YouTube Iframe wrapper - styled according to viewMode */}
        <div 
          className={viewMode === 'video' && videoId ? 'w-full h-full relative z-10' : 'pointer-events-none'}
          style={viewMode === 'video' && videoId ? {} : {
            width: '1px',
            height: '1px',
            position: 'absolute',
            left: '-9999px',
            opacity: 0.01,
            zIndex: 10
          }}
        >
          <div id={playerContainerId} className="w-full h-full" />
          {/* Overlay to block direct interactions and force chat controls */}
          <div className="absolute inset-0 z-20 bg-transparent cursor-default" />
        </div>

        {/* Empty Room State */}
        {!videoId && (
          <div className="flex flex-col items-center justify-center text-center z-10">
            <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4 text-purple-400 animate-spin-slow">
              <Music size={28} />
            </div>
            <h3 className="font-bold text-lg text-white mb-1.5">Phòng Đang Trống Nhạc</h3>
            <p className="text-xs text-neutral-400 max-w-xs leading-relaxed">
              Gõ lệnh <code className="bg-white/5 px-1 py-0.5 rounded text-cyan-400">/play &lt;link&gt;</code> hoặc tìm kiếm nhạc phía trên để phát cùng mọi người!
            </p>
          </div>
        )}

        {/* Vinyl & Visualizer shown ONLY in audio mode */}
        {videoId && viewMode === 'audio' && (
          <div className="flex flex-col items-center justify-center w-full h-full relative z-10 animate-fade-in">
            {/* Spinning Vinyl Record */}
            <div className="relative mb-6 group">
              <div 
                className={`absolute inset-0 rounded-full blur-xl transition-all duration-1000 ${
                  isPlaying ? 'bg-purple-500/20 scale-125 opacity-100' : 'bg-transparent scale-100 opacity-0'
                }`}
              />
              <div 
                className={`w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-[#08070e] border-4 border-[#242135] shadow-2xl flex items-center justify-center relative overflow-hidden ${
                  isPlaying && !isBuffering ? 'animate-spin-slow' : ''
                }`}
                style={{
                  boxShadow: '0 0 40px rgba(139, 92, 246, 0.15), inset 0 0 20px rgba(0,0,0,0.8)'
                }}
              >
                <div className="absolute inset-2 rounded-full border border-neutral-800/40 opacity-50" />
                <div className="absolute inset-6 rounded-full border border-neutral-800/40 opacity-50" />
                <div className="absolute inset-10 rounded-full border border-neutral-800/40 opacity-50" />
                <div className="absolute inset-14 rounded-full border border-neutral-800/40 opacity-50" />
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-purple-600 to-pink-500 flex items-center justify-center border-2 border-[#08070e] z-10">
                  <Music size={16} className="text-white animate-pulse" />
                </div>
              </div>
            </div>

            {/* Simulated Equalizer Waveform Bars */}
            <div className="flex items-end gap-1 h-12 mt-2 w-full justify-center max-w-sm px-4">
              {Array.from({ length: 24 }).map((_, i) => {
                const delay = `${(i * 0.08).toFixed(2)}s`;
                const barHeight = 20 + ((i * 37) % 75);
                const animationDuration = `${(0.5 + ((i * 13) % 8) / 10).toFixed(2)}s`;
                return (
                  <div
                    key={i}
                    className={`w-1 rounded-full transition-all duration-300 ${
                      isPlaying 
                        ? 'bg-gradient-to-t from-purple-500 to-cyan-400' 
                        : 'bg-neutral-800 h-1'
                    }`}
                    style={isPlaying ? {
                      height: `${barHeight}%`,
                      animation: `equalize ${animationDuration} ease-in-out ${delay} infinite alternate`
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

      {/* UINIFIED TIMELINE & VOLUME CONTROL BAR */}
      {videoId && (
        <div 
          className="bg-white-02 border border-white-5 rounded-xl flex-shrink-0"
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '20px',
            padding: '12px'
          }}
        >
          
          {/* TIMELINE COMPONENT */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
            {/* Current Time */}
            <span className="text-xs font-mono tabular-nums text-neutral-400 select-none shrink-0" style={{ fontSize: '11px' }}>
              {formatTime(currentTime)}
            </span>

            {/* Slider track */}
            <div className="relative flex-1 group">
              <div
                className="w-full rounded-full overflow-hidden relative"
                style={{ height: '6px', backgroundColor: 'rgba(255,255,255,0.08)' }}
              >
                {activeDurationSeconds > 0 ? (
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-linear"
                    style={{
                      width: `${Math.min(100, (currentTime / activeDurationSeconds) * 100)}%`,
                      background: 'linear-gradient(to right, #a855f7, #06b6d4)',
                      boxShadow: '0 0 8px rgba(168,85,247,0.6)'
                    }}
                  />
                ) : (
                  <div
                    className="h-full rounded-full w-1/3 absolute"
                    style={{
                      background: 'linear-gradient(to right, transparent, #a855f7, transparent)',
                      animation: 'shimmerProgress 2s ease-in-out infinite'
                    }}
                  />
                )}
              </div>

              {activeDurationSeconds > 0 && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-lg border-2 border-purple-400 pointer-events-none"
                  style={{
                    left: `clamp(0px, calc(${Math.min(100, (currentTime / activeDurationSeconds) * 100)}% - 6px), calc(100% - 12px))`,
                    transition: 'left 0.5s linear',
                    boxShadow: '0 0 8px rgba(168,85,247,0.8)'
                  }}
                />
              )}
            </div>

            {/* Total Duration */}
            <span className="text-xs font-mono tabular-nums text-neutral-500 select-none shrink-0" style={{ fontSize: '11px' }}>
              {activeDurationFormatted || '--:--'}
            </span>
          </div>

          {/* VOLUME COMPONENT */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, width: '160px', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '12px' }}>
            <button
              onClick={toggleMute}
              className="flex items-center justify-center text-neutral-400 w-7 h-7 rounded-lg transition-colors hover:text-white"
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
            <span className="text-xs text-neutral-400 font-mono text-right shrink-0" style={{ fontSize: '10px', width: '36px' }}>
              {isMuted ? 0 : volume}%
            </span>
          </div>

        </div>
      )}
    </div>
  );
}
