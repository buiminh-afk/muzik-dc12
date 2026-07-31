'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Users, ArrowRight, Headphones, Lock, Unlock, Plus, X, Search, User } from 'lucide-react';
import { getRealtimeChannel } from '@/lib/supabase';
import { simpleHash } from '@/lib/utils';
import styles from './page.module.css';

export default function Home() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [activeRooms, setActiveRooms] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isPrivateRoom, setIsPrivateRoom] = useState(false);
  
  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomPass, setNewRoomPass] = useState('');
  
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<any>(null);
  const [joinPass, setJoinPass] = useState('');
  const [joinError, setJoinError] = useState('');
  
  // Ref để giữ kết nối lobby
  const channelRef = useRef<any>(null);

  useEffect(() => {
    // Tự động lấy tên đã lưu nếu có
    const savedName = localStorage.getItem('yt_together_username');
    if (savedName) setUsername(savedName);

    // Khôi phục theme từ localStorage
    const savedTheme = localStorage.getItem('yt_together_theme');
    if (savedTheme) {
      document.body.className = savedTheme;
    } else {
      document.body.className = 'dark';
    }

    // Khởi tạo kết nối Sảnh (Lobby)
    const channel = getRealtimeChannel('lobby');
    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const rooms: any[] = [];
        
        Object.values(state).forEach((presences: any) => {
          presences.forEach((p: any) => {
            if (p.type === 'room') {
              rooms.push(p);
            }
          });
        });
        
        // Loại bỏ các phòng trùng lặp ID (phòng hờ trường hợp host đổi tab)
        const uniqueRooms = Array.from(new Map(rooms.map(r => [r.roomId, r])).values());
        setActiveRooms(uniqueRooms);
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  const generateRoomId = () => {
    return Math.random().toString(36).substring(2, 9).toUpperCase();
  };

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      alert('Vui lòng nhập tên của bạn trước!');
      return;
    }
    
    const name = username.trim();
    const rName = newRoomName.trim() || `Phòng của ${name}`;
    const newRoomId = generateRoomId();
    
    localStorage.setItem('yt_together_username', name);
    
    const hasPass = isPrivateRoom && !!newRoomPass;
    const passHash = hasPass ? simpleHash(newRoomPass) : null;
    
    // Lưu cấu hình phòng vào sessionStorage để RoomClient đọc
    sessionStorage.setItem(`yt_room_config_${newRoomId}`, JSON.stringify({
      roomName: rName,
      hasPassword: hasPass,
      passwordHash: passHash
    }));
    
    router.push(`/room/${newRoomId}`);
  };

  const handleRoomClick = (room: any) => {
    if (!username.trim()) {
      alert('Vui lòng nhập tên của bạn trước khi vào phòng!');
      return;
    }
    
    localStorage.setItem('yt_together_username', username.trim());

    if (room.hasPassword) {
      setSelectedRoom(room);
      setShowJoinModal(true);
      setJoinPass('');
      setJoinError('');
    } else {
      router.push(`/room/${room.roomId}`);
    }
  };

  const handleJoinWithPass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoom) return;

    if (simpleHash(joinPass) === selectedRoom.passwordHash) {
      sessionStorage.setItem(`yt_room_auth_${selectedRoom.roomId}`, 'true');
      router.push(`/room/${selectedRoom.roomId}`);
    } else {
      setJoinError('Mật khẩu không chính xác!');
    }
  };

  // Lọc phòng theo từ khóa tìm kiếm
  const filteredRooms = activeRooms.filter(room => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (room.roomName || '').toLowerCase().includes(q) ||
      (room.roomId || '').toLowerCase().includes(q) ||
      (room.hostName || '').toLowerCase().includes(q)
    );
  });

  // Tính tổng số user đang online
  const totalUsers = activeRooms.reduce((acc, room) => acc + (room.userCount || 1), 0);

  return (
    <main className={styles.main} style={{ height: '100dvh', overflow: 'hidden' }}>
      <div className="flex flex-col h-full w-full max-w-1600 mx-auto p-4 relative z-10">
        
        {/* Header Sảnh - Compact */}
        <div className="flex flex-col sm-flex-row justify-between items-center gap-4 shrink-0" style={{ marginBottom: '24px' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50-20 border border-purple-5-30 flex items-center justify-center text-purple-400 shadow-[0_0_15px_rgba(139,92,246,0.2)]">
              <Headphones size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                YouTube <span className="text-purple-400">Together</span>
              </h1>
              {/* Quick Stats */}
              <div className="quick-stats">
                <span className="stat-item">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                  {activeRooms.length} phòng đang mở
                </span>
                <span className="stat-item">
                  <Users size={12} className="text-cyan-400" />
                  {totalUsers} người online
                </span>
              </div>
            </div>
          </div>
          
          {/* Profile Card / Username input */}
          <div className="profile-username-card">
            <div className="w-7 h-7 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-xs font-bold text-purple-300">
              {username.trim() ? username.trim().charAt(0).toUpperCase() : <User size={14} />}
            </div>
            <input 
              type="text" 
              placeholder="Nhập tên hiển thị..." 
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="text-sm text-white placeholder:text-muted"
              style={{ background: 'transparent', border: 'none', outline: 'none', padding: '2px 4px', width: '150px' }}
              maxLength={20}
            />
          </div>
        </div>

        {/* Nội dung Sảnh (Danh sách phòng) */}
        <div className="flex-1 flex flex-col min-h-0 glass-card p-6 border-white-10 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col sm-flex-row justify-between items-stretch sm-items-center gap-3 mb-4 shrink-0">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5 mr-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
                </span>
                Danh Sách Phòng
              </h2>
            </div>
            
            <div className="flex flex-col sm-flex-row items-stretch sm-items-center gap-3">
              {/* Search Bar */}
              <div className="search-bar-container">
                <Search size={14} className="search-icon-inside" />
                <input 
                  type="text" 
                  placeholder="Tìm phòng bằng tên hoặc ID..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="search-input"
                />
              </div>

              {/* Create Room Button */}
              <button 
                onClick={() => {
                  if(!username.trim()) { alert('Nhập tên bạn trước nhé!'); return; }
                  setShowCreateModal(true);
                  setIsPrivateRoom(false);
                  setNewRoomPass('');
                  setNewRoomName('');
                }}
                className="glass-btn bg-purple-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.3)] flex items-center justify-center gap-1.5 px-4"
                style={{ cursor: 'pointer', height: '38px', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                <Plus size={16} />
                <span>Tạo Phòng</span>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-4">
            {filteredRooms.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted gap-4 opacity-70" style={{ minHeight: '260px' }}>
                <Headphones size={48} className="opacity-20 animate-pulse" />
                <div className="text-center">
                  <p className="font-semibold text-white">Không tìm thấy phòng nào</p>
                  <p className="text-xs text-muted mt-1">Hãy thử tìm từ khóa khác hoặc tạo phòng mới.</p>
                </div>
                <button 
                  onClick={() => username.trim() ? setShowCreateModal(true) : alert('Nhập tên trước!')} 
                  className="glass-btn bg-purple-500 text-white px-4 py-2 mt-2" 
                  style={{ cursor: 'pointer' }}
                >
                  Tạo Phòng Đầu Tiên!
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                {filteredRooms.map(room => (
                  <div 
                    key={room.roomId}
                    onClick={() => handleRoomClick(room)}
                    className="group flex flex-col bg-black-40 border border-white-5 hover-border-purple-5-50 rounded-xl p-4 cursor-pointer transition-all relative overflow-hidden"
                    style={{ minHeight: '150px' }}
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-purple-500 to-cyan-400 opacity-0 group-hover-opacity transition-opacity"></div>
                    
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="font-bold text-base text-white truncate pr-4" title={room.roomName}>
                        {room.roomName}
                      </h3>
                      <div className="text-muted shrink-0">
                        {room.hasPassword ? <Lock size={15} className="text-pink-400" /> : <Unlock size={15} className="opacity-40" />}
                      </div>
                    </div>

                    <div className="text-xs text-muted mb-3">
                      Được tạo bởi: <span className="text-neutral-300 font-medium">{room.hostName || 'Ẩn danh'}</span>
                    </div>
                    
                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-white-5 text-xs text-muted">
                      <div className="flex items-center gap-1.5 text-neutral-400">
                        <Users size={12} className="text-cyan-400" />
                        <span>{room.userCount || 1} người</span>
                      </div>
                      <span className="font-mono bg-black-60 px-1.5 py-0.5 rounded text-neutral-400 border border-white-5 text-[10px]">
                        ID: {room.roomId}
                      </span>
                    </div>

                    <div className="room-card-cta">
                      Vào phòng <ArrowRight size={12} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Tạo Phòng */}
      {showCreateModal && (
        <div 
          className="animate-fade-in" 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            zIndex: 9999, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: '16px', 
            backgroundColor: 'rgba(0, 0, 0, 0.85)', 
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)'
          }}
        >
          <div className="modal-card p-6 relative" style={{ width: '100%', maxWidth: '450px', backgroundColor: '#181628' }}>
            <button onClick={() => setShowCreateModal(false)} className="absolute top-4 right-4 text-muted hover-text-white transition-colors">
              <X size={20} />
            </button>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
              <Plus size={20} className="text-purple-400" /> Tạo Phòng Nhạc
            </h2>
            <form onSubmit={handleCreateRoom} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted">Tên phòng</label>
                <input 
                  type="text" 
                  value={newRoomName}
                  onChange={e => setNewRoomName(e.target.value)}
                  placeholder={`Phòng của ${username}`}
                  className="glass-input text-sm"
                  maxLength={30}
                  autoFocus
                />
              </div>

              {/* Private Room Checkbox Switch */}
              <div 
                className="checkbox-switch-container"
                onClick={() => setIsPrivateRoom(!isPrivateRoom)}
              >
                <span className="text-xs font-semibold text-neutral-300 flex items-center gap-2">
                  <Lock size={14} className="text-purple-400" /> Phòng riêng tư (Có mật khẩu)
                </span>
                <input 
                  type="checkbox" 
                  checked={isPrivateRoom} 
                  onChange={() => {}} // Handled by container click
                />
              </div>

              {isPrivateRoom && (
                <div className="flex flex-col gap-1.5 animate-fade-in">
                  <label className="text-xs font-semibold text-muted">Mật khẩu phòng</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={newRoomPass}
                      onChange={e => setNewRoomPass(e.target.value)}
                      placeholder="Mật khẩu tùy chọn..."
                      className="glass-input text-sm w-full pr-10"
                      maxLength={20}
                      required
                    />
                    <Lock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
                  </div>
                </div>
              )}

              <button type="submit" className="glass-btn bg-purple-500 hover-bg-purple-400 text-white mt-2 w-full justify-center">
                Tạo & Vào Phòng
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Nhập Mật Khẩu */}
      {showJoinModal && (
        <div 
          className="animate-fade-in" 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            zIndex: 9999, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: '16px', 
            backgroundColor: 'rgba(0, 0, 0, 0.85)', 
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)'
          }}
        >
          <div className="modal-card p-6 relative border-pink-500/30" style={{ width: '100%', maxWidth: '380px', backgroundColor: '#181628' }}>
            <button onClick={() => setShowJoinModal(false)} className="absolute top-4 right-4 text-muted hover-text-white transition-colors">
              <X size={20} />
            </button>
            <div className="flex flex-col items-center text-center gap-2 mb-6">
              <div className="w-12 h-12 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center mb-2 shadow-[0_0_15px_rgba(236,72,153,0.3)]">
                <Lock size={24} />
              </div>
              <h2 className="text-lg font-bold text-white truncate w-full px-4">{selectedRoom?.roomName}</h2>
              <p className="text-xs text-muted">Phòng này yêu cầu mật khẩu để tham gia</p>
            </div>
            
            <form onSubmit={handleJoinWithPass} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <input 
                  type="password" 
                  value={joinPass}
                  onChange={e => setJoinPass(e.target.value)}
                  placeholder="Nhập mật khẩu..."
                  className={`glass-input text-sm text-center ${joinError ? 'border-red-500' : ''}`}
                  autoFocus
                />
                {joinError && <span className="text-[10px] text-red-400 text-center animate-shake">{joinError}</span>}
              </div>
              <button type="submit" className="glass-btn bg-pink-600 hover-bg-pink-500 text-white mt-2 w-full justify-center">
                Mở Khóa
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
