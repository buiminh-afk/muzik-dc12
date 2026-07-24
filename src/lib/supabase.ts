import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Kiểm tra xem đã cấu hình đầy đủ Supabase chưa
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

// Singleton pattern để tránh việc Next.js dev tạo nhiều thực thể Supabase Client khi hot-reload
const globalForSupabase = globalThis as unknown as {
  supabase: ReturnType<typeof createClient> | null;
};

export const supabase = globalForSupabase.supabase || (
  isSupabaseConfigured 
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false, // Tắt session persistence nếu chỉ dùng để nghe nhạc
        }
      })
    : null
);

if (process.env.NODE_ENV !== 'production') {
  globalForSupabase.supabase = supabase;
}

/**
 * Lớp giả lập Supabase Realtime Channel sử dụng HTML5 BroadcastChannel API
 * để hỗ trợ đồng bộ đa tab cục bộ (local multi-tab synchronization) khi chưa cấu hình Supabase.
 */
class MockRealtimeChannel {
  private channelName: string;
  private broadcastChannel: BroadcastChannel | null = null;
  private listeners: { event: string; callback: (payload: any) => void }[] = [];
  private presenceCallback: ((payload: any) => void) | null = null;
  private _presenceState: Record<string, any> = {};
  private localUser: any = null;

  constructor(channelName: string) {
    this.channelName = channelName;
    if (typeof window !== 'undefined') {
      this.broadcastChannel = new BroadcastChannel(`mock_supabase_${channelName}`);
      this.broadcastChannel.onmessage = (event) => {
        this.handleIncomingMessage(event.data);
      };
    }
  }

  on(type: string, filter: { event: string }, callback: (payload: any) => void) {
    if (type === 'broadcast') {
      this.listeners.push({ event: filter.event, callback });
    } else if (type === 'presence') {
      if (filter.event === 'sync') {
        this.presenceCallback = callback;
      }
    }
    return this;
  }

  presenceState() {
    const formatted: Record<string, any[]> = {};
    Object.keys(this._presenceState).forEach(key => {
      formatted[key] = [this._presenceState[key]];
    });
    return formatted;
  }

  subscribe(callback?: (status: string) => void) {
    if (callback) {
      setTimeout(() => callback('SUBSCRIBED'), 100);
    }
    
    // Giả lập gửi tin nhắn join để mọi người biết có user mới
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        if (this.localUser) {
          this.broadcast('presence_join', { user: this.localUser });
        }
      }, 500);
    }
    return this;
  }

  // Gửi tin nhắn Broadcast đến tất cả các tab khác
  send(payload: { type: string; event: string; payload: any }) {
    if (payload.type === 'broadcast') {
      const data = {
        type: 'broadcast',
        event: payload.event,
        payload: payload.payload,
        senderTabId: this.getTabId(),
      };
      
      this.broadcastChannel?.postMessage(data);
      this.triggerLocal(payload.event, data.payload);
    }
    return Promise.resolve('ok');
  }

  // Theo dõi Presence (danh sách user online)
  track(state: any) {
    this.localUser = state;
    this._presenceState[this.getTabId()] = { presence_ref: this.getTabId(), ...state };
    
    this.broadcast('presence_state_change', {
      tabId: this.getTabId(),
      state: state
    });
    
    this.triggerPresenceSync();
    return this;
  }

  untrack() {
    delete this._presenceState[this.getTabId()];
    this.broadcast('presence_leave', { tabId: this.getTabId() });
    this.triggerPresenceSync();
    return Promise.resolve('ok');
  }

  unsubscribe() {
    this.untrack();
    this.broadcastChannel?.close();
  }

  // Helper gửi message
  private broadcast(event: string, payload: any) {
    this.broadcastChannel?.postMessage({
      type: 'system',
      event,
      payload,
      senderTabId: this.getTabId(),
    });
  }

  private handleIncomingMessage(msg: any) {
    if (msg.type === 'broadcast') {
      this.triggerLocal(msg.event, msg.payload);
    } else if (msg.type === 'system') {
      if (msg.event === 'presence_state_change') {
        this._presenceState[msg.senderTabId] = {
          presence_ref: msg.senderTabId,
          ...msg.payload.state
        };
        this.triggerPresenceSync();
      } else if (msg.event === 'presence_join' && this.localUser) {
        this._presenceState[msg.senderTabId] = {
          presence_ref: msg.senderTabId,
          ...msg.payload.user
        };
        this.triggerPresenceSync();
        
        this.broadcastChannel?.postMessage({
          type: 'system',
          event: 'presence_state_reply',
          payload: { state: this.localUser },
          senderTabId: this.getTabId()
        });
      } else if (msg.event === 'presence_state_reply') {
        this._presenceState[msg.senderTabId] = {
          presence_ref: msg.senderTabId,
          ...msg.payload.state
        };
        this.triggerPresenceSync();
      } else if (msg.event === 'presence_leave') {
        delete this._presenceState[msg.payload.tabId];
        this.triggerPresenceSync();
      }
    }
  }

  private triggerLocal(event: string, payload: any) {
    this.listeners
      .filter((l) => l.event === event)
      .forEach((l) => l.callback({ event, payload }));
  }

  private triggerPresenceSync() {
    if (this.presenceCallback) {
      const formatted: Record<string, any[]> = {};
      Object.keys(this._presenceState).forEach(key => {
        formatted[key] = [this._presenceState[key]];
      });
      this.presenceCallback(formatted);
    }
  }

  private tabId: string | null = null;
  private getTabId() {
    if (!this.tabId) {
      this.tabId = Math.random().toString(36).substring(2, 10);
    }
    return this.tabId;
  }
}

/**
 * Trả về một realtime channel, tự động dùng mock BroadcastChannel nếu chưa cấu hình Supabase
 */
export const getRealtimeChannel = (roomId: string) => {
  const channelName = `room_${roomId}`;
  if (isSupabaseConfigured && supabase) {
    return supabase.channel(channelName);
  } else {
    return new MockRealtimeChannel(channelName) as any;
  }
};
