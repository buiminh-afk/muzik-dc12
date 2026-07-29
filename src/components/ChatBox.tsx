'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Terminal, HelpCircle, Smile } from 'lucide-react';
import { RoomUser } from './UsersList';

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
  username: string;
  users: RoomUser[];
  onSendMessage: (text: string) => void;
  onCommand: (command: string, args: string) => void;
  onSendReaction?: (reaction: string) => void;
}

const COMMANDS = [
  { cmd: '/play', desc: 'Phát nhạc YouTube (link hoặc từ khóa)' },
  { cmd: '/voteskip', desc: 'Bình chọn bỏ qua bài hát (vs)' },
  { cmd: '/pause', desc: 'Tạm dừng nhạc (Chủ phòng)' },
  { cmd: '/resume', desc: 'Tiếp tục phát nhạc (Chủ phòng)' },
  { cmd: '/clear', desc: 'Xóa sạch danh sách chờ (Chủ phòng)' },
  { cmd: '/queue', desc: 'Xem danh sách hàng đợi (q)' },
  { cmd: '/help', desc: 'Xem toàn bộ hướng dẫn lệnh' }
];

export default function ChatBox({ messages, username, users, onSendMessage, onCommand, onSendReaction }: ChatBoxProps) {
  const [inputText, setInputText] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [mentionSuggestions, setMentionSuggestions] = useState<string[]>([]);
  const [commandSuggestions, setCommandSuggestions] = useState<{ cmd: string, desc: string }[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const reactionRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelectedSuggestionIndex(0);
  }, [mentionSuggestions, commandSuggestions]);

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

  // Mention & Command autocomplete khi gõ
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);

    if (val.startsWith('/') && !val.includes(' ')) {
      const query = val.toLowerCase();
      const filtered = COMMANDS.filter(c => c.cmd.startsWith(query));
      setCommandSuggestions(filtered);
      setMentionSuggestions([]);
    } else {
      setCommandSuggestions([]);
      const atIndex = val.lastIndexOf('@');
      if (atIndex !== -1) {
        const query = val.slice(atIndex + 1).toLowerCase();
        const filtered = users
          .map(u => u.username)
          .filter(name => name !== username && name !== 'Server Feeder' && name.toLowerCase().startsWith(query));
        setMentionSuggestions(filtered);
      } else {
        setMentionSuggestions([]);
      }
    }
  };

  const insertMention = (name: string) => {
    const atIndex = inputText.lastIndexOf('@');
    const newText = inputText.slice(0, atIndex) + `@${name} `;
    setInputText(newText);
    setMentionSuggestions([]);
    inputRef.current?.focus();
  };

  const insertCommand = (cmd: string) => {
    setInputText(cmd + ' ');
    setCommandSuggestions([]);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const hasCommand = commandSuggestions.length > 0;
    const hasMention = mentionSuggestions.length > 0;

    if (!hasCommand && !hasMention) return;

    const totalSuggestions = hasCommand ? commandSuggestions.length : mentionSuggestions.length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => Math.min(prev + 1, totalSuggestions - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (hasCommand) {
        insertCommand(commandSuggestions[selectedSuggestionIndex].cmd);
      } else if (hasMention) {
        insertMention(mentionSuggestions[selectedSuggestionIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setCommandSuggestions([]);
      setMentionSuggestions([]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text) return;
    setMentionSuggestions([]);
    setCommandSuggestions([]);

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

  // Hiển thị text có @mention highlight
  const renderMessageText = (text: string, isMine: boolean) => {
    if (!text.includes('@')) return <span>{text}</span>;
    const parts = text.split(/(@\w+)/g);
    return (
      <span>
        {parts.map((part, i) =>
          part.startsWith('@') ? (
            <span
              key={i}
              className={`font-bold px-0.5 rounded ${
                part === `@${username}`
                  ? 'text-yellow-300 bg-yellow-500/15'
                  : 'text-cyan-300'
              }`}
            >
              {part}
            </span>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </span>
    );
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

            {/* Lệnh /voteskip */}
            <div className="flex flex-col gap-0.5 p-1 rounded hover:bg-white-02 transition-colors">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                <code className="text-cyan-400 font-mono font-bold" style={{ fontSize: '11px' }}>/voteskip</code>
                <span className="text-muted text-[10px]">hoặc</span>
                <code className="text-cyan-400 font-mono font-bold" style={{ fontSize: '11px' }}>/vs</code>
              </div>
              <p className="text-neutral-300 pl-3.5" style={{ fontSize: '10.5px' }}>
                Bình chọn bỏ qua bài — cần 60% người trong phòng đồng ý.
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

            {/* @mention */}
            <div className="flex flex-col gap-0.5 p-1 rounded hover:bg-white-02 transition-colors">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-pink-400" />
                <code className="text-cyan-400 font-mono font-bold" style={{ fontSize: '11px' }}>@username</code>
              </div>
              <p className="text-neutral-300 pl-3.5" style={{ fontSize: '10.5px' }}>
                Nhắc đến ai đó trong chat — họ sẽ nhận thông báo.
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
                {isSystem ? msg.text : renderMessageText(msg.text, msg.username === username)}
              </p>
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      {/* Ô Nhập liệu (Input Form) */}
      <div className="relative">
        {/* Command autocomplete dropdown — xuất hiện BÊN TRÊN input */}
        {commandSuggestions.length > 0 && (
          <div
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 6px)',
              left: 0,
              right: 0,
              background: 'linear-gradient(135deg, #1a0c32, #0a0814)',
              border: '1.5px solid rgba(168,85,247,0.5)',
              borderRadius: '12px',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(168,85,247,0.1)',
              backdropFilter: 'blur(16px)',
              zIndex: 999,
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '4px' }}>
              {commandSuggestions.map((item, idx) => (
                <button
                  key={item.cmd}
                  type="button"
                  onClick={() => insertCommand(item.cmd)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    padding: '8px 12px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    background: idx === selectedSuggestionIndex ? 'rgba(168,85,247,0.25)' : 'transparent',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'white',
                    textAlign: 'left',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(168,85,247,0.15)')}
                  onMouseLeave={e => (e.currentTarget.style.background = idx === selectedSuggestionIndex ? 'rgba(168,85,247,0.25)' : 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#a855f7', fontFamily: 'monospace', fontWeight: 700 }}>/</span>
                    <span style={{ fontWeight: 600, color: '#f8fafc' }}>{item.cmd.slice(1)}</span>
                  </div>
                  <span style={{ fontSize: '10px', color: '#94a3b8' }}>{item.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Mention autocomplete dropdown — xuất hiện BÊN TRÊN input */}
        {mentionSuggestions.length > 0 && (
          <div
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 6px)',
              left: 0,
              right: 0,
              background: 'linear-gradient(135deg, #1a0c32, #0a0814)',
              border: '1.5px solid rgba(168,85,247,0.5)',
              borderRadius: '12px',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(168,85,247,0.1)',
              backdropFilter: 'blur(16px)',
              zIndex: 999,
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '4px' }}>
              {mentionSuggestions.map((name, idx) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => insertMention(name)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    background: idx === selectedSuggestionIndex ? 'rgba(168,85,247,0.25)' : 'transparent',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'white',
                    textAlign: 'left',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(168,85,247,0.15)')}
                  onMouseLeave={e => (e.currentTarget.style.background = idx === selectedSuggestionIndex ? 'rgba(168,85,247,0.25)' : 'transparent')}
                >
                  <span style={{ color: '#22d3ee', fontFamily: 'monospace', fontWeight: 700 }}>@</span>
                  <span style={{ fontWeight: 600, color: '#f8fafc' }}>{name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2 items-center">
          <input
            ref={inputRef}
            type="text"
            placeholder="Gõ tin nhắn, lệnh /play, /vs... hoặc @tên"
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
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
                {['❤️', '🔥', '👍', '🎉', '😆', '🖕'].map((emoji) => (
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
    </div>
  );
}
