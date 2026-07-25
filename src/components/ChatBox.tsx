'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Terminal, HelpCircle, Smile } from 'lucide-react';

export interface ChatMessage {
  id: string;
  username: string;
  text: string;
  timestamp: Date;
  isSystem?: boolean;
  isError?: boolean;
}

interface ChatBoxProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onCommand: (command: string, args: string) => void;
  onSendReaction?: (reaction: string) => void;
}

export default function ChatBox({ messages, onSendMessage, onCommand, onSendReaction }: ChatBoxProps) {
  const [inputText, setInputText] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const reactionRef = useRef<HTMLDivElement>(null);

  // Tự động cuộn xuống khi có tin nhắn mới
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Click ra ngoài để đóng reactions
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (reactionRef.current && !reactionRef.current.contains(e.target as Node)) {
        setShowReactions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text) return;

    if (text.startsWith('/')) {
      const match = text.match(/^\/([a-zA-Z]+)(?:\s+(.*))?$/);
      if (match) {
        const cmd = match[1].toLowerCase();
        const args = match[2] || '';
        onCommand(cmd, args);
      } else {
        onSendMessage(text);
      }
    } else {
      onSendMessage(text);
    }
    
    setInputText('');
  };

  const getMessageStyle = (msg: ChatMessage) => {
    if (msg.isError) return 'text-rose-400 bg-rose-60-20 border-rose-50-10 border p-2 rounded-lg';
    if (msg.isSystem) return 'text-purple-300 bg-purple-95-20 border-purple-50-10 border p-2 rounded-lg text-center font-mono';
    return '';
  };

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Terminal size={18} className="text-purple-400" />
          <span className="text-sm font-semibold uppercase tracking-wider text-muted">
            Khung Chat & Lệnh
          </span>
        </div>
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="text-xs text-muted flex items-center gap-1 transition-colors px-2 py-1 bg-white-5 border border-white-5 rounded"
          style={{ cursor: 'pointer' }}
        >
          <HelpCircle size={13} />
          Xem Lệnh
        </button>
      </div>

      {/* Bảng trợ giúp Lệnh (Help Panel) - Thiết kế cao cấp tránh bể layout */}
      {showHelp && (
        <div 
          className="absolute p-4 rounded-xl border text-xs leading-relaxed animate-fade-in z-30 shadow-2xl"
          style={{
            top: '36px',
            left: '8px',
            right: '8px',
            background: 'linear-gradient(135deg, rgba(17, 12, 28, 0.96), rgba(8, 8, 16, 0.99))',
            backdropFilter: 'blur(16px)',
            border: '1.5px solid rgba(168, 85, 247, 0.25)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.9)'
          }}
        >
          <div className="flex justify-between items-center mb-3 pb-2 border-b border-white-5">
            <h4 className="font-bold tracking-wide bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-1-5" style={{ fontSize: '11px' }}>
              <Terminal size={13} className="text-purple-400" />
              DANH SÁCH LỆNH TRONG PHÒNG
            </h4>
            <button 
              onClick={() => setShowHelp(false)} 
              className="w-5 h-5 rounded-full flex items-center justify-center text-neutral-400 hover:text-rose-400 bg-white-5 hover:bg-rose-500-10 border border-white-10 transition-all active:scale-95"
              style={{ cursor: 'pointer', fontSize: '9px' }}
              title="Đóng trợ giúp"
            >
              ✕
            </button>
          </div>

          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {/* Lệnh /play */}
            <div className="flex flex-col gap-0.5 p-1 rounded hover:bg-white-02 transition-colors">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <code className="text-cyan-400 font-mono font-bold" style={{ fontSize: '11px' }}>/play &lt;link&gt;</code>
                <span className="text-muted text-[10px]">hoặc</span>
                <code className="text-cyan-400 font-mono font-bold" style={{ fontSize: '11px' }}>/p</code>
              </div>
              <p className="text-neutral-300 pl-3.5" style={{ fontSize: '10.5px' }}>
                Phát video hoặc thêm vào hàng đợi (hỗ trợ cả link playlist).
              </p>
            </div>

            {/* Lệnh /pause */}
            <div className="flex flex-col gap-0.5 p-1 rounded hover:bg-white-02 transition-colors">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <code className="text-cyan-400 font-mono font-bold" style={{ fontSize: '11px' }}>/pause</code>
              </div>
              <p className="text-neutral-300 pl-3.5" style={{ fontSize: '10.5px' }}>
                Tạm dừng phát nhạc trong phòng.
              </p>
            </div>

            {/* Lệnh /resume */}
            <div className="flex flex-col gap-0.5 p-1 rounded hover:bg-white-02 transition-colors">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <code className="text-cyan-400 font-mono font-bold" style={{ fontSize: '11px' }}>/resume</code>
              </div>
              <p className="text-neutral-300 pl-3.5" style={{ fontSize: '10.5px' }}>
                Tiếp tục phát nhạc đang tạm dừng.
              </p>
            </div>

            {/* Lệnh /skip */}
            <div className="flex flex-col gap-0.5 p-1 rounded hover:bg-white-02 transition-colors">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                <code className="text-cyan-400 font-mono font-bold" style={{ fontSize: '11px' }}>/skip</code>
                <span className="text-muted text-[10px]">hoặc</span>
                <code className="text-cyan-400 font-mono font-bold" style={{ fontSize: '11px' }}>/next</code>
              </div>
              <p className="text-neutral-300 pl-3.5" style={{ fontSize: '10.5px' }}>
                Bỏ qua bài hát hiện tại để chuyển sang bài tiếp theo.
              </p>
            </div>

            {/* Lệnh /clear */}
            <div className="flex flex-col gap-0.5 p-1 rounded hover:bg-white-02 transition-colors">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                <code className="text-cyan-400 font-mono font-bold" style={{ fontSize: '11px' }}>/clear</code>
              </div>
              <p className="text-neutral-300 pl-3.5" style={{ fontSize: '10.5px' }}>
                Xóa toàn bộ các bài hát đang có trong hàng đợi chờ.
              </p>
            </div>

            {/* Lệnh /queue */}
            <div className="flex flex-col gap-0.5 p-1 rounded hover:bg-white-02 transition-colors">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                <code className="text-cyan-400 font-mono font-bold" style={{ fontSize: '11px' }}>/queue</code>
                <span className="text-muted text-[10px]">hoặc</span>
                <code className="text-cyan-400 font-mono font-bold" style={{ fontSize: '11px' }}>/q</code>
              </div>
              <p className="text-neutral-300 pl-3.5" style={{ fontSize: '10.5px' }}>
                Hiển thị danh sách các bài hát trong hàng chờ hiện tại.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Danh sách Tin nhắn (Messages List) */}
      <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2-5 mb-3 p-3 rounded-lg bg-black-20 border border-white-5 min-h-0">
        {messages.map((msg) => {
          const isSystem = msg.isSystem || msg.isError;
          return (
            <div key={msg.id} className={`flex flex-col gap-1 text-xs ${getMessageStyle(msg)}`}>
              {!isSystem && (
                <div className="flex items-baseline gap-2">
                  <span className="font-bold text-purple-400 font-mono">{msg.username}</span>
                  <span className="text-muted" style={{ fontSize: '9px' }}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
              <p className={isSystem ? 'leading-relaxed' : 'text-neutral-200 mt-0.5 break-words whitespace-pre-wrap'}>
                {msg.text}
              </p>
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      {/* Ô Nhập liệu (Input Form) */}
      <form onSubmit={handleSubmit} className="flex gap-2 items-center">
        <input
          type="text"
          placeholder="Gõ tin nhắn hoặc lệnh (ví dụ: /play <link>)..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          className="glass-input flex-1 py-2 px-3 text-xs"
          style={{ height: '36px' }}
          maxLength={200}
        />
        
        {/* Emoji Button */}
        <div className="relative flex" ref={reactionRef}>
          <button 
            type="button" 
            onClick={() => setShowReactions(!showReactions)}
            className="glass-btn rounded-lg flex-shrink-0 flex items-center justify-center" 
            style={{ cursor: 'pointer', width: '36px', height: '36px', padding: 0 }} 
            title="Biểu cảm"
          >
            <Smile size={15} />
          </button>
          
          {showReactions && (
            <div 
              className="absolute p-2 glass-card rounded-xl shadow-xl flex items-center gap-1 z-50 animate-fade-in" 
              style={{ 
                bottom: '100%', 
                right: '0', 
                marginBottom: '8px',
                backgroundColor: 'var(--bg-primary)', 
                border: '1px solid var(--glass-border)' 
              }}
            >
              {['❤️', '🔥', '👍', '🎉', '😆'].map((emoji) => (
                <button 
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onSendReaction?.(emoji);
                    setShowReactions(false);
                  }} 
                  className="text-lg hover:scale-125 transition-transform bg-white-5 p-1.5 rounded-full cursor-pointer border border-white-5"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <button type="submit" className="glass-btn rounded-lg flex-shrink-0 flex items-center justify-center" style={{ cursor: 'pointer', width: '36px', height: '36px', padding: 0 }} title="Gửi (Enter)">
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
