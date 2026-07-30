'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  duration?: string;
}

interface SearchUIProps {
  onAddVideo: (video: {
    videoId: string;
    title: string;
    thumbnailUrl: string;
    duration?: string;
  }) => void | Promise<void>;
}

function parseSearchResults(data: unknown): YouTubeSearchResult[] {
  if (
    typeof data !== 'object' ||
    data === null ||
    !('results' in data) ||
    !Array.isArray(data.results)
  ) {
    return [];
  }

  const validResults = data.results.filter(
    (item): item is YouTubeSearchResult =>
      typeof item === 'object' &&
      item !== null &&
      typeof item.videoId === 'string' &&
      typeof item.title === 'string' &&
      typeof item.thumbnail === 'string' &&
      typeof item.channelTitle === 'string' &&
      (item.duration === undefined || typeof item.duration === 'string')
  );

  // Deduplicate by videoId
  return Array.from(
    new Map(validResults.map((result) => [result.videoId, result])).values()
  );
}

function SearchThumbnail({ result }: { result: YouTubeSearchResult }) {
  const fallback = `https://i.ytimg.com/vi/${result.videoId}/hqdefault.jpg`;
  const [src, setSrc] = useState(result.thumbnail || fallback);

  useEffect(() => {
    setSrc(result.thumbnail || fallback);
  }, [result.thumbnail, fallback]);

  return (
    <img
      src={src}
      alt=""
      className="h-full w-full object-cover"
      loading="lazy"
      onError={() => {
        if (src !== fallback) {
          setSrc(fallback);
        }
      }}
    />
  );
}

export default function SearchUI({ onAddVideo }: SearchUIProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [searchResults, setSearchResults] = useState<YouTubeSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [addingVideoId, setAddingVideoId] = useState<string | null>(null);

  const searchRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: PointerEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setShowSearchDropdown(false);
      }
    };

    document.addEventListener('pointerdown', handleClickOutside);

    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();

    const query = searchQuery.trim();
    if (!query) return;

    abortControllerRef.current?.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setSubmittedQuery(query);
    setSearchError(null);
    setIsSearching(true);
    setShowSearchDropdown(true);

    try {
      const response = await fetch(
        `/api/youtube-search?q=${encodeURIComponent(query)}`,
        {
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        throw new Error(`Search API returned ${response.status}`);
      }

      const data: unknown = await response.json();

      if (!controller.signal.aborted) {
        setSearchResults(parseSearchResults(data));
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      console.error('YouTube search failed:', error);
      setSearchResults([]);
      setSearchError('Không thể kết nối với dịch vụ tìm kiếm lúc này.');
    } finally {
      if (!controller.signal.aborted) {
        setIsSearching(false);
      }
    }
  };

  const handleAddVideo = async (result: YouTubeSearchResult) => {
    if (addingVideoId) return;

    setAddingVideoId(result.videoId);

    try {
      await onAddVideo({
        videoId: result.videoId,
        title: result.title,
        thumbnailUrl: result.thumbnail,
        duration: result.duration,
      });
    } finally {
      setAddingVideoId(null);
    }
  };

  return (
    <div
      ref={searchRef}
      className="relative mx-auto min-w-[200px] max-w-sm flex-1"
    >
      <form onSubmit={handleSearch} className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          onFocus={() => {
            if (searchResults.length > 0 || searchError || isSearching) {
              setShowSearchDropdown(true);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setShowSearchDropdown(false);
            }
          }}
          maxLength={100}
          placeholder="Tìm nhạc trên YouTube..."
          role="combobox"
          aria-expanded={showSearchDropdown}
          aria-controls="youtube-search-results"
          aria-autocomplete="list"
          className="w-full glass-input text-sm placeholder:text-muted focus:outline-none"
          style={{ paddingTop: '6px', paddingBottom: '6px', paddingLeft: '32px', paddingRight: '12px' }}
        />

        <button
          type="submit"
          disabled={!searchQuery.trim() || isSearching}
          aria-label="Tìm kiếm"
          className="absolute rounded p-1 text-muted hover:text-main disabled:opacity-50 border-none bg-transparent cursor-pointer flex items-center justify-center"
          style={{
            left: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
            outline: 'none'
          }}
        >
          {isSearching ? (
            <Loader2 size={14} className="animate-spin text-purple-400" />
          ) : (
            <Search size={14} />
          )}
        </button>
      </form>

      {showSearchDropdown && (
        <div
          id="youtube-search-results"
          role="listbox"
          className="custom-scrollbar absolute left-0 right-0 top-full z-50 mt-2 max-h-[300px] overflow-y-auto rounded-xl border shadow-2xl"
          style={{
            backgroundColor: 'var(--bg-primary)',
          }}
        >
          {isSearching ? (
            <div className="flex flex-col items-center justify-center gap-2 p-4 text-muted select-none">
              <Loader2 size={20} className="animate-spin text-purple-500" />
              <span className="text-xs">Đang tìm kiếm...</span>
            </div>
          ) : searchError ? (
            <div className="p-4 text-center text-xs text-rose-400 select-none">
              {searchError}
            </div>
          ) : searchResults.length > 0 ? (
            <div className="flex flex-col py-1">
              {searchResults.map((result) => (
                <div
                  key={result.videoId}
                  role="option"
                  aria-selected="false"
                  className="group flex items-center gap-3 p-2 transition-colors hover:bg-white/5"
                >
                  <div className="relative aspect-video w-16 shrink-0 overflow-hidden rounded bg-black select-none">
                    <SearchThumbnail result={result} />
                    {result.duration && (
                      <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 font-mono text-[9px] text-white">
                        {result.duration}
                      </span>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <span
                      className="block w-full truncate text-xs font-medium text-main"
                      title={result.title}
                    >
                      {result.title}
                    </span>
                    <span
                      className="truncate text-[10px] text-muted select-none"
                      title={result.channelTitle}
                    >
                      {result.channelTitle}
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={addingVideoId !== null}
                    onClick={() => void handleAddVideo(result)}
                    className="shrink-0 rounded-full bg-white/5 p-2 text-muted transition-colors hover:bg-purple-500/20 hover:text-purple-400 disabled:opacity-50 border-none cursor-pointer flex items-center justify-center"
                    aria-label={`Thêm ${result.title} vào hàng đợi`}
                  >
                    {addingVideoId === result.videoId ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Plus size={16} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          ) : submittedQuery ? (
            <div className="p-4 text-center text-xs text-muted select-none">
              Không tìm thấy kết quả cho “{submittedQuery}”.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
