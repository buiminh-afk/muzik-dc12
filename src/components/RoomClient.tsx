'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getRealtimeChannel, isSupabaseConfigured } from '@/lib/supabase';
import YoutubePlayer from './YoutubePlayer';
import QueueList, { PlaylistItem } from './QueueList';
import ChatBox, { ChatMessage } from './ChatBox';
import UsersList, { RoomUser } from './UsersList';
import SearchUI from './SearchUI';
import { Music, Share2, LogOut, Disc, Sparkles, Headphones, ArrowRight, Sun, Moon, MonitorPlay, Heart, ThumbsUp, Flame, PartyPopper, RefreshCw, HelpCircle } from 'lucide-react';
import 'intro.js/introjs.css';

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
  const [roomName, setRoomName] = useState(`Phòng ${roomId}`);
  
  // State quản lý chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  // State nâng cấp UI/UX
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [reactions, setReactions] = useState<{ id: string, emoji: string }[]>([]);
  const [toasts, setToasts] = useState<{ id: string, message: string }[]>([]);
  
  // Ref của realtime channel
  const channelRef = useRef<any>(null);
  const lobbyChannelRef = useRef<any>(null);
  const queueRef = useRef<PlaylistItem[]>([]);
  queueRef.current = queue;

  // Ref của player để lấy thời gian hiện tại khi phản hồi sync
  const playerTimeRef = useRef<number>(0);
  const usersRef = useRef<RoomUser[]>([]);
  usersRef.current = users;
  const localRefIdRef = useRef<string | null>(null);
  localRefIdRef.current = localRefId;
  const playNextSongRef = useRef<() => void>(() => {});

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

  // Lấy username từ localStorage & Tên phòng
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

    // Lấy cấu hình phòng từ sessionStorage
    try {
      const stored = sessionStorage.getItem(`yt_room_config_${roomId}`);
      if (stored) {
        const config = JSON.parse(stored);
        if (config && config.roomName) {
          setRoomName(config.roomName);
        }
      }
    } catch (e) {
      console.warn('[RoomClient] Error loading roomName:', e);
    }
  }, [roomId]);

  // Thiết lập Supabase Realtime Connection
  useEffect(() => {
    if (!username) return;

    const channel = getRealtimeChannel(roomId);
    channelRef.current = channel;

    const lobby = getRealtimeChannel('lobby');
    lobbyChannelRef.current = lobby;

    let pingInterval: NodeJS.Timeout | null = null;

    lobby.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        lobby.send({
          type: 'broadcast',
          event: 'room_active',
          payload: { roomId }
        });
        
        pingInterval = setInterval(() => {
          lobby.send({
            type: 'broadcast',
            event: 'room_active',
            payload: { roomId }
          });
        }, 10000);
      }
    });

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
          const latency = payload.sentAt ? (Date.now() - payload.sentAt) / 1000 : 0;
          setSeekTime(payload.seekTime + latency);
          setTimeout(() => setSeekTime(null), 100);
        }
      })
      .on('broadcast', { event: 'emoji_reaction' }, ({ payload }: any) => {
        setReactions(prev => [...prev, { id: payload.id, emoji: payload.emoji }]);
        setTimeout(() => {
          setReactions(prev => prev.filter(r => r.id !== payload.id));
        }, 2500);
      })
      .on('broadcast', { event: 'request_sync' }, ({ payload }: any) => {
        // Chỉ cho phép đúng 1 người gửi thông tin sync (Host hoặc người join cũ nhất)
        // để tránh tình trạng nhiều người cùng phản hồi gây loạn/nhảy timeline ở client mới.
        const activeUsers = usersRef.current;
        if (activeUsers.length === 0 || queueRef.current.length === 0) return;

        const host = activeUsers.find(u => u.isHost);
        const myRefId = localRefIdRef.current;

        let shouldISync = false;
        if (host) {
          shouldISync = host.presence_ref === myRefId;
        } else {
          // Nếu không có host rõ ràng, người có thời gian tham gia sớm nhất sẽ làm nhiệm vụ sync
          const oldestUser = [...activeUsers].sort((a, b) => 
            new Date(a.joinedAt || 0).getTime() - new Date(b.joinedAt || 0).getTime()
          )[0];
          shouldISync = oldestUser?.presence_ref === myRefId;
        }

        if (shouldISync) {
          channel.send({
            type: 'broadcast',
            event: 'sync_state',
            payload: {
              queue: queueRef.current,
              isPlaying: isPlayingRef.current,
              currentTime: playerTimeRef.current,
              targetRef: payload.requesterRef
            }
          });
        }
      })
      .on('broadcast', { event: 'sync_state' }, ({ payload }: any) => {
        const myRefId = localRefIdRef.current;
        const isMyTarget = !payload.targetRef || payload.targetRef === 'new_tab' || payload.targetRef === myRefId;
        if (isMyTarget && payload.queue) {
          setQueue(payload.queue);
          setIsPlaying(payload.isPlaying);
          if (payload.currentTime > 0) {
            setSeekTime(payload.currentTime);
            setTimeout(() => setSeekTime(null), 100);
          }
          addSystemMessage(`🔄 Đã đồng bộ thành công với phòng.`);
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
            isHost: userPresence.isHost,
            videoFinished: userPresence.videoFinished || false
          });
        }
      });
      
      // Sắp xếp theo thời gian tham gia để xác định thứ tự
      onlineUsers.sort((a, b) => new Date(a.joinedAt || 0).getTime() - new Date(b.joinedAt || 0).getTime());

      // Dynamic Host Logic
      const hasHost = onlineUsers.some(u => u.isHost);
      const myRefId = localRefIdRef.current;
      
      if (!hasHost && onlineUsers.length > 0) {
        const oldestUser = onlineUsers[0];
        oldestUser.isHost = true;
        
        if (oldestUser.presence_ref === myRefId) {
          channel.track({
            username,
            color,
            joinedAt: oldestUser.joinedAt,
            isHost: true,
            videoFinished: oldestUser.videoFinished || false
          }).catch((err: any) => console.warn('Lobby track error:', err));
          addSystemMessage('👑 Chủ phòng cũ đã rời đi. Bạn đã trở thành Chủ phòng mới!');
        }
      }

      setUsers(onlineUsers);
      
      const myRef = Object.keys(state).find(key => {
        const p = state[key][0];
        return p && p.username === username && p.color === color;
      });
      if (myRef) {
        setLocalRefId(myRef);
      }

      // Check if everyone is finished (Only Host coordinates this)
      const isCurrentHost = onlineUsers.find(u => u.presence_ref === myRefId)?.isHost;
      if (isCurrentHost && onlineUsers.length > 0) {
        const allFinished = onlineUsers.every(u => u.videoFinished);
        if (allFinished) {
          playNextSongRef.current();
        }
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
            isHost: isFirst,
            videoFinished: false
          });

          setTimeout(() => {
            const myRefId = localRefIdRef.current;
            channel.send({
              type: 'broadcast',
              event: 'request_sync',
              payload: { requesterRef: myRefId || 'new_tab' }
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
      if (pingInterval) {
        clearInterval(pingInterval);
      }
      lobby.unsubscribe();
      channel.unsubscribe();
    };
  }, [username, color, roomId]);

  // Cập nhật số lượng người trong phòng lên Lobby Presence
  useEffect(() => {
    if (!lobbyChannelRef.current || !username) return;
    
    let hasPassword = false;
    let passwordHash = null;
    try {
      const stored = sessionStorage.getItem(`yt_room_config_${roomId}`);
      if (stored) {
        const config = JSON.parse(stored);
        hasPassword = config.hasPassword || false;
        passwordHash = config.passwordHash || null;
      }
    } catch (e) {
      // ignore
    }

    lobbyChannelRef.current.track({
      type: 'room',
      roomId,
      roomName: roomName,
      hostName: username,
      hasPassword: hasPassword,
      passwordHash: passwordHash,
      userCount: Math.max(1, users.length)
    }).catch((err: any) => console.warn('Lobby track error:', err));
  }, [users.length, username, roomId, roomName]);

  // Reset videoFinished status when the current video changes
  const currentVideo = queue.length > 0 ? queue[0] : null;
  const currentVideoId = currentVideo ? currentVideo.videoId : null;
  useEffect(() => {
    if (!channelRef.current || !username) return;
    const myRefId = localRefIdRef.current;
    if (!myRefId) return;
    
    const me = usersRef.current.find(u => u.presence_ref === myRefId);
    channelRef.current.track({
      username,
      color,
      joinedAt: me ? me.joinedAt : new Date().toISOString(),
      isHost: me ? me.isHost : false,
      videoFinished: false
    }).catch((err: any) => console.warn('Track reset error:', err));
  }, [currentVideoId, username]);

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

  const showToast = (message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
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
    
    const isCurrentHost = usersRef.current.find(u => u.presence_ref === localRefIdRef.current)?.isHost;

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
            payload: { isPlaying: true, seekTime: 0, sentAt: Date.now() }
          });
          setIsPlaying(true);
          setSeekTime(0);
          setTimeout(() => setSeekTime(null), 100);
        }
        break;
      }

      case 'pause': {
        if (!isCurrentHost) {
          addSystemMessage('❌ Chỉ Chủ phòng mới có quyền tạm dừng/phát nhạc.', true);
          return;
        }
        channelRef.current.send({
          type: 'broadcast',
          event: 'playback_state',
          payload: { isPlaying: false, sentAt: Date.now() }
        });
        // Cập nhật local state
        setIsPlaying(false);
        broadcastSystemMessage(`⏸️ ${username} đã tạm dừng trình phát.`);
        break;
      }

      case 'resume':
      case 'unpause': {
        if (!isCurrentHost) {
          addSystemMessage('❌ Chỉ Chủ phòng mới có quyền tạm dừng/phát nhạc.', true);
          return;
        }
        if (queueRef.current.length === 0) {
          addSystemMessage('Hàng đợi đang trống. Vui lòng thêm bài hát trước bằng lệnh /play', true);
          return;
        }
        channelRef.current.send({
          type: 'broadcast',
          event: 'playback_state',
          payload: { isPlaying: true, sentAt: Date.now() }
        });
        // Cập nhật local state
        setIsPlaying(true);
        broadcastSystemMessage(`▶️ ${username} đã tiếp tục phát nhạc.`);
        break;
      }

      case 'skip':
      case 'next': {
        if (!isCurrentHost) {
          addSystemMessage('❌ Chỉ Chủ phòng mới có quyền chuyển bài.', true);
          return;
        }
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
        if (!isCurrentHost) {
          addSystemMessage('❌ Chỉ Chủ phòng mới có quyền xóa hàng đợi.', true);
          return;
        }
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

  const handleAddVideo = (videoId: string, title: string, thumbnail: string) => {
    if (!channelRef.current) return;
    const newItem: PlaylistItem = {
      id: Math.random().toString(36).substring(2, 9),
      videoId,
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
    showToast(`${username} vừa thêm 1 bài hát`);

    if (newQueue.length === 1) {
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

  const sendReaction = (emoji: string) => {
    if (!channelRef.current) return;
    const id = Math.random().toString(36).substring(2, 9);
    channelRef.current.send({
      type: 'broadcast',
      event: 'emoji_reaction',
      payload: { id, emoji }
    });
    setReactions(prev => [...prev, { id, emoji }]);
    setTimeout(() => {
      setReactions(prev => prev.filter(r => r.id !== id));
    }, 2500);
  };

  const handleManualSync = () => {
    if (!channelRef.current) return;
    
    const myRefId = localRefId;
    channelRef.current.send({
      type: 'broadcast',
      event: 'request_sync',
      payload: { requesterRef: myRefId || 'new_tab' }
    });
    
    addSystemMessage('🔄 Đang gửi yêu cầu đồng bộ lại với chủ phòng...');
    showToast('🔄 Đang đồng bộ lại nhạc...');
  };

  const handleStartTour = () => {
    import('intro.js').then(({ default: intro }) => {
      intro()
        .setOptions({
          steps: [
            {
              element: '.room-header-branding',
              intro: 'Chào mừng bạn đến với phòng nhạc YouTube Together! Đây là tên phòng và ID phòng.',
              position: 'bottom'
            },
            {
              element: '.room-header-search',
              intro: 'Bạn có thể tìm kiếm video YouTube hoặc dán liên kết video/playlist trực tiếp ở đây để thêm vào hàng đợi.',
              position: 'bottom'
            },
            {
              element: '.room-nav-buttons',
              intro: 'Các nút chức năng: Đổi giao diện Sáng/Tối, Đồng bộ lại nhạc, Chế độ rạp hát, Mời bạn bè và Rời phòng.',
              position: 'bottom'
            },
            {
              element: '.room-left-column',
              intro: 'Cột bên trái hiển thị Danh sách thành viên trực tuyến đang có mặt trong phòng.',
              position: 'right'
            },
            {
              element: '.room-middle-column',
              intro: 'Khu vực trung tâm chứa Đài phát nhạc (YouTube Video Player) và Hàng đợi bài hát (Queue).',
              position: 'bottom'
            },
            {
              element: '.room-right-column',
              intro: 'Cột bên phải là Khung chat và các Lệnh để bạn tương tác, bày tỏ cảm xúc với mọi người.',
              position: 'left'
            }
          ],
          nextLabel: 'Tiếp tục &rarr;',
          prevLabel: '&larr; Quay lại',
          doneLabel: 'Hoàn tất',
          dontShowAgain: true
        })
        .start();
    }).catch(err => console.error('Failed to load intro.js:', err));
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
    
    // Đánh dấu bản thân đã xem xong bài
    const myRefId = localRefIdRef.current;
    const me = usersRef.current.find(u => u.presence_ref === myRefId);
    
    channelRef.current.track({
      username,
      color,
      joinedAt: me ? me.joinedAt : new Date().toISOString(),
      isHost: me ? me.isHost : false,
      videoFinished: true
    }).catch((err: any) => console.warn('Track videoFinished error:', err));
    
    addSystemMessage('⌛ Bạn đã nghe xong. Đang đợi các thành viên khác...');
    showToast('⌛ Đang đợi các thành viên khác...');
  };

  const playNextSong = () => {
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
        payload: { isPlaying: true, seekTime: 0, sentAt: Date.now() }
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
        payload: { isPlaying: false, seekTime: 0, sentAt: Date.now() }
      });
      
      // Cập nhật local state
      setQueue([]);
      setIsPlaying(false);
      setSeekTime(0);
      setTimeout(() => setSeekTime(null), 100);
      
      broadcastSystemMessage('🎵 Danh sách phát đã hết. Trình phát tạm dừng.');
    }
  };
  playNextSongRef.current = playNextSong;

  const handleLocalSeek = (time: number) => {
    if (!channelRef.current) return;
    const isCurrentHost = usersRef.current.find(u => u.presence_ref === localRefIdRef.current)?.isHost;
    if (!isCurrentHost) return;
    
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
    
    const itemIndex = queueRef.current.findIndex(item => item.id === id);
    if (itemIndex === -1) return;

    const removedItem = queueRef.current[itemIndex];
    const isCurrentHost = usersRef.current.find(u => u.presence_ref === localRefIdRef.current)?.isHost;
    const isOwner = removedItem.addedBy === username;

    if (!isCurrentHost && !isOwner) {
      addSystemMessage('❌ Chỉ Chủ phòng hoặc người thêm bài mới có quyền xóa bài hát.', true);
      return;
    }

    let newQueue = queueRef.current.filter(item => item.id !== id);

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

  const isCurrentHost = users.find(u => u.presence_ref === localRefId)?.isHost;

  return (
    <div 
      className="h-dvh max-h-dvh w-full mx-auto p-4 flex flex-col gap-4 overflow-hidden"
      style={{ maxWidth: '100%', paddingLeft: '32px', paddingRight: '32px' }}
    >
      {/* HEADER */}
      <header className="glass-card flex flex-col sm-flex-row items-center justify-between p-4 gap-4 shrink-0 flex-wrap" style={{ overflow: 'visible', zIndex: 50 }}>
        <div className="flex items-center gap-3 room-header-branding">
          <div className="w-10 h-10 rounded-xl bg-purple-5-20 border border-purple-5-30 flex items-center justify-center text-purple-400 shadow-md">
            <Disc size={20} className="animate-spin-slow text-purple-400" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-white via-neutral-100 to-purple-400 bg-clip-text text-transparent flex items-center gap-2">
              {roomName}
              <span 
                className="font-semibold px-2 py-0.5 rounded-full border text-cyan-400 uppercase tracking-widest font-mono"
                style={{ fontSize: '10px', backgroundColor: 'rgba(6, 182, 212, 0.1)', borderColor: 'rgba(6, 182, 212, 0.2)' }}
              >
                ID: {roomId}
              </span>
            </h1>
            <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
              <Sparkles size={11} className="text-purple-400" />
              Đồng bộ thời gian thực bằng Supabase Broadcast Channel
            </p>
          </div>
        </div>

        {/* Search Bar in Header */}
        <div className="flex-1 w-full sm-w-auto max-w-2xl px-0 sm-px-4 mt-2 sm-mt-0 order-last sm-order-none room-header-search">
          <SearchUI onAddVideo={handleAddVideo} />
        </div>

        <div className="flex items-center w-full sm-w-auto justify-end room-nav-buttons" style={{ gap: '12px' }}>
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
            onClick={handleManualSync}
            className="glass-btn glass-btn-secondary text-xs flex items-center justify-center"
            style={{ cursor: 'pointer', width: '32px', height: '32px', padding: 0 }}
            title="Đồng bộ lại"
            aria-label="Đồng bộ"
          >
            <RefreshCw size={14} />
          </button>
          
          <button
            onClick={() => setIsTheaterMode(!isTheaterMode)}
            className="glass-btn glass-btn-secondary text-xs flex items-center justify-center"
            style={{ cursor: 'pointer', width: '32px', height: '32px', padding: 0 }}
            title="Chế độ rạp hát"
            aria-label="Chế độ rạp hát"
          >
            <MonitorPlay size={14} />
          </button>

          <button
            onClick={handleStartTour}
            className="glass-btn glass-btn-secondary text-xs flex items-center justify-center"
            style={{ cursor: 'pointer', width: '32px', height: '32px', padding: 0 }}
            title="Hướng dẫn sử dụng"
            aria-label="Hướng dẫn"
          >
            <HelpCircle size={14} />
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

      {/* WORKSPACE - 3 COLUMNS */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg-grid lg-grid-cols-12 gap-4 overflow-y-auto lg-overflow-hidden">
        
        {/* LEFT COLUMN: Active Users (lg-col-span-3, order-3 on mobile, lg-order-1 on desktop) */}
        <aside className={`lg-col-span-3 min-h-0 flex flex-col gap-4 overflow-hidden room-left-column order-3 lg-order-1 ${isTheaterMode ? 'lg-hidden' : ''}`}>
          <div className="glass-card p-4 flex-1 min-h-0 flex flex-col overflow-hidden">
            <UsersList users={users} localRefId={localRefId} />
          </div>
        </aside>

        {/* MIDDLE COLUMN: Video Player & QueueList (lg-col-span-6 / lg-col-span-9, order-1 on mobile, lg-order-2 on desktop) */}
        <main className={`${isTheaterMode ? 'lg-col-span-9' : 'lg-col-span-6'} min-h-0 flex flex-col gap-4 overflow-hidden transition-all duration-300 room-middle-column order-1 lg-order-2`}>
          {/* Video Player */}
          <div className="glass-card p-4 shrink-0 overflow-hidden relative">
            <div 
              className="shrink-0 overflow-hidden"
              style={{ height: isTheaterMode ? 'clamp(300px, 60vh, 600px)' : 'clamp(200px, 42vh, 480px)', transition: 'height 0.3s' }}
            >
              <YoutubePlayer
                roomId={roomId}
                videoId={currentVideo ? currentVideo.videoId : null}
                isPlaying={isPlaying}
                seekTime={seekTime}
                playlistIdToLoad={playlistIdToLoad}
                isHost={isCurrentHost}
                reactions={reactions}
                isWaitingForOthers={users.find(u => u.presence_ref === localRefId)?.videoFinished || false}
                waitingCount={users.filter(u => !u.videoFinished).length}
                onPlayerStateChange={handlePlayerStateChange}
                onVideoEnded={handleVideoEnded}
                onLocalSeek={handleLocalSeek}
                onPlaylistLoaded={handlePlaylistLoaded}
                onVideoTitleLoaded={handleVideoTitleLoaded}
              />
            </div>
          </div>

          {/* Playlist / QueueList */}
          <div className="glass-card p-4 flex-1 min-h-0 flex flex-col overflow-hidden">
            <QueueList
              queue={queue}
              isPlaying={isPlaying}
              username={username}
              isHost={!!isCurrentHost}
              onRemoveItem={handleRemoveItem}
              onPlayIndex={handlePlayIndex}
              onMoveToTop={handleMoveToTop}
            />
          </div>
        </main>

        {/* RIGHT COLUMN: Chat Box & Commands (lg-col-span-3, order-2 on mobile, lg-order-3 on desktop) */}
        <aside className="lg-col-span-3 min-h-0 flex flex-col gap-4 overflow-hidden room-right-column order-2 lg-order-3">
          <div className="glass-card p-4 flex-1 min-h-0 flex flex-col overflow-hidden">
            <ChatBox
              messages={messages}
              username={username}
              users={users}
              onSendMessage={handleSendMessage}
              onCommand={handleCommand}
              onSendReaction={sendReaction}
            />
          </div>
        </aside>

      </div>
      
      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className="toast-item flex items-center gap-2">
            <Sparkles size={14} className="text-purple-400" />
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
