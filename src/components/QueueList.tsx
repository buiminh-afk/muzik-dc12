'use client';

import { useState } from 'react';
import {
  ListMusic,
  Disc,
  ArrowUpToLine,
  X,
  Volume2,
  Music,
} from 'lucide-react';

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
  onRemoveItem: (id: string) => void;
  onPlayIndex: (index: number) => void;
  onMoveToTop: (index: number) => void;
}

// Component Thumbnail riêng biệt có xử lý Fallback đa tầng
function QueueThumbnail({ videoId, title }: { videoId: string; title: string; rawThumbnail?: string }) {
  const [imgSrc, setImgSrc] = useState<string>(`https://i.ytimg.com/vi/${videoId}/0.jpg`);
  const [hasError, setHasError] = useState(false);

  const handleError = () => {
    if (imgSrc.includes('i.ytimg.com')) {
      setImgSrc(`https://img.youtube.com/vi/${videoId}/0.jpg`);
    } else {
      setHasError(true);
    }
  };

  return (
    <div className="relative w-20 aspect-video shrink-0 overflow-hidden rounded-md bg-black border border-white/5 flex items-center justify-center shadow-sm">
      {!hasError ? (
        <img
          src={imgSrc}
          alt={title}
          className="h-full w-full object-cover scale-[1.35]"
          onError={handleError}
          loading="lazy"
        />
      ) : (
        <div className="flex items-center justify-center w-full h-full bg-gradient-to-br from-purple-900/40 to-neutral-900 text-purple-400">
          <Music size={20} />
        </div>
      )}
    </div>
  );
}

export default function QueueList({
  queue,
  onRemoveItem,
  onPlayIndex,
  onMoveToTop,
}: QueueListProps) {
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
        .queue-item {
          background-color: rgba(255, 255, 255, 0.03);
          border-color: transparent;
          color: var(--text-muted);
          cursor: pointer;
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
      <div className="flex flex-col h-full w-full select-none">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4 shrink-0 px-2">
          <ListMusic size={20} className="text-purple-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex-1">
            Hàng Đợi ({queue.length})
          </span>
        </div>

        {/* Queue List */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-4 custom-scrollbar" style={{ paddingRight: '8px' }}>
          {queue.length === 0 ? (
            <div
              className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-white/[0.02] border border-white/5 rounded-2xl min-h-[160px]"
              style={{ borderStyle: 'dashed' }}
            >
              <Disc size={32} className="text-neutral-600 mb-3 animate-spin-slow" />
              <p className="text-sm text-neutral-500">Chưa có bài hát nào trong hàng đợi</p>
            </div>
          ) : (
            queue.map((item, index) => {
              const isPlayingNow = index === 0;

              return (
                <div
                  key={item.id}
                  onClick={() => !isPlayingNow && onPlayIndex(index)}
                  className={`group relative flex items-center gap-4 px-4 py-3 w-full rounded-xl transition-all duration-200 border ${
                    isPlayingNow
                      ? 'queue-item-playing shadow-sm'
                      : 'queue-item text-neutral-300'
                  }`}
                >
                  {/* 1. STT / Icon Đang phát */}
                  <div className="w-7 shrink-0 flex items-center justify-center">
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
                          : 'font-semibold text-neutral-200 group-hover:text-white'
                      }`}
                      style={{ maxWidth: '400px' }}
                      title={item.title}
                    >
                      {item.title}
                    </h4>

                    <p className="text-xs text-neutral-500 truncate block w-full mt-1">
                      Thêm bởi <span className="text-neutral-400 font-medium">{item.addedBy}</span>
                    </p>
                  </div>

                  {/* 4. Actions tinh tế theo style Dark Minimal */}
                  <div className="shrink-0 flex items-center pl-2" style={{ paddingRight: '4px' }}>
                    {isPlayingNow ? (
                      <div className="flex items-end justify-center gap-[4px] w-8 h-5 mr-1">
                        <div className="music-bar h-full" style={{ width: '4px', animationDelay: '0s' }} />
                        <div className="music-bar h-full" style={{ width: '4px', animationDelay: '0.3s' }} />
                        <div className="music-bar h-full" style={{ width: '4px', animationDelay: '0.6s' }} />
                        <div className="music-bar h-full" style={{ width: '4px', animationDelay: '0.2s' }} />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            onMoveToTop(index);
                          }}
                          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-neutral-400 hover:text-purple-300 hover:bg-purple-500/20 active:scale-90 transition-all"
                          title="Đưa lên phát tiếp"
                        >
                          <ArrowUpToLine size={16} />
                        </div>

                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveItem(item.id);
                          }}
                          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-rose-500/20 active:scale-90 transition-all"
                          title="Xóa khỏi hàng đợi"
                        >
                          <X size={16} />
                        </div>
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