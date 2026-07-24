import RoomClient from '@/components/RoomClient';

interface PageProps {
  params: Promise<{ roomId: string }> | { roomId: string };
}

export default async function RoomPage({ params }: PageProps) {
  // Tương thích cả Next.js 14 và Next.js 15 (params là Promise)
  const resolvedParams = params && typeof (params as any).then === 'function' 
    ? await (params as any) 
    : params;
    
  const roomId = (resolvedParams?.roomId || '').toUpperCase();

  return <RoomClient roomId={roomId} />;
}
export const dynamic = 'force-dynamic';
