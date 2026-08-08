'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Chip, Avatar } from "@nextui-org/react";
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import YoutubePlayer from './YoutubePlayer';
import QueueList, { PlaylistItem } from './QueueList';
import ChatBox, { ChatMessage } from './ChatBox';
import UsersList, { RoomUser } from './UsersList';
import SearchUI from './SearchUI';
import { useQueue } from '@/hooks/useQueue';
import { useChatCommands } from '@/hooks/useChatCommands';
import { useRoomSync } from '@/hooks/useRoomSync';
import { useToast } from '@/components/ToastContext';
import {
  Disc,
  Share2,
  LogOut,
  Sparkles,
  MonitorPlay,
  RefreshCw,
  HelpCircle,
  Sun,
  Moon,
  Video,
  VideoOff,
  Lock,
  MoreVertical,
  Headphones,
  Lightbulb,
  LightbulbOff,
  X
} from 'lucide-react';
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
  const { showToast } = useToast();

  // State quản lý theme & mobile menu
  const [theme, setTheme] = useState<string>('dark');
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const THEMES = ['dark', 'light', 'cyberpunk', 'forest', 'ocean'];

  // Khôi phục theme từ localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('yt_together_theme') || 'dark';
    setTheme(savedTheme);
    document.documentElement.classList.remove('dark', 'light', 'cyberpunk', 'forest', 'ocean');
    document.documentElement.classList.add(savedTheme);
  }, []);

  const toggleTheme = () => {
    setTheme(prev => {
      const newTheme = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('yt_together_theme', newTheme);
      document.documentElement.classList.remove('dark', 'light');
      document.documentElement.classList.add(newTheme);
      return newTheme;
    });
  };

  // State quản lý kết nối & user
  const [username, setUsername] = useState('');
  const [hasLoadedName, setHasLoadedName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [color, setColor] = useState('#00F0FF');
  const [localRefId, setLocalRefId] = useState<string | null>(null);
  const [users, setUsers] = useState<RoomUser[]>([]);
  const [dbHostClientId, _setDbHostClientId] = useState<string | null>(null);
  const dbHostClientIdRef = useRef<string | null>(null);

  const setDbHostClientId = (id: string | null) => {
    dbHostClientIdRef.current = id;
    _setDbHostClientId(id);
  };

  // State xác thực mật khẩu
  const [authStatus, setAuthStatus] = useState<'checking' | 'authenticated' | 'requires_password'>('checking');
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // State quản lý trình phát, queue & chat
  const [playlistIdToLoad, setPlaylistIdToLoad] = useState<string | null>(null);
  const [roomName, setRoomName] = useState(`Phòng ${roomId}`);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [isLightsOff, setIsLightsOff] = useState(false);
  const [isVideoHidden, setIsVideoHidden] = useState(false);
  const [reactions, setReactions] = useState<{ id: string; emoji: string; x: number }[]>([]);

  // Refs của client & player
  const playerTimeRef = useRef<number>(0);
  const localRefIdRef = useRef<string | null>(null);
  localRefIdRef.current = localRefId;

  const usersRef = useRef<RoomUser[]>([]);
  usersRef.current = users;

  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15);
  };

  const clientIdRef = useRef<string | null>(null);
  if (!clientIdRef.current) {
    if (typeof window !== 'undefined') {
      let saved = localStorage.getItem('yt_together_clientId');
      if (!saved) {
        saved = generateId();
        localStorage.setItem('yt_together_clientId', saved);
      }
      clientIdRef.current = saved;
    } else {
      clientIdRef.current = generateId();
    }
  }

  const advancedItemIdRef = useRef<string | null>(null);
  const finishedItemIdRef = useRef<string | null>(null);
  const hasReceivedInitialSyncRef = useRef<boolean>(false);
  const playNextSongRef = useRef<() => void>(() => {});

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

  const getCurrentUser = (activeUsers: RoomUser[]): RoomUser | undefined => {
    let me = activeUsers.find(u => u.clientId === clientIdRef.current);
    if (me) return me;
    me = activeUsers.find(u => u.username === username && u.color === color);
    if (me) return me;
    me = activeUsers.find(u => u.presence_ref === localRefIdRef.current);
    return me;
  };

  const getIsCurrentHost = (): boolean => {
    if (isSupabaseConfigured) {
      if (dbHostClientIdRef.current) {
        return dbHostClientIdRef.current === clientIdRef.current;
      }
      return !!getCurrentUser(usersRef.current)?.isHost;
    }
    return !!getCurrentUser(usersRef.current)?.isHost;
  };

  const broadcastSystemMessage = (text: string, isError = false) => {
    if (!channelRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'system_action',
      payload: { text, isError }
    });
    addSystemMessage(text, isError);
  };

  // Helper update DB
  const updateRoomInDb = async (updates: {
    is_playing?: boolean;
    seek_time?: number;
    queue?: PlaylistItem[];
    host_client_id?: string;
    current_video_id?: string | null;
  }) => {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      const { error } = await (supabase as any)
        .from('rooms')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', roomId);
        
      if (error) {
        console.error('[RoomClient] Lỗi cập nhật DB:', error);
      }
    } catch (err) {
      console.error('[RoomClient] Lỗi gọi API cập nhật DB:', err);
    }
  };

  // Stable callback refs để bridge useRoomSync ↔ useQueue mà không tạo circular dependency
  const setQueueRef = useRef<React.Dispatch<React.SetStateAction<PlaylistItem[]>>>(() => {});
  const setIsPlayingRef = useRef<React.Dispatch<React.SetStateAction<boolean>>>(() => {});
  const setSeekTimeRef = useRef<React.Dispatch<React.SetStateAction<number | null>>>(() => {});
  const sharedQueueRef = useRef<PlaylistItem[]>([]);
  const sharedIsPlayingRef = useRef<boolean>(false);
  const queueRefPtr = useRef<React.MutableRefObject<PlaylistItem[]>>(sharedQueueRef);
  const isPlayingRefPtr = useRef<React.MutableRefObject<boolean>>(sharedIsPlayingRef);

  const proxyQueueRef = useMemo(() => ({
    get current() { return queueRefPtr.current.current; },
    set current(v) { queueRefPtr.current.current = v; }
  }), []) as React.MutableRefObject<PlaylistItem[]>;

  const proxyIsPlayingRef = useMemo(() => ({
    get current() { return isPlayingRefPtr.current.current; },
    set current(v) { isPlayingRefPtr.current.current = v; }
  }), []) as React.MutableRefObject<boolean>;

  // 1. Hook useRoomSync
  const { channelRef, lobbyChannelRef } = useRoomSync({
    roomId,
    username,
    color,
    authStatus,
    roomName,
    users,
    setUsers,
    usersRef,
    clientIdRef,
    localRefId,
    setLocalRefId,
    localRefIdRef,
    dbHostClientId,
    dbHostClientIdRef,
    setDbHostClientId,
    queueRef: proxyQueueRef,
    setQueue: (v) => setQueueRef.current(v as any),
    isPlayingRef: proxyIsPlayingRef,
    setIsPlaying: (v) => setIsPlayingRef.current(v as any),
    setSeekTime: (v) => setSeekTimeRef.current(v as any),
    playerTimeRef,
    addSystemMessage,
    showToast,
    processSkipVote: (voter, user, item) => processSkipVote(voter, user, item),
    playNextSongRef,
    advancedItemIdRef,
    finishedItemIdRef,
    setReactions,
    hasReceivedInitialSyncRef,
    updateRoomInDb,
    getCurrentUser,
    getIsCurrentHost,
    setMessages
  });

  // 2. Hook useQueue
  const {
    queue,
    setQueue,
    isPlaying,
    setIsPlaying,
    seekTime,
    setSeekTime,
    queueRef,
    isPlayingRef,
    skipVotesRef,
    skipVoteItemIdRef,
    handleAddVideo,
    handleRemoveItem,
    handlePlayItem,
    handleMoveNext,
    playNextSong,
    handlePlaylistLoaded,
    handleVideoTitleLoaded
  } = useQueue({
    roomId,
    username,
    channelRef,
    getIsCurrentHost,
    updateRoomInDb,
    broadcastSystemMessage,
    showToast,
    generateId
  });

  // Kết nối refs ổn định với các hàm thực từ useQueue
  setQueueRef.current = setQueue;
  setIsPlayingRef.current = setIsPlaying;
  setSeekTimeRef.current = setSeekTime;
  queueRefPtr.current = queueRef;
  isPlayingRefPtr.current = isPlayingRef;

  playNextSongRef.current = playNextSong;

  // 3. Hook useChatCommands
  const { handleCommand } = useChatCommands({
    username,
    channelRef,
    getIsCurrentHost,
    updateRoomInDb,
    addSystemMessage,
    broadcastSystemMessage,
    queueRef,
    setQueue,
    setIsPlaying,
    setSeekTime,
    playNextSong,
    playerTimeRef,
    generateId,
    clientIdRef,
    getCurrentUser,
    usersRef,
    color,
    processSkipVote: (voter, user, item) => processSkipVote(voter, user, item),
    dbHostClientId
  });

  const processSkipVote = (
    voterClientId: string,
    voterUsername: string,
    itemId: string
  ) => {
    const currentItem = queueRef.current[0];
    if (!currentItem || currentItem.id !== itemId) return;

    const isCurrentHost = getIsCurrentHost();
    if (!isCurrentHost) return;

    if (skipVoteItemIdRef.current !== itemId) {
      skipVoteItemIdRef.current = itemId;
      skipVotesRef.current.clear();
    }

    if (skipVotesRef.current.has(voterClientId)) return;

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

    addSystemMessage(`🗳️ ${voterUsername} đã biểu quyết bỏ qua bài hát (${voteCount}/${requiredVotes} phiếu).`);

    if (voteCount >= requiredVotes) {
      skipVotesRef.current.clear();
      skipVoteItemIdRef.current = null;

      broadcastSystemMessage(`⏭️ Đã đủ ${voteCount}/${requiredVotes} phiếu. Bỏ qua bài hiện tại.`);
      playNextSong();
    }
  };

  // Kiểm tra xác thực mật khẩu khi trực tiếp vào bằng URL
  useEffect(() => {
    const isHost = !!sessionStorage.getItem(`yt_room_config_${roomId}`);
    const isAuth = sessionStorage.getItem(`yt_room_auth_${roomId}`) === 'true';

    if (isHost || isAuth) {
      if (isAuth) {
        sessionStorage.removeItem(`yt_room_auth_${roomId}`);
      }
      setAuthStatus('authenticated');
      return;
    }

    const checkPasswordRequirement = async () => {
      try {
        const response = await fetch('/api/room/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId })
        });
        const data = await response.json();
        
        if (response.ok && data.requiresPassword) {
          setAuthStatus('requires_password');
        } else {
          setAuthStatus('authenticated');
        }
      } catch (err) {
        setAuthStatus('authenticated');
      }
    };

    checkPasswordRequirement();
  }, [roomId]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = nameInput.trim();
    if (!username && !name) {
      setPasswordError('Vui lòng nhập tên hiển thị của bạn!');
      return;
    }

    try {
      const response = await fetch('/api/room/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, password: passwordInput })
      });
      const data = await response.json();

      if (response.ok && data.success) {
        if (!username && name) {
          setUsername(name);
          setHasLoadedName(true);
          localStorage.setItem('yt_together_username', name);
        }
        setAuthStatus('authenticated');
      } else {
        setPasswordError(data.error || 'Mật khẩu không chính xác!');
      }
    } catch (err) {
      setPasswordError('Lỗi kết nối máy chủ!');
    }
  };

  // Khởi tạo cấu hình phòng từ Database
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    if (!isSupabaseConfigured || !supabase || !username) return;

    const initRoom = async () => {
      try {
        const { data: room, error } = await (supabase as any)
          .from('rooms')
          .select('*')
          .eq('id', roomId)
          .single();

        if (error || !room) {
          let hasPassword = false;
          let passwordHash = null;
          try {
            const stored = sessionStorage.getItem(`yt_room_config_${roomId}`);
            if (stored) {
              const config = JSON.parse(stored);
              hasPassword = config.hasPassword || false;
              passwordHash = config.passwordHash || null;
            }
          } catch (e) {}

          const dbRoomName = hasPassword && passwordHash ? `${roomName}:::pw_${passwordHash}` : roomName;

          const { error: insertError } = await (supabase as any)
            .from('rooms')
            .insert({
              id: roomId,
              name: dbRoomName,
              host_client_id: clientIdRef.current,
              is_playing: false,
              seek_time: 0,
              queue: []
            });

          if (insertError) {
            console.error('[RoomClient] Lỗi khởi tạo phòng:', insertError);
          } else {
            setQueue([]);
            setIsPlaying(false);
            setDbHostClientId(clientIdRef.current);
            addSystemMessage('👑 Bạn đã khởi tạo phòng và trở thành Chủ phòng!');
          }
        } else {
          const rawName = (room as any).name || '';
          if (rawName.includes(':::pw_')) {
            setRoomName(rawName.split(':::pw_')[0]);
          } else {
            setRoomName(rawName);
          }
          setQueue(((room as any).queue as PlaylistItem[]) || []);
          setIsPlaying((room as any).is_playing || false);
          setDbHostClientId((room as any).host_client_id);
          if (Number.isFinite((room as any).seek_time)) {
            setSeekTime((room as any).seek_time);
            setTimeout(() => setSeekTime(null), 100);
          }
        }
      } catch (err) {
        console.error('[RoomClient] Lỗi khởi tạo phòng:', err);
      }
    };

    initRoom();
  }, [username, roomId, authStatus]);

  useEffect(() => {
    if (!isSupabaseConfigured || !isPlaying) return;
    const isCurrentHost = dbHostClientId === clientIdRef.current;
    if (!isCurrentHost) return;

    const interval = setInterval(() => {
      if (isPlayingRef.current) {
        updateRoomInDb({ seek_time: playerTimeRef.current });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isPlaying, dbHostClientId]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    if (!lobbyChannelRef.current || !username) return;
    
    let hasPassword = false;
    try {
      const stored = sessionStorage.getItem(`yt_room_config_${roomId}`);
      if (stored) {
        const config = JSON.parse(stored);
        hasPassword = config.hasPassword || false;
      }
    } catch (e) {}

    const currentHost = users.find(u => u.isHost)?.username || username;

    try {
      lobbyChannelRef.current?.track?.({
        type: 'room',
        roomId,
        roomName: roomName,
        hostName: currentHost,
        hasPassword: hasPassword,
        userCount: Math.max(1, users.length)
      })?.catch((err: any) => console.warn('Lobby track error:', err));
    } catch (e) {}
  }, [users, username, roomId, roomName]);

  const currentVideo = queue.length > 0 ? queue[0] : null;
  const currentItemId = currentVideo ? currentVideo.id : null;

  useEffect(() => {
    if (!channelRef.current || !username) return;
    const me = getCurrentUser(usersRef.current);
    
    try {
      channelRef.current?.track?.({
        clientId: clientIdRef.current,
        username,
        color,
        joinedAt: me ? me.joinedAt : new Date().toISOString(),
        isHost: isSupabaseConfigured ? false : (me ? me.isHost || false : false),
        videoFinished: false,
        finishedItemId: null,
        votedToSkip: false
      })?.catch((err: any) => console.warn('Track reset error:', err));
    } catch (e) {}
  }, [currentItemId, username]);

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

    setMessages((prev) => [...prev, {
      id: messageId,
      username: username,
      text: text,
      timestamp: new Date(),
      isSystem: false,
      isError: false
    }].slice(-500));
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

    hasReceivedInitialSyncRef.current = false;

    if (amIHost) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'sync_state',
        payload: {
          queue: queueRef.current,
          isPlaying: isPlayingRef.current,
          currentTime: playerTimeRef.current,
          sentAt: Date.now(),
          targetRef: 'all',
          isForced: true,
          hostClientId: dbHostClientIdRef.current
        }
      });
      showToast('🔄 Đã đồng bộ nhạc cho toàn phòng!');
    } else {
      channelRef.current.send({
        type: 'broadcast',
        event: 'request_sync',
        payload: { 
          requesterId: clientIdRef.current,
          requesterRef: localRefIdRef.current || 'new_tab',
          isForced: true
        }
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

  // ĐỒNG BỘ TRÌNH PHÁT
  const handlePlayerStateChange = (_state: 'PLAYING' | 'PAUSED', time: number) => {
    playerTimeRef.current = time;
  };

  const handleTimeUpdate = (time: number) => {
    playerTimeRef.current = time;
  };

  const handleVideoEnded = () => {
    if (!channelRef.current) return;
    const me = getCurrentUser(usersRef.current);
    const currentVideo = queueRef.current.length > 0 ? queueRef.current[0] : null;
    const currentItemId = currentVideo ? currentVideo.id : null;
    if (!currentItemId) return;

    if (finishedItemIdRef.current === currentItemId) return;
    finishedItemIdRef.current = currentItemId;

    const activeUsers = usersRef.current;
    const isCurrentHost = activeUsers.find(u => u.clientId === clientIdRef.current)?.isHost;
    
    if (activeUsers.length <= 1) {
      playNextSong();
      return;
    }

    // FIX: Giảm timeout ghost user xuống 5s cho Host và 8s cho Client
    const timeoutMs = isCurrentHost ? 5000 : 8000;
    
    setTimeout(() => {
      if (finishedItemIdRef.current === currentItemId && queueRef.current.length > 0 && queueRef.current[0].id === currentItemId) {
        console.log(`[Auto-Next Fallback] Kích hoạt chuyển bài (Sau ${timeoutMs/1000}s chờ).`);
        playNextSong();
      }
    }, timeoutMs);

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

  const handleLocalSeek = async (time: number) => {
    const isCurrentHost = getIsCurrentHost();
    if (!isCurrentHost) return;
    
    playerTimeRef.current = time;
    if (isSupabaseConfigured) {
      await updateRoomInDb({ seek_time: time });
    }
    
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'playback_state',
        payload: {
          isPlaying: isPlaying,
          seekTime: time,
          sentAt: Date.now()
        }
      });
    }
    broadcastSystemMessage(`⏩ ${username} đã tua nhạc tới mốc ${Math.floor(time)} giây.`);
  };

  const handleCopyLink = () => {
    if (typeof window === 'undefined') return;
    navigator.clipboard.writeText(window.location.href);
    addSystemMessage('Đã sao chép liên kết phòng! Hãy gửi cho bạn bè để cùng nghe nhạc.');
    showToast('Đã sao chép liên kết phòng!');
  };

  const handleLeaveRoom = async () => {
    try {
      if (channelRef.current?.untrack) await channelRef.current.untrack();
      if (lobbyChannelRef.current?.untrack) await lobbyChannelRef.current.untrack();
    } catch (e) {}

    const storageKey = `yt_together_room_${roomId}`;
    try {
      localStorage.removeItem(storageKey);
    } catch (e) {}
    router.push('/');
  };

  // Phục hồi username từ localStorage khi mount
  useEffect(() => {
    const storedName = localStorage.getItem('yt_together_username');
    if (storedName) {
      setUsername(storedName);
      setNameInput(storedName);
    }
    setHasLoadedName(true);
    
    const randomColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    setColor(randomColor);

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

  // Cập nhật tên bài hát lên tiêu đề Tab trình duyệt (document.title)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (currentVideo && currentVideo.title) {
      const statusIcon = isPlaying ? '▶️' : '⏸️';
      document.title = `${statusIcon} ${currentVideo.title} | YouTube Together`;
    } else {
      document.title = 'YouTube Together';
    }
  }, [currentVideo, isPlaying]);

  // Lắng nghe phím tắt toàn cục (L: tắt đèn, T: rạp hát, Esc: bật lại đèn)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Bỏ qua nếu đang gõ chữ trong ô input, textarea hoặc contenteditable
      const activeEl = document.activeElement;
      if (activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.getAttribute('contenteditable') === 'true'
      )) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'l') {
        setIsLightsOff(prev => !prev);
      } else if (key === 't') {
        setIsTheaterMode(prev => !prev);
      } else if (e.key === 'Escape') {
        setIsLightsOff(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const displayUsers = isSupabaseConfigured
    ? users.map(u => ({ ...u, isHost: dbHostClientId ? u.clientId === dbHostClientId : u.isHost }))
    : users;

  // 1. Màn hình Loading
  if (authStatus === 'checking' || !hasLoadedName) {
    return (
      <div className="h-[100dvh] w-full flex flex-col items-center justify-center relative overflow-hidden bg-[#080810]">
        <div className="w-16 h-16 rounded-full border-4 border-purple-500/30 border-t-purple-500 animate-spin mb-4"></div>
        <h2 className="text-white font-bold text-xl mb-2">Đang tải dữ liệu phòng...</h2>
        <p className="text-neutral-400 text-sm">Vui lòng chờ trong giây lát</p>
      </div>
    );
  }

  // 2. Màn hình Mật khẩu
  if (authStatus === 'requires_password') {
    return (
      <div className="h-[100dvh] w-full flex flex-col items-center justify-center relative overflow-hidden bg-[#080810]">
        <div className="glass-card p-8 rounded-2xl w-full max-w-sm flex flex-col items-center animate-fade-in text-center border border-purple-500/20 shadow-[0_0_50px_rgba(139,92,246,0.1)]">
          <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center mb-4 text-purple-400">
            <LogOut size={28} className="transform -rotate-90" />
          </div>
          <h2 className="text-white font-bold text-2xl mb-2">Phòng Có Mật Khẩu</h2>
          <p className="text-neutral-400 text-sm mb-6">Bạn cần nhập {!username ? 'tên và ' : ''}mật khẩu để vào phòng này</p>
          
          <form onSubmit={handlePasswordSubmit} className="w-full flex flex-col gap-4">
            {!username && (
              <div className="flex flex-col text-left gap-1.5">
                <label className="text-xs font-semibold text-neutral-400">Tên hiển thị</label>
                <input
                  type="text"
                  placeholder="Nhập tên của bạn..."
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  className="glass-input py-3 px-4 rounded-xl text-white text-base focus:ring-2 focus:ring-purple-500/50"
                  maxLength={20}
                  autoFocus
                />
              </div>
            )}
            <div className="flex flex-col text-left gap-1.5">
              <label className="text-xs font-semibold text-neutral-400">Mật khẩu phòng</label>
              <input
                type="password"
                placeholder="Nhập mật khẩu..."
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                className="glass-input py-3 px-4 rounded-xl text-white text-base focus:ring-2 focus:ring-purple-500/50"
                autoFocus={!!username}
              />
              {passwordError && (
                <span className="text-rose-400 text-xs font-semibold px-1">{passwordError}</span>
              )}
            </div>
            <button type="submit" className="glass-btn w-full py-3 rounded-xl mt-2">
              Vào Phòng
            </button>
            <button type="button" onClick={() => router.push('/')} className="glass-btn glass-btn-secondary w-full py-3 rounded-xl mt-1">
              Quay lại Sảnh
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 3. Màn hình Nhập tên
  if (!username) {
    return (
      <div className="h-[100dvh] w-full flex flex-col items-center justify-center relative overflow-hidden bg-[#080810]">
        <div className="glass-card p-8 rounded-2xl w-full max-w-sm flex flex-col items-center animate-fade-in text-center border border-purple-500/20 shadow-[0_0_50px_rgba(139,92,246,0.1)] z-10">
          <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center mb-4 text-purple-400">
            <Headphones size={28} />
          </div>
          <h2 className="text-white font-bold text-2xl mb-2">Vào Phòng</h2>
          <p className="text-neutral-400 text-sm mb-6">Nhập tên hiển thị của bạn</p>
          
          <form onSubmit={(e) => { 
            e.preventDefault(); 
            const name = nameInput.trim();
            if (name) { 
              setUsername(name); 
              setHasLoadedName(true); 
              localStorage.setItem('yt_together_username', name);
            } 
          }} className="w-full flex flex-col gap-4">
            <input
              type="text"
              placeholder="Tên của bạn..."
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              className="glass-input py-3 px-4 rounded-xl text-white text-base focus:ring-2 focus:ring-purple-500/50 text-center"
              autoFocus
              maxLength={20}
            />
            
            <div className="flex flex-wrap gap-2 justify-center mt-2 mb-4">
              {AVATAR_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-white' : 'hover:scale-110 opacity-70'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>

            <button type="submit" disabled={!nameInput.trim()} className="glass-btn w-full py-3 rounded-xl mt-2 disabled:opacity-50 disabled:cursor-not-allowed">
              Tham Gia
            </button>
            <button type="button" onClick={() => router.push('/')} className="glass-btn glass-btn-secondary w-full py-3 rounded-xl mt-1">
              Quay lại Sảnh
            </button>
          </form>
        </div>
      </div>
    );
  }

  const isCurrentHost = users.find(u => u.presence_ref === localRefId)?.isHost;

  return (
    <div className={`h-dvh max-h-dvh w-full mx-auto p-4 flex flex-col gap-4 overflow-hidden relative z-0 transition-colors duration-500 ${
      isLightsOff ? 'bg-black !p-0 lights-off-active !max-w-none' : 'max-w-[1600px]'
    } ${isTheaterMode ? 'theater-active' : ''}`}>
      
      {/* CSS Styles cho hiệu ứng chuyển đổi mượt mà */}
      <style dangerouslySetInnerHTML={{
        __html: `
        .workspace-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
          transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }
        @media (min-width: 1024px) {
          .workspace-container {
            flex-direction: row;
          }
        }

        /* Hiệu ứng chuyển động cho 2 cột bên */
        .sidebar-left, .sidebar-right {
          width: 100%;
          transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
          opacity: 1;
          max-height: 1000px;
          overflow: hidden;
        }
        @media (min-width: 1024px) {
          .sidebar-left, .sidebar-right {
            width: 25%;
            max-height: none;
          }
        }

        /* Ẩn các cột khi tắt đèn */
        .lights-off-active .sidebar-left,
        .lights-off-active .sidebar-right {
          opacity: 0 !important;
          width: 0% !important;
          max-height: 0px !important;
          margin: 0 !important;
          padding: 0 !important;
          pointer-events: none;
        }

        /* Ẩn cột trái khi ở chế độ rạp hát */
        @media (min-width: 1024px) {
          .theater-active .sidebar-left {
            opacity: 0 !important;
            width: 0% !important;
            pointer-events: none;
            margin: 0 !important;
            padding: 0 !important;
          }
        }

        /* Cột chính ở giữa */
        .main-column {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 16px;
          transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }

        /* Co giãn Queue nhạc */
        .queue-container {
          transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
          max-height: 600px;
          opacity: 1;
          overflow: hidden;
        }
        .lights-off-active .queue-container {
          max-height: 0px !important;
          opacity: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          pointer-events: none;
        }

        /* Ẩn header mượt mà bằng cách trượt lên */
        .header-container {
          position: relative;
          z-index: 50; /* Đảm bảo ô tìm kiếm nổi lên trên các thành phần khác */
          transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
          max-height: 200px;
          opacity: 1;
          transform: translateY(0);
        }
        .lights-off-active .header-container {
          max-height: 0px !important;
          opacity: 0 !important;
          transform: translateY(-80px) !important;
          margin: 0 !important;
          padding: 0 !important;
          pointer-events: none;
        }

        /* Tối ưu hóa kích thước màn hình YouTube */
        .player-card-wrapper {
          transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
          height: clamp(200px, 42vh, 480px);
          width: 100%;
        }
        @media (min-width: 1024px) {
          .theater-active .player-card-wrapper {
            height: clamp(300px, 60vh, 600px);
          }
          .lights-off-active .player-card-wrapper {
            height: 96dvh; /* Chiếm 96% chiều cao màn hình khi tắt đèn */
          }
        }
        @media (max-width: 1023px) {
          .lights-off-active .player-card-wrapper {
            height: 90dvh; /* Cho mobile */
          }
        }

        /* Card bọc trình phát khi tắt đèn */
        .player-card-container {
          transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
          width: 100%;
        }
        .lights-off-active .player-card-container {
          max-width: 98vw !important; /* To sát viền trình duyệt */
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
          margin: 0 auto;
        }

        /* Style lại Intro.js sang giao diện tối đồng bộ */
        .introjs-tooltip {
          background-color: rgba(20, 20, 30, 0.95) !important;
          backdrop-filter: blur(12px) !important;
          border: 1px solid rgba(139, 92, 246, 0.3) !important;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5), 0 0 20px rgba(139, 92, 246, 0.1) !important;
          color: #ffffff !important;
          border-radius: 16px !important;
          font-family: inherit !important;
          padding: 20px !important;
        }

        .introjs-tooltiptext {
          color: #e5e5e5 !important;
          font-size: 14px !important;
          line-height: 1.6 !important;
        }

        .introjs-arrow.top {
          border-bottom-color: rgba(20, 20, 30, 0.95) !important;
        }
        .introjs-arrow.bottom {
          border-top-color: rgba(20, 20, 30, 0.95) !important;
        }
        .introjs-arrow.left {
          border-right-color: rgba(20, 20, 30, 0.95) !important;
        }
        .introjs-arrow.right {
          border-left-color: rgba(20, 20, 30, 0.95) !important;
        }

        /* Nút điều hướng */
        .introjs-button {
          background: rgba(255, 255, 255, 0.08) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          color: #ffffff !important;
          text-shadow: none !important;
          border-radius: 8px !important;
          font-weight: 600 !important;
          font-size: 13px !important;
          padding: 8px 16px !important;
          transition: all 0.2s ease !important;
        }
        .introjs-button:hover {
          background: rgba(168, 85, 247, 0.2) !important;
          border-color: rgba(168, 85, 247, 0.5) !important;
          color: #c084fc !important;
        }
        
        /* Nút Bỏ qua / Skip */
        .introjs-skipbutton {
          color: rgba(255, 255, 255, 0.4) !important;
          font-size: 18px !important;
        }
        .introjs-skipbutton:hover {
          color: #ff4a4a !important;
        }

        /* Checkbox Don't show this again */
        .introjs-dontshowagain {
          color: rgba(255, 255, 255, 0.6) !important;
          font-size: 13px !important;
          margin-top: 12px !important;
        }
        .introjs-dontshowagain input[type="checkbox"] {
          accent-color: #a855f7 !important;
          margin-right: 6px !important;
        }

        /* Bullets phân trang */
        .introjs-bullets ul li a {
          background: rgba(255, 255, 255, 0.2) !important;
        }
        .introjs-bullets ul li a.active {
          background: #a855f7 !important;
          box-shadow: 0 0 8px #a855f7 !important;
        }
      `}} />

      
      {/* HEADER */}
      <div className="header-container shrink-0">
        <Card className="flex flex-col sm:flex-row items-center justify-between p-4 gap-4 shrink-0 flex-wrap overflow-visible z-50 bg-content1/50 border-none shadow-lg">
          <div className="flex items-center gap-4 room-header-branding">
            <div className="w-12 h-12 rounded-xl bg-secondary/20 flex items-center justify-center text-secondary shadow-md">
              <Disc size={24} className="animate-spin-slow text-secondary" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight flex items-center gap-3">
                {roomName}
                <Chip size="sm" color="primary" variant="flat" className="font-mono uppercase tracking-widest">
                  ID: {roomId}
                </Chip>
              </h1>
            </div>
          </div>

          {/* Search Bar in Header */}
          <div className="flex-1 w-full sm:w-auto max-w-2xl mt-2 sm:mt-0 order-last sm:order-none room-header-search">
            <SearchUI onAddVideo={handleAddVideo} />
          </div>

          {/* TOOLBAR BUTTONS - DESKTOP */}
          <div className="hidden md:flex items-center gap-3 room-nav-buttons">
            <Button isIconOnly size="sm" variant="flat" color="secondary" onPress={toggleTheme} title={theme === 'dark' ? 'Chuyển sang nền Sáng' : 'Chuyển sang nền Tối'}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </Button>

            <Button isIconOnly size="sm" variant="flat" onPress={handleManualSync} title="Đồng bộ lại">
              <RefreshCw size={16} />
            </Button>
            
            <Button isIconOnly size="sm" variant="flat" onPress={() => setIsTheaterMode(!isTheaterMode)} title="Chế độ rạp hát">
              <MonitorPlay size={16} />
            </Button>

            <Button isIconOnly size="sm" variant="flat" onPress={() => setIsLightsOff(true)} title="Tắt đèn">
              <Lightbulb size={16} />
            </Button>

            <Button isIconOnly size="sm" variant="flat" color={isVideoHidden ? "danger" : "default"} onPress={() => setIsVideoHidden(!isVideoHidden)} title={isVideoHidden ? "Hiện video" : "Ẩn video"}>
              {isVideoHidden ? <VideoOff size={16} /> : <Video size={16} />}
            </Button>

            <Button isIconOnly size="sm" variant="flat" onPress={handleStartTour} title="Hướng dẫn sử dụng">
              <HelpCircle size={16} />
            </Button>

            <Button size="sm" variant="flat" color="primary" onPress={handleCopyLink} startContent={<Share2 size={16} />}>
              Mời Bạn Bè
            </Button>
            
            <Button size="sm" variant="flat" color="danger" onPress={handleLeaveRoom} startContent={<LogOut size={16} />}>
              Rời Phòng
            </Button>
          </div>

          {/* MOBILE OVERFLOW MENU */}
          <div className="flex md:hidden items-center gap-2">
            <Button isIconOnly size="sm" variant="flat" color="secondary" onPress={toggleTheme}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </Button>

            <Dropdown>
              <DropdownTrigger>
                <Button isIconOnly size="sm" variant="flat">
                  <MoreVertical size={16} />
                </Button>
              </DropdownTrigger>
              <DropdownMenu variant="flat" color="secondary" aria-label="More Options" onAction={(key) => {
                switch(key) {
                  case "sync": handleManualSync(); break;
                  case "theater": setIsTheaterMode(!isTheaterMode); break;
                  case "lightsoff": setIsLightsOff(true); break;
                  case "video": setIsVideoHidden(!isVideoHidden); break;
                  case "help": handleStartTour(); break;
                  case "invite": handleCopyLink(); break;
                  case "leave": handleLeaveRoom(); break;
                }
              }}>
                <DropdownItem key="theater" startContent={<MonitorPlay size={16} />}>Chế độ rạp hát</DropdownItem>
                <DropdownItem key="lightsoff" startContent={<Lightbulb size={16} />}>Tắt đèn</DropdownItem>
                <DropdownItem key="video" startContent={isVideoHidden ? <Video size={16} /> : <VideoOff size={16} />}>{isVideoHidden ? 'Hiện video' : 'Ẩn video'}</DropdownItem>
                <DropdownItem key="help" startContent={<HelpCircle size={16} />}>Hướng dẫn sử dụng</DropdownItem>
                <DropdownItem key="invite" startContent={<Share2 size={16} />}>Sao chép link mời</DropdownItem>
                <DropdownItem key="leave" className="text-danger" color="danger" startContent={<LogOut size={16} />}>Rời phòng</DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        </Card>
      </div>

      {/* Floating Button khi Tắt Đèn */}
      <div 
        className="fixed top-4 right-4 z-[999] transition-all duration-500 ease-in-out"
        style={{
          opacity: isLightsOff ? 1 : 0,
          pointerEvents: isLightsOff ? 'auto' : 'none',
          transform: isLightsOff ? 'scale(1)' : 'scale(0.8)'
        }}
      >
        <Button 
          size="sm" 
          color="warning" 
          variant="flat" 
          onPress={() => setIsLightsOff(false)}
          startContent={<Lightbulb size={16} />}
          className="backdrop-blur-md bg-black/40 border border-white/10"
        >
          Bật đèn
        </Button>
      </div>

      {/* WORKSPACE - 3 COLUMNS */}
      <div className="flex-1 min-h-0 workspace-container">
        {/* LEFT COLUMN: Active Users */}
        <aside className="sidebar-left room-left-column">
          <Card className="p-4 flex-1 min-h-0 flex flex-col overflow-hidden bg-content1/50 border-none shadow-lg h-full">
            <UsersList users={displayUsers} myClientId={clientIdRef.current || ""} />
          </Card>
        </aside>

        {/* MIDDLE COLUMN: Video Player & QueueList */}
        <main className="main-column relative room-middle-column">
          


          <Card className="p-4 shrink-0 overflow-hidden relative bg-content1/50 border-none shadow-lg player-card-container">
            <div className="shrink-0 overflow-hidden relative rounded-xl player-card-wrapper">
              <YoutubePlayer
                roomId={roomId}
                videoId={currentVideo?.videoId || ""}
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
          </Card>

          <div className="queue-container flex-1 min-h-0">
            <Card className="p-4 h-full flex flex-col overflow-hidden bg-content1/50 border-none shadow-lg">
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
            </Card>
          </div>
        </main>

        {/* RIGHT COLUMN: Chat Box & Commands */}
        <aside className="sidebar-right room-right-column">
          <Card className="p-4 flex-1 min-h-0 flex flex-col overflow-hidden bg-content1/50 border-none shadow-lg h-full">
            <ChatBox
              messages={messages}
              username={username}
              users={users}
              onSendMessage={handleSendMessage}
              onCommand={handleCommand}
              onSendReaction={sendReaction}
            />
          </Card>
        </aside>
      </div>
    </div>
  );
}
