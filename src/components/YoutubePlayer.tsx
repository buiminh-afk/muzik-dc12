'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { AlertCircle, Eye, EyeOff, Music, Volume2, VolumeX, Volume1 } from 'lucide-react';

interface YoutubePlayerProps {
  videoId: string | null;
  isPlaying: boolean;
  seekTime: number | null;
  playlistIdToLoad: string | null;
  onPlayerStateChange: (state: 'PLAYING' | 'PAUSED', time: number) => void;
  onVideoEnded: () => void;
  onLocalSeek: (time: number) => void;
  onPlaylistLoaded: (videoIds: string[]) => void;
  onVideoTitleLoaded: (videoId: string, title: string) => void;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

// Format giây thành mm:ss
function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function YoutubePlayer({
  videoId,
  isPlaying,
  seekTime,
  playlistIdToLoad,
  onPlayerStateChange,
  onVideoEnded,
  onLocalSeek,
  onPlaylistLoaded,
  onVideoTitleLoaded,
}: YoutubePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVideoVisible, setIsVideoVisible] = useState(true);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [isAutoplayBlocked, setIsAutoplayBlocked] = useState(false);

  // Timeline state
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Biến lock để tránh vòng lặp vô tận của sự kiện sync
  const isSyncingRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);

  // Cập nhật thanh tiến trình liên tục khi đang phát
  useEffect(() => {
    if (isPlaying && isPlayerReady && playerRef.current) {
      progressIntervalRef.current = setInterval(() => {
        if (playerRef.current) {
          try {
            const ct = playerRef.current.getCurrentTime() || 0;
            const dur = playerRef.current.getDuration() || 0;
            const state = playerRef.current.getPlayerState();
            
            setCurrentTime(ct);
            setDuration(dur);
            
            // Nếu trình duyệt chặn tự động phát (ví dụ: người dùng mới vào phòng)
            if (state !== window.YT.PlayerState.PLAYING && state !== window.YT.PlayerState.BUFFERING) {
              setIsAutoplayBlocked(true);
            } else {
              setIsAutoplayBlocked(false);
              // Liên tục cập nhật ref thời gian của RoomClient để phục vụ sync chính xác khi có user mới
              onPlayerStateChange('PLAYING', ct);
            }
          } catch (e) {}
        }
      }, 500);
    } else {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [isPlaying, isPlayerReady]);

  // 1. Tải YouTube IFrame Player API
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);

      window.onYouTubeIframeAPIReady = () => {
        if (videoId) {
          initPlayer(videoId);
        } else if (playlistIdToLoad) {
          initPlayerWithPlaylist(playlistIdToLoad);
        }
      };
    } else {
      if (videoId) {
        initPlayer(videoId);
      } else if (playlistIdToLoad) {
        initPlayerWithPlaylist(playlistIdToLoad);
      }
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, []);

  // Khởi tạo Player bằng videoId đơn lẻ
  const initPlayer = (initialVideoId: string) => {
    if (!containerRef.current || playerRef.current || !initialVideoId) return;

    try {
      playerRef.current = new window.YT.Player('yt-player-iframe', {
        height: '100%',
        width: '100%',
        videoId: initialVideoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          origin: typeof window !== 'undefined' ? window.location.origin : '',
        },
        events: {
          onReady: (event: any) => {
            setIsPlayerReady(true);
            setError(null);
            
            // Luôn bắt đầu phát khi player ready
            event.target.playVideo();

            // Nếu có thời gian tua đang chờ (đồng bộ khi người dùng mới vào phòng)
            if (pendingSeekRef.current !== null && pendingSeekRef.current > 0) {
              const targetTime = pendingSeekRef.current;
              pendingSeekRef.current = null; // Đã tiêu thụ
              setTimeout(() => {
                try {
                  event.target.seekTo(targetTime, true);
                  setCurrentTime(targetTime);
                } catch (e) {}
              }, 300);
            }

            // Lấy tiêu đề
            try {
              const title = playerRef.current.getVideoData()?.title;
              const currentId = playerRef.current.getVideoData()?.video_id;
              if (title && currentId) {
                onVideoTitleLoaded(currentId, title);
              }
            } catch (e) {}
          },
          onStateChange: handlePlayerStateChange,
          onError: (e: any) => {
            console.error('Lỗi YouTube Player:', e.data);
            setError('Không thể phát video này. Có thể video bị hạn chế bản quyền hoặc không tồn tại.');
          },
        },
      });
    } catch (err) {
      console.error('Không thể tạo YouTube Player:', err);
      setError('Đã xảy ra lỗi khi tải trình phát YouTube.');
    }
  };

  // Khởi tạo Player bằng Playlist ID
  const initPlayerWithPlaylist = (playlistId: string) => {
    if (!containerRef.current || playerRef.current || !playlistId) return;

    try {
      playerRef.current = new window.YT.Player('yt-player-iframe', {
        height: '100%',
        width: '100%',
        playerVars: {
          listType: 'playlist',
          list: playlistId,
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          origin: typeof window !== 'undefined' ? window.location.origin : '',
        },
        events: {
          onReady: (event: any) => {
            setIsPlayerReady(true);
            setError(null);

            // Nếu có thời gian tua đang chờ (đồng bộ khi người dùng mới vào phòng)
            if (pendingSeekRef.current !== null && pendingSeekRef.current > 0) {
              const targetTime = pendingSeekRef.current;
              pendingSeekRef.current = null; // Đã tiêu thụ
              setTimeout(() => {
                try {
                  event.target.seekTo(targetTime, true);
                  setCurrentTime(targetTime);
                } catch (e) {}
              }, 300);
            }

            setTimeout(() => {
              try {
                const playlistIds = playerRef.current.getPlaylist();
                if (playlistIds && playlistIds.length > 0) {
                  onPlaylistLoaded(playlistIds);
                }
              } catch (err) {
                console.error('Lỗi khi getPlaylist trong onReady:', err);
              }
            }, 1500);
          },
          onStateChange: handlePlayerStateChange,
          onError: (e: any) => {
            console.error('Lỗi YouTube Playlist Player:', e.data);
            setError('Không thể tải danh sách phát này.');
          },
        },
      });
    } catch (err) {
      console.error('Không thể tạo YouTube Playlist Player:', err);
      setError('Đã xảy ra lỗi khi tải trình phát YouTube.');
    }
  };

  // 2. Lắng nghe thay đổi videoId từ props để nạp video hoặc khởi tạo player
  useEffect(() => {
    if (!videoId) {
      if (playerRef.current && isPlayerReady) {
        playerRef.current.stopVideo();
      }
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    if (window.YT && !playerRef.current) {
      initPlayer(videoId);
      return;
    }

    if (isPlayerReady && playerRef.current) {
      try {
        const currentVideoId = playerRef.current.getVideoData?.()?.video_id;
        if (currentVideoId !== videoId) {
          isSyncingRef.current = true;
          
          const targetTime = pendingSeekRef.current !== null ? pendingSeekRef.current : 0;
          if (pendingSeekRef.current !== null) {
            pendingSeekRef.current = null; // Đã tiêu thụ
          }
          
          // Nếu trạng thái phòng đang phát (isPlaying = true), phát luôn bài mới.
          // Nếu đang tạm dừng, chỉ nạp ảnh chờ (cue).
          if (isPlaying) {
            playerRef.current.loadVideoById({
              videoId: videoId,
              startSeconds: targetTime,
            });
          } else {
            playerRef.current.cueVideoById({
              videoId: videoId,
              startSeconds: targetTime,
            });
          }
          
          setCurrentTime(0);
          setDuration(0);
          setTimeout(() => {
            isSyncingRef.current = false;
          }, 500);
          setError(null);
        }
      } catch (err) {
        console.error('Lỗi khi nạp video mới:', err);
      }
    }
  }, [videoId, isPlayerReady, isPlaying]);

  // 3. Lắng nghe thay đổi playlistIdToLoad
  useEffect(() => {
    if (!playlistIdToLoad) return;

    if (window.YT && !playerRef.current) {
      initPlayerWithPlaylist(playlistIdToLoad);
      return;
    }

    if (isPlayerReady && playerRef.current) {
      try {
        isSyncingRef.current = true;
        playerRef.current.cuePlaylist({
          listType: 'playlist',
          list: playlistIdToLoad,
          index: 0,
          startSeconds: 0
        });

        setTimeout(() => {
          try {
            const playlistIds = playerRef.current.getPlaylist();
            if (playlistIds && playlistIds.length > 0) {
              onPlaylistLoaded(playlistIds);
            }
          } catch (err) {
            console.error('Lỗi khi getPlaylist:', err);
          }
        }, 1500);
      } catch (err) {
        console.error('Lỗi khi cuePlaylist:', err);
      }
    }
  }, [playlistIdToLoad, isPlayerReady]);

  // 4. Lắng nghe thay đổi isPlaying từ props
  useEffect(() => {
    if (!isPlaying) {
      setIsAutoplayBlocked(false);
    }

    if (!isPlayerReady || !playerRef.current || !videoId) return;

    const playerState = playerRef.current.getPlayerState();
    const isActuallyPlaying = playerState === window.YT.PlayerState.PLAYING;

    let playTimeoutId: NodeJS.Timeout | null = null;

    if (isPlaying && !isActuallyPlaying) {
      isSyncingRef.current = true;
      // Trì hoãn 150ms để bảo đảm nếu có đổi bài hát song song (khi skip từ pause) 
      // thì trình phát YouTube đã hoàn tất nạp bài mới trước khi chạy playVideo()
      playTimeoutId = setTimeout(() => {
        if (playerRef.current) {
          playerRef.current.playVideo();
        }
      }, 150);
      
      setTimeout(() => {
        isSyncingRef.current = false;
      }, 450);
    } else if (!isPlaying && isActuallyPlaying) {
      isSyncingRef.current = true;
      playerRef.current.pauseVideo();
      setTimeout(() => {
        isSyncingRef.current = false;
      }, 300);
    }

    return () => {
      if (playTimeoutId) clearTimeout(playTimeoutId);
    };
  }, [isPlaying, isPlayerReady, videoId]);

  // 5. Lắng nghe thay đổi seekTime từ props
  useEffect(() => {
    if (seekTime !== null) {
      pendingSeekRef.current = seekTime;
    }

    if (!isPlayerReady || !playerRef.current || seekTime === null || !videoId) return;

    const ct = playerRef.current.getCurrentTime();
    const diff = Math.abs(ct - seekTime);

    if (diff > 2) {
      isSyncingRef.current = true;
      playerRef.current.seekTo(seekTime, true);
      setCurrentTime(seekTime);
      pendingSeekRef.current = null; // Đã seek thành công
      setTimeout(() => {
        isSyncingRef.current = false;
      }, 500);
    }
  }, [seekTime, isPlayerReady, videoId]);

  // 6. Tự động đồng bộ trạng thái chơi nhạc và tua video ban đầu ngay sau khi player đã Ready
  useEffect(() => {
    if (isPlayerReady && playerRef.current && videoId) {
      // Đồng bộ trạng thái chơi nhạc ban đầu
      if (isPlaying) {
        playerRef.current.playVideo();
      } else {
        playerRef.current.pauseVideo();
      }

      // Đồng bộ mốc thời gian tua nhạc ban đầu (nếu có)
      if (pendingSeekRef.current !== null) {
        const targetTime = pendingSeekRef.current;
        pendingSeekRef.current = null; // Reset
        
        // Trì hoãn 250ms để player hoàn tất dựng hình và buffer rồi mới seek
        setTimeout(() => {
          if (playerRef.current) {
            playerRef.current.seekTo(targetTime, true);
            setCurrentTime(targetTime);
          }
        }, 250);
      }
    }
  }, [isPlayerReady, videoId]);

  // Xử lý các sự kiện từ iframe
  const handlePlayerStateChange = (event: any) => {
    if (!playerRef.current) return;

    const state = event.data;
    const time = playerRef.current.getCurrentTime() || 0;

    // Cập nhật timeline khi state thay đổi
    setCurrentTime(time);
    try {
      const dur = playerRef.current.getDuration() || 0;
      if (dur > 0) setDuration(dur);
    } catch (e) {}

    // Tự động lấy tiêu đề thật
    if (state === window.YT.PlayerState.PLAYING || state === window.YT.PlayerState.CUED) {
      try {
        const title = playerRef.current.getVideoData()?.title;
        const currentId = playerRef.current.getVideoData()?.video_id;
        if (title && currentId) {
          onVideoTitleLoaded(currentId, title);
        }
      } catch (e) {}
    }

    if (isSyncingRef.current) return;

    // REVERT: chặn user click play/pause trên iframe
    if (state === window.YT.PlayerState.PAUSED && isPlaying) {
      setTimeout(() => {
        if (playerRef.current) {
          isSyncingRef.current = true;
          playerRef.current.playVideo();
          setTimeout(() => { isSyncingRef.current = false; }, 300);
        }
      }, 100);
      return;
    }
    if (state === window.YT.PlayerState.PLAYING && !isPlaying && videoId) {
      setTimeout(() => {
        if (playerRef.current) {
          isSyncingRef.current = true;
          playerRef.current.pauseVideo();
          setTimeout(() => { isSyncingRef.current = false; }, 300);
        }
      }, 100);
      return;
    }

    if (state === window.YT.PlayerState.PLAYING) {
      onPlayerStateChange('PLAYING', time);
    } else if (state === window.YT.PlayerState.PAUSED) {
      onPlayerStateChange('PAUSED', time);
    } else if (state === window.YT.PlayerState.ENDED) {
      onVideoEnded();
    }
  };

  const toggleVideoVisibility = () => {
    setIsVideoVisible(!isVideoVisible);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    if (playerRef.current) {
      playerRef.current.setVolume(val);
      if (val === 0) {
        playerRef.current.mute();
        setIsMuted(true);
      } else {
        playerRef.current.unMute();
        setIsMuted(false);
      }
    }
  };

  const toggleMute = () => {
    if (!playerRef.current) return;
    try {
      // Đọc trạng thái câm thực tế từ API để tránh lệch pha state
      const currentlyMuted = playerRef.current.isMuted();
      if (currentlyMuted) {
        playerRef.current.unMute();
        playerRef.current.setVolume(volume > 0 ? volume : 50);
        setIsMuted(false);
        if (volume === 0) setVolume(50);
      } else {
        playerRef.current.mute();
        setIsMuted(true);
      }
    } catch (err) {
      console.error('Lỗi khi toggle mute:', err);
    }
  };

  const showAudioOnlyOverlay = videoId && !isVideoVisible;
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs text-muted flex items-center gap-1-5 font-semibold uppercase tracking-wider">
          <Music size={12} className="text-purple-400" />
          Trình Phát Nhạc
        </span>
        {videoId && (
          <button
            onClick={toggleVideoVisibility}
            className="flex items-center gap-1-5 text-xs text-muted transition-colors bg-white-5 border border-white-10 px-2-5 py-1 rounded"
            style={{ cursor: 'pointer' }}
            title={isVideoVisible ? "Chuyển sang chế độ chỉ nghe nhạc" : "Hiện màn hình video"}
          >
            {isVideoVisible ? (
              <>
                <EyeOff size={13} />
                Ẩn Video
              </>
            ) : (
              <>
                <Eye size={13} />
                Hiện Video
              </>
            )}
          </button>
        )}
      </div>

      {/* CONTAINER VIDEO */}
      <div 
        className="relative w-full flex-1 min-h-0 rounded-xl overflow-hidden bg-black-60 border border-white-5 shadow-inner flex flex-col items-center justify-center"
      >
        
        {/* Lỗi Video Overlay */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-black-85 z-30 transition-colors">
            <AlertCircle className="text-rose-500 mb-3" size={32} />
            <p className="text-sm font-semibold text-rose-200 max-w-sm mb-4">{error}</p>
            <button 
              onClick={() => { setError(null); if (videoId) initPlayer(videoId); else if (playlistIdToLoad) initPlayerWithPlaylist(playlistIdToLoad); }} 
              className="text-xs px-3 py-1-5 bg-white-10 rounded border border-white-10 text-white transition-colors"
              style={{ cursor: 'pointer' }}
            >
              Thử lại
            </button>
          </div>
        )}

        {/* Màn hình chờ Idle */}
        <div 
          className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-gradient-to-br from-black-80 to-purple-95-20 z-10"
          style={{ 
            opacity: (videoId || playlistIdToLoad) ? 0 : 1, 
            pointerEvents: (videoId || playlistIdToLoad) ? 'none' : 'auto',
            display: (videoId || playlistIdToLoad) ? 'none' : 'flex',
            transition: 'opacity 0.3s ease'
          }}
        >
          <div className="w-16 h-16 rounded-full bg-purple-5-10 border border-purple-5-20 flex items-center justify-center mb-4 text-purple-400 animate-pulse">
            <Music size={28} />
          </div>
          <h3 className="font-bold text-lg text-white mb-1-5">Phòng Đang Trống Nhạc</h3>
          <p className="text-xs text-muted max-w-xs leading-relaxed">
            Dán link YouTube hoặc gõ lệnh chat <code className="bg-white-5 px-1 py-0.5 rounded text-cyan-400">/play &lt;link&gt;</code> để bắt đầu nghe nhạc cùng nhau!
          </p>
        </div>

        {/* Màn hình chỉ nghe nhạc Audio Only - Đổi from-indigo-95 và to-purple-95 đục hoàn toàn */}
        <div 
          className="absolute inset-0 flex flex-col items-center justify-center text-center bg-gradient-to-tr from-indigo-95 to-purple-95 z-15"
          style={{ 
            opacity: showAudioOnlyOverlay ? 1 : 0, 
            pointerEvents: showAudioOnlyOverlay ? 'auto' : 'none',
            display: showAudioOnlyOverlay ? 'flex' : 'none',
            transition: 'opacity 0.3s ease'
          }}
        >
          <div className="relative mb-6">
            <div className="absolute rounded-full blur-xl animate-pulse" style={{ inset: '-16px', backgroundColor: 'rgba(124, 58, 237, 0.3)' }}></div>
            <div className="w-20 h-20 rounded-full bg-purple-5-20 border border-purple-5-40 flex items-center justify-center text-purple-300 relative">
              {isPlaying ? (
                <div className="flex items-end gap-1-5 h-8">
                  <span className="bg-purple-400 rounded-full animate-pulse" style={{ width: '6px', height: '60%' }}></span>
                  <span className="bg-cyan-400 rounded-full animate-pulse" style={{ width: '6px', height: '100%' }}></span>
                  <span className="bg-pink-400 rounded-full animate-pulse" style={{ width: '6px', height: '80%' }}></span>
                  <span className="bg-purple-400 rounded-full animate-pulse" style={{ width: '6px', height: '40%' }}></span>
                </div>
              ) : (
                <Music size={32} />
              )}
            </div>
          </div>
          <span className="text-sm font-semibold text-purple-200">Chế độ Chỉ Nghe Nhạc đang bật</span>
          <span className="text-xs text-muted mt-1">Video đang phát ẩn để tiết kiệm RAM & CPU</span>
        </div>

        {/* LỚP PHỦ TRONG SUỐT TRÊN CÙNG — chặn mọi click trực tiếp vào iframe */}
        {(videoId || playlistIdToLoad) && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 25,
              cursor: 'default',
              background: 'transparent'
            }}
            title="Dùng lệnh /pause hoặc /resume trong khung chat để điều khiển nhạc"
          />
        )}

        {/* MÀN HÌNH BỊ CHẶN AUTOPLAY BỞI TRÌNH DUYỆT */}
        {isAutoplayBlocked && isPlaying && (
          <div 
            className="absolute inset-0 flex flex-col items-center justify-center bg-black-80 z-30 transition-all cursor-pointer animate-fade-in"
            onClick={() => {
               setIsAutoplayBlocked(false);
               if (playerRef.current) {
                 playerRef.current.playVideo();
               }
            }}
            title="Nhấn để tham gia phát nhạc"
          >
            <div className="w-16 h-16 rounded-full bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center mb-4 text-cyan-400 animate-pulse">
               <Volume2 size={32} />
            </div>
            <h3 className="font-bold text-lg text-white mb-2">Bấm để tham gia nghe nhạc</h3>
            <p className="text-xs text-white-60 max-w-xs text-center leading-relaxed">Trình duyệt đã chặn tự động phát do bạn chưa tương tác với trang. Bấm vào đây để đồng bộ cùng mọi người.</p>
          </div>
        )}

        {/* Container bọc ngoài YouTube IFrame - Di chuyển hoàn toàn ra khỏi màn hình khi ẩn video */}
        <div 
          style={{ 
            position: showAudioOnlyOverlay ? 'absolute' : 'relative',
            top: showAudioOnlyOverlay ? '-9999px' : 0,
            left: showAudioOnlyOverlay ? '-9999px' : 0,
            width: showAudioOnlyOverlay ? '1px' : '100%',
            height: showAudioOnlyOverlay ? '1px' : '100%',
            opacity: showAudioOnlyOverlay ? 0 : 1,
            zIndex: 1
          }}
        >
          <div 
            ref={containerRef} 
            id="yt-player-iframe" 
            className="w-full h-full animate-fade-in"
          />
        </div>
      </div>

      {/* THANH ĐIỀU KHIỂN TÙY CHỈNH (CÙNG HÀNG) */}
      {videoId && (
        <div className="flex flex-row items-center justify-between gap-4 p-3 bg-white-02 border border-white-5 rounded-xl flex-shrink-0">
          
          {/* CỘT TRÁI: TIẾN TRÌNH & THỜI GIAN */}
          <div className="flex-1 flex items-center gap-3 min-w-0">
            {/* Chỉ báo trạng thái */}
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

            {/* Progress bar */}
            <div className="flex-1 relative flex items-center min-w-0">
              <div 
                className="w-full rounded-full overflow-hidden bg-white-10"
                style={{ height: '5px' }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${progressPercent}%`,
                    background: isPlaying 
                      ? 'linear-gradient(90deg, #a855f7, #06b6d4)' 
                      : 'rgba(168, 85, 247, 0.5)',
                    transition: 'width 0.5s linear',
                  }}
                />
              </div>
            </div>

            {/* Thời gian */}
            <span className="text-xs text-muted font-mono whitespace-nowrap flex-shrink-0" style={{ fontSize: '11px' }}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* CỘT PHẢI: THÀNH PHẦN ÂM LƯỢNG */}
          <div className="flex items-center gap-2-5 flex-shrink-0 w-32 sm:w-40 border-l border-white-10 pl-3">
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
