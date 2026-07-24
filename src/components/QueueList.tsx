'use client';

import {
  ListMusic,
  Disc,
  Play,
  ArrowUpToLine,
  X,
} from 'lucide-react';

export interface PlaylistItem {
  id: string;
  videoId: string;
  title: string;
  thumbnail: string;
  addedBy: string;
  duration?: string;
}

interface QueueListProps {
  queue: PlaylistItem[];
  onRemoveItem: (id: string) => void;
  onPlayIndex: (index: number) => void;
  onMoveToTop: (index: number) => void;
}

export default function QueueList({
  queue,
  onRemoveItem,
  onPlayIndex,
  onMoveToTop,
}: QueueListProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <ListMusic size={18} className="text-purple-400" />
        <span className="text-sm font-semibold uppercase tracking-wider text-muted flex-1">
          Hàng Đợi ({queue.length})
        </span>
      </div>

      <div 
        className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2"
      >
        {queue.length === 0 ? (
          <div 
            className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-white-02 border border-white-5 rounded-xl min-h-120"
            style={{ borderStyle: 'dashed' }}
          >
            <Disc size={28} className="text-white/10 mb-2 animate-spin-slow" style={{ opacity: 0.15 }} />
            <p className="text-xs text-muted">Chưa có bài hát nào trong hàng đợi.</p>
          </div>
        ) : (
          queue.map((item, index) => {
            const isPlayingNow = index === 0;

            return (
              <div
                key={item.id}
                onClick={() => !isPlayingNow && onPlayIndex(index)}
                className={`group relative flex items-center gap-3.5 p-3.5 rounded-xl border transition-all duration-150 ${
                  isPlayingNow
                    ? 'bg-purple-500/10 border-purple-400/20 shadow-md'
                    : 'bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.045] hover:border-white/10'
                }`}
                style={{ cursor: isPlayingNow ? 'default' : 'pointer' }}
                title={isPlayingNow ? 'Đang phát' : 'Nhấp để phát bài hát này ngay'}
              >
                {/* Number or Play indicator */}
                <div className="w-5 text-center text-xs font-semibold text-muted animate-fade-in">
                  {isPlayingNow ? (
                    <span className="flex items-center justify-center">
                      <span className="flex h-2 w-2 relative">
                        <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-purple-400" style={{ opacity: 0.75 }}></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                      </span>
                    </span>
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>

                {/* Thumbnail */}
                <div className="relative w-16 aspect-video rounded overflow-hidden bg-black flex-shrink-0 shadow-md">
                  <img
                    src={item.thumbnail || `https://img.youtube.com/vi/${item.videoId}/default.jpg`}
                    alt={item.title}
                    className="w-full h-full"
                    style={{ objectFit: 'cover' }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100&auto=format&fit=crop&q=60';
                    }}
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h4
                    className={`text-xs font-medium truncate ${
                      isPlayingNow ? 'text-purple-200 font-semibold' : 'text-white'
                    }`}
                    title={item.title}
                  >
                    {item.title}
                  </h4>
                  <p className="text-[10px] text-muted truncate mt-0.5">
                    Thêm bởi: <span className="text-neutral-300">{item.addedBy}</span>
                  </p>
                </div>

                {/* Item actions - Luôn hiển thị ở độ mờ 70% và sáng lên 100% khi hover */}
                {!isPlayingNow && (
                  <div
                    className="
                      flex items-center gap-1.5
                      opacity-70 group-hover:opacity-100
                      transition-opacity
                      shrink-0
                    "
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveToTop(index);
                      }}
                      className="
                        w-8 h-8
                        flex items-center justify-center
                        rounded-lg
                        border border-white-10
                        bg-white-5
                        text-neutral-300
                        transition-all
                        hover:bg-purple-500/20
                        hover:border-purple-400/30
                        hover:text-purple-300
                        active:scale-95
                        cursor-pointer
                      "
                      title="Đưa lên phát tiếp"
                      aria-label={`Đưa ${item.title} lên đầu hàng đợi`}
                    >
                      <ArrowUpToLine size={13} strokeWidth={2} />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveItem(item.id);
                      }}
                      className="
                        w-8 h-8
                        flex items-center justify-center
                        rounded-lg
                        border border-transparent
                        bg-transparent
                        text-neutral-400
                        transition-all
                        hover:bg-rose-500/15
                        hover:border-rose-400/20
                        hover:text-rose-300
                        active:scale-95
                        cursor-pointer
                      "
                      title="Xóa khỏi hàng đợi"
                      aria-label={`Xóa ${item.title} khỏi hàng đợi`}
                    >
                      <X size={14} strokeWidth={2} />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
