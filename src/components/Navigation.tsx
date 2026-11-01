import React from 'react';
import { MessageSquare, Palette, Layout, Package, Settings, Circle } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export type ActiveTab = 'discord' | 'aseprite' | 'whiteboard' | 'backups';

interface NavigationProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  openSettings: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  setActiveTab,
  openSettings
}) => {
  const { currentUser, serverConnected } = useSocket();

  const NAV_ITEMS = [
    { id: 'discord', icon: MessageSquare, label: 'Chat & Voz (Discord)' },
    { id: 'aseprite', icon: Palette, label: 'Pixel Art (Aseprite)' },
    { id: 'whiteboard', icon: Layout, label: 'Quadro Compartilhado (Figma)' },
    { id: 'backups', icon: Package, label: 'Backups & Builds' }
  ];

  return (
    <div className="w-[72px] bg-[#101118] border-r border-gray-900 flex flex-col items-center py-3 justify-between shrink-0 select-none z-30">
      {/* Top: App Logo & Hub button */}
      <div className="flex flex-col items-center gap-3 w-full">
        <button
          onClick={() => setActiveTab('discord')}
          title="LPP2 Studio - Organizer Software"
          className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-950/80 to-slate-900/90 border border-indigo-500/50 flex items-center justify-center shadow-lg shadow-indigo-600/30 hover:scale-110 hover:shadow-indigo-500/50 transition-all overflow-hidden group"
        >
          <img
            src="./logo.png"
            alt="LPP2 Studio"
            className="w-[150%] h-[150%] object-cover object-[center_38%] group-hover:scale-105 transition-transform"
            style={{ imageRendering: 'pixelated' }}
            onError={(e) => {
              // fallback if path differs
              (e.target as HTMLImageElement).src = '/logo.png';
            }}
          />
        </button>

        <div className="w-8 h-[2px] bg-gray-800 rounded-full" />

        {/* Navigation Tabs */}
        <div className="flex flex-col items-center gap-2 w-full">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <div key={item.id} className="relative group flex items-center justify-center w-full">
                {/* Active Pill Indicator */}
                {isActive && (
                  <span className="absolute left-0 w-1 h-8 bg-white rounded-r-full transition-all" />
                )}

                <button
                  onClick={() => setActiveTab(item.id as ActiveTab)}
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-600/40'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800 hover:rounded-xl'
                  }`}
                >
                  <Icon size={22} />
                </button>

                {/* Tooltip */}
                <div className="absolute left-16 px-2.5 py-1 bg-gray-900 border border-gray-700 text-white text-xs font-semibold rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50 whitespace-nowrap">
                  {item.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom: User Avatar & Settings */}
      <div className="flex flex-col items-center gap-2.5 w-full">
        {/* Server connection dot */}
        <div
          title={serverConnected ? 'Servidor Conectado' : 'Servidor Desconectado'}
          className="flex items-center gap-1 cursor-pointer"
          onClick={openSettings}
        >
          <Circle
            size={8}
            className={`${
              serverConnected ? 'fill-emerald-500 text-emerald-500 animate-pulse' : 'fill-rose-500 text-rose-500'
            }`}
          />
        </div>

        {/* Settings button */}
        <button
          onClick={openSettings}
          title="Configurações e Perfil"
          className="w-12 h-12 rounded-2xl flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 hover:rounded-xl transition-all relative"
        >
          <Settings size={20} />
        </button>

        {/* User Avatar */}
        <button
          onClick={openSettings}
          title={`${currentUser.username} (${currentUser.role})`}
          className="w-10 h-10 rounded-full bg-gray-800 border-2 border-indigo-500/50 flex items-center justify-center text-lg hover:scale-105 transition"
        >
          {currentUser.avatar}
        </button>
      </div>
    </div>
  );
};
