const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'RoomClient.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Add NextUI imports safely
if (!content.includes('@nextui-org/react')) {
  content = content.replace(
    "import { getRealtimeChannel, supabase, isSupabaseConfigured } from '@/lib/supabase';",
    `import { getRealtimeChannel, supabase, isSupabaseConfigured } from '@/lib/supabase';\nimport { Card, Button, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Chip, Avatar } from "@nextui-org/react";`
  );
}

const startIndex = content.indexOf('  return (\n    <div');
if (startIndex === -1) {
  console.error("Could not find start of return block");
  process.exit(1);
}

const beforeReturn = content.substring(0, startIndex);

const newReturn = `  return (
    <div className="h-dvh max-h-dvh w-full mx-auto p-4 flex flex-col gap-4 overflow-hidden max-w-[1600px]">
      {/* HEADER */}
      <Card className="flex flex-col sm:flex-row items-center justify-between p-4 gap-4 shrink-0 flex-wrap overflow-visible z-50 bg-content1/50 border-none shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-secondary/20 flex items-center justify-center text-secondary shadow-md">
            <Disc size={24} className="animate-spin-slow text-secondary" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight flex items-center gap-3">
              {roomName}
              <Chip size="sm" color="primary" variant="flat" className="font-mono uppercase tracking-widest">
                ID: {roomId}
              </Chip>
            </h1>
          </div>
        </div>

        {/* Search Bar in Header */}
        <div className="flex-1 w-full sm:w-auto max-w-2xl mt-2 sm:mt-0 order-last sm:order-none">
          <SearchUI onAddVideo={handleAddVideo} />
        </div>

        {/* TOOLBAR BUTTONS - DESKTOP */}
        <div className="hidden md:flex items-center gap-3">
          <Dropdown>
            <DropdownTrigger>
              <Button size="sm" variant="flat" color="secondary" startContent={<Palette size={16} />}>
                Chủ đề
              </Button>
            </DropdownTrigger>
            <DropdownMenu aria-label="Theme Selection" onAction={(key) => handleSelectTheme(key as string)}>
              <DropdownItem key="dark" description="Sắc tím huyền ảo">Tối Neon</DropdownItem>
              <DropdownItem key="light" description="Ấm áp & dịu mắt">Kem Sáng</DropdownItem>
              <DropdownItem key="cyberpunk" description="Neon cá tính">Cyberpunk</DropdownItem>
              <DropdownItem key="forest" description="Xanh thanh mát">Mint Rừng</DropdownItem>
              <DropdownItem key="ocean" description="Biển sâu cuốn hút">Đại Dương</DropdownItem>
            </DropdownMenu>
          </Dropdown>

          <Button isIconOnly size="sm" variant="flat" onClick={handleManualSync} title="Đồng bộ lại">
            <RefreshCw size={16} />
          </Button>
          
          <Button isIconOnly size="sm" variant="flat" onClick={() => setIsTheaterMode(!isTheaterMode)} title="Chế độ rạp hát">
            <MonitorPlay size={16} />
          </Button>

          <Button isIconOnly size="sm" variant="flat" color={isVideoHidden ? "danger" : "default"} onClick={() => setIsVideoHidden(!isVideoHidden)} title={isVideoHidden ? "Hiện video" : "Ẩn video"}>
            {isVideoHidden ? <VideoOff size={16} /> : <Video size={16} />}
          </Button>

          <Button isIconOnly size="sm" variant="flat" onClick={handleStartTour} title="Hướng dẫn sử dụng">
            <HelpCircle size={16} />
          </Button>

          <Button size="sm" variant="flat" color="primary" onClick={handleCopyLink} startContent={<Share2 size={16} />}>
            Mời Bạn Bè
          </Button>
          
          <Button size="sm" variant="flat" color="danger" onClick={handleLeaveRoom} startContent={<LogOut size={16} />}>
            Rời Phòng
          </Button>
        </div>

        {/* MOBILE OVERFLOW MENU */}
        <div className="flex md:hidden items-center gap-2">
          <Dropdown>
            <DropdownTrigger>
              <Button isIconOnly size="sm" variant="flat" color="secondary">
                <Palette size={16} />
              </Button>
            </DropdownTrigger>
            <DropdownMenu aria-label="Theme Selection" onAction={(key) => handleSelectTheme(key as string)}>
              {THEMES.map(t => <DropdownItem key={t}>{t.toUpperCase()}</DropdownItem>)}
            </DropdownMenu>
          </Dropdown>

          <Dropdown>
            <DropdownTrigger>
              <Button isIconOnly size="sm" variant="flat">
                <MoreVertical size={16} />
              </Button>
            </DropdownTrigger>
            <DropdownMenu aria-label="More Options" onAction={(key) => {
              switch(key) {
                case "sync": handleManualSync(); break;
                case "theater": setIsTheaterMode(!isTheaterMode); break;
                case "video": setIsVideoHidden(!isVideoHidden); break;
                case "help": handleStartTour(); break;
                case "invite": handleCopyLink(); break;
                case "leave": handleLeaveRoom(); break;
              }
            }}>
              <DropdownItem key="sync" startContent={<RefreshCw size={16} />}>Đồng bộ nhạc</DropdownItem>
              <DropdownItem key="theater" startContent={<MonitorPlay size={16} />}>Chế độ rạp hát</DropdownItem>
              <DropdownItem key="video" startContent={isVideoHidden ? <Video size={16} /> : <VideoOff size={16} />}>{isVideoHidden ? 'Hiện video' : 'Ẩn video'}</DropdownItem>
              <DropdownItem key="help" startContent={<HelpCircle size={16} />}>Hướng dẫn sử dụng</DropdownItem>
              <DropdownItem key="invite" startContent={<Share2 size={16} />}>Sao chép link mời</DropdownItem>
              <DropdownItem key="leave" className="text-danger" color="danger" startContent={<LogOut size={16} />}>Rời phòng</DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </div>
      </Card>

      {/* WORKSPACE - 3 COLUMNS */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-y-auto lg:overflow-hidden">
        {/* LEFT COLUMN: Active Users */}
        <aside className={\`lg:col-span-3 min-h-0 flex flex-col gap-4 overflow-hidden order-3 lg:order-1 \${isTheaterMode ? 'lg:hidden' : ''}\`}>
          <Card className="p-4 flex-1 min-h-0 flex flex-col overflow-hidden bg-content1/50 border-none shadow-lg">
            <UsersList users={displayUsers} myClientId={clientIdRef.current || ""} />
          </Card>
        </aside>

        {/* MIDDLE COLUMN: Video Player & QueueList */}
        <main className={\`\${isTheaterMode ? 'lg:col-span-9' : 'lg:col-span-6'} min-h-0 flex flex-col gap-4 overflow-hidden transition-all duration-300 order-1 lg:order-2\`}>
          <Card className="p-4 shrink-0 overflow-hidden relative bg-content1/50 border-none shadow-lg">
            <div 
              className="shrink-0 overflow-hidden relative rounded-xl"
              style={{ height: isTheaterMode ? 'clamp(300px, 60vh, 600px)' : 'clamp(200px, 42vh, 480px)', transition: 'height 0.3s' }}
            >
              <YoutubePlayer
                roomId={roomId}
                videoId={currentVideo?.videoId || ""}
                isPlaying={isPlaying}
                seekTime={seekTime}
                reactions={reactions}
                viewMode={isVideoHidden ? 'audio' : 'video'}
                isWaitingForOthers={users.find(u => u.clientId === clientIdRef.current)?.videoFinished || false}
                waitingCount={users.filter(u => !u.videoFinished).length}
                onPlayerStateChange={handlePlayerStateChange}
                onTimeUpdate={handleTimeUpdate}
                onVideoEnded={handleVideoEnded}
                onVideoTitleLoaded={handleVideoTitleLoaded}
              />
            </div>
          </Card>

          <Card className="p-4 flex-1 min-h-0 flex flex-col overflow-hidden bg-content1/50 border-none shadow-lg">
            <QueueList
              queue={queue}
              currentItemId={currentVideo ? currentVideo.id : null}
              isPlaying={isPlaying}
              username={username}
              isHost={!!isCurrentHost}
              onRemoveItem={handleRemoveItem}
              onPlayItem={handlePlayItem}
              onMoveNext={handleMoveNext}
            />
          </Card>
        </main>

        {/* RIGHT COLUMN: Chat Box & Commands */}
        <aside className="lg:col-span-3 min-h-0 flex flex-col gap-4 overflow-hidden order-2 lg:order-3">
          <Card className="p-4 flex-1 min-h-0 flex flex-col overflow-hidden bg-content1/50 border-none shadow-lg">
            <ChatBox
              messages={messages}
              username={username}
              users={users}
              onSendMessage={handleSendMessage}
              onCommand={handleCommand}
              onSendReaction={sendReaction}
            />
          </Card>
        </aside>
      </div>
    </div>
  );
}
`;

fs.writeFileSync(filePath, beforeReturn + newReturn);
console.log('Successfully updated RoomClient.tsx with NextUI components');
