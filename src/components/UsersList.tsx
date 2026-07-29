'use client';

import { Users, Shield } from 'lucide-react';

export interface RoomUser {
  presence_ref: string;
  username: string;
  color: string;
  joinedAt: string;
  isHost?: boolean;
  videoFinished?: boolean;
}

interface UsersListProps {
  users: RoomUser[];
  localRefId: string | null;
}

export default function UsersList({ users, localRefId }: UsersListProps) {
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
          const isMe = user.presence_ref === localRefId;
          const firstLetter = user.username.charAt(0).toUpperCase();

          return (
            <div
              key={user.presence_ref}
              className={`flex items-center gap-2-5 p-2 rounded-lg border transition-all ${
                isMe
                  ? 'bg-purple-95-10 border-purple-50-20'
                  : 'bg-white-01 border-white-5'
              }`}
            >
              {/* Avatar với viền màu được gán ngẫu nhiên */}
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white relative shadow-inner"
                style={{
                  backgroundColor: `${user.color}25`,
                  border: `1.5px solid ${user.color}`,
                  textShadow: `0 0 4px ${user.color}80`,
                  boxShadow: `inset 0 0 6px ${user.color}30, 0 0 8px ${user.color}20`
                }}
              >
                {firstLetter}
                <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 border border-black"></span>
              </div>

              {/* Username */}
              <div className="flex-1 min-w-0 flex items-center gap-1-5">
                <span
                  className={`text-xs truncate ${isMe ? 'text-purple-200 font-semibold' : 'text-neutral-300'}`}
                  title={user.username}
                >
                  {user.username}
                </span>
                {isMe && (
                  <span 
                    className="py-0.5 rounded bg-purple-50-20 border border-purple-50-30 text-purple-300 font-mono scale-90"
                    style={{ fontSize: '9px', paddingLeft: '6px', paddingRight: '6px' }}
                  >
                    Bạn
                  </span>
                )}
                {user.isHost && (
                  <span
                    className="text-amber-400 flex items-center"
                    title="Chủ phòng"
                  >
                    <Shield size={12} fill="currentColor" style={{ opacity: 0.8 }} />
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
