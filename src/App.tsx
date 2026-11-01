import { useState } from 'react';
import { SocketProvider } from './context/SocketContext';
import { Navigation, type ActiveTab } from './components/Navigation';
import { DiscordModule } from './modules/discord/DiscordModule';
import { AsepriteModule } from './modules/aseprite/AsepriteModule';
import { WhiteboardModule } from './modules/whiteboard/WhiteboardModule';
import { BackupsModule } from './modules/backups/BackupsModule';
import { AuthModal } from './modules/auth/AuthModal';

function MainLayout() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('discord');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="flex w-screen h-screen overflow-hidden bg-[#0f1117] text-white">
      {/* Discord style left vertical dock */}
      <Navigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        openSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Active Module Screen */}
      <div className="flex-1 h-full overflow-hidden relative">
        <div className={`w-full h-full ${activeTab === 'discord' ? 'block' : 'hidden'}`}>
          <DiscordModule />
        </div>
        <div className={`w-full h-full ${activeTab === 'aseprite' ? 'block' : 'hidden'}`}>
          <AsepriteModule />
        </div>
        <div className={`w-full h-full ${activeTab === 'whiteboard' ? 'block' : 'hidden'}`}>
          <WhiteboardModule />
        </div>
        <div className={`w-full h-full ${activeTab === 'backups' ? 'block' : 'hidden'}`}>
          <BackupsModule />
        </div>
      </div>

      {/* Settings / Profile Modal */}
      <AuthModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <SocketProvider>
      <MainLayout />
    </SocketProvider>
  );
}
