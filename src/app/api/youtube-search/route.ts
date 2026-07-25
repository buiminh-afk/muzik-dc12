import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'Missing query parameter (q)' }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY || process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;

  if (apiKey) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(query)}&type=video&key=${apiKey}`;
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.items) {
        const results = data.items.map((item: any) => ({
          videoId: item.id.videoId,
          title: item.snippet.title.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
          thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
          channelTitle: item.snippet.channelTitle
        }));
        return NextResponse.json({ results });
      }
    } catch (e) {
      console.error('YouTube API Search Error, falling back to scraping:', e);
    }
  }

  // Fallback: Scrape from youtube search page
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    const html = await res.text();
    const match = html.match(/ytInitialData\s*=\s*({.+?});/);
    
    if (match) {
      const ytInitialData = JSON.parse(match[1]);
      const contents = ytInitialData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
      
      let itemSection = contents.find((c: any) => c.itemSectionRenderer)?.itemSectionRenderer?.contents;
      
      if (itemSection) {
        const results = itemSection
          .filter((item: any) => item.videoRenderer)
          .map((item: any) => {
            const video = item.videoRenderer;
            return {
              videoId: video.videoId,
              title: video.title?.runs?.[0]?.text || '',
              thumbnail: video.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
              channelTitle: video.ownerText?.runs?.[0]?.text || '',
              duration: video.lengthText?.simpleText || ''
            };
          })
          .slice(0, 10);
          
        return NextResponse.json({ results });
      }
    }
    
    return NextResponse.json({ error: 'No results found via scraping' }, { status: 404 });
  } catch (error) {
    console.error('YouTube Scraping Error:', error);
    return NextResponse.json({ error: 'Failed to search YouTube' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
