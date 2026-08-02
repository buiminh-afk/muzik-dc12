import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { simpleHash } from '@/lib/utils';

function solveHash(targetHash: string): string | null {
  const common = ['123', '1234', '123456', '0000', '1111', '8888', '9999', 'admin', 'password', 'hackme', 'muzik', 'music'];
  for (const pw of common) {
    if (simpleHash(pw) === targetHash) return pw;
  }
  for (let i = 0; i <= 999999; i++) {
    const pw = String(i);
    if (simpleHash(pw) === targetHash) return pw;
    const pwPadded = String(i).padStart(4, '0');
    if (simpleHash(pwPadded) === targetHash) return pwPadded;
  }
  return null;
}

export async function GET() {
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' });
  }

  const channel = supabase.channel('room_lobby');
  
  return new Promise<Response>((resolve) => {
    let resolved = false;

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const rooms: any[] = [];
      let targetRoom: any = null;
      let solvedPassword: string | null = null;

      Object.keys(state).forEach(ref => {
        const list = state[ref];
        list.forEach((p: any) => {
          if (p.type === 'room') {
            rooms.push(p);
            if (p.roomId === 'ECV0XJV') {
              targetRoom = p;
              if (p.passwordHash) {
                solvedPassword = solveHash(p.passwordHash);
              }
            }
          }
        });
      });

      if (targetRoom && !resolved) {
        resolved = true;
        channel.unsubscribe();
        resolve(NextResponse.json({ success: true, targetRoom, solvedPassword, rooms }));
      }
    });

    channel.subscribe((status) => {
      console.log('Lobby subscribe status:', status);
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        channel.unsubscribe();
        resolve(NextResponse.json({ error: 'Timeout or room not online', rooms: [] }));
      }
    }, 6000);
  });
}
