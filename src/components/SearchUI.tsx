'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, Plus, Loader2 } from 'lucide-react';

interface SearchUIProps {
  onAddVideo: (videoId: string, title: string, thumbnail: string) => void;
}

export default function SearchUI({ onAddVideo }: SearchUIProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    setShowSearchDropdown(true);
    
    try {
      const res = await fetch(`/api/youtube-search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data.results) {
        setSearchResults(data.results);
      } else {
        setSearchResults([]);
      }
    } catch (err) {
      console.error(err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="relative w-full max-w-sm mx-auto flex-1 min-w-[200px]" ref={searchRef}>
      <form onSubmit={handleSearch} className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => {
            if (searchResults.length > 0) setShowSearchDropdown(true);
          }}
          placeholder="Tìm nhạc trên YouTube..."
          className="w-full glass-input text-sm focus:outline-none transition-all placeholder:text-muted"
          style={{ paddingTop: '6px', paddingBottom: '6px', paddingLeft: '32px', paddingRight: '12px' }}
        />
        <Search size={14} className="absolute text-muted" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
      </form>

      {showSearchDropdown && (
        <div className="absolute z-50 left-0 right-0 top-full mt-2 border rounded-xl shadow-2xl overflow-hidden max-h-[300px] overflow-y-auto custom-scrollbar" style={{ backgroundColor: 'var(--bg-primary)' }}>
          {isSearching ? (
            <div className="p-4 flex flex-col items-center justify-center text-muted gap-2">
              <Loader2 size={20} className="animate-spin text-purple-500" />
              <span className="text-xs">Đang tìm kiếm...</span>
            </div>
          ) : searchResults.length > 0 ? (
            <div className="flex flex-col py-1">
              {searchResults.map((res: any) => (
                <div key={res.videoId} className="flex items-center gap-3 p-2 hover:bg-white-5 group transition-colors">
                  <div className="relative w-16 aspect-video shrink-0 overflow-hidden rounded bg-black">
                    <img src={res.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
                    {res.duration && (
                      <span className="absolute bottom-1 right-1 bg-black-80 text-[9px] px-1 rounded text-white font-mono">
                        {res.duration}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col">
                    <span className="text-xs font-medium text-main truncate block w-full" title={res.title}>{res.title}</span>
                    <span className="text-[10px] text-muted truncate" title={res.channelTitle}>{res.channelTitle}</span>
                  </div>
                  <button
                    onClick={() => {
                      onAddVideo(res.videoId, res.title, res.thumbnail);
                      setShowSearchDropdown(false);
                      setSearchQuery('');
                    }}
                    className="p-2 shrink-0 rounded-full bg-white-5 hover:bg-purple-5-20 text-muted hover:text-purple-400 transition-colors"
                    title="Thêm vào hàng đợi"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : searchQuery ? (
            <div className="p-4 text-center text-xs text-muted">
              Không tìm thấy kết quả.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
