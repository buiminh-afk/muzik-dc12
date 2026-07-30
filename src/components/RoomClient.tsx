'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getRealtimeChannel, isSupabaseConfigured, supabase } from '@/lib/supabase';
import YoutubePlayer from './YoutubePlayer';
import QueueList, { PlaylistItem } from './QueueList';
import ChatBox, { ChatMessage } from './ChatBox';
import UsersList, { RoomUser } from './UsersList';
import SearchUI from './SearchUI';
import { Music, Share2, LogOut, Disc, Sparkles, Headphones, ArrowRight, Sun, Moon, MonitorPlay, Heart, ThumbsUp, Flame, PartyPopper, RefreshCw, HelpCircle, Palette, Video, VideoOff } from 'lucide-react';
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
  
  // State quản lý theme
  const [theme, setTheme] = useState<string>('dark');
  const [showThemeMenu, setShowThemeMenu] = useState(false);

  const THEMES = ['dark', 'light', 'glassmorphism'];

  // Khôi phục theme từ localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('yt_together_theme') || 'dark';
    setTheme(savedTheme);
    document.body.classList.remove('dark', 'light', 'glassmorphism');
    document.body.classList.add(savedTheme);
  }, []);

  const handleSelectTheme = (newTheme: string) => {
    setTheme(newTheme);
    localStorage.setItem('yt_together_theme', newTheme);
    document.body.classList.remove('dark', 'light', 'glassmorphism');
    document.body.classList.add(newTheme);
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
  const [isVideoHidden, setIsVideoHidden] = useState(false);
  const [reactions, setReactions] = useState<{ id: string; emoji: string; x: number }[]>([]);
  const [toasts, setToasts] = useState<{ id: string, message: string }[]>([]);
  
  // Ref của realtime channel
  const channelRef = useRef<any>(null);
  const lobbyChannelRef = useRef<any>(null);
  const queueRef = useRef<PlaylistItem[]>([]);
  queueRef.current = queue;

  // Ref của player để lấy thời gian hiện tại khi phản hồi sync
  const playerTimeRef = useRef<number>(0);
  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15);
  };

  const usersRef = useRef<RoomUser[]>([]);
  usersRef.current = users;
  const localRefIdRef = useRef<string | null>(null);
  localRefIdRef.current = localRefId;
  const playNextSongRef = useRef<() => void>(() => {});

  const clientIdRef = useRef<string | null>(null);
  if (!clientIdRef.current) {
    clientIdRef.current = generateId();
  }
  const advancedItemIdRef = useRef<string | null>(null);
  const finishedItemIdRef = useRef<string | null>(null);
  const skipVotesRef = useRef<Set<string>>(new Set());
  const skipVoteItemIdRef = useRef<string | null>(null);

  // Helper hiển thị tin nhắn hệ thống
  const addSystemMessage = (text: string, isError = false) => {
    setMessages((prev) => [
      ...prev,
      {
        id: generateId(),
        username: 'Hệ thống',
        text: text,
        timestamp: new Date(),
        isSystem: !isError,
        isError: isError
      }
    ].slice(-500));
  };

  const showToast = (message: string) => {
    const id = generateId();
    setToasts(prev => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const getCurrentUser = (activeUsers: RoomUser[]): RoomUser | undefined => {
    let me = activeUsers.find(u => u.clientId === clientIdRef.current);
    if (me) return me;
    me = activeUsers.find(u => u.username === username && u.color === color);
    if (me) return me;
    me = activeUsers.find(u => u.presence_ref === localRefIdRef.current);
    return me;
  };

  // Phát broadcast tin nhắn hệ thống (gửi đi và tự in ra màn hình của mình)
  const broadcastSystemMessage = (text: string, isError = false) => {
    if (!channelRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'system_action',
      payload: { text, isError }
    });
    addSystemMessage(text, isError);
  };

  // Gửi tin nhắn chat thông thường
  const handleSendMessage = (text: string) => {
    if (!channelRef.current) return;
    
    const messageId = generateId();
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
    }].slice(-500));
  };

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

  const processSkipVote = (
    voterClientId: string,
    voterUsername: string,
    itemId: string
  ) => {
    const currentItem = queueRef.current[0];

    if (!currentItem || currentItem.id !== itemId) {
      return;
    }

    const currentUser = getCurrentUser(usersRef.current);

    // Chỉ host điều phối việc đếm và skip.
    if (!currentUser?.isHost) {
      return;
    }

    // Bài mới thì reset toàn bộ phiếu cũ.
    if (skipVoteItemIdRef.current !== itemId) {
      skipVoteItemIdRef.current = itemId;
      skipVotesRef.current.clear();
    }

    // Mỗi client chỉ được vote một lần.
    if (skipVotesRef.current.has(voterClientId)) {
      return;
    }

    skipVotesRef.current.add(voterClientId);

    const activeUsers = usersRef.current.filter(user => user.clientId);
    const totalUsers = Math.max(1, activeUsers.length);
    const requiredVotes = Math.ceil(totalUsers * 0.6);
    const voteCount = skipVotesRef.current.size;

    channelRef.current?.send({
      type: 'broadcast',
      event: 'system_action',
      payload: {
        text: `🗳️ ${voterUsername} đã biểu quyết bỏ qua bài hát (${voteCount}/${requiredVotes} phiếu).`,
        isError: false
      }
    });

    addSystemMessage(
      `🗳️ ${voterUsername} đã biểu quyết bỏ qua bài hát (${voteCount}/${requiredVotes} phiếu).`
    );

    if (voteCount >= requiredVotes) {
      skipVotesRef.current.clear();
      skipVoteItemIdRef.current = null;

      broadcastSystemMessage(
        `⏭️ Đã đủ ${voteCount}/${requiredVotes} phiếu. Bỏ qua bài hiện tại.`
      );

      playNextSongRef.current();
    }
  };

  useEffect(() => {
    if (!username) return;

    const channel = getRealtimeChannel(roomId);
    channelRef.current = channel;

    const lobby = getRealtimeChannel('lobby');
    lobbyChannelRef.current = lobby;

    let pingInterval: NodeJS.Timeout | null = null;
    let syncTimeoutId: NodeJS.Timeout | null = null;

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
        }].slice(-500));
      })
      .on('broadcast', { event: 'vote_skip' }, ({ payload }: any) => {
        if (!payload?.clientId || !payload?.username || !payload?.itemId) {
          return;
        }
        processSkipVote(payload.clientId, payload.username, payload.itemId);
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
          setSeekTime(payload.seekTime + (payload.isPlaying ? latency : 0));
          setTimeout(() => setSeekTime(null), 100);
        }
      })
      .on('broadcast', { event: 'emoji_reaction' }, ({ payload }: any) => {
        const x = 15 + Math.random() * 70;
        setReactions(prev => [...prev, { id: payload.id, emoji: payload.emoji, x }]);
        setTimeout(() => {
          setReactions(prev => prev.filter(r => r.id !== payload.id));
        }, 2500);
      })
      .on('broadcast', { event: 'request_sync' }, ({ payload }: any) => {
        if (payload.requesterId === clientIdRef.current) return;
        const activeUsers = usersRef.current;
        if (activeUsers.length === 0 || queueRef.current.length === 0) return;

        const host = activeUsers.find(u => u.isHost);

        let shouldISync = false;
        if (host) {
          shouldISync = host.clientId === clientIdRef.current;
        } else {
          const oldestUser = [...activeUsers].sort((a, b) => 
            new Date(a.joinedAt || 0).getTime() - new Date(b.joinedAt || 0).getTime()
          )[0];
          shouldISync = oldestUser?.clientId === clientIdRef.current;
        }

        if (shouldISync) {
          channel.send({
            type: 'broadcast',
            event: 'sync_state',
            payload: {
              queue: queueRef.current,
              isPlaying: isPlayingRef.current,
              currentTime: playerTimeRef.current,
              targetClientId: payload.requesterId,
              sentAt: Date.now()
            }
          });
        }
      })
      .on('broadcast', { event: 'sync_state' }, ({ payload }: any) => {
        const isMyTarget = payload.targetClientId === clientIdRef.current;
        if (isMyTarget && payload.queue) {
          setQueue(payload.queue);
          setIsPlaying(payload.isPlaying);
          if (Number.isFinite(payload.currentTime)) {
            const latency = payload.sentAt ? (Date.now() - payload.sentAt) / 1000 : 0;
            const targetTime = Math.max(0, payload.currentTime + (payload.isPlaying ? latency : 0));
            setSeekTime(targetTime);
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
            videoFinished: userPresence.videoFinished || false,
            finishedItemId: userPresence.finishedItemId || null,
            votedToSkip: userPresence.votedToSkip || false,
            clientId: userPresence.clientId
          });
        }
      });
      
      // Sắp xếp theo thời gian tham gia để xác định thứ tự
      onlineUsers.sort((a, b) => new Date(a.joinedAt || 0).getTime() - new Date(b.joinedAt || 0).getTime());

      // Dynamic Host Election
      let canonicalHostRef: string | null = null;
      const hostUsers = onlineUsers.filter(u => u.isHost);
      if (hostUsers.length === 1) {
        canonicalHostRef = hostUsers[0].presence_ref;
      } else if (hostUsers.length > 1) {
        const sortedHosts = [...hostUsers].sort((a, b) => new Date(a.joinedAt || 0).getTime() - new Date(b.joinedAt || 0).getTime());
        canonicalHostRef = sortedHosts[0].presence_ref;
      } else if (onlineUsers.length > 0) {
        canonicalHostRef = onlineUsers[0].presence_ref;
      }

      const myRefId = localRefIdRef.current;
      const normalisedUsers = onlineUsers.map(u => ({
        ...u,
        isHost: u.presence_ref === canonicalHostRef
      }));

      // Bầu chủ phòng mới nếu mình được chọn
      const myPresence = getCurrentUser(onlineUsers);
      const isCanonicalHost = myPresence && myPresence.presence_ref === canonicalHostRef;

      if (isCanonicalHost) {
        if (myPresence && !myPresence.isHost) {
          channel.track({
            clientId: clientIdRef.current,
            username,
            color,
            joinedAt: myPresence.joinedAt,
            isHost: true,
            videoFinished: myPresence.videoFinished || false,
            finishedItemId: myPresence.finishedItemId || null,
            votedToSkip: myPresence.votedToSkip || false
          }).catch((err: any) => console.warn('Track host update error:', err));
          addSystemMessage('👑 Bạn đã trở thành Chủ phòng mới!');
        }
      }

      // Nhường chủ phòng nếu phát hiện người khác hợp lệ hơn
      if (!isCanonicalHost) {
        if (myPresence && myPresence.isHost) {
          channel.track({
            clientId: clientIdRef.current,
            username,
            color,
            joinedAt: myPresence.joinedAt,
            isHost: false,
            videoFinished: myPresence.videoFinished || false,
            finishedItemId: myPresence.finishedItemId || null,
            votedToSkip: myPresence.votedToSkip || false
          }).catch((err: any) => console.warn('Track host step down error:', err));
        }
      }

      usersRef.current = normalisedUsers;
      setUsers(normalisedUsers);
      
      const myRef = Object.keys(state).find(key => {
        const list = state[key];
        return list && list.some((p: any) => p.clientId === clientIdRef.current);
      });
      if (myRef) {
        setLocalRefId(myRef);
      }

      // Check if everyone is finished (Only Host coordinates this)
      const isCurrentHost = normalisedUsers.find(u => u.clientId === clientIdRef.current)?.isHost;
      if (isCurrentHost && normalisedUsers.length > 0) {
        const currentVideo = queueRef.current.length > 0 ? queueRef.current[0] : null;
        const currentItemId = currentVideo ? currentVideo.id : null;
        
        // Everyone must have finished the CURRENT active song item ID
        const allFinished = currentItemId && normalisedUsers.every(u => u.finishedItemId === currentItemId);

        if (allFinished && currentItemId && advancedItemIdRef.current !== currentItemId) {
          advancedItemIdRef.current = currentItemId;
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
          const isFirst = usersRef.current.length === 0;
          channel.track({
            clientId: clientIdRef.current,
            username,
            color,
            joinedAt: new Date().toISOString(),
            isHost: isFirst,
            videoFinished: false,
            finishedItemId: null,
            votedToSkip: false
          });

          syncTimeoutId = setTimeout(() => {
            channel.send({
              type: 'broadcast',
              event: 'request_sync',
              payload: { requesterId: clientIdRef.current }
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
      if (syncTimeoutId) {
        clearTimeout(syncTimeoutId);
      }
      lobby.unsubscribe();
      channel.unsubscribe();
      if (isSupabaseConfigured && supabase) {
        supabase.removeChannel(channel);
        supabase.removeChannel(lobby);
      }
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
  const currentItemId = currentVideo ? currentVideo.id : null;
  useEffect(() => {
    if (!channelRef.current || !username) return;
    
    const me = getCurrentUser(usersRef.current);
    
    channelRef.current.track({
      clientId: clientIdRef.current,
      username,
      color,
      joinedAt: me ? me.joinedAt : new Date().toISOString(),
      isHost: me ? me.isHost || false : false,
      videoFinished: false,
      finishedItemId: null,
      votedToSkip: false
    }).catch((err: any) => console.warn('Track reset error:', err));
  }, [currentItemId, username]);



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
                  id: generateId(),
                  videoId: vid.videoId,
                  title: vid.title,
                  thumbnail: vid.thumbnail_url,
                  addedBy: username,
                  duration: vid.duration
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
          id: generateId(),
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

      case 'voteskip':
      case 'vs': {
        const currentItem = queueRef.current[0];

        if (!currentItem) {
          addSystemMessage('Hàng đợi đang trống, không thể bỏ phiếu qua bài.', true);
          return;
        }

        const myClientId = clientIdRef.current;
        if (!myClientId) {
          addSystemMessage('Không xác định được phiên người dùng. Hãy tải lại trang.', true);
          return;
        }

        const me = getCurrentUser(usersRef.current);
        if (me && me.votedToSkip) {
          addSystemMessage('⚠️ Bạn đã biểu quyết bỏ qua bài hát này rồi.', true);
          return;
        }

        // Cập nhật Presence local cho giao diện UsersList hiển thị checkmark
        channelRef.current.track({
          clientId: clientIdRef.current,
          username,
          color,
          joinedAt: me ? me.joinedAt : new Date().toISOString(),
          isHost: me ? me.isHost || false : false,
          videoFinished: me ? me.videoFinished || false : false,
          finishedItemId: me ? me.finishedItemId || null : null,
          votedToSkip: true
        }).catch((err: any) => console.warn('Track votedToSkip error:', err));

        /*
         * Gửi vote cho các client khác.
         * Host sẽ là coordinator và quyết định khi nào skip.
         */
        channelRef.current.send({
          type: 'broadcast',
          event: 'vote_skip',
          payload: {
            clientId: myClientId,
            username,
            itemId: currentItem.id
          }
        });

        /*
         * Supabase broadcast thường không echo lại sender.
         * Nếu chính người vote là host thì phải xử lý local.
         */
        const isSelfHost = usersRef.current.some(
          user => user.clientId === myClientId && user.isHost
        );

        if (isSelfHost) {
          processSkipVote(myClientId, username, currentItem.id);
        } else {
          addSystemMessage('🗳️ Đã gửi phiếu bỏ qua bài hát.');
        }
        break;
      }

      case 'skip':
      case 'next': {
        if (!isCurrentHost) {
          addSystemMessage('❌ Chỉ Chủ phòng mới có quyền bỏ qua bài hát ngay lập tức.', true);
          return;
        }

        if (queueRef.current.length === 0) {
          addSystemMessage('Hàng đợi đang trống, không thể bỏ qua bài.', true);
          return;
        }

        skipVotesRef.current.clear();
        skipVoteItemIdRef.current = null;

        broadcastSystemMessage(`⏭️ ${username} đã bỏ qua bài hát hiện tại.`);
        playNextSongRef.current();
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

      case 'help':
      case 'h': {
        const helpMsg = `Danh sách các lệnh hỗ trợ:
📌 /play <link hoặc từ khóa> (hoặc /p) - Thêm nhạc vào hàng đợi.
⏸️ /pause - Tạm dừng nhạc (Chủ phòng).
▶️ /resume (hoặc /unpause) - Tiếp tục phát nhạc (Chủ phòng).
⏭️ /skip (hoặc /next) - Bỏ qua bài hát hiện tại (Chủ phòng).
🗑️ /clear - Xóa sạch hàng đợi (Chủ phòng).
📋 /queue (hoặc /q) - Xem danh sách hàng chờ.
ℹ️ /help (hoặc /h) - Hiển thị hướng dẫn này.`;
        addSystemMessage(helpMsg);
        break;
      }

      default: {
        addSystemMessage(`Lỗi: Không tìm thấy lệnh /${cmd}. Gõ "/help" để xem các lệnh hỗ trợ.`, true);
      }
    }
  };

  const handleAddVideo = (video: { videoId: string; title: string; thumbnailUrl: string; duration?: string }) => {
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
    channelRef.current.send({
      type: 'broadcast',
      event: 'queue_update',
      payload: { queue: newQueue }
    });
    setQueue(newQueue);
    broadcastSystemMessage(`🎵 ${username} đã thêm bài hát: "${video.title}" vào hàng đợi.`);
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
    const id = generateId();
    channelRef.current.send({
      type: 'broadcast',
      event: 'emoji_reaction',
      payload: { id, emoji }
    });
    const x = 15 + Math.random() * 70;
    setReactions(prev => [...prev, { id, emoji, x }]);
    setTimeout(() => {
      setReactions(prev => prev.filter(r => r.id !== id));
    }, 2500);
  };

  const handleManualSync = () => {
    if (!channelRef.current) return;
    
    const activeUsers = usersRef.current;
    const host = activeUsers.find(u => u.isHost);
    
    let amIHost = false;
    if (host) {
      amIHost = host.clientId === clientIdRef.current;
    } else if (activeUsers.length > 0) {
      const oldestUser = [...activeUsers].sort((a, b) => 
        new Date(a.joinedAt || 0).getTime() - new Date(b.joinedAt || 0).getTime()
      )[0];
      amIHost = oldestUser?.clientId === clientIdRef.current;
    }

    if (amIHost) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'sync_state',
        payload: {
          queue: queueRef.current,
          isPlaying: isPlayingRef.current,
          currentTime: playerTimeRef.current,
          targetRef: 'new_tab'
        }
      });
      showToast('🔄 Đã phát đồng bộ nhạc cho toàn phòng...');
    } else {
      channelRef.current.send({
        type: 'broadcast',
        event: 'request_sync',
        payload: { requesterRef: localRefIdRef.current || 'new_tab' }
      });
      addSystemMessage('🔄 Đang gửi yêu cầu đồng bộ lại với chủ phòng...');
      showToast('🔄 Đang đồng bộ lại nhạc...');
    }
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
          nextLabel: 'Tiếp tục →',
          prevLabel: '← Quay lại',
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

  const handleTimeUpdate = (time: number) => {
    playerTimeRef.current = time;
  };

  const handleVideoEnded = () => {
    if (!channelRef.current) return;
    
    // Đánh dấu bản thân đã xem xong bài
    const me = getCurrentUser(usersRef.current);
    
    const currentVideo = queueRef.current.length > 0 ? queueRef.current[0] : null;
    const currentItemId = currentVideo ? currentVideo.id : null;
    if (!currentItemId) return;

    // Tránh gửi lặp cho cùng một bài hát
    if (finishedItemIdRef.current === currentItemId) return;
    finishedItemIdRef.current = currentItemId;

    // Nếu chỉ có 1 mình trong phòng (hoặc chưa có ai đồng bộ), tự động next luôn không cần qua server sync
    const activeUsers = usersRef.current;
    if (activeUsers.length <= 1) {
      playNextSongRef.current();
      return;
    }

    channelRef.current.track({
      clientId: clientIdRef.current,
      username,
      color,
      joinedAt: me ? me.joinedAt : new Date().toISOString(),
      isHost: me ? me.isHost || false : false,
      videoFinished: true,
      finishedItemId: currentItemId,
      votedToSkip: me ? me.votedToSkip || false : false
    }).catch((err: any) => console.warn('Track finishedItemId error:', err));
    
    addSystemMessage('⌛ Bạn đã nghe xong. Đang đợi các thành viên khác...');
    showToast('⌛ Đang đợi các thành viên khác...');
  };

  const playNextSong = () => {
    if (!channelRef.current) return;
    
    skipVotesRef.current.clear();
    skipVoteItemIdRef.current = null;
    
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
    const isCurrentHost = usersRef.current.find(u => u.clientId === clientIdRef.current)?.isHost;
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
    const isCurrentHost = usersRef.current.find(u => u.clientId === clientIdRef.current)?.isHost;
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

  const handlePlayItem = (itemId: string) => {
    if (!channelRef.current) return;

    // Check host status
    const isCurrentHost = usersRef.current.find(u => u.clientId === clientIdRef.current)?.isHost;
    if (!isCurrentHost) return;

    const index = queueRef.current.findIndex(item => item.id === itemId);
    if (index === -1) return;

    const targetItem = queueRef.current[index];
    const remainingItems = queueRef.current.filter(item => item.id !== itemId);
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

  const handleMoveNext = (itemId: string) => {
    if (!channelRef.current) return;

    // Check host status
    const isCurrentHost = usersRef.current.find(u => u.clientId === clientIdRef.current)?.isHost;
    if (!isCurrentHost) return;

    const index = queueRef.current.findIndex(item => item.id === itemId);
    if (index === -1 || index <= 1) return;

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
      id: generateId(),
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
          {/* Nút Chọn Theme dạng Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              className="glass-btn glass-btn-secondary text-xs flex items-center justify-center gap-1.5"
              style={{ cursor: 'pointer', height: '32px', padding: '0 10px' }}
              title="Chọn chủ đề"
              aria-label="Chọn chủ đề"
            >
              <Palette size={14} className="text-purple-400" />
              <span className="hidden md:inline text-xs font-semibold">Chủ đề</span>
            </button>

            {showThemeMenu && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowThemeMenu(false)}
                />
                
                <div 
                  className="absolute right-0 mt-2 w-48 rounded-xl border z-50 p-2 flex flex-col gap-1 shadow-2xl animate-fade-in"
                  style={{
                    backgroundColor: 'var(--glass-bg)',
                    backdropFilter: 'blur(16px)',
                    borderColor: 'var(--glass-border)',
                  }}
                >
                  <div className="px-2.5 py-1 text-[10px] font-bold text-muted uppercase tracking-wider">
                    Chọn chủ đề
                  </div>
                  {[
                    { id: 'dark', label: 'Tối Neon', desc: 'Sắc tím huyền ảo', colors: ['#8b5cf6', '#06b6d4'] },
                    { id: 'light', label: 'Kem Sáng', desc: 'Ấm áp & dịu mắt', colors: ['#f6f5f0', '#be185d'] },
                    { id: 'cyberpunk', label: 'Cyberpunk', desc: 'Neon cá tính', colors: ['#ff007f', '#00f0ff'] },
                    { id: 'forest', label: 'Mint Rừng', desc: 'Xanh thanh mát', colors: ['#10b981', '#34d399'] },
                    { id: 'ocean', label: 'Đại Dương', desc: 'Biển sâu cuốn hút', colors: ['#2563eb', '#60a5fa'] }
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => {
                        handleSelectTheme(t.id);
                        setShowThemeMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-all duration-200 hover:bg-white-05 active:scale-98"
                      style={{
                        cursor: 'pointer',
                        background: theme === t.id ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                        border: 'none',
                        color: 'inherit'
                      }}
                    >
                      <div 
                        className="w-4 h-4 rounded-full border border-white-20 shrink-0" 
                        style={{
                          background: `linear-gradient(135deg, ${t.colors[0]} 0%, ${t.colors[1]} 100%)`
                        }}
                      />
                      <div className="flex flex-col min-w-0">
                        <span className={`text-xs font-semibold ${theme === t.id ? 'text-purple-400' : 'text-main'}`}>
                          {t.label}
                        </span>
                        <span className="text-[10px] text-muted truncate">
                          {t.desc}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

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
            onClick={() => setIsVideoHidden(!isVideoHidden)}
            className="glass-btn glass-btn-secondary text-xs flex items-center justify-center"
            style={{ cursor: 'pointer', width: '32px', height: '32px', padding: 0 }}
            title={isVideoHidden ? "Hiện video" : "Ẩn video"}
            aria-label={isVideoHidden ? "Hiện video" : "Ẩn video"}
          >
            {isVideoHidden ? <VideoOff size={14} className="text-rose-400" /> : <Video size={14} />}
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
            <UsersList users={users} myClientId={clientIdRef.current} />
          </div>
        </aside>

        {/* MIDDLE COLUMN: Video Player & QueueList (lg-col-span-6 / lg-col-span-9, order-1 on mobile, lg-order-2 on desktop) */}
        <main className={`${isTheaterMode ? 'lg-col-span-9' : 'lg-col-span-6'} min-h-0 flex flex-col gap-4 overflow-hidden transition-all duration-300 room-middle-column order-1 lg-order-2`}>
          {/* Video Player */}
          <div className="glass-card p-4 shrink-0 overflow-hidden relative">
            <div 
              className="shrink-0 overflow-hidden relative"
              style={{ height: isTheaterMode ? 'clamp(300px, 60vh, 600px)' : 'clamp(200px, 42vh, 480px)', transition: 'height 0.3s' }}
            >
              <YoutubePlayer
                roomId={roomId}
                videoId={currentVideo ? currentVideo.videoId : null}
                isPlaying={isPlaying}
                seekTime={seekTime}
                reactions={reactions}
                viewMode={isVideoHidden ? 'audio' : 'video'}
                isWaitingForOthers={users.find(u => u.clientId === clientIdRef.current)?.videoFinished || false}
                waitingCount={users.filter(u => !u.videoFinished).length}
                onPlayerStateChange={handlePlayerStateChange}
                onTimeUpdate={handleTimeUpdate}
                onVideoEnded={handleVideoEnded}
                onVideoTitleLoaded={handleVideoTitleLoaded}
              />
            </div>
          </div>

          {/* Playlist / QueueList */}
          <div className="glass-card p-4 flex-1 min-h-0 flex flex-col overflow-hidden">
            <QueueList
              queue={queue}
              currentItemId={currentVideo ? currentVideo.id : null}
              isPlaying={isPlaying}
              username={username}
              isHost={!!isCurrentHost}
              onRemoveItem={handleRemoveItem}
              onPlayItem={handlePlayItem}
              onMoveNext={handleMoveNext}
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
