const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'app', 'page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Replace imports
content = content.replace(
  "import { Play, Users, ArrowRight, Headphones, Lock, Unlock, Plus, X, Search, User } from 'lucide-react';",
  `import { Play, Users, ArrowRight, Headphones, Lock, Unlock, Plus, Search, User } from 'lucide-react';
import { 
  Button, 
  Card, 
  CardBody, 
  CardHeader,
  CardFooter,
  Input, 
  Modal, 
  ModalContent, 
  ModalHeader, 
  ModalBody, 
  ModalFooter,
  Switch,
  useDisclosure,
  Badge,
  Avatar,
  ScrollShadow
} from "@nextui-org/react";`
);

// 2. Add useDisclosure
content = content.replace(
  "const [isPrivateRoom, setIsPrivateRoom] = useState(false);",
  `const [isPrivateRoom, setIsPrivateRoom] = useState(false);
  const createModal = useDisclosure();
  const joinModal = useDisclosure();`
);

// 3. Update the handle methods to use useDisclosure's onClose, we'll just leave them as they are and use onClose in the JSX.

// 4. Replace the return statement
const returnIndex = content.indexOf('  return (\n    <main');
if (returnIndex === -1) {
  console.error("Could not find return statement");
  process.exit(1);
}

const beforeReturn = content.substring(0, returnIndex);

const newReturn = `  return (
    <main className="h-screen w-full bg-background flex flex-col items-center overflow-hidden">
      <div className="flex flex-col h-full w-full max-w-7xl mx-auto p-4 md:p-8 relative z-10 gap-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
          <div className="flex items-center gap-4">
            <Badge color="secondary" content={activeRooms.length} shape="circle" placement="top-right">
              <div className="w-12 h-12 rounded-xl bg-secondary/20 flex items-center justify-center text-secondary">
                <Headphones size={24} />
              </div>
            </Badge>
            <div>
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                YouTube <span className="text-secondary">Together</span>
              </h1>
              <div className="flex items-center gap-4 text-sm text-default-500 mt-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-success"></span>
                  {activeRooms.length} phòng đang mở
                </span>
                <span className="flex items-center gap-1.5">
                  <Users size={14} className="text-primary" />
                  {totalUsers} người online
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 bg-default-100 px-4 py-2 rounded-full border border-default-200">
            <Avatar size="sm" icon={<User size={16} />} color="secondary" isBordered />
            <input 
              type="text" 
              placeholder="Nhập tên hiển thị..." 
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="bg-transparent border-none outline-none text-sm w-32 md:w-40"
              maxLength={20}
            />
          </div>
        </div>

        {/* Danh sách phòng */}
        <Card className="flex-1 w-full bg-content1/50 border-none shadow-lg">
          <CardHeader className="flex flex-col sm:flex-row justify-between items-center gap-4 px-6 pt-6 pb-2">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
              </span>
              Danh Sách Phòng
            </h2>
            
            <div className="flex w-full sm:w-auto items-center gap-3">
              <Input
                classNames={{
                  base: "w-full sm:w-64",
                  mainWrapper: "h-10",
                  input: "text-small",
                  inputWrapper: "h-10 font-normal text-default-500 bg-default-400/20 dark:bg-default-500/20",
                }}
                placeholder="Tìm phòng bằng tên hoặc ID..."
                size="sm"
                startContent={<Search size={18} />}
                type="search"
                value={searchQuery}
                onValueChange={setSearchQuery}
              />
              <Button 
                color="secondary" 
                startContent={<Plus size={18} />}
                onPress={() => {
                  if(!username.trim()) { showToast('Nhập tên bạn trước nhé!'); return; }
                  createModal.onOpen();
                  setIsPrivateRoom(false);
                  setNewRoomPass('');
                  setNewRoomName('');
                }}
              >
                Tạo Phòng
              </Button>
            </div>
          </CardHeader>
          
          <CardBody className="p-6">
            <ScrollShadow className="h-full pr-2">
              {filteredRooms.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-default-400 gap-4 min-h-[260px]">
                  <Headphones size={64} className="opacity-20 animate-pulse" />
                  <div className="text-center">
                    <p className="font-semibold text-foreground">Không tìm thấy phòng nào</p>
                    <p className="text-sm mt-1">Hãy thử tìm từ khóa khác hoặc tạo phòng mới.</p>
                  </div>
                  <Button 
                    color="secondary" 
                    variant="flat"
                    onPress={() => username.trim() ? createModal.onOpen() : showToast('Nhập tên trước!')} 
                  >
                    Tạo Phòng Đầu Tiên!
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredRooms.map(room => (
                    <Card 
                      key={room.roomId} 
                      isPressable 
                      onPress={() => handleRoomClick(room)}
                      className="bg-content2 hover:bg-content3 transition-colors border-none"
                    >
                      <CardBody className="p-4 flex flex-col gap-3">
                        <div className="flex justify-between items-start">
                          <h3 className="font-bold text-lg truncate pr-4">{room.roomName}</h3>
                          {room.hasPassword ? <Lock size={16} className="text-danger" /> : <Unlock size={16} className="text-default-400" />}
                        </div>
                        <div className="text-sm text-default-500">
                          Host: <span className="text-default-700 font-medium">{room.hostName || 'Ẩn danh'}</span>
                        </div>
                      </CardBody>
                      <CardFooter className="flex justify-between items-center bg-content1/50 px-4 py-2 border-t border-default-100">
                        <div className="flex items-center gap-1.5 text-default-500 text-sm">
                          <Users size={14} className="text-primary" />
                          <span>{room.userCount || 1} người</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-default-400 bg-default-100 px-2 py-1 rounded">
                            ID: {room.roomId}
                          </span>
                          <ArrowRight size={16} className="text-secondary" />
                        </div>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollShadow>
          </CardBody>
        </Card>
      </div>

      {/* Modal Tạo Phòng */}
      <Modal isOpen={createModal.isOpen} onOpenChange={createModal.onOpenChange} backdrop="blur">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">Tạo Phòng Nhạc</ModalHeader>
              <ModalBody>
                <form id="create-room-form" onSubmit={(e) => { handleCreateRoom(e); onClose(); }} className="flex flex-col gap-4">
                  <Input 
                    autoFocus
                    label="Tên phòng"
                    placeholder={\`Phòng của \${username}\`}
                    value={newRoomName}
                    onValueChange={setNewRoomName}
                    variant="bordered"
                  />
                  <Switch 
                    isSelected={isPrivateRoom} 
                    onValueChange={setIsPrivateRoom}
                    color="secondary"
                  >
                    Phòng riêng tư (Có mật khẩu)
                  </Switch>
                  
                  {isPrivateRoom && (
                    <Input 
                      type="password"
                      label="Mật khẩu"
                      placeholder="Nhập mật khẩu..."
                      value={newRoomPass}
                      onValueChange={setNewRoomPass}
                      variant="bordered"
                      startContent={<Lock size={16} className="text-default-400" />}
                      isRequired
                    />
                  )}
                </form>
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose}>Hủy</Button>
                <Button color="secondary" type="submit" form="create-room-form">Tạo & Vào Phòng</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Modal Nhập Mật Khẩu */}
      <Modal isOpen={joinModal.isOpen} onOpenChange={joinModal.onOpenChange} backdrop="blur">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1 text-center">Tham Gia Phòng</ModalHeader>
              <ModalBody>
                <div className="flex flex-col items-center gap-2 mb-4">
                  <Avatar icon={<Lock size={24} />} color="danger" className="w-16 h-16" />
                  <h3 className="font-bold text-xl">{selectedRoom?.roomName}</h3>
                  <p className="text-sm text-default-500">Phòng này yêu cầu mật khẩu để tham gia</p>
                </div>
                <form id="join-room-form" onSubmit={(e) => { handleJoinWithPass(e); }} className="flex flex-col gap-4">
                  <Input 
                    autoFocus
                    type="password"
                    placeholder="Nhập mật khẩu..."
                    value={joinPass}
                    onValueChange={setJoinPass}
                    isInvalid={!!joinError}
                    errorMessage={joinError}
                    variant="bordered"
                  />
                </form>
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={onClose}>Hủy</Button>
                <Button color="danger" type="submit" form="join-room-form">Mở Khóa</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </main>
  );
}
`;

fs.writeFileSync(filePath, beforeReturn + newReturn);
console.log('Successfully updated page.tsx with NextUI components');
