'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getRealtimeChannel, isSupabaseConfigured } from '@/lib/supabase';
import YoutubePlayer from './YoutubePlayer';
import QueueList, { PlaylistItem } from './QueueList';
import ChatBox, { ChatMessage } from './ChatBox';
import UsersList, { RoomUser } from './UsersList';
import { Music, Share2, LogOut, Disc, Sparkles, Headphones, ArrowRight, Sun, Moon } from 'lucide-react';

interface RoomClientProps {
  roomId: string;
}

const AVATAR_COLORS = [
  '#FF007F', '#00F0FF', '#7000FF', '#FF9F00', '#00FF66',
  '#FF3366', '#33CCFF', '#CC33FF', '#FFCC00', '#33FF99'
];

export default function RoomClient({ roomId }: RoomClientProps) {
  const router = useRouter();
  
  // State quản lý theme (light / dark)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Khôi phục theme từ localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('yt_together_theme') as 'dark' | 'light';
    if (savedTheme) {
      setTheme(savedTheme);
      document.body.className = savedTheme;
    } else {
      document.body.className = 'dark';
    }
  }, []);

  const handleToggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('yt_together_theme', newTheme);
    document.body.className = newTheme;
  };

  // State quản lý kết nối & user
  const [username, setUsername] = useState('');
  const [hasLoadedName, setHasLoadedName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [color, setColor] = useState('#00F0FF');
  const [localRefId, setLocalRefId] = useState<string | null>(null);
  const [users, setUsers] = useState<RoomUser[]>([]);
  
  // State quản lý trình phát & queue
  const [queue, setQueue] = useState<PlaylistItem[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [playlistIdToLoad, setPlaylistIdToLoad] = useState<string | null>(null);
  
  // State quản lý chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  // Ref của realtime channel
  const channelRef = useRef<any>(null);
  const queueRef = useRef<PlaylistItem[]>([]);
  queueRef.current = queue;

  // Ref của player để lấy thời gian hiện tại khi phản hồi sync
  const playerTimeRef = useRef<number>(0);

  // ===== PERSISTENCE: Lưu/phục hồi hàng đợi từ localStorage =====
  const storageKey = `yt_together_room_${roomId}`;

  // Phục hồi queue từ localStorage khi mount
  useEffect(() => {
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

  // Lưu queue vào localStorage mỗi khi thay đổi
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        queue,
        isPlaying,
        savedAt: Date.now()
      }));
    } catch (e) {}
  }, [queue, isPlaying, storageKey]);

  // Lấy username từ localStorage
  useEffect(() => {
    const storedName = localStorage.getItem('yt_together_username');
    if (storedName) {
      setUsername(storedName);
      setNameInput(storedName);
    }
    setHasLoadedName(true);
    
    // Gán màu ngẫu nhiên cho user
    const randomColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    setColor(randomColor);
  }, []);

  // Thiết lập Supabase Realtime Connection
  useEffect(() => {
    if (!username) return;

    const channel = getRealtimeChannel(roomId);
    channelRef.current = channel;

    // Tin nhắn chào mừng ban đầu
    addSystemMessage(`Chào mừng bạn đến với phòng ${roomId}! Bạn đang ở chế độ điều khiển chung.`);
    if (!isSupabaseConfigured) {
      addSystemMessage('🔔 Lưu ý: Hệ thống đang chạy ở chế độ Local-Only (giả lập offline qua trình duyệt). Mở thêm tab khác với cùng link để test tính năng đồng bộ hóa.');
    }

    // Đăng ký nhận Broadcast Events
    channel
      .on('broadcast', { event: 'chat_message' }, ({ payload }: any) => {
        setMessages((prev) => [...prev, {
          id: payload.id,
          username: payload.username,
          text: payload.text,
          timestamp: new Date(payload.timestamp)
        }]);
      })
      .on('broadcast', { event: 'system_action' }, ({ payload }: any) => {
        addSystemMessage(payload.text, payload.isError);
      })
      .on('broadcast', { event: 'queue_update' }, ({ payload }: any) => {
        setQueue(payload.queue);
      })
      .on('broadcast', { event: 'playback_state' }, ({ payload }: any) => {
        setIsPlaying(payload.isPlaying);
        if (payload.seekTime !== undefined && payload.seekTime !== null) {
          setSeekTime(payload.seekTime);
          setTimeout(() => setSeekTime(null), 100);
        }
      })
      .on('broadcast', { event: 'request_sync' }, ({ payload }: any) => {
        if (queueRef.current.length > 0) {
          channel.send({
            type: 'broadcast',
            event: 'sync_state',
            payload: {
              queue: queueRef.current,
              isPlaying: isPlayingRef.current,
              currentTime: playerTimeRef.current,
              targetTabId: payload.senderTabId
            }
          });
        }
      })
      .on('broadcast', { event: 'sync_state' }, ({ payload }: any) => {
        const myTabId = channel.getTabId ? channel.getTabId() : 'new_tab';
        // Chỉ đồng bộ nếu chính tab này là người gửi yêu cầu sync ban đầu
        if (payload.targetTabId === myTabId && payload.queue && payload.queue.length > 0) {
          setQueue(payload.queue);
          setIsPlaying(payload.isPlaying);
          if (payload.currentTime > 0) {
            setSeekTime(payload.currentTime);
            setTimeout(() => setSeekTime(null), 100);
          }
          addSystemMessage(`Chào mừng ${username} vào phòng! Đã đồng bộ dữ liệu với mọi người.`);
        }
      });

    // Đăng ký Presence (Theo dõi danh sách Online)
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const onlineUsers: RoomUser[] = [];
      
      Object.keys(state).forEach((ref) => {
        const userPresence = state[ref][0];
        if (userPresence) {
          onlineUsers.push({
            presence_ref: ref,
            username: userPresence.username || 'Khách',
            color: userPresence.color || '#00F0FF',
            joinedAt: userPresence.joinedAt,
            isHost: userPresence.isHost
          });
        }
      });
      
      setUsers(onlineUsers);
      
      const myRef = Object.keys(state).find(key => {
        const p = state[key][0];
        return p && p.username === username && p.color === color;
      });
      if (myRef) {
        setLocalRefId(myRef);
      }
    });

    channel.subscribe((status: string, error?: any) => {
      console.log('[Supabase Realtime]', {
        status,
        error,
        roomId,
      });

      switch (status) {
        case 'SUBSCRIBED': {
          console.log('Realtime connected');
          const isFirst = users.length === 0;
          channel.track({
            username,
            color,
            joinedAt: new Date().toISOString(),
            isHost: isFirst
          });

          setTimeout(() => {
            channel.send({
              type: 'broadcast',
              event: 'request_sync',
              payload: { senderTabId: channel.getTabId ? channel.getTabId() : 'new_tab' }
            });
          }, 1000);
          break;
        }

        case 'CHANNEL_ERROR':
          console.error('Realtime channel error:', error);
          addSystemMessage('❌ Lỗi kết nối Realtime: Kênh gặp sự cố. Kiểm tra cấu hình Supabase, mạng Internet hoặc VPN/Adblocker.', true);
          break;

        case 'TIMED_OUT':
          console.error('Realtime connection timed out:', error);
          addSystemMessage('⚠️ Hết hạn kết nối Realtime. Hệ thống đang tự động thử kết nối lại...', true);
          break;

        case 'CLOSED':
          console.warn('Realtime channel closed:', error);
          break;
      }
    });

    return () => {
      channel.unsubscribe();
    };
  }, [username, color, roomId]);

  // Gửi tin nhắn chat thông thường
  const handleSendMessage = (text: string) => {
    if (!channelRef.current) return;
    
    const messageId = Math.random().toString(36).substring(2, 9);
    const msgPayload = {
      id: messageId,
      username: username,
      text: text,
      timestamp: new Date().toISOString()
    };

    channelRef.current.send({
      type: 'broadcast',
      event: 'chat_message',
      payload: msgPayload
    });

    // Cập nhật local state cho chính người gửi (vì broadcast không phản hồi lại người gửi)
    setMessages((prev) => [...prev, {
      id: messageId,
      username: username,
      text: text,
      timestamp: new Date()
    }]);
  };

  // Helper hiển thị tin nhắn hệ thống
  const addSystemMessage = (text: string, isError = false) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        username: 'Hệ thống',
        text: text,
        timestamp: new Date(),
        isSystem: !isError,
        isError: isError
      }
    ]);
  };

  // Phát broadcast tin nhắn hệ thống (gửi đi và tự in ra màn hình của mình)
  const broadcastSystemMessage = (text: string, isError = false) => {
    if (!channelRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'system_action',
      payload: { text, isError }
    });
    // Tự cập nhật local
    addSystemMessage(text, isError);
  };

  // XỬ LÝ LỆNH CHAT COMMANDS
  const handleCommand = async (cmd: string, args: string) => {
    if (!channelRef.current) return;

    switch (cmd) {
      case 'play':
      case 'p': {
        if (!args.trim()) {
          addSystemMessage('Lỗi: Thiếu link YouTube. Cú pháp: /play <link>', true);
          return;
        }

        const playlistId = extractPlaylistId(args.trim());
        const videoId = extractYoutubeId(args.trim());

        if (!playlistId && !videoId) {
          addSystemMessage('Lỗi: Link YouTube không hợp lệ. Vui lòng kiểm tra lại.', true);
          return;
        }

        // Xử lý nếu là Link Playlist
        if (playlistId) {
          addSystemMessage('Đang tải danh sách phát (playlist) từ YouTube...');
          try {
            const response = await fetch(`/api/video-info?url=${encodeURIComponent(args.trim())}`);
            if (response.ok) {
              const data = await response.json();
              if (data.isPlaylist && data.videos && data.videos.length > 0) {
                const newItems: PlaylistItem[] = data.videos.map((vid: any) => ({
                  id: Math.random().toString(36).substring(2, 9),
                  videoId: vid.videoId,
                  title: vid.title,
                  thumbnail: vid.thumbnail_url,
                  addedBy: username
                }));

                const newQueue = [...queueRef.current, ...newItems];

                // 1. Gửi broadcast cập nhật queue cho các client khác
                channelRef.current.send({
                  type: 'broadcast',
                  event: 'queue_update',
                  payload: { queue: newQueue }
                });

                // 2. Cập nhật local state cho chính người gửi
                setQueue(newQueue);

                broadcastSystemMessage(`🎵 ${username} đã thêm danh sách phát "${data.playlistTitle}" (${newItems.length} bài hát) vào hàng đợi.`);

                // Nếu queue trước đó rỗng, tự động phát luôn bài đầu tiên của playlist
                if (newQueue.length === newItems.length) {
                  channelRef.current.send({
                    type: 'broadcast',
                    event: 'playback_state',
                    payload: { isPlaying: true, seekTime: 0 }
                  });
                  // Cập nhật local state
                  setIsPlaying(true);
                  setSeekTime(0);
                  setTimeout(() => setSeekTime(null), 100);
                }
                return;
              }
            }
          } catch (err) {
            console.error('Lỗi khi tải thông tin playlist:', err);
          }
          if (!videoId) {
            addSystemMessage('Không thể tải thông tin danh sách phát này.', true);
            return;
          }
        }

        // Xử lý video đơn lẻ nếu không phải playlist hoặc cạo playlist lỗi
        addSystemMessage(`Đang tải thông tin video YouTube (${videoId})...`);

        let title = `YouTube Video (${videoId})`;
        let thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        try {
          const response = await fetch(
            `/api/video-info?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`,
            { signal: controller.signal }
          );
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const data = await response.json();
            title = data.title || title;
            thumbnail = data.thumbnail_url || thumbnail;
          }
        } catch (err) {
          clearTimeout(timeoutId);
          console.log('Không thể tải thông tin oEmbed, sử dụng fallback mặc định:', err);
        }

        const newItem: PlaylistItem = {
          id: Math.random().toString(36).substring(2, 9),
          videoId: videoId!,
          title,
          thumbnail,
          addedBy: username,
        };

        const newQueue = [...queueRef.current, newItem];
        
        channelRef.current.send({
          type: 'broadcast',
          event: 'queue_update',
          payload: { queue: newQueue }
        });

        setQueue(newQueue);

        broadcastSystemMessage(`🎵 ${username} đã thêm bài hát: "${title}" vào hàng đợi.`);

        if (newQueue.length === 1) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'playback_state',
            payload: { isPlaying: true, seekTime: 0 }
          });
          setIsPlaying(true);
          setSeekTime(0);
          setTimeout(() => setSeekTime(null), 100);
        }
        break;
      }

      case 'pause': {
        channelRef.current.send({
          type: 'broadcast',
          event: 'playback_state',
          payload: { isPlaying: false }
        });
        // Cập nhật local state
        setIsPlaying(false);
        broadcastSystemMessage(`⏸️ ${username} đã tạm dừng trình phát.`);
        break;
      }

      case 'resume':
      case 'unpause': {
        if (queueRef.current.length === 0) {
          addSystemMessage('Hàng đợi đang trống. Vui lòng thêm bài hát trước bằng lệnh /play', true);
          return;
        }
        channelRef.current.send({
          type: 'broadcast',
          event: 'playback_state',
          payload: { isPlaying: true }
        });
        // Cập nhật local state
        setIsPlaying(true);
        broadcastSystemMessage(`▶️ ${username} đã tiếp tục phát nhạc.`);
        break;
      }

      case 'skip':
      case 'next': {
        if (queueRef.current.length <= 1) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'queue_update',
            payload: { queue: [] }
          });
          channelRef.current.send({
            type: 'broadcast',
            event: 'playback_state',
            payload: { isPlaying: false, seekTime: 0 }
          });
          // Cập nhật local state
          setQueue([]);
          setIsPlaying(false);
          setSeekTime(0);
          setTimeout(() => setSeekTime(null), 100);
          broadcastSystemMessage(`⏭️ ${username} đã bỏ qua bài hát cuối cùng.`);
        } else {
          const newQueue = queueRef.current.slice(1);
          channelRef.current.send({
            type: 'broadcast',
            event: 'queue_update',
            payload: { queue: newQueue }
          });
          channelRef.current.send({
            type: 'broadcast',
            event: 'playback_state',
            payload: { isPlaying: true, seekTime: 0 }
          });
          // Cập nhật local state
          setQueue(newQueue);
          setIsPlaying(true);
          setSeekTime(0);
          setTimeout(() => setSeekTime(null), 100);
          broadcastSystemMessage(`⏭️ ${username} đã bỏ qua bài hát. Bài tiếp theo: "${newQueue[0].title}"`);
        }
        break;
      }

      case 'clear': {
        channelRef.current.send({
          type: 'broadcast',
          event: 'queue_update',
          payload: { queue: [] }
        });
        channelRef.current.send({
          type: 'broadcast',
          event: 'playback_state',
          payload: { isPlaying: false, seekTime: 0 }
        });
        // Cập nhật local state
        setQueue([]);
        setIsPlaying(false);
        setSeekTime(0);
        setTimeout(() => setSeekTime(null), 100);
        broadcastSystemMessage(`🗑️ ${username} đã xóa sạch hàng đợi.`);
        break;
      }

      case 'queue':
      case 'q': {
        if (queueRef.current.length === 0) {
          addSystemMessage('Hàng đợi nhạc đang trống.');
        } else {
          let listStr = 'Danh sách nhạc đang chờ:\n';
          queueRef.current.forEach((item, index) => {
            listStr += `${index === 0 ? '▶️ [ĐANG PHÁT]' : `${index}.`} ${item.title} (Thêm bởi: ${item.addedBy})\n`;
          });
          addSystemMessage(listStr);
        }
        break;
      }

      default: {
        addSystemMessage(`Lỗi: Không tìm thấy lệnh /${cmd}. Gõ "/help" để xem các lệnh hỗ trợ.`, true);
      }
    }
  };

  const extractYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const extractPlaylistId = (url: string) => {
    const match = url.match(/[?&]list=([^#\&\?]+)/);
    return match ? match[1] : null;
  };

  // ĐỒNG BỘ TRÌNH PHÁT
  // Người dùng yêu cầu: KHÔNG cho phép điều khiển play/pause trên trình phát YouTube.
  // Chỉ cho phép dùng lệnh chat (/pause, /resume) để đồng bộ.
  // Khi user click pause/play trên iframe, ta đẩy lại trạng thái đúng (revert).
  const handlePlayerStateChange = (_state: 'PLAYING' | 'PAUSED', time: number) => {
    // Chỉ cập nhật thời gian hiện tại (dùng cho sync khi có tab mới)
    playerTimeRef.current = time;
    // Không broadcast, không thay đổi state — player sẽ tự bị revert
    // bởi useEffect lắng nghe isPlaying trong YoutubePlayer.tsx
  };

  const handleVideoEnded = () => {
    if (!channelRef.current) return;
    
    if (queueRef.current.length > 1) {
      const newQueue = queueRef.current.slice(1);
      channelRef.current.send({
        type: 'broadcast',
        event: 'queue_update',
        payload: { queue: newQueue }
      });
      channelRef.current.send({
        type: 'broadcast',
        event: 'playback_state',
        payload: { isPlaying: true, seekTime: 0 }
      });
      
      // Cập nhật local state
      setQueue(newQueue);
      setIsPlaying(true);
      setSeekTime(0);
      setTimeout(() => setSeekTime(null), 100);
      
      broadcastSystemMessage(`🎵 Bài hát kết thúc. Đang tự động phát bài kế tiếp: "${newQueue[0].title}"`);
    } else {
      channelRef.current.send({
        type: 'broadcast',
        event: 'queue_update',
        payload: { queue: [] }
      });
      channelRef.current.send({
        type: 'broadcast',
        event: 'playback_state',
        payload: { isPlaying: false, seekTime: 0 }
      });
      
      // Cập nhật local state
      setQueue([]);
      setIsPlaying(false);
      setSeekTime(0);
      setTimeout(() => setSeekTime(null), 100);
      
      broadcastSystemMessage('🎵 Danh sách phát đã hết. Trình phát tạm dừng.');
    }
  };

  const handleLocalSeek = (time: number) => {
    if (!channelRef.current) return;
    
    playerTimeRef.current = time;
    channelRef.current.send({
      type: 'broadcast',
      event: 'playback_state',
      payload: {
        isPlaying: isPlaying,
        seekTime: time
      }
    });
    broadcastSystemMessage(`⏩ ${username} đã tua nhạc tới mốc ${Math.floor(time)} giây.`);
  };

  const handleRemoveItem = (id: string) => {
    if (!channelRef.current) return;

    const itemIndex = queue.findIndex(item => item.id === id);
    if (itemIndex === -1) return;

    const removedItem = queue[itemIndex];
    let newQueue = queue.filter(item => item.id !== id);

    channelRef.current.send({
      type: 'broadcast',
      event: 'queue_update',
      payload: { queue: newQueue }
    });
    // Cập nhật local state
    setQueue(newQueue);

    broadcastSystemMessage(`🗑️ ${username} đã xóa bài: "${removedItem.title}" khỏi hàng đợi.`);

    if (itemIndex === 0) {
      const nextIsPlaying = newQueue.length > 0;
      channelRef.current.send({
        type: 'broadcast',
        event: 'playback_state',
        payload: {
          isPlaying: nextIsPlaying,
          seekTime: 0
        }
      });
      // Cập nhật local state
      setIsPlaying(nextIsPlaying);
      setSeekTime(0);
      setTimeout(() => setSeekTime(null), 100);
    }
  };

  const handlePlayIndex = (index: number) => {
    if (!channelRef.current || index < 0 || index >= queue.length) return;

    const targetItem = queue[index];
    const remainingItems = queue.filter((_, i) => i !== index);
    const newQueue = [targetItem, ...remainingItems];

    channelRef.current.send({
      type: 'broadcast',
      event: 'queue_update',
      payload: { queue: newQueue }
    });
    channelRef.current.send({
      type: 'broadcast',
      event: 'playback_state',
      payload: { isPlaying: true, seekTime: 0 }
    });
    
    // Cập nhật local state
    setQueue(newQueue);
    setIsPlaying(true);
    setSeekTime(0);
    setTimeout(() => setSeekTime(null), 100);

    broadcastSystemMessage(`🎵 ${username} đã phát trực tiếp bài hát: "${targetItem.title}"`);
  };

  const handleMoveToTop = (index: number) => {
    if (!channelRef.current || index <= 1 || index >= queueRef.current.length) return;

    const selectedItem = queueRef.current[index];
    if (!selectedItem) return;

    // Giữ nguyên bài đang phát ở index 0, đưa bài được chọn lên làm bài tiếp theo (index 1)
    const newQueue = [
      queueRef.current[0],
      selectedItem,
      ...queueRef.current.slice(1, index),
      ...queueRef.current.slice(index + 1),
    ];

    channelRef.current.send({
      type: 'broadcast',
      event: 'queue_update',
      payload: { queue: newQueue },
    });

    setQueue(newQueue);
    broadcastSystemMessage(
      `⏫ ${username} đã đưa "${selectedItem.title}" lên phát tiếp.`
    );
  };

  const handlePlaylistLoaded = (videoIds: string[]) => {
    if (!videoIds || videoIds.length === 0) return;

    const newItems: PlaylistItem[] = videoIds.map((id) => ({
      id: Math.random().toString(36).substring(2, 9),
      videoId: id,
      title: `YouTube Video (${id})`,
      thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      addedBy: username
    }));

    const newQueue = [...queueRef.current, ...newItems];

    channelRef.current.send({
      type: 'broadcast',
      event: 'queue_update',
      payload: { queue: newQueue }
    });
    setQueue(newQueue);

    broadcastSystemMessage(`🎵 ${username} đã thêm danh sách phát YouTube (${newItems.length} bài hát) vào hàng đợi.`);

    if (newQueue.length === newItems.length) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'playback_state',
        payload: { isPlaying: true, seekTime: 0 }
      });
      setIsPlaying(true);
      setSeekTime(0);
      setTimeout(() => setSeekTime(null), 100);
    }

    setPlaylistIdToLoad(null);
  };

  const handleVideoTitleLoaded = (videoId: string, title: string) => {
    if (!title || title === 'YouTube Video') return;

    const updatedQueue = queueRef.current.map((item) => {
      if (item.videoId === videoId && (item.title.startsWith('YouTube Video (') || item.title === 'YouTube Video')) {
        return { ...item, title };
      }
      return item;
    });

    const hasChange = JSON.stringify(updatedQueue) !== JSON.stringify(queueRef.current);
    if (hasChange) {
      setQueue(updatedQueue);
      channelRef.current.send({
        type: 'broadcast',
        event: 'queue_update',
        payload: { queue: updatedQueue }
      });
    }
  };

  const handleCopyLink = () => {
    if (typeof window === 'undefined') return;
    navigator.clipboard.writeText(window.location.href);
    addSystemMessage('Đã sao chép liên kết phòng! Hãy gửi cho bạn bè để cùng nghe nhạc.');
  };

  const handleLeaveRoom = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch (e) {}
    router.push('/');
  };

  const currentVideo = queue.length > 0 ? queue[0] : null;

  if (hasLoadedName && !username) {
    return (
      <div className="h-dvh w-full flex items-center justify-center p-4 bg-gradient-to-br from-black-90 to-purple-95-20">
        <div className="glass-card w-full max-w-md p-6 flex flex-col gap-4 shadow-2xl animate-fade-in">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="w-12 h-12 rounded-xl bg-purple-5-20 border border-purple-5-30 flex items-center justify-center text-purple-400 shadow-md">
              <Headphones size={24} className="text-purple-400 animate-pulse" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white mt-2">Tham Gia Phòng Nhạc</h2>
            <p className="text-xs text-muted">
              Nhập tên hiển thị của bạn để tham gia phòng <span className="text-cyan-400 font-mono font-semibold">{roomId}</span>
            </p>
          </div>

          <form 
            onSubmit={(e) => {
              e.preventDefault();
              const name = nameInput.trim();
              if (name) {
                localStorage.setItem('yt_together_username', name);
                setUsername(name);
              }
            }} 
            className="flex flex-col gap-4 mt-2"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name-input" className="text-xs font-semibold text-muted">Tên của bạn</label>
              <input
                id="name-input"
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Nhập tên hiển thị..."
                className="glass-input text-sm"
                maxLength={20}
                required
                autoFocus
              />
            </div>
            <button type="submit" className="glass-btn w-full text-sm" style={{ cursor: 'pointer', padding: '10px' }}>
              Vào Phòng
              <ArrowRight size={16} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!hasLoadedName) {
    return (
      <div className="h-dvh w-full flex items-center justify-center bg-black-95">
        <Disc size={32} className="animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div 
      className="h-dvh max-h-dvh w-full mx-auto p-4 flex flex-col gap-4 overflow-hidden"
      style={{ maxWidth: '1400px', paddingLeft: '24px', paddingRight: '24px' }}
    >
      {/* HEADER */}
      <header className="glass-card flex flex-col sm-flex-row items-center justify-between p-4 gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-5-20 border border-purple-5-30 flex items-center justify-center text-purple-400 shadow-md">
            <Disc size={20} className="animate-spin-slow text-purple-400" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-white via-neutral-100 to-purple-400 bg-clip-text text-transparent flex items-center gap-2">
              YouTube Together
              <span 
                className="font-semibold px-2 py-0.5 rounded-full border text-cyan-400 uppercase tracking-widest font-mono"
                style={{ fontSize: '10px', backgroundColor: 'rgba(6, 182, 212, 0.1)', borderColor: 'rgba(6, 182, 212, 0.2)' }}
              >
                Room: {roomId}
              </span>
            </h1>
            <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
              <Sparkles size={11} className="text-purple-400" />
              Đồng bộ thời gian thực bằng Supabase Broadcast Channel
            </p>
          </div>
        </div>

        <div className="flex items-center w-full sm-w-auto justify-end" style={{ gap: '12px' }}>
          <button
            onClick={handleToggleTheme}
            className="glass-btn glass-btn-secondary text-xs flex items-center justify-center"
            style={{ cursor: 'pointer', width: '32px', height: '32px', padding: 0 }}
            title={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
            aria-label="Đổi giao diện"
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>

          <button
            onClick={handleCopyLink}
            className="glass-btn glass-btn-secondary px-4 text-xs flex items-center flex-1 sm-flex-none"
            style={{ cursor: 'pointer', padding: '6px 12px', gap: '6px' }}
            title="Copy link phòng"
          >
            <Share2 size={13} />
            Mời Bạn Bè
          </button>
          
          <button
            onClick={handleLeaveRoom}
            className="glass-btn bg-rose-6-20 border border-rose-5-20 text-rose-300 text-xs flex items-center flex-1 sm-flex-none"
            style={{ cursor: 'pointer', padding: '6px 12px', gap: '6px' }}
            title="Thoát phòng"
          >
            <LogOut size={13} />
            Rời Phòng
          </button>
        </div>
      </header>

      {/* WORKSPACE */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg-grid lg-grid-cols-12 gap-4 overflow-y-auto lg-overflow-hidden">
        
        {/* LEFT COLUMN (Player & Chat) */}
        <main className="lg-col-span-7 min-h-0 flex flex-col gap-4 overflow-hidden">
          {/* Video Player */}
          <div className="glass-card p-4 shrink-0 overflow-hidden">
            <div 
              className="shrink-0 overflow-hidden"
              style={{ height: 'clamp(200px, 42vh, 480px)' }}
            >
              <YoutubePlayer
                videoId={currentVideo ? currentVideo.videoId : null}
                isPlaying={isPlaying}
                seekTime={seekTime}
                playlistIdToLoad={playlistIdToLoad}
                onPlayerStateChange={handlePlayerStateChange}
                onVideoEnded={handleVideoEnded}
                onLocalSeek={handleLocalSeek}
                onPlaylistLoaded={handlePlaylistLoaded}
                onVideoTitleLoaded={handleVideoTitleLoaded}
              />
            </div>
          </div>

          {/* Chat & Commands */}
          <div className="glass-card p-4 flex-1 min-h-0 flex flex-col overflow-hidden">
            <ChatBox
              messages={messages}
              onSendMessage={handleSendMessage}
              onCommand={handleCommand}
            />
          </div>
        </main>

        {/* RIGHT COLUMN (Users & Playlist) */}
        <aside className="lg-col-span-5 min-h-0 flex flex-col gap-4 overflow-hidden">
          {/* Active Users */}
          <div className="glass-card p-4 h-[140px] shrink-0 overflow-hidden">
            <UsersList users={users} localRefId={localRefId} />
          </div>

          {/* Playlist / QueueList */}
          <div className="glass-card p-4 flex-1 min-h-0 flex flex-col overflow-hidden">
            <QueueList
              queue={queue}
              onRemoveItem={handleRemoveItem}
              onPlayIndex={handlePlayIndex}
              onMoveToTop={handleMoveToTop}
            />
          </div>
        </aside>

      </div>
    </div>
  );
}
