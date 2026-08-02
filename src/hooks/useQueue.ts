'use client';

import { useState, useRef, useEffect } from 'react';
import { PlaylistItem } from '@/components/QueueList';
import { isSupabaseConfigured } from '@/lib/supabase';

interface UseQueueProps {
  roomId: string;
  username: string;
  channelRef: React.MutableRefObject<any>;
  getIsCurrentHost: () => boolean;
  updateRoomInDb: (updates: any) => Promise<void>;
  broadcastSystemMessage: (text: string, isError?: boolean) => void;
  showToast: (message: string) => void;
  generateId: () => string;
}

export function useQueue({
  roomId,
  username,
  channelRef,
  getIsCurrentHost,
  updateRoomInDb,
  broadcastSystemMessage,
  showToast,
  generateId,
}: UseQueueProps) {
  const [queue, setQueue] = useState<PlaylistItem[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [seekTime, setSeekTime] = useState<number | null>(null);

  const queueRef = useRef<PlaylistItem[]>([]);
  queueRef.current = queue;

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const finishedItemIdRef = useRef<string | null>(null);
  const skipVotesRef = useRef<Set<string>>(new Set());
  const skipVoteItemIdRef = useRef<string | null>(null);

  // Persistence for offline/local mode
  const storageKey = `yt_together_room_${roomId}`;
  useEffect(() => {
    if (isSupabaseConfigured) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.queue && parsed.queue.length > 0) {
          setQueue(parsed.queue);
          setIsPlaying(parsed.isPlaying ?? false);
        }
      }
    } catch (e) {
      console.warn('Không thể phục hồi hàng đợi từ localStorage:', e);
    }
  }, [roomId]);

  useEffect(() => {
    if (isSupabaseConfigured) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        queue,
        isPlaying,
        savedAt: Date.now()
      }));
    } catch (e) {}
  }, [queue, isPlaying, storageKey]);

  const handleAddVideo = async (video: { videoId: string; title: string; thumbnailUrl: string; duration?: string }) => {
    if (!channelRef.current) return;
    const newItem: PlaylistItem = {
      id: generateId(),
      videoId: video.videoId,
      title: video.title,
      thumbnail: video.thumbnailUrl,
      addedBy: username,
      duration: video.duration,
    };
    const newQueue = [...queueRef.current, newItem];

    // FIX: Update DB with new queue
    if (isSupabaseConfigured) {
      await updateRoomInDb({ queue: newQueue });
    }

    channelRef.current.send({
      type: 'broadcast',
      event: 'queue_update',
      payload: { queue: newQueue }
    });
    setQueue(newQueue);
    broadcastSystemMessage(`🎵 ${username} đã thêm bài hát: "${video.title}" vào hàng đợi.`);
    showToast(`${username} vừa thêm 1 bài hát`);

    if (newQueue.length === 1) {
      if (isSupabaseConfigured) {
        await updateRoomInDb({ is_playing: true, seek_time: 0 });
      }
      channelRef.current.send({
        type: 'broadcast',
        event: 'playback_state',
        payload: { isPlaying: true, seekTime: 0, sentAt: Date.now() }
      });
      setIsPlaying(true);
      setSeekTime(0);
      setTimeout(() => setSeekTime(null), 100);
    }
  };

  const handleRemoveItem = async (id: string) => {
    const itemIndex = queueRef.current.findIndex(item => item.id === id);
    if (itemIndex === -1) return;

    const removedItem = queueRef.current[itemIndex];
    const isCurrentHost = getIsCurrentHost();
    const isOwner = removedItem.addedBy === username;

    if (!isCurrentHost && !isOwner) {
      broadcastSystemMessage(`❌ Chỉ Chủ phòng hoặc người thêm bài mới có quyền xóa bài hát.`, true);
      return;
    }

    const newQueue = queueRef.current.filter(item => item.id !== id);

    if (isSupabaseConfigured) {
      await updateRoomInDb({ queue: newQueue });
    }
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'queue_update',
        payload: { queue: newQueue }
      });
    }
    setQueue(newQueue);

    broadcastSystemMessage(`🗑️ ${username} đã xóa bài: "${removedItem.title}" khỏi hàng đợi.`);

    if (itemIndex === 0) {
      const nextIsPlaying = newQueue.length > 0;
      if (isSupabaseConfigured) {
        await updateRoomInDb({ is_playing: nextIsPlaying, seek_time: 0 });
      }
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'playback_state',
          payload: {
            isPlaying: nextIsPlaying,
            seekTime: 0,
            sentAt: Date.now()
          }
        });
      }
      setIsPlaying(nextIsPlaying);
      setSeekTime(0);
      setTimeout(() => setSeekTime(null), 100);
    }
  };

  const handlePlayItem = async (itemId: string) => {
    const isCurrentHost = getIsCurrentHost();
    if (!isCurrentHost) return;

    const index = queueRef.current.findIndex(item => item.id === itemId);
    if (index === -1) return;

    const targetItem = queueRef.current[index];
    const remainingItems = queueRef.current.filter(item => item.id !== itemId);
    const newQueue = [targetItem, ...remainingItems];

    if (isSupabaseConfigured) {
      await updateRoomInDb({
        queue: newQueue,
        current_video_id: targetItem.videoId,
        is_playing: true,
        seek_time: 0
      });
    }
    
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'queue_update',
        payload: { queue: newQueue }
      });
      channelRef.current.send({
        type: 'broadcast',
        event: 'playback_state',
        payload: { isPlaying: true, seekTime: 0, sentAt: Date.now() }
      });
    }
    
    setQueue(newQueue);
    setIsPlaying(true);
    setSeekTime(0);
    setTimeout(() => setSeekTime(null), 100);

    broadcastSystemMessage(`🎵 ${username} đã phát trực tiếp bài hát: "${targetItem.title}"`);
  };

  const handleMoveNext = async (itemId: string) => {
    const isCurrentHost = getIsCurrentHost();
    if (!isCurrentHost) return;

    const index = queueRef.current.findIndex(item => item.id === itemId);
    if (index === -1 || index <= 1) return;

    const selectedItem = queueRef.current[index];
    if (!selectedItem) return;

    const newQueue = [
      queueRef.current[0],
      selectedItem,
      ...queueRef.current.slice(1, index),
      ...queueRef.current.slice(index + 1),
    ];

    if (isSupabaseConfigured) {
      await updateRoomInDb({ queue: newQueue });
    }
    
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'queue_update',
        payload: { queue: newQueue },
      });
    }
    setQueue(newQueue);
    broadcastSystemMessage(`⏫ ${username} đã đưa "${selectedItem.title}" lên phát tiếp.`);
  };

  const playNextSong = async () => {
    skipVotesRef.current.clear();
    skipVoteItemIdRef.current = null;
    
    if (queueRef.current.length > 1) {
      const newQueue = queueRef.current.slice(1);
      
      if (isSupabaseConfigured) {
        await updateRoomInDb({
          queue: newQueue,
          current_video_id: newQueue[0].videoId,
          is_playing: true,
          seek_time: 0
        });
      }
      
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'queue_update',
          payload: { queue: newQueue }
        });
        channelRef.current.send({
          type: 'broadcast',
          event: 'playback_state',
          payload: { isPlaying: true, seekTime: 0, sentAt: Date.now() }
        });
      }
      
      setQueue(newQueue);
      setIsPlaying(true);
      setSeekTime(0);
      setTimeout(() => setSeekTime(null), 100);
      
      broadcastSystemMessage(`🎵 Bài hát kết thúc. Đang tự động phát bài kế tiếp: "${newQueue[0].title}"`);
    } else {
      if (isSupabaseConfigured) {
        await updateRoomInDb({
          queue: [],
          current_video_id: null,
          is_playing: false,
          seek_time: 0
        });
      }
      
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'queue_update',
          payload: { queue: [] }
        });
        channelRef.current.send({
          type: 'broadcast',
          event: 'playback_state',
          payload: { isPlaying: false, seekTime: 0, sentAt: Date.now() }
        });
      }
      
      setQueue([]);
      setIsPlaying(false);
      setSeekTime(0);
      setTimeout(() => setSeekTime(null), 100);
      
      broadcastSystemMessage('🎵 Danh sách phát đã hết. Trình phát tạm dừng.');
    }
  };

  const handlePlaylistLoaded = async (videoIds: string[]) => {
    if (!videoIds || videoIds.length === 0) return;

    const newItems: PlaylistItem[] = videoIds.map((id) => ({
      id: generateId(),
      videoId: id,
      title: `YouTube Video (${id})`,
      thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      addedBy: username
    }));

    const newQueue = [...queueRef.current, ...newItems];

    if (isSupabaseConfigured) {
      await updateRoomInDb({ queue: newQueue });
    }
    
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'queue_update',
        payload: { queue: newQueue }
      });
    }
    setQueue(newQueue);
    
    broadcastSystemMessage(`🎵 ${username} đã thêm danh sách phát YouTube (${newItems.length} bài hát) vào hàng đợi.`);

    if (newQueue.length === newItems.length) {
      if (isSupabaseConfigured) {
        await updateRoomInDb({ is_playing: true, seek_time: 0 });
      }
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'playback_state',
          payload: { isPlaying: true, seekTime: 0, sentAt: Date.now() }
        });
      }
      setIsPlaying(true);
      setSeekTime(0);
      setTimeout(() => setSeekTime(null), 100);
    }
  };

  const handleVideoTitleLoaded = async (videoId: string, title: string) => {
    if (!title || title === 'YouTube Video') return;

    const updatedQueue = queueRef.current.map((item) => {
      if (item.videoId === videoId && (item.title.startsWith('YouTube Video (') || item.title === 'YouTube Video')) {
        return { ...item, title };
      }
      return item;
    });

    const hasChange = JSON.stringify(updatedQueue) !== JSON.stringify(queueRef.current);
    if (hasChange) {
      if (isSupabaseConfigured) {
        await updateRoomInDb({ queue: updatedQueue });
      }
      
      setQueue(updatedQueue);
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'queue_update',
          payload: { queue: updatedQueue }
        });
      }
    }
  };

  return {
    queue,
    setQueue,
    isPlaying,
    setIsPlaying,
    seekTime,
    setSeekTime,
    queueRef,
    isPlayingRef,
    finishedItemIdRef,
    skipVotesRef,
    skipVoteItemIdRef,
    handleAddVideo,
    handleRemoveItem,
    handlePlayItem,
    handleMoveNext,
    playNextSong,
    handlePlaylistLoaded,
    handleVideoTitleLoaded
  };
}
