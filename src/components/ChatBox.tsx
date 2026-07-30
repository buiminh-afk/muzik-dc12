'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
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

const ALLOWED_CMDS = [
  'play', 'p', 'voteskip', 'vs', 'pause', 'resume', 'unpause', 
  'skip', 'next', 'clear', 'queue', 'q', 'help'
];

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Helper to format timestamps safely
const formatMessageTime = (timestamp: string | number | Date): string => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getMessageStyle = (msg: ChatMessage) => {
  if (msg.isError) {
    return 'text-rose-400 bg-rose-600/20 border border-rose-500/10 p-2 rounded-lg';
  }
  if (msg.isSystem) {
    return 'text-purple-300 bg-purple-950/20 border border-purple-500/10 p-2 rounded-lg text-center font-mono';
  }
  return '';
};

// Helper for finding context of mention
const getMentionContext = (
  value: string,
  cursor: number,
): { start: number; end: number; query: string } | null => {
  const beforeCursor = value.slice(0, cursor);
  const match = beforeCursor.match(/(?:^|\s)@([^\s@]*)$/u);

  if (!match || match.index === undefined) {
    return null;
  }

  const token = match[0];
  const atOffset = token.lastIndexOf('@');
  const start = match.index + atOffset;

  return {
    start,
    end: cursor,
    query: match[1],
  };
};

// --- CHAT MESSAGE LIST COMPONENT (MEMOIZED) ---
interface ChatMessageListProps {
  messages: ChatMessage[];
  username: string;
  users: RoomUser[];
  mentionPattern: RegExp | null;
}

const ChatMessageList = React.memo(function ChatMessageList({
  messages,
  username,
  mentionPattern,
}: ChatMessageListProps) {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight -
      container.scrollTop -
      container.clientHeight;

    shouldAutoScrollRef.current = distanceFromBottom < 80;
  };

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    chatEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }, [messages.length]);

  const renderMessageText = (text: string) => {
    if (!mentionPattern) {
      return <span>{text}</span>;
    }

    const parts = text.split(mentionPattern);

    return (
      <span>
        {parts.map((part, index) => {
          const isMention = part.startsWith('@');
          const isCurrentUser =
            part.localeCompare(`@${username}`, undefined, {
              sensitivity: 'accent',
            }) === 0;

          if (!isMention) {
            return <span key={index}>{part}</span>;
          }

          return (
            <span
              key={index}
              className={
                isCurrentUser
                  ? 'font-bold px-0.5 rounded text-yellow-300 bg-yellow-500/15'
                  : 'font-bold px-0.5 rounded text-cyan-300'
              }
            >
              {part}
            </span>
          );
        })}
      </span>
    );
  };

  return (
    <div
      ref={messagesContainerRef}
      onScroll={handleMessagesScroll}
      className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2.5 mb-3 p-3 rounded-lg bg-black-20 border border-white-5 min-h-0"
    >
      {messages.map((msg, index) => {
        const isSystem = msg.isSystem || msg.isError;
        const prevMsg = index > 0 ? messages[index - 1] : null;
        
        // Group consecutive user messages sent within 2 minutes
        const isGrouped = 
          prevMsg && 
          !isSystem && 
          !(prevMsg.isSystem || prevMsg.isError) && 
          msg.username === prevMsg.username &&
          (new Date(msg.timestamp).getTime() - new Date(prevMsg.timestamp).getTime()) < 120000;

        return (
          <div 
            key={msg.id} 
            className={`flex flex-col text-xs ${getMessageStyle(msg)} ${
              isSystem ? 'my-1.5' : isGrouped ? 'mt-0.5 pl-3.5 relative' : 'mt-2.5'
            }`}
          >
            {!isSystem && !isGrouped && (
              <div className="flex items-baseline gap-2 mb-0.5 select-none">
                <span className="font-bold text-purple-400 font-mono">{msg.username}</span>
                <span className="text-muted" style={{ fontSize: '9px' }}>
                  {formatMessageTime(msg.timestamp)}
                </span>
              </div>
            )}
            {isGrouped && (
              <div className="absolute left-1.5 top-1.5 w-1 h-1 rounded-full bg-purple-500/20" />
            )}
            <p className={isSystem ? 'leading-relaxed' : 'text-neutral-200 break-words whitespace-pre-wrap'}>
              {isSystem ? msg.text : renderMessageText(msg.text)}
            </p>
          </div>
        );
      })}
      <div ref={chatEndRef} />
    </div>
  );
});

// --- CHAT COMPOSER COMPONENT ---
interface ChatComposerProps {
  users: RoomUser[];
  username: string;
  onSendMessage: (text: string) => Promise<void> | void;
  onCommand: (command: string, args: string) => Promise<void> | void;
  onSendReaction?: (reaction: string) => void;
}

function ChatComposer({
  users,
  username,
  onSendMessage,
  onCommand,
  onSendReaction,
}: ChatComposerProps) {
  const [inputText, setInputText] = useState('');
  const [showReactions, setShowReactions] = useState(false);
  const [mentionSuggestions, setMentionSuggestions] = useState<string[]>([]);
  const [commandSuggestions, setCommandSuggestions] = useState<{ cmd: string; desc: string }[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const reactionRef = useRef<HTMLDivElement>(null);

  // Click outside to close reactions
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (reactionRef.current && !reactionRef.current.contains(e.target as Node)) {
        setShowReactions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const cursor = e.target.selectionStart ?? value.length;

    setInputText(value);

    if (value.startsWith('/') && !value.includes(' ')) {
      const query = value.toLowerCase();
      const filtered = COMMANDS.filter((command) =>
        command.cmd.toLowerCase().startsWith(query)
      );
      setCommandSuggestions(filtered);
      setMentionSuggestions([]);
      setSelectedSuggestionIndex(0);
      return;
    }

    setCommandSuggestions([]);

    const context = getMentionContext(value, cursor);

    if (!context) {
      setMentionSuggestions([]);
      setSelectedSuggestionIndex(0);
      return;
    }

    const query = context.query.toLowerCase();

    const suggestions = users
      .map((user) => user.username)
      .filter((name) => {
        const normalisedName = name.toLowerCase();
        return (
          name !== username &&
          name !== 'Server Feeder' &&
          normalisedName.startsWith(query)
        );
      });

    setMentionSuggestions(suggestions);
    setSelectedSuggestionIndex(0);
  };

  const insertMention = (name: string) => {
    const input = inputRef.current;
    const cursor = input?.selectionStart ?? inputText.length;
    const context = getMentionContext(inputText, cursor);

    if (!context) return;

    const replacement = `@${name} `;
    const newText =
      inputText.slice(0, context.start) +
      replacement +
      inputText.slice(context.end);

    const nextCursor = context.start + replacement.length;

    setInputText(newText);
    setMentionSuggestions([]);
    setSelectedSuggestionIndex(0);

    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const insertCommand = (cmd: string) => {
    setInputText(cmd + ' ');
    setCommandSuggestions([]);
    setSelectedSuggestionIndex(0);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const hasCommand = commandSuggestions.length > 0;
    const hasMention = mentionSuggestions.length > 0;

    if (e.key === 'Escape') {
      if (hasCommand || hasMention) {
        e.preventDefault();
        setCommandSuggestions([]);
        setMentionSuggestions([]);
        setSelectedSuggestionIndex(0);
      } else if (showReactions) {
        e.preventDefault();
        setShowReactions(false);
      }
      return;
    }

    if (!hasCommand && !hasMention) return;

    const suggestionsLength = hasCommand
      ? commandSuggestions.length
      : mentionSuggestions.length;

    const safeIndex = Math.min(
      selectedSuggestionIndex,
      suggestionsLength - 1
    );

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) => Math.min(prev + 1, suggestionsLength - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (safeIndex < 0) return;
      if (hasCommand) {
        const suggestion = commandSuggestions[safeIndex];
        if (suggestion) insertCommand(suggestion.cmd);
      } else if (hasMention) {
        const suggestion = mentionSuggestions[safeIndex];
        if (suggestion) insertMention(suggestion);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || isSubmitting) return;

    setIsSubmitting(true);
    setMentionSuggestions([]);
    setCommandSuggestions([]);
    setSelectedSuggestionIndex(0);

    try {
      if (text.startsWith('/')) {
        const [rawCommand, ...argParts] = text.slice(1).split(/\s+/u);
        const command = rawCommand.toLowerCase();
        const args = argParts.join(' ');

        const commandExists = ALLOWED_CMDS.includes(command);

        if (commandExists) {
          await onCommand(command, args);
        } else {
          await onSendMessage(text);
        }
      } else {
        await onSendMessage(text);
      }
      setInputText('');
    } catch (err) {
      console.error('Lỗi khi gửi tin nhắn:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasSuggestions = commandSuggestions.length > 0 || mentionSuggestions.length > 0;
  const safeSuggestionIndex = Math.min(
    selectedSuggestionIndex,
    (commandSuggestions.length > 0 ? commandSuggestions.length : mentionSuggestions.length) - 1
  );

  return (
    <div className="relative">
      {/* Command autocomplete dropdown */}
      {commandSuggestions.length > 0 && (
        <div
          id="chat-suggestions"
          role="listbox"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            background: 'var(--bg-primary)',
            border: '1.5px solid var(--glass-border)',
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
                id={`chat-suggestion-${idx}`}
                role="option"
                aria-selected={idx === safeSuggestionIndex}
                type="button"
                onClick={() => insertCommand(item.cmd)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs rounded-lg text-left transition-colors"
                style={{
                  cursor: 'pointer',
                  background: idx === safeSuggestionIndex ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                  border: 'none',
                  color: 'var(--text-main)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#a855f7', fontFamily: 'monospace', fontWeight: 700 }}>/</span>
                  <span style={{ fontWeight: 600 }}>{item.cmd.slice(1)}</span>
                </div>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{item.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mention autocomplete dropdown */}
      {mentionSuggestions.length > 0 && (
        <div
          id="chat-suggestions"
          role="listbox"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            background: 'var(--bg-primary)',
            border: '1.5px solid var(--glass-border)',
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
                id={`chat-suggestion-${idx}`}
                role="option"
                aria-selected={idx === safeSuggestionIndex}
                type="button"
                onClick={() => insertMention(name)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg text-left transition-colors"
                style={{
                  cursor: 'pointer',
                  background: idx === safeSuggestionIndex ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                  border: 'none',
                  color: 'var(--text-main)'
                }}
              >
                <span style={{ color: '#22d3ee', fontFamily: 'monospace', fontWeight: 700 }}>@</span>
                <span style={{ fontWeight: 600 }}>{name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2 items-center">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={hasSuggestions}
          aria-controls={hasSuggestions ? 'chat-suggestions' : undefined}
          aria-activedescendant={hasSuggestions ? `chat-suggestion-${safeSuggestionIndex}` : undefined}
          placeholder="Gõ tin nhắn, lệnh /play, /vs... hoặc @tên"
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          className="glass-input flex-1 py-2 px-3 text-xs"
          style={{ height: '36px' }}
          maxLength={200}
          disabled={isSubmitting}
        />
        {/* Emoji Button */}
        <div className="relative flex" ref={reactionRef}>
          <button
            type="button"
            onClick={() => setShowReactions(!showReactions)}
            className="glass-btn rounded-lg flex-shrink-0 flex items-center justify-center"
            style={{ cursor: 'pointer', width: '36px', height: '36px', padding: 0 }}
            title="Biểu cảm"
            aria-label="Mở danh sách biểu cảm"
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
                border: '1px solid var(--glass-border)',
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
                  className="text-lg hover:scale-125 transition-transform bg-[#ffffff0d] p-1.5 rounded-full cursor-pointer border border-[#ffffff0d]"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="submit"
          className="glass-btn rounded-lg flex-shrink-0 flex items-center justify-center"
          style={{ cursor: 'pointer', width: '36px', height: '36px', padding: 0 }}
          title="Gửi (Enter)"
          aria-label="Gửi tin nhắn"
          disabled={isSubmitting}
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}

// --- MAIN CHAT BOX COMPONENT ---
export default function ChatBox({
  messages,
  username,
  users,
  onSendMessage,
  onCommand,
  onSendReaction,
}: ChatBoxProps) {
  const [showHelp, setShowHelp] = useState(false);
  const helpPanelRef = useRef<HTMLDivElement>(null);

  // Close help panel on Escape or click outside
  useEffect(() => {
    const handleKeyDownGlobal = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowHelp(false);
      }
    };

    const handleClickOutsideGlobal = (e: MouseEvent) => {
      if (helpPanelRef.current && !helpPanelRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (!target.closest('.help-toggle-btn')) {
          setShowHelp(false);
        }
      }
    };

    if (showHelp) {
      document.addEventListener('keydown', handleKeyDownGlobal);
      document.addEventListener('mousedown', handleClickOutsideGlobal);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDownGlobal);
      document.removeEventListener('mousedown', handleClickOutsideGlobal);
    };
  }, [showHelp]);

  const mentionPattern = useMemo(() => {
    const names = users
      .map((user) => user.username)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp);

    if (names.length === 0) return null;

    return new RegExp(`(@(?:${names.join('|')}))`, 'giu');
  }, [users]);

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
          className="text-xs flex items-center gap-1 transition-all rounded help-toggle-btn hover:text-white"
          style={{
            cursor: 'pointer',
            outline: 'none',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--glass-border)',
            padding: '4px 8px',
            color: 'var(--text-muted)'
          }}
          aria-label="Xem danh sách lệnh hỗ trợ"
        >
          <HelpCircle size={13} />
          Xem Lệnh
        </button>
      </div>

      {/* Help Panel */}
      {showHelp && (
        <div
          ref={helpPanelRef}
          className="absolute p-4 rounded-xl border text-xs leading-relaxed animate-fade-in z-30 shadow-2xl"
          style={{
            top: '36px',
            left: '8px',
            right: '8px',
            background: 'linear-gradient(135deg, rgba(17, 12, 28, 0.96), rgba(8, 8, 16, 0.99))',
            backdropFilter: 'blur(16px)',
            border: '1.5px solid rgba(168, 85, 247, 0.25)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.9)',
          }}
        >
          <div className="flex justify-between items-center mb-3 pb-2 border-b border-[#ffffff0d]">
            <h4
              className="font-bold tracking-wide bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-1.5"
              style={{ fontSize: '11px' }}
            >
              <Terminal size={13} className="text-purple-400" />
              DANH SÁCH LỆNH TRONG PHÒNG
            </h4>
            <button
              onClick={() => setShowHelp(false)}
              className="w-5 h-5 rounded-full flex items-center justify-center text-neutral-400 hover:text-rose-400 bg-[#ffffff0d] hover:bg-rose-500/10 border border-[#ffffff1a] transition-all active:scale-95"
              style={{ cursor: 'pointer', fontSize: '9px' }}
              title="Đóng trợ giúp"
              aria-label="Đóng trợ giúp"
            >
              ✕
            </button>
          </div>

          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {/* Lệnh /play */}
            <div className="flex flex-col gap-0.5 p-1 rounded hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <code className="text-cyan-400 font-mono font-bold" style={{ fontSize: '11px' }}>
                  /play &lt;link&gt;
                </code>
                <span className="text-muted text-[10px]">hoặc</span>
                <code className="text-cyan-400 font-mono font-bold" style={{ fontSize: '11px' }}>
                  /p
                </code>
              </div>
              <p className="text-neutral-300 pl-3.5" style={{ fontSize: '10.5px' }}>
                Phát video hoặc thêm vào hàng đợi (hỗ trợ cả link playlist).
              </p>
            </div>

            {/* Lệnh /pause */}
            <div className="flex flex-col gap-0.5 p-1 rounded hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <code className="text-cyan-400 font-mono font-bold" style={{ fontSize: '11px' }}>
                  /pause
                </code>
              </div>
              <p className="text-neutral-300 pl-3.5" style={{ fontSize: '10.5px' }}>
                Tạm dừng phát nhạc trong phòng.
              </p>
            </div>

            {/* Lệnh /resume */}
            <div className="flex flex-col gap-0.5 p-1 rounded hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <code className="text-cyan-400 font-mono font-bold" style={{ fontSize: '11px' }}>
                  /resume
                </code>
              </div>
              <p className="text-neutral-300 pl-3.5" style={{ fontSize: '10.5px' }}>
                Tiếp tục phát nhạc đang tạm dừng.
              </p>
            </div>

            {/* Lệnh /voteskip */}
            <div className="flex flex-col gap-0.5 p-1 rounded hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                <code className="text-cyan-400 font-mono font-bold" style={{ fontSize: '11px' }}>
                  /voteskip
                </code>
                <span className="text-muted text-[10px]">hoặc</span>
                <code className="text-cyan-400 font-mono font-bold" style={{ fontSize: '11px' }}>
                  /vs
                </code>
              </div>
              <p className="text-neutral-300 pl-3.5" style={{ fontSize: '10.5px' }}>
                Bình chọn bỏ qua bài — cần 60% người trong phòng đồng ý.
              </p>
            </div>

            {/* Lệnh /clear */}
            <div className="flex flex-col gap-0.5 p-1 rounded hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                <code className="text-cyan-400 font-mono font-bold" style={{ fontSize: '11px' }}>
                  /clear
                </code>
              </div>
              <p className="text-neutral-300 pl-3.5" style={{ fontSize: '10.5px' }}>
                Xóa toàn bộ các bài hát đang có trong hàng đợi chờ.
              </p>
            </div>

            {/* Lệnh /queue */}
            <div className="flex flex-col gap-0.5 p-1 rounded hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                <code className="text-cyan-400 font-mono font-bold" style={{ fontSize: '11px' }}>
                  /queue
                </code>
                <span className="text-muted text-[10px]">hoặc</span>
                <code className="text-cyan-400 font-mono font-bold" style={{ fontSize: '11px' }}>
                  /q
                </code>
              </div>
              <p className="text-neutral-300 pl-3.5" style={{ fontSize: '10.5px' }}>
                Hiển thị danh sách các bài hát trong hàng chờ hiện tại.
              </p>
            </div>

            {/* @mention */}
            <div className="flex flex-col gap-0.5 p-1 rounded hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-pink-400" />
                <code className="text-cyan-400 font-mono font-bold" style={{ fontSize: '11px' }}>
                  @username
                </code>
              </div>
              <p className="text-neutral-300 pl-3.5" style={{ fontSize: '10.5px' }}>
                Nhắc đến ai đó trong chat — họ sẽ nhận thông báo.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Messages List */}
      <ChatMessageList
        messages={messages}
        username={username}
        users={users}
        mentionPattern={mentionPattern}
      />

      {/* Input Composer */}
      <ChatComposer
        users={users}
        username={username}
        onSendMessage={onSendMessage}
        onCommand={onCommand}
        onSendReaction={onSendReaction}
      />
    </div>
  );
}
