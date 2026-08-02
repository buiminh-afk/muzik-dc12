import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { simpleHash } from '@/lib/utils';

export async function POST(request: Request) {
  try {
    const { roomId, password } = await request.json();

    if (!roomId) {
      return NextResponse.json({ error: 'Missing roomId' }, { status: 400 });
    }

    if (!supabase) {
      return NextResponse.json({ success: true, offline: true });
    }

    const { data: room, error } = await supabase
      .from('rooms')
      .select('name')
      .eq('id', roomId)
      .single();

    if (error || !room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    const rawName = (room as any).name || '';
    const hasPassword = rawName.includes(':::pw_');
    const roomName = rawName.split(':::pw_')[0];

    if (!hasPassword) {
      return NextResponse.json({ success: true, requiresPassword: false, roomName });
    }

    if (password === undefined) {
      return NextResponse.json({ success: false, requiresPassword: true, roomName });
    }

    const expectedHash = rawName.split(':::pw_')[1];
    const inputHash = simpleHash(password);

    if (inputHash === expectedHash) {
      return NextResponse.json({ success: true, roomName });
    } else {
      return NextResponse.json({ success: false, error: 'Incorrect password' });
    }
  } catch (err: any) {
    console.error('Verify error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
