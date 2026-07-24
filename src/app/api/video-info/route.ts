import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  // 1. Kiểm tra xem URL có chứa tham số Playlist (list=) hay không
  const playlistIdMatch = targetUrl.match(/[?&]list=([^#\&\?]+)/);
  if (playlistIdMatch) {
    const playlistId = playlistIdMatch[1];
    try {
      console.log(`Đang cạo danh sách phát qua RSS Feed cho Playlist ID: ${playlistId}`);
      const playlistData = await scrapePlaylist(playlistId);
      return NextResponse.json(playlistData);
    } catch (err) {
      console.error('Lỗi khi cạo playlist bằng RSS feed, rơi về oEmbed video đơn:', err);
      // Nếu cạo playlist lỗi, sẽ tiếp tục xử lý như video đơn bên dưới
    }
  }

  // 2. Xử lý video đơn lẻ qua YouTube oEmbed
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500);

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`;
    const response = await fetch(oembedUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const fallbackController = new AbortController();
      const fallbackTimeoutId = setTimeout(() => fallbackController.abort(), 2000);
      try {
        const noembedResponse = await fetch(
          `https://noembed.com/embed?url=${encodeURIComponent(targetUrl)}`,
          { signal: fallbackController.signal }
        );
        clearTimeout(fallbackTimeoutId);
        if (noembedResponse.ok) {
          const data = await noembedResponse.json();
          return NextResponse.json({
            isPlaylist: false,
            title: data.title,
            thumbnail_url: data.thumbnail_url
          });
        }
      } catch (err) {
        clearTimeout(fallbackTimeoutId);
      }
      return NextResponse.json({ error: 'Failed to fetch video details' }, { status: 502 });
    }

    const data = await response.json();
    return NextResponse.json({
      isPlaylist: false,
      title: data.title,
      thumbnail_url: data.thumbnail_url
    });
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error('Lỗi khi fetch thông tin video oembed:', error.name === 'AbortError' ? 'Timeout 2.5s' : error);
    return NextResponse.json({ error: 'Request timeout or network error' }, { status: 504 });
  }
}

/**
 * Cạo (scrape) thông tin và danh sách video từ Playlist YouTube qua RSS Feed (XML)
 * Cách này cực kỳ ổn định, không bao giờ bị YouTube chặn captcha hay robot check!
 */
async function scrapePlaylist(playlistId: string) {
  const url = `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch playlist RSS: status ${response.status}`);
  }

  const xml = await response.text();
  
  // Trích xuất tiêu đề playlist
  let playlistTitle = 'Danh sách phát YouTube';
  const titleMatch = xml.match(/<title>(.*?)<\/title>/);
  if (titleMatch) {
    playlistTitle = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1');
  }

  // Trích xuất danh sách video bằng Regex quét qua các entry XML
  const videos: any[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  
  while ((match = entryRegex.exec(xml)) !== null) {
    const entryContent = match[1];
    
    const idMatch = entryContent.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
    const videoTitleMatch = entryContent.match(/<title>(.*?)<\/title>/);
    
    if (idMatch) {
      const videoId = idMatch[1];
      let title = 'YouTube Video';
      if (videoTitleMatch) {
        title = videoTitleMatch[1]
          .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
      }
      
      const thumbnail_url = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      
      videos.push({
        videoId,
        title,
        thumbnail_url
      });
    }
  }

  if (videos.length === 0) {
    throw new Error('No videos found in RSS feed');
  }

  return {
    isPlaylist: true,
    playlistTitle,
    videos
  };
}

export const dynamic = 'force-dynamic';
