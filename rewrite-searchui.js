const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'SearchUI.tsx');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
  "import { Loader2, Plus, Search } from 'lucide-react';",
  `import { Loader2, Plus, Search } from 'lucide-react';\nimport { Input, Card, CardBody, Button, Spinner, Image } from "@nextui-org/react";`
);

const returnIndex = content.indexOf('  return (\n    <div');
if (returnIndex === -1) {
  console.error("Could not find return statement");
  process.exit(1);
}

const beforeReturn = content.substring(0, returnIndex);

const newReturn = `  return (
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
                      aria-label={\`Thêm \${result.title} vào hàng đợi\`}
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
`;

fs.writeFileSync(filePath, beforeReturn + newReturn);
console.log('Successfully updated SearchUI.tsx with NextUI components');
