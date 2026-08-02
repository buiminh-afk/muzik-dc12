'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';
import { Input, Card, CardBody, Button, Spinner, Image } from "@nextui-org/react";

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
      className="relative mx-auto min-w-[200px] w-full max-w-sm flex-1 z-50"
    >
      <form onSubmit={handleSearch} className="relative w-full">
        <Input
          type="text"
          value={searchQuery}
          onValueChange={setSearchQuery}
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
          variant="faded"
          radius="full"
          endContent={
            <Button
              isIconOnly
              size="sm"
              variant="light"
              type="submit"
              isDisabled={!searchQuery.trim() || isSearching}
              className="text-default-500"
            >
              {isSearching ? <Spinner size="sm" color="secondary" /> : <Search size={18} />}
            </Button>
          }
        />
      </form>

      {showSearchDropdown && (
        <Card
          className="absolute left-0 right-0 top-full mt-2 w-full max-h-[350px] z-50 shadow-2xl border border-default-200"
          radius="lg"
        >
          <CardBody className="p-0 custom-scrollbar overflow-y-auto">
            {isSearching ? (
              <div className="flex flex-col items-center justify-center gap-2 p-8 text-default-400">
                <Spinner color="secondary" />
                <span className="text-sm mt-2">Đang tìm kiếm...</span>
              </div>
            ) : searchError ? (
              <div className="p-6 text-center text-sm text-danger">
                {searchError}
              </div>
            ) : searchResults.length > 0 ? (
              <div className="flex flex-col">
                {searchResults.map((result) => (
                  <div
                    key={result.videoId}
                    className="flex items-center gap-3 p-3 transition-colors hover:bg-default-100 cursor-default border-b border-default-100 last:border-none"
                  >
                    <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-black">
                      <SearchThumbnail result={result} />
                      {result.duration && (
                        <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 font-mono text-[10px] text-white">
                          {result.duration}
                        </span>
                      )}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col justify-center">
                      <span className="block w-full truncate text-sm font-semibold text-foreground" title={result.title}>
                        {result.title}
                      </span>
                      <span className="truncate text-xs text-default-500 mt-0.5" title={result.channelTitle}>
                        {result.channelTitle}
                      </span>
                    </div>

                    <Button
                      isIconOnly
                      size="sm"
                      variant="flat"
                      color="secondary"
                      isDisabled={addingVideoId !== null}
                      onPress={() => void handleAddVideo(result)}
                      aria-label={`Thêm ${result.title} vào hàng đợi`}
                      className="shrink-0"
                    >
                      {addingVideoId === result.videoId ? (
                        <Spinner size="sm" color="current" />
                      ) : (
                        <Plus size={18} />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            ) : submittedQuery ? (
              <div className="p-6 text-center text-sm text-default-500">
                Không tìm thấy kết quả cho “{submittedQuery}”.
              </div>
            ) : null}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
