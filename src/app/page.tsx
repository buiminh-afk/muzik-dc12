'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Users, ArrowRight, Headphones } from 'lucide-react';
import styles from './page.module.css';

export default function Home() {
  const router = useRouter();
  const [roomIdInput, setRoomIdInput] = useState('');
  const [username, setUsername] = useState('');

  const generateRoomId = () => {
    return Math.random().toString(36).substring(2, 9).toUpperCase();
  };

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const name = username.trim() || 'Người dùng';
    const newRoomId = generateRoomId();
    // Lưu tên người dùng tạm thời vào localStorage để qua phòng lấy ra sử dụng
    localStorage.setItem('yt_together_username', name);
    router.push(`/room/${newRoomId}`);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomIdInput.trim()) return;
    const name = username.trim() || 'Người dùng';
    localStorage.setItem('yt_together_username', name);
    router.push(`/room/${roomIdInput.trim().toUpperCase()}`);
  };

  return (
    <main className={styles.main}>
      <div className={styles.logoContainer}>
        <div className={`${styles.iconGlow} animate-float`}>
          <Headphones size={48} className={styles.headphoneIcon} />
        </div>
        <h1 className={styles.title}>
          <span>YouTube</span> Together
        </h1>
        <p className={styles.subtitle}>
          Nghe nhạc cùng nhau theo thời gian thực. Đơn giản, mượt mà, điều khiển bằng câu lệnh.
        </p>
      </div>

      <div className="glass-card style_cardContainer__1">
        <div className={styles.cardHeader}>
          <h2>Tham Gia Hoặc Tạo Phòng</h2>
          <p>Nhập tên hiển thị của bạn và chọn hành động bên dưới</p>
        </div>

        <div className={styles.formSection}>
          <div className={styles.inputGroup}>
            <label htmlFor="username">Tên của bạn</label>
            <input
              id="username"
              type="text"
              placeholder="Nhập tên hiển thị..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="glass-input"
              maxLength={20}
              required
            />
          </div>

          <div className={styles.divider}></div>

          <div className={styles.actions}>
            {/* Tạo phòng */}
            <form onSubmit={handleCreateRoom} className={styles.actionForm}>
              <button type="submit" className="glass-btn w-full">
                <Play size={18} />
                Tạo Phòng Mới
              </button>
            </form>

            <div className={styles.orText}>hoặc</div>

            {/* Vào phòng bằng ID */}
            <form onSubmit={handleJoinRoom} className={`${styles.actionForm} ${styles.joinForm}`}>
              <input
                type="text"
                placeholder="Nhập mã phòng (ví dụ: ABC123)"
                value={roomIdInput}
                onChange={(e) => setRoomIdInput(e.target.value)}
                className="glass-input"
                maxLength={10}
              />
              <button type="submit" className="glass-btn glass-btn-secondary" disabled={!roomIdInput.trim()}>
                Vào Phòng
                <ArrowRight size={18} />
              </button>
            </form>
          </div>
        </div>
      </div>

      <footer className={styles.footer}>
        <p>© 2026 YouTube Together. Tối ưu hóa trải nghiệm nghe nhạc nhóm.</p>
      </footer>
    </main>
  );
}
