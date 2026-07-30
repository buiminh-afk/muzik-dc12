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
          const duration = await fetchVideoDuration(targetUrl);
          return NextResponse.json({
            isPlaylist: false,
            title: data.title,
            thumbnail_url: data.thumbnail_url,
            duration
          });
        }
      } catch (err) {
        clearTimeout(fallbackTimeoutId);
      }
      return NextResponse.json({ error: 'Failed to fetch video details' }, { status: 502 });
    }

    const data = await response.json();
    const duration = await fetchVideoDuration(targetUrl);
    return NextResponse.json({
      isPlaylist: false,
      title: data.title,
      thumbnail_url: data.thumbnail_url,
      duration
    });
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error('Lỗi khi fetch thông tin video oembed:', error.name === 'AbortError' ? 'Timeout 2.5s' : error);
    return NextResponse.json({ error: 'Request timeout or network error' }, { status: 504 });
  }
}

// Helper to fetch watch page and parse duration
async function fetchVideoDuration(targetUrl: string): Promise<string> {
  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (res.ok) {
      const html = await res.text();
      let match = html.match(/<meta itemprop="duration" content="([^"]+)">/);
      if (match) {
        const iso = match[1]; // e.g. PT3M45S or PT1H2M3S
        const parts = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (parts) {
          const hours = parseInt(parts[1] || '0');
          const minutes = parseInt(parts[2] || '0');
          const seconds = parseInt(parts[3] || '0');
          
          if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
          } else {
            return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
          }
        }
      }

      // Fallback: Parse lengthSeconds from youtube initial player response
      const lengthMatch = html.match(/"lengthSeconds"\s*:\s*"(\d+)"/);
      if (lengthMatch) {
        const secs = parseInt(lengthMatch[1]);
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
      }
    }
  } catch (e) {
    console.error('Error fetching video duration:', e);
  }
  return '';
}

/**
 * Cạo (scrape) thông tin và danh sách video từ Playlist YouTube
 * Đầu tiên cố gắng cạo từ trang web HTML để lấy đầy đủ danh sách (lên đến 100 bài)
 * Nếu lỗi hoặc không lấy được, rơi về phương thức RSS Feed (giới hạn 15 bài)
 */
async function scrapePlaylist(playlistId: string) {
  // 1. Thử cạo trực tiếp từ trang playlist HTML
  try {
    const playlistUrl = `https://www.youtube.com/playlist?list=${playlistId}&hl=en`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const response = await fetch(playlistUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      cache: 'no-store',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const html = await response.text();
      
      // Trích xuất ytInitialData
      const jsonMatch = html.match(/ytInitialData\s*=\s*({[\s\S]*?});\s*<\/script>/)
                     || html.match(/ytInitialData\s*=\s*({[\s\S]*?});/)
                     || html.match(/window\["ytInitialData"\]\s*=\s*({[\s\S]*?});/);
      
      if (jsonMatch) {
        const ytInitialData = JSON.parse(jsonMatch[1]);
        
        // Trích xuất tiêu đề playlist
        let playlistTitle = 'Danh sách phát YouTube';
        try {
          playlistTitle = ytInitialData.metadata?.playlistMetadataRenderer?.title || 'Danh sách phát YouTube';
        } catch (e) {}

        // Hàm đệ quy tìm kiếm playlistVideoRenderer
        const renderers: any[] = [];
        const findRenderers = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;
          if (obj.playlistVideoRenderer) {
            renderers.push(obj.playlistVideoRenderer);
          } else {
            for (const key of Object.keys(obj)) {
              findRenderers(obj[key]);
            }
          }
        };

        findRenderers(ytInitialData);

        if (renderers.length > 0) {
          const videos = renderers.map((r: any) => {
            const videoId = r.videoId;
            const title = r.title?.runs?.[0]?.text || r.title?.accessibility?.accessibilityData?.label || 'YouTube Video';
            const thumbnail_url = r.thumbnail?.thumbnails?.[0]?.url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            const duration = r.lengthText?.simpleText || '';
            return {
              videoId,
              title,
              thumbnail_url,
              duration
            };
          });

          console.log(`Đã cạo thành công ${videos.length} bài hát từ playlist HTML.`);
          return {
            isPlaylist: true,
            playlistTitle,
            videos
          };
        }
      }
    }
  } catch (err) {
    console.warn('Lỗi khi cạo playlist HTML, đang thử rơi về RSS Feed:', err);
  }

  // 2. Dự phòng: cạo qua RSS Feed (chỉ lấy tối đa 15 bài đầu tiên)
  console.log(`Đang chạy cơ chế dự phòng RSS Feed cho Playlist ID: ${playlistId}`);
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;
  
  const rssController = new AbortController();
  const rssTimeoutId = setTimeout(() => rssController.abort(), 3500);

  let rssResponse;
  try {
    rssResponse = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      cache: 'no-store',
      signal: rssController.signal
    });
    clearTimeout(rssTimeoutId);
  } catch (error) {
    clearTimeout(rssTimeoutId);
    throw new Error('Timeout or network error fetching playlist RSS');
  }

  if (!rssResponse.ok) {
    throw new Error(`Failed to fetch playlist RSS: status ${rssResponse.status}`);
  }

  const xml = await rssResponse.text();
  
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
    throw new Error('No videos found in RSS/HTML playlist scraper');
  }

  return {
    isPlaylist: true,
    playlistTitle,
    videos
  };
}

export const dynamic = 'force-dynamic';
