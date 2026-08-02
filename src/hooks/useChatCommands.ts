'use client';

import { PlaylistItem } from '@/components/QueueList';
import { isSupabaseConfigured } from '@/lib/supabase';

interface UseChatCommandsProps {
  username: string;
  channelRef: React.MutableRefObject<any>;
  getIsCurrentHost: () => boolean;
  updateRoomInDb: (updates: any) => Promise<void>;
  addSystemMessage: (text: string, isError?: boolean) => void;
  broadcastSystemMessage: (text: string, isError?: boolean) => void;
  queueRef: React.MutableRefObject<PlaylistItem[]>;
  setQueue: React.Dispatch<React.SetStateAction<PlaylistItem[]>>;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  setSeekTime: React.Dispatch<React.SetStateAction<number | null>>;
  playNextSong: () => Promise<void>;
  playerTimeRef: React.MutableRefObject<number>;
  generateId: () => string;
  clientIdRef: React.MutableRefObject<string | null>;
  getCurrentUser: (users: any[]) => any;
  usersRef: React.MutableRefObject<any[]>;
  color: string;
  processSkipVote: (voterClientId: string, voterUsername: string, itemId: string) => void;
  dbHostClientId: string | null;
}

export function useChatCommands({
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
  processSkipVote,
  dbHostClientId,
}: UseChatCommandsProps) {

  const extractYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const extractPlaylistId = (url: string) => {
    const match = url.match(/[?&]list=([^#\&\?]+)/);
    return match ? match[1] : null;
  };

  const handleCommand = async (cmd: string, args: string) => {
    if (!channelRef.current) return;
    
    const isCurrentHost = getIsCurrentHost();

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

                if (isSupabaseConfigured) {
                  await updateRoomInDb({ queue: newQueue });
                }

                channelRef.current.send({
                  type: 'broadcast',
                  event: 'queue_update',
                  payload: { queue: newQueue }
                });
                setQueue(newQueue);

                broadcastSystemMessage(`🎵 ${username} đã thêm danh sách phát "${data.playlistTitle}" (${newItems.length} bài hát) vào hàng đợi.`);

                if (newQueue.length === newItems.length) {
                  if (isSupabaseConfigured) {
                    await updateRoomInDb({ is_playing: true, seek_time: 0 });
                  }
                  channelRef.current.send({
                    type: 'broadcast',
                    event: 'playback_state',
                    payload: { isPlaying: true, seekTime: 0 }
                  });
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
        
        if (isSupabaseConfigured) {
          await updateRoomInDb({ queue: newQueue });
        }

        channelRef.current.send({
          type: 'broadcast',
          event: 'queue_update',
          payload: { queue: newQueue }
        });
        setQueue(newQueue);

        broadcastSystemMessage(`🎵 ${username} đã thêm bài hát: "${title}" vào hàng đợi.`);

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
        break;
      }

      case 'pause': {
        if (!isCurrentHost) {
          addSystemMessage('❌ Chỉ Chủ phòng mới có quyền tạm dừng/phát nhạc.', true);
          return;
        }
        if (isSupabaseConfigured) {
          await updateRoomInDb({ is_playing: false, seek_time: playerTimeRef.current });
        }
        channelRef.current.send({
          type: 'broadcast',
          event: 'playback_state',
          payload: { isPlaying: false, seekTime: playerTimeRef.current, sentAt: Date.now() }
        });
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
        if (isSupabaseConfigured) {
          await updateRoomInDb({ is_playing: true, seek_time: playerTimeRef.current });
        }
        channelRef.current.send({
          type: 'broadcast',
          event: 'playback_state',
          payload: { isPlaying: true, seekTime: playerTimeRef.current, sentAt: Date.now() }
        });
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

        channelRef.current.track({
          clientId: clientIdRef.current,
          username,
          color,
          joinedAt: me ? me.joinedAt : new Date().toISOString(),
          isHost: isSupabaseConfigured ? false : (me ? me.isHost || false : false),
          videoFinished: me ? me.videoFinished || false : false,
          finishedItemId: me ? me.finishedItemId || null : null,
          votedToSkip: true
        }).catch((err: any) => console.warn('Track votedToSkip error:', err));

        channelRef.current.send({
          type: 'broadcast',
          event: 'vote_skip',
          payload: {
            clientId: myClientId,
            username,
            itemId: currentItem.id
          }
        });

        const isSelfHost = isSupabaseConfigured
          ? dbHostClientId === myClientId
          : usersRef.current.some(user => user.clientId === myClientId && user.isHost);

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

        broadcastSystemMessage(`⏭️ ${username} đã bỏ qua bài hát hiện tại.`);
        await playNextSong();
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

  return {
    handleCommand
  };
}
