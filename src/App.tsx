import { useState, useEffect } from 'react';
import { SocketProvider } from './context/SocketContext';
import { Navigation, type ActiveTab } from './components/Navigation';
import { DiscordModule } from './modules/discord/DiscordModule';
import { AsepriteModule } from './modules/aseprite/AsepriteModule';
import { WhiteboardModule } from './modules/whiteboard/WhiteboardModule';
import { BackupsModule } from './modules/backups/BackupsModule';
import { AuthModal } from './modules/auth/AuthModal';
import { UpdateModal } from './components/UpdateModal';
import type { UpdateInfo, UpdateStatusPayload } from './types';
import { Sparkles, X, ArrowRight } from 'lucide-react';

function MainLayout() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('discord');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<UpdateInfo | null>(null);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);

  // Auto-listen to update status events
  useEffect(() => {
    if (window.electronAPI?.onUpdateStatus) {
      const cleanup = window.electronAPI.onUpdateStatus((payload: UpdateStatusPayload) => {
        if (payload.type === 'available' && payload.info) {
          setAvailableUpdate(payload.info);
          setShowUpdateBanner(true);
        }
      });
      return () => cleanup?.();
    }
  }, []);

  return (
    <div className="flex w-screen h-screen overflow-hidden bg-[#0f1117] text-white flex-col">
      {/* Top Banner when a new version is detected */}
      {showUpdateBanner && availableUpdate && (
        <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 px-4 py-2 flex items-center justify-between z-40 text-xs shadow-md animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2 font-medium text-white">
            <Sparkles size={15} className="animate-spin text-yellow-300" />
            <span>
              <strong>Nova versão v{availableUpdate.version} disponível!</strong> Seus sócios e você podem atualizar com 1 clique.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowUpdateBanner(false);
                setIsUpdateModalOpen(true);
              }}
              className="px-3 py-1 bg-white text-indigo-900 rounded-lg font-bold hover:bg-gray-100 transition shadow-sm flex items-center gap-1"
            >
              Atualizar Agora <ArrowRight size={13} />
            </button>
            <button
              onClick={() => setShowUpdateBanner(false)}
              className="p-1 text-white/80 hover:text-white transition"
              title="Dispensar aviso"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Discord style left vertical dock */}
        <Navigation
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          openSettings={() => setIsSettingsOpen(true)}
          openUpdates={() => setIsUpdateModalOpen(true)}
          hasUpdate={!!availableUpdate}
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
      </div>

      {/* Settings / Profile Modal */}
      <AuthModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onOpenUpdates={() => setIsUpdateModalOpen(true)}
      />

      {/* Auto-Update Modal */}
      <UpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
        initialInfo={availableUpdate}
        onUpdateAvailable={(info) => {
          setAvailableUpdate(info);
          setShowUpdateBanner(true);
        }}
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
