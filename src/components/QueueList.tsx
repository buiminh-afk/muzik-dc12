'use client';

import { useState, useEffect, useMemo } from 'react';
import { ListMusic, Disc, ArrowUpToLine, X, Music } from 'lucide-react';
import { Card, CardBody, Button, Chip, Image, ScrollShadow } from "@nextui-org/react";

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
    <div className="relative w-20 aspect-video shrink-0 overflow-hidden rounded-md bg-black border border-default-100 flex items-center justify-center shadow-sm">
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
          className="flex h-full w-full items-center justify-center bg-content2 text-default-400"
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
          background-color: hsl(var(--nextui-secondary));
          border-radius: 2px;
          animation: equalize 1s ease-in-out infinite;
          transform-origin: bottom;
        }
        .music-bar-paused {
          animation-play-state: paused !important;
        }
      `}</style>
      <div className="flex flex-col h-full w-full">
        <div className="flex items-center gap-2 mb-4 shrink-0 px-2 select-none">
          <ListMusic size={20} className="text-secondary" />
          <span className="text-xs font-bold uppercase tracking-wider text-default-500 flex-1">
            Hàng Đợi ({queue.length})
          </span>
        </div>

        <ScrollShadow className="flex-1 flex flex-col gap-3 pr-2">
          {queue.length === 0 ? (
            <Card className="flex-1 flex flex-col items-center justify-center text-center bg-content1 border-dashed border-2 border-default-200 min-h-[160px] select-none" shadow="none">
              <CardBody className="flex items-center justify-center flex-col py-8">
                <Disc size={32} className="text-default-400 mb-3 animate-spin-slow" />
                <p className="text-sm text-default-500">Chưa có bài hát nào trong hàng đợi</p>
              </CardBody>
            </Card>
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
                  className={`rounded-lg group relative flex flex-row items-center gap-4 px-4 py-3 w-full shrink-0 text-left border transition-all duration-200 ${
                    isHost && !isPlayingNow ? 'cursor-pointer' : ''
                  } ${
                    isPlayingNow
                      ? 'bg-secondary/10 border-secondary/30 shadow-sm'
                      : 'bg-content2 border-transparent hover:bg-content3 hover:border-default-100 shadow-none'
                  }`}
                >
                  <div className="w-6 shrink-0 flex items-center justify-center select-none">
                    <span className={`text-sm transition-colors ${
                      isPlayingNow ? 'text-secondary font-bold' : 'text-default-400 font-semibold group-hover:text-default-foreground'
                    }`}>
                      {index + 1}
                    </span>
                  </div>

                  <QueueThumbnail
                    videoId={item.videoId}
                    title={item.title}
                    rawThumbnail={item.thumbnail}
                  />

                  <div className="flex-1 min-w-0 overflow-hidden flex flex-col justify-center items-start text-left gap-1">
                    <h4
                      className={`text-sm leading-snug truncate block w-full ${
                        isPlayingNow
                          ? 'font-bold text-secondary'
                          : isNextUp
                          ? 'font-semibold text-cyan-400'
                          : 'font-semibold text-default-600 group-hover:text-foreground'
                      }`}
                      title={item.title}
                    >
                      {item.title}
                    </h4>

                    <div className="text-xs text-default-500 flex items-center gap-2 flex-wrap">
                      {isNextUp && <span className="text-cyan-400 select-none font-medium">▶ Tiếp theo •</span>}
                      <span>Thêm bởi <span className="text-default-foreground font-medium">{item.addedBy}</span></span>
                      {item.duration && (
                        <span className="text-default-400 select-none">• {item.duration}</span>
                      )}
                      {isPlayingNow && (
                        <Chip
                          size="sm"
                          color={isPlaying ? "success" : "warning"}
                          variant="flat"
                          className="h-4 text-[9px] px-1 font-bold uppercase tracking-wider"
                          classNames={{ content: "px-1" }}
                        >
                          <div className="flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${isPlaying ? 'bg-success animate-pulse' : 'bg-warning'}`} />
                            {isPlaying ? 'ON AIR' : 'PAUSED'}
                          </div>
                        </Chip>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center pl-2 select-none">
                    {isPlayingNow ? (
                      <div className="flex items-center gap-1.5">
                        <div className="flex items-end justify-center gap-1 w-8 h-5 mr-1 group-hover:hidden">
                          <div className={`music-bar h-full ${!isPlaying ? 'music-bar-paused' : ''}`} style={{ width: '4px', animationDelay: '0s' }} />
                          <div className={`music-bar h-full ${!isPlaying ? 'music-bar-paused' : ''}`} style={{ width: '4px', animationDelay: '0.3s' }} />
                          <div className={`music-bar h-full ${!isPlaying ? 'music-bar-paused' : ''}`} style={{ width: '4px', animationDelay: '0.6s' }} />
                          <div className={`music-bar h-full ${!isPlaying ? 'music-bar-paused' : ''}`} style={{ width: '4px', animationDelay: '0.2s' }} />
                        </div>
                        {(isHost || item.addedBy === username) && (
                          <Button
                            isIconOnly
                            size="sm"
                            color="danger"
                            variant="light"
                            className="hidden group-hover:flex"
                            onPress={(e) => {
                              onRemoveItem(item.id);
                            }}
                            title="Xóa khỏi hàng đợi"
                          >
                            <X size={16} />
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        {isHost && !isNextUp && (
                          <Button
                            isIconOnly
                            size="sm"
                            color="secondary"
                            variant="light"
                            onPress={(e) => {
                              onMoveNext(item.id);
                            }}
                            title="Đưa lên phát tiếp"
                          >
                            <ArrowUpToLine size={16} />
                          </Button>
                        )}
                        {(isHost || item.addedBy === username) && (
                          <Button
                            isIconOnly
                            size="sm"
                            color="danger"
                            variant="light"
                            onPress={(e) => {
                              onRemoveItem(item.id);
                            }}
                            title="Xóa khỏi hàng đợi"
                          >
                            <X size={16} />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </ScrollShadow>
      </div>
    </>
  );
}
