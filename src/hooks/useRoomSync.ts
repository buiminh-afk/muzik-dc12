'use client';

import { useEffect, useRef } from 'react';
import { getRealtimeChannel, isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useNotifications } from '@/hooks/useNotifications';
import { RoomUser } from '@/components/UsersList';
import { PlaylistItem } from '@/components/QueueList';

interface UseRoomSyncProps {
  roomId: string;
  username: string;
  color: string;
  authStatus: 'checking' | 'authenticated' | 'requires_password';
  roomName: string;
  users: RoomUser[];
  setUsers: React.Dispatch<React.SetStateAction<RoomUser[]>>;
  usersRef: React.MutableRefObject<RoomUser[]>;
  clientIdRef: React.MutableRefObject<string | null>;
  localRefId: string | null;
  setLocalRefId: React.Dispatch<React.SetStateAction<string | null>>;
  localRefIdRef: React.MutableRefObject<string | null>;
  dbHostClientId: string | null;
  dbHostClientIdRef: React.MutableRefObject<string | null>;
  setDbHostClientId: (id: string | null) => void;
  queueRef: React.MutableRefObject<PlaylistItem[]>;
  setQueue: React.Dispatch<React.SetStateAction<PlaylistItem[]>>;
  isPlayingRef: React.MutableRefObject<boolean>;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  setSeekTime: React.Dispatch<React.SetStateAction<number | null>>;
  playerTimeRef: React.MutableRefObject<number>;
  addSystemMessage: (text: string, isError?: boolean) => void;
  showToast: (message: string) => void;
  processSkipVote: (voterClientId: string, voterUsername: string, itemId: string) => void;
  playNextSongRef: React.MutableRefObject<() => void>;
  advancedItemIdRef: React.MutableRefObject<string | null>;
  finishedItemIdRef: React.MutableRefObject<string | null>;
  setReactions: React.Dispatch<React.SetStateAction<{ id: string; emoji: string; x: number }[]>>;
  hasReceivedInitialSyncRef: React.MutableRefObject<boolean>;
  updateRoomInDb: (updates: any) => Promise<void>;
  getCurrentUser: (users: RoomUser[]) => RoomUser | undefined;
  getIsCurrentHost: () => boolean;
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
}

export function useRoomSync({
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
  queueRef,
  setQueue,
  isPlayingRef,
  setIsPlaying,
  setSeekTime,
  playerTimeRef,
  addSystemMessage,
  showToast,
  processSkipVote,
  playNextSongRef,
  advancedItemIdRef,
  finishedItemIdRef,
  setReactions,
  hasReceivedInitialSyncRef,
  updateRoomInDb,
  getCurrentUser,
  getIsCurrentHost,
  setMessages,
}: UseRoomSyncProps) {
  const channelRef = useRef<any>(null);
  const lobbyChannelRef = useRef<any>(null);
  const { sendNotification } = useNotifications();

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
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

    addSystemMessage(`Chào mừng bạn đến với phòng ${roomId}! Bạn đang ở chế độ điều khiển chung.`);
    if (!isSupabaseConfigured) {
      addSystemMessage('🔔 Lưu ý: Hệ thống đang chạy ở chế độ Local-Only (giả lập offline qua trình duyệt). Mở thêm tab khác với cùng link để test tính năng đồng bộ hóa.');
    }

    channel
      .on('broadcast', { event: 'chat_message' }, ({ payload }: any) => {
        setMessages((prev: any) => [...prev, {
          id: payload.id,
          username: payload.username,
          text: payload.text,
          timestamp: new Date(payload.timestamp)
        }].slice(-500));

        if (
          payload.username !== username &&
          (payload.text.includes(`@${username}`) || payload.text.toLowerCase().includes('@all'))
        ) {
          showToast(`💬 ${payload.username} nhắc đến bạn: ${payload.text}`);
          // Bắn Browser Notification khi tab bị ẩn
          sendNotification(
            `💬 ${payload.username} nhắc đến bạn!`,
            payload.text,
            'mention'
          );
        }
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
      .on('broadcast', { event: 'host_changed' }, ({ payload }: any) => {
        setDbHostClientId(payload.hostClientId);
      })
      .on('broadcast', { event: 'emoji_reaction' }, ({ payload }: any) => {
        const x = 15 + Math.random() * 70;
        setReactions((prev: any) => [...prev, { id: payload.id, emoji: payload.emoji, x }]);
        setTimeout(() => {
          setReactions((prev: any) => prev.filter((r: any) => r.id !== payload.id));
        }, 2500);
      })
      .on('broadcast', { event: 'request_sync' }, ({ payload }: any) => {
        if (payload.requesterId === clientIdRef.current) return;
        if (queueRef.current.length === 0) return;

        const activeUsers = usersRef.current;
        const host = activeUsers.find(u => u.isHost);

        let isPrimarySyncer = false;
        if (host) {
          isPrimarySyncer = host.clientId === clientIdRef.current;
        } else if (activeUsers.length > 0) {
          const oldestUser = [...activeUsers].sort((a, b) => 
            new Date(a.joinedAt || 0).getTime() - new Date(b.joinedAt || 0).getTime()
          )[0];
          isPrimarySyncer = oldestUser?.clientId === clientIdRef.current;
        } else {
          isPrimarySyncer = true;
        }

        // Chỉ Host mới cần phản hồi, nếu không phải host thì bỏ qua
        if (!isPrimarySyncer) return;

        setTimeout(() => {
          channel.send({
            type: 'broadcast',
            event: 'sync_state',
            payload: {
              queue: queueRef.current,
              isPlaying: isPlayingRef.current,
              currentTime: playerTimeRef.current,
              targetClientId: payload.requesterId,
              sentAt: Date.now(),
              isForced: payload.isForced || false,
              hostClientId: dbHostClientIdRef.current
            }
          });
        }, 0);
      })
      .on('broadcast', { event: 'sync_state' }, ({ payload }: any) => {
        const isMyTarget = 
          payload.targetClientId === clientIdRef.current || 
          payload.targetRef === 'new_tab' ||
          payload.targetRef === 'all';   // broadcast toàn phòng
        if (!isMyTarget || !payload.queue) return;

        // Chỉ bỏ qua lần 2+ nếu đây không phải forced sync
        if (hasReceivedInitialSyncRef.current && !payload.isForced) return;
        hasReceivedInitialSyncRef.current = true;

        if (payload.hostClientId) {
          setDbHostClientId(payload.hostClientId);
        }

        setQueue(payload.queue);
        setIsPlaying(payload.isPlaying);
        if (Number.isFinite(payload.currentTime)) {
          const latency = payload.sentAt ? (Date.now() - payload.sentAt) / 1000 : 0;
          const targetTime = Math.max(0, payload.currentTime + (payload.isPlaying ? latency : 0));
          setSeekTime(targetTime);
          setTimeout(() => setSeekTime(null), 100);
        }
        addSystemMessage(`🔄 Đã đồng bộ thành công!`);
      });

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const uniqueUsersMap = new Map<string, RoomUser>();
      
      Object.keys(state).forEach((ref) => {
        const userPresence = state[ref][0];
        if (userPresence && userPresence.clientId) {
          uniqueUsersMap.set(userPresence.clientId, {
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
      
      const onlineUsers: RoomUser[] = Array.from(uniqueUsersMap.values());
      onlineUsers.sort((a, b) => new Date(a.joinedAt || 0).getTime() - new Date(b.joinedAt || 0).getTime());

      if (isSupabaseConfigured) {
        const isHostOnline = dbHostClientIdRef.current ? onlineUsers.some(u => u.clientId === dbHostClientIdRef.current) : false;
        
        if (!isHostOnline && onlineUsers.length > 0) {
          const oldestUser = onlineUsers[0];
          
          if (oldestUser.clientId === clientIdRef.current) {
            console.log('[RoomClient] Bầu chọn Host mới...');
            updateRoomInDb({ host_client_id: clientIdRef.current });
            channel.send({
              type: 'broadcast',
              event: 'host_changed',
              payload: { hostClientId: clientIdRef.current }
            });
            setDbHostClientId(clientIdRef.current);
            addSystemMessage('👑 Chủ phòng cũ đã ngắt kết nối. Bạn đã trở thành Chủ phòng mới!');
          }
        }

        const normalisedUsers = onlineUsers.map(u => ({
          ...u,
          isHost: u.clientId === dbHostClientIdRef.current
        }));

        usersRef.current = normalisedUsers;
        setUsers(normalisedUsers);
      } else {
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

        const normalisedUsers = onlineUsers.map(u => ({
          ...u,
          isHost: u.presence_ref === canonicalHostRef
        }));

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
      }
      
      const myRef = Object.keys(state).find(key => {
        const list = state[key];
        return list && list.some((p: any) => p.clientId === clientIdRef.current);
      });
      if (myRef) {
        setLocalRefId(myRef);
      }

      const isCurrentHostCheck = getIsCurrentHost();
        
      if (isCurrentHostCheck && onlineUsers.length > 0) {
        const currentVideo = queueRef.current.length > 0 ? queueRef.current[0] : null;
        const currentItemId = currentVideo ? currentVideo.id : null;
        const allFinished = currentItemId && onlineUsers.every(u => u.finishedItemId === currentItemId);

        if (allFinished && currentItemId && advancedItemIdRef.current !== currentItemId) {
          advancedItemIdRef.current = currentItemId;
          playNextSongRef.current();
        }
      }
    });

    // Xử lý ngay khi có người rời phòng, không chờ sync event
    channel.on('presence', { event: 'leave' }, ({ leftPresences }: any) => {
      const leftClientIds = new Set(
        (leftPresences as any[]).map((p: any) => p.clientId).filter(Boolean)
      );
      if (leftClientIds.size === 0) return;

      setUsers(prev => {
        const updated = prev.filter(u => !leftClientIds.has(u.clientId));
        usersRef.current = updated;
        return updated;
      });
    });

    channel.subscribe((status: string, error?: any) => {
      console.log('[Supabase Realtime]', { status, error, roomId });

      switch (status) {
        case 'SUBSCRIBED': {
          const isFirst = usersRef.current.length === 0;
          try {
            channel.track({
              clientId: clientIdRef.current,
              username,
              color,
              joinedAt: new Date().toISOString(),
              isHost: isSupabaseConfigured ? false : isFirst,
              videoFinished: false,
              finishedItemId: null,
              votedToSkip: false
            }).catch((err: any) => console.warn('Track connect error:', err));
          } catch (e) {}

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
          addSystemMessage('❌ Lỗi kết nối Realtime: Kênh gặp sự cố. Kiểm tra cấu hình Supabase, mạng Internet hoặc VPN/Adblocker.', true);
          break;

        case 'TIMED_OUT':
          addSystemMessage('⚠️ Hết hạn kết nối Realtime. Hệ thống đang tự động thử kết nối lại...', true);
          break;
      }
    });

    const handleBeforeUnload = () => {
      if (channel) channel.untrack();
      if (lobby) lobby.untrack();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (pingInterval) clearInterval(pingInterval);
      if (syncTimeoutId) clearTimeout(syncTimeoutId);
      lobby.unsubscribe();
      channel.unsubscribe();
      if (isSupabaseConfigured && supabase) {
        supabase.removeChannel(channel);
        supabase.removeChannel(lobby);
      }
    };
  }, [username, roomId, authStatus]); // We REMOVED color from dependencies to prevent reconnection on color change!

  return {
    channelRef,
    lobbyChannelRef
  };
}
