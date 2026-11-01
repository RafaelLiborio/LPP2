export interface UserProfile {
  id: string;
  username: string;
  avatar: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  role: 'Diretor' | 'Programador' | 'Artista 2D' | 'Game Designer' | 'Músico';
  isMuted?: boolean;
  isDeafened?: boolean;
  isScreenSharing?: boolean;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  userId: string;
  username: string;
  avatar: string;
  content: string;
  fileUrl?: string;
  timestamp: string;
}

export interface VoicePeer {
  peerId: string;
  user: UserProfile;
  stream?: MediaStream;
}

export interface PixelLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  data: string[];
}

export interface WhiteboardElement {
  id: string;
  type: 'pencil' | 'rectangle' | 'circle' | 'sticky' | 'arrow' | 'text';
  x: number;
  y: number;
  width?: number;
  height?: number;
  points?: { x: number; y: number }[];
  color: string;
  fillColor?: string;
  text?: string;
  strokeWidth: number;
  author: string;
}

export interface GameBackup {
  id: string;
  version: string;
  title: string;
  notes: string;
  author: string;
  date: string;
  size: string;
  fileName: string;
  fileData?: string;
}

export interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
}

declare global {
  interface Window {
    electronAPI?: {
      getScreenSources: () => Promise<ScreenSource[]>;
      openFileDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
      isElectron?: boolean;
    };
  }
}
