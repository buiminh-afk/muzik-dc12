'use client';

import { useState, useEffect, useMemo } from 'react';
import { ListMusic, Disc, ArrowUpToLine, X, Music } from 'lucide-react';

export interface PlaylistItem {
  id: string;
  videoId: string;
  title: string;
  thumbnail?: string;
  addedBy: string;
  duration?: string;
}

interface QueueListProps {
  queue: PlaylistItem[];
  currentItemId: string | null;
  isPlaying: boolean;
  username: string;
  isHost: boolean;
  onRemoveItem: (id: string) => void;
  onPlayItem: (id: string) => void;
  onMoveNext: (id: string) => void;
}

// Component Thumbnail riêng biệt có xử lý Fallback đa tầng
function QueueThumbnail({
  videoId,
  title,
  rawThumbnail,
}: {
  videoId: string;
  title: string;
  rawThumbnail?: string;
}) {
  const candidates = useMemo(() => [
    rawThumbnail,
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
  ].filter((value): value is string => Boolean(value)), [videoId, rawThumbnail]);

  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [videoId, rawThumbnail]);

  const imgSrc = candidates[candidateIndex];

  return (
    <div className="relative w-20 aspect-video shrink-0 overflow-hidden rounded-md bg-black border border-white/5 flex items-center justify-center shadow-sm">
      {imgSrc ? (
        <img
          src={imgSrc}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => {
            setCandidateIndex((current) => current + 1);
          }}
        />
      ) : (
        <div
          role="img"
          aria-label={`Không có ảnh bìa cho ${title}`}
          className="flex h-full w-full items-center justify-center bg-gradient-to-br from-purple-900/40 to-neutral-900 text-purple-400"
        >
          <Music size={20} />
        </div>
      )}
    </div>
  );
}

export default function QueueList({
  queue,
  currentItemId,
  isPlaying,
  username,
  isHost,
  onRemoveItem,
  onPlayItem,
  onMoveNext,
}: QueueListProps) {
  const currentIndex = currentItemId
    ? queue.findIndex((item) => item.id === currentItemId)
    : -1;

  return (
    <>
      <style>{`
        @keyframes equalize {
          0%, 100% { transform: scaleY(0.4); }
          50% { transform: scaleY(1); }
        }
        .music-bar {
          width: 3px;
          background-color: #a855f7;
          border-radius: 2px;
          animation: equalize 1s ease-in-out infinite;
          transform-origin: bottom;
        }
        .music-bar-paused {
          animation-play-state: paused !important;
        }
        .queue-item {
          background-color: rgba(255, 255, 255, 0.03);
          border-color: transparent;
          color: var(--text-muted);
        }
        .queue-item:hover {
          background-color: rgba(255, 255, 255, 0.07);
          border-color: rgba(255, 255, 255, 0.05);
        }
        .queue-item-playing {
          background-color: rgba(139, 92, 246, 0.1);
          border-color: rgba(139, 92, 246, 0.3);
          color: var(--accent-primary);
        }
        body.light .queue-item {
          background-color: rgba(0, 0, 0, 0.02);
          color: var(--text-main);
        }
        body.light .queue-item:hover {
          background-color: rgba(0, 0, 0, 0.05);
          border-color: rgba(0, 0, 0, 0.05);
        }
        body.light .queue-item-playing {
          background-color: rgba(109, 40, 217, 0.08);
          border-color: rgba(109, 40, 217, 0.2);
        }
      `}</style>
      <div className="flex flex-col h-full w-full">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4 shrink-0 px-2 select-none">
          <ListMusic size={20} className="text-purple-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex-1">
            Hàng Đợi ({queue.length})
          </span>
        </div>

        {/* Queue List */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-4 custom-scrollbar" style={{ paddingRight: '8px' }}>
          {queue.length === 0 ? (
            <div
              className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-white/[0.02] border border-white/5 rounded-2xl min-h-[160px] select-none"
              style={{ borderStyle: 'dashed' }}
            >
              <Disc size={32} className="text-neutral-600 mb-3 animate-spin-slow" />
              <p className="text-sm text-neutral-500">Chưa có bài hát nào trong hàng đợi</p>
            </div>
          ) : (
            queue.map((item, index) => {
              const isPlayingNow = item.id === currentItemId;
              const isNextUp = currentIndex >= 0 ? index === currentIndex + 1 : index === 0;

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    if (isHost && !isPlayingNow) {
                      onPlayItem(item.id);
                    }
                  }}
                  className={`group relative flex items-center gap-4 px-4 py-3 w-full rounded-xl transition-all duration-200 border ${
                    isPlayingNow
                      ? 'queue-item-playing shadow-sm cursor-default'
                      : `queue-item text-neutral-300 ${isHost ? 'cursor-pointer' : 'cursor-default'}`
                  }`}
                >
                  {/* 1. STT / Icon Đang phát */}
                  <div className="w-7 shrink-0 flex items-center justify-center select-none">
                    <span className={`text-[13px] transition-colors ${
                      isPlayingNow ? 'text-purple-400 font-bold' : 'text-neutral-500 font-semibold group-hover:text-neutral-300'
                    }`}>
                      {index + 1}
                    </span>
                  </div>

                  {/* 2. Thumbnail chuẩn nét & không vỡ */}
                  <QueueThumbnail
                    videoId={item.videoId}
                    title={item.title}
                    rawThumbnail={item.thumbnail}
                  />

                  {/* 3. Info (Cắt tên cực gọn) */}
                  <div className="flex-1 min-w-0 overflow-hidden flex flex-col justify-center">
                    <h4
                      className={`text-xs leading-snug truncate block w-full ${
                        isPlayingNow
                          ? 'font-bold text-purple-300'
                          : isNextUp
                          ? 'font-semibold text-cyan-300'
                          : 'font-semibold text-neutral-200 group-hover:text-white'
                      }`}
                      style={{ maxWidth: '400px' }}
                      title={item.title}
                    >
                      {item.title}
                    </h4>

                    <p className="text-xs text-neutral-500 truncate w-full mt-1 flex items-center gap-2 flex-wrap">
                      {isNextUp && <span className="text-cyan-500/70 mr-1 select-none">▶ Tiếp theo •</span>}
                      <span>Thêm bởi <span className="text-neutral-400 font-medium">{item.addedBy}</span></span>
                      {item.duration && (
                        <span className="text-neutral-500 select-none">• {item.duration}</span>
                      )}
                      {isPlayingNow && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider select-none ${
                          isPlaying 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isPlaying ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                          {isPlaying ? 'ON AIR' : 'PAUSED'}
                        </span>
                      )}
                    </p>
                  </div>

                  {/* 4. Actions tinh tế theo style Dark Minimal */}
                  <div className="shrink-0 flex items-center pl-2 select-none" style={{ paddingRight: '4px' }}>
                    {isPlayingNow ? (
                      <div className="flex items-center gap-1.5">
                        <div className="flex items-end justify-center gap-[4px] w-8 h-5 mr-1 group-hover:hidden">
                          <div className={`music-bar h-full ${!isPlaying ? 'music-bar-paused' : ''}`} style={{ width: '4px', animationDelay: '0s' }} />
                          <div className={`music-bar h-full ${!isPlaying ? 'music-bar-paused' : ''}`} style={{ width: '4px', animationDelay: '0.3s' }} />
                          <div className={`music-bar h-full ${!isPlaying ? 'music-bar-paused' : ''}`} style={{ width: '4px', animationDelay: '0.6s' }} />
                          <div className={`music-bar h-full ${!isPlaying ? 'music-bar-paused' : ''}`} style={{ width: '4px', animationDelay: '0.2s' }} />
                        </div>
                        {/* Show delete button on hover for host or owner */}
                        {(isHost || item.addedBy === username) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveItem(item.id);
                            }}
                            className="hidden group-hover:flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-rose-500/20 active:scale-90 transition-all border-none bg-transparent cursor-pointer"
                            title="Xóa khỏi hàng đợi"
                            aria-label={`Xóa bài ${item.title} khỏi hàng đợi`}
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        {/* Nút đẩy lên phát tiếp - chỉ hiện cho host */}
                        {isHost && !isNextUp && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onMoveNext(item.id);
                            }}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:text-purple-300 hover:bg-purple-500/20 active:scale-90 transition-all border-none bg-transparent cursor-pointer"
                            title="Đưa lên phát tiếp"
                            aria-label={`Đưa bài ${item.title} lên phát tiếp`}
                          >
                            <ArrowUpToLine size={16} />
                          </button>
                        )}

                        {/* Nút xoá - hiện cho host HOẶC người thêm bài */}
                        {(isHost || item.addedBy === username) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveItem(item.id);
                            }}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-rose-500/20 active:scale-90 transition-all border-none bg-transparent cursor-pointer"
                            title="Xóa khỏi hàng đợi"
                            aria-label={`Xóa bài ${item.title} khỏi hàng đợi`}
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}