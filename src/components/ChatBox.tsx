'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Send, Terminal, HelpCircle, Smile } from 'lucide-react';
import { RoomUser } from './UsersList';
import { Tabs, Tab, Input, Button, Popover, PopoverTrigger, PopoverContent, ScrollShadow, Card, Listbox, ListboxItem } from "@nextui-org/react";

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
    return 'text-danger bg-danger/10 border border-danger/20 p-2 rounded-lg text-center';
  }
  if (msg.isSystem) {
    return 'text-secondary bg-secondary/10 border border-secondary/20 p-2 rounded-lg text-center font-mono';
  }
  return '';
};

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
            }) === 0 || part.toLowerCase() === '@all';

          if (!isMention) {
            return <span key={index}>{part}</span>;
          }

          return (
            <span
              key={index}
              className={
                isCurrentUser
                  ? 'font-bold px-1 rounded text-warning bg-warning/20'
                  : 'font-bold px-1 rounded text-primary bg-primary/10'
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
    <ScrollShadow
      ref={messagesContainerRef}
      onScroll={handleMessagesScroll}
      className="flex-1 flex flex-col mb-3 p-3 rounded-xl bg-content1 border border-default-100 min-h-0"
    >
      {messages.map((msg, index) => {
        const isSystem = msg.isSystem || msg.isError;
        const prevMsg = index > 0 ? messages[index - 1] : null;
        
        const isGrouped = 
          prevMsg && 
          !isSystem && 
          !(prevMsg.isSystem || prevMsg.isError) && 
          msg.username === prevMsg.username &&
          (new Date(msg.timestamp).getTime() - new Date(prevMsg.timestamp).getTime()) < 120000;

        return (
          <div 
            key={msg.id} 
            className={`flex flex-col ${getMessageStyle(msg)} ${
              isSystem ? 'my-1' : isGrouped ? 'mt-1' : 'mt-3'
            }`}
            style={{
              fontSize: isSystem ? '12px' : '14px',
            }}
          >
            {!isSystem && !isGrouped && (
              <div className="flex items-baseline gap-2 mb-1 select-none">
                <span className="font-bold text-secondary font-mono text-[13px] tracking-tight">{msg.username}</span>
                <span className="text-default-400 text-[10px]">
                  {formatMessageTime(msg.timestamp)}
                </span>
              </div>
            )}

            <p className={isSystem ? 'leading-relaxed' : 'text-default-700 break-words whitespace-pre-wrap leading-snug'}>
              {isSystem ? msg.text : renderMessageText(msg.text)}
            </p>
          </div>
        );
      })}
      <div ref={chatEndRef} />
    </ScrollShadow>
  );
});

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

    if ('all'.startsWith(query)) {
      suggestions.push('all');
    }

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
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 0);
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
        <Card
          className="absolute bottom-full left-0 right-0 mb-2 z-50 overflow-hidden"
          shadow="lg"
        >
          <Listbox
            aria-label="Command suggestions"
            onAction={(key) => insertCommand(key as string)}
            className="p-1"
          >
            {commandSuggestions.map((item, idx) => (
              <ListboxItem
                key={item.cmd}
                className={idx === safeSuggestionIndex ? 'bg-default-200' : ''}
                textValue={item.cmd}
              >
                <div className="flex flex-col">
                  <div className="flex items-center gap-1 font-mono text-secondary">
                    <span className="font-bold">/</span>
                    <span className="font-semibold">{item.cmd.slice(1)}</span>
                  </div>
                  <span className="text-[10px] text-default-500">{item.desc}</span>
                </div>
              </ListboxItem>
            ))}
          </Listbox>
        </Card>
      )}

      {/* Mention autocomplete dropdown */}
      {mentionSuggestions.length > 0 && (
        <Card
          className="absolute bottom-full left-0 right-0 mb-2 z-50 overflow-hidden"
          shadow="lg"
        >
          <Listbox
            aria-label="Mention suggestions"
            onAction={(key) => insertMention(key as string)}
            className="p-1"
          >
            {mentionSuggestions.map((name, idx) => (
              <ListboxItem
                key={name}
                className={idx === safeSuggestionIndex ? 'bg-default-200' : ''}
                textValue={name}
              >
                <div className="flex items-center gap-1 font-mono text-primary">
                  <span className="font-bold">@</span>
                  <span className="font-semibold">{name}</span>
                </div>
              </ListboxItem>
            ))}
          </Listbox>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2 items-center">
        <Input
          ref={inputRef}
          type="text"
          placeholder="Gõ tin nhắn, lệnh /play, /vs... hoặc @tên"
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          className="flex-1"
          size="sm"
          radius="lg"
          variant="faded"
          maxLength={200}
        />
        
        {/* Emoji Button */}
        <Popover placement="top" isOpen={showReactions} onOpenChange={setShowReactions}>
          <PopoverTrigger>
            <Button
              isIconOnly
              size="sm"
              variant="flat"
              color="secondary"
              aria-label="Mở danh sách biểu cảm"
            >
              <Smile size={16} />
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <div className="flex items-center gap-2 px-1 py-2">
              {['❤️', '🔥', '👍', '🎉', '😆', '🖕'].map((emoji) => (
                <Button
                  key={emoji}
                  isIconOnly
                  variant="light"
                  className="text-xl"
                  onPress={() => {
                    onSendReaction?.(emoji);
                    setShowReactions(false);
                  }}
                >
                  {emoji}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Button
          type="submit"
          isIconOnly
          size="sm"
          color="primary"
          aria-label="Gửi tin nhắn"
          isDisabled={isSubmitting || !inputText.trim()}
        >
          <Send size={16} />
        </Button>
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
  const [activeTab, setActiveTab] = useState<'chat' | 'system'>('chat');

  const mentionPattern = useMemo(() => {
    const names = users
      .map((user) => user.username)
      .filter(Boolean);
      
    names.push('all');
    
    const uniqueNames = Array.from(new Set(names))
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp);

    if (uniqueNames.length === 0) return null;

    return new RegExp(`(@(?:${uniqueNames.join('|')}))`, 'giu');
  }, [users]);

  // Filter messages based on active tab
  const filteredMessages = useMemo(() => {
    return messages.filter((msg) => {
      const isSystem = msg.isSystem || msg.isError || msg.username === 'Hệ thống';
      return activeTab === 'system' ? isSystem : !isSystem;
    });
  }, [messages, activeTab]);

  const chatCount = useMemo(() => 
    messages.filter(m => !(m.isSystem || m.isError || m.username === 'Hệ thống')).length, 
    [messages]
  );
  
  const systemCount = useMemo(() => 
    messages.filter(m => m.isSystem || m.isError || m.username === 'Hệ thống').length, 
    [messages]
  );

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Terminal size={18} className="text-secondary" />
          <span className="text-sm font-semibold uppercase tracking-wider text-default-500">
            Khung Chat & Lệnh
          </span>
        </div>
        <Popover placement="bottom-end" isOpen={showHelp} onOpenChange={setShowHelp}>
          <PopoverTrigger>
            <Button size="sm" variant="light" className="text-default-500">
              <HelpCircle size={14} /> Xem Lệnh
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0 bg-content1 border border-default-200">
            <Card className="w-full border-none shadow-none bg-transparent">
              <div className="flex justify-between items-center p-3 border-b border-default-100">
                <h4 className="font-bold text-xs flex items-center gap-1.5 text-secondary">
                  <Terminal size={12} />
                  DANH SÁCH LỆNH TRONG PHÒNG
                </h4>
              </div>
              <ScrollShadow className="p-3 max-h-[250px] flex flex-col gap-3">
                {/* Lệnh /play */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    <code className="text-cyan-400 font-mono font-bold text-[11px]">/play &lt;link&gt;</code>
                    <span className="text-default-400 text-[10px]">hoặc</span>
                    <code className="text-cyan-400 font-mono font-bold text-[11px]">/p</code>
                  </div>
                  <p className="text-default-500 pl-3.5 text-[10px]">Phát video hoặc thêm vào hàng đợi.</p>
                </div>

                {/* Lệnh /pause */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                    <code className="text-cyan-400 font-mono font-bold text-[11px]">/pause</code>
                  </div>
                  <p className="text-default-500 pl-3.5 text-[10px]">Tạm dừng phát nhạc trong phòng.</p>
                </div>

                {/* Lệnh /resume */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-success" />
                    <code className="text-cyan-400 font-mono font-bold text-[11px]">/resume</code>
                  </div>
                  <p className="text-default-500 pl-3.5 text-[10px]">Tiếp tục phát nhạc đang tạm dừng.</p>
                </div>

                {/* Lệnh /voteskip */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                    <code className="text-cyan-400 font-mono font-bold text-[11px]">/voteskip</code>
                    <span className="text-default-400 text-[10px]">hoặc</span>
                    <code className="text-cyan-400 font-mono font-bold text-[11px]">/vs</code>
                  </div>
                  <p className="text-default-500 pl-3.5 text-[10px]">Bình chọn bỏ qua bài (60% đồng ý).</p>
                </div>

                {/* Lệnh /clear */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-danger" />
                    <code className="text-cyan-400 font-mono font-bold text-[11px]">/clear</code>
                  </div>
                  <p className="text-default-500 pl-3.5 text-[10px]">Xóa toàn bộ các bài hát trong hàng đợi.</p>
                </div>

                {/* Lệnh /queue */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                    <code className="text-cyan-400 font-mono font-bold text-[11px]">/queue</code>
                  </div>
                  <p className="text-default-500 pl-3.5 text-[10px]">Hiển thị danh sách các bài hát trong hàng chờ.</p>
                </div>

                {/* @mention */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <code className="text-cyan-400 font-mono font-bold text-[11px]">@username</code>
                  </div>
                  <p className="text-default-500 pl-3.5 text-[10px]">Nhắc đến ai đó trong chat.</p>
                </div>
              </ScrollShadow>
            </Card>
          </PopoverContent>
        </Popover>
      </div>

      {/* Tabs Selector */}
      <Tabs 
        aria-label="Chat Tabs" 
        selectedKey={activeTab} 
        onSelectionChange={(k) => setActiveTab(k as 'chat' | 'system')}
        fullWidth
        size="sm"
        color="secondary"
        className="mb-2"
      >
        <Tab 
          key="chat" 
          title={
            <div className="flex items-center gap-2">
              💬 Trò chuyện 
              {chatCount > 0 && <span className="bg-default-200 text-default-600 px-1.5 rounded-full text-[10px]">{chatCount}</span>}
            </div>
          }
        />
        <Tab 
          key="system" 
          title={
            <div className="flex items-center gap-2">
              🎵 Thông báo
              {systemCount > 0 && <span className="bg-default-200 text-default-600 px-1.5 rounded-full text-[10px]">{systemCount}</span>}
            </div>
          } 
        />
      </Tabs>

      {/* Messages List */}
      <ChatMessageList
        messages={filteredMessages}
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
