'use client';

import { Users, Crown, FastForward } from 'lucide-react';

export interface RoomUser {
  presence_ref: string;
  username: string;
  color: string;
  joinedAt: string;
  isHost?: boolean;
  videoFinished?: boolean;
  finishedItemId?: string | null;
  votedToSkip?: boolean;
  clientId?: string;
}

interface UsersListProps {
  users: RoomUser[];
  myClientId: string;
}

export default function UsersList({ users, myClientId }: UsersListProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <Users size={18} className="text-purple-400" />
        <span className="text-sm font-semibold uppercase tracking-wider text-muted flex-1">
          Trực Tuyến ({users.length})
        </span>
      </div>

      <div 
        className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2 scrollbar-thin"
      >
        {users.map((user) => {
          const isMe = user.clientId === myClientId;
          const firstLetter = user.username.charAt(0).toUpperCase();

          return (
            <div
              key={user.presence_ref}
              className={`flex items-center gap-3 p-2 rounded-lg border transition-all ${
                isMe
                  ? 'bg-secondary/10 border-secondary/20'
                  : 'bg-default-100 border-default-200'
              }`}
            >
              {/* Avatar với viền màu được gán ngẫu nhiên */}
              <div className="relative">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-inner"
                  style={{
                    backgroundColor: `${user.color}30`,
                    border: `2px solid ${user.color}`,
                    textShadow: `0 0 4px ${user.color}80`
                  }}
                >
                  {firstLetter}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-success border-2 border-background"></span>
              </div>

              {/* Username */}
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <span
                  className={`text-sm truncate ${isMe ? 'text-secondary font-bold' : 'text-foreground'}`}
                  title={user.username}
                >
                  {user.username}
                </span>
                {isMe && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-secondary/20 text-secondary shrink-0">
                    Bạn
                  </span>
                )}
                {user.isHost && (
                  <Crown size={14} className="text-warning shrink-0" />
                )}
                {user.votedToSkip && (
                  <span
                    className="text-yellow-400 flex items-center"
                    title="Đã bỏ phiếu skip"
                  >
                    <FastForward size={12} fill="currentColor" style={{ opacity: 0.8 }} />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
