import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { UserProfile, ChatMessage, WhiteboardElement, GameBackup } from '../types';
import { getSupabaseClient, updateSupabaseCredentials, isSupabaseConfigured } from '../services/supabase';

interface SocketContextType {
  socket: Socket | null;
  currentUser: UserProfile;
  setCurrentUser: (user: UserProfile) => void;
  onlineUsers: UserProfile[];
  serverConnected: boolean;
  serverUrl: string;
  setServerUrl: (url: string) => void;
  messages: ChatMessage[];
  sendMessage: (content: string, channelId: string, fileUrl?: string) => void;
  whiteboardElements: WhiteboardElement[];
  sendWhiteboardAction: (action: { type: 'add' | 'clear'; element?: WhiteboardElement }) => void;
  sendCursorMove: (x: number, y: number) => void;
  remoteCursors: Map<string, { username: string; x: number; y: number; color: string }>;
  backups: GameBackup[];
  addBackup: (backup: Partial<GameBackup>) => void;
  supabaseConnected: boolean;
  saveSupabaseConfig: (url: string, key: string) => Promise<boolean>;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

const DEFAULT_SERVER_URL = 'https://lpp2-server.onrender.com';

const SocketContext = createContext<SocketContextType | null>(null);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [serverUrl, setServerUrlState] = useState<string>(() => {
    return localStorage.getItem('lpp2_server_url') || DEFAULT_SERVER_URL;
  });

  const [supabaseUrl, setSupabaseUrl] = useState<string>(() => {
    return localStorage.getItem('lpp2_supabase_url') || '';
  });

  const [supabaseAnonKey, setSupabaseAnonKey] = useState<string>(() => {
    return localStorage.getItem('lpp2_supabase_anon_key') || '';
  });

  const [supabaseConnected, setSupabaseConnected] = useState(false);

  const [currentUser, setCurrentUserState] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('lpp2_user_profile');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return {
      id: `usr-${Math.random().toString(36).substr(2, 6)}`,
      username: 'Dev Sócio ' + Math.floor(Math.random() * 100),
      avatar: '🎮',
      status: 'online',
      role: 'Programador',
      isMuted: false,
      isDeafened: false,
      isScreenSharing: false
    };
  });

  const setCurrentUser = (user: UserProfile) => {
    setCurrentUserState(user);
    localStorage.setItem('lpp2_user_profile', JSON.stringify(user));
    if (socket && socket.connected) {
      socket.emit('register-user', user);
    }
  };

  const setServerUrl = (url: string) => {
    setServerUrlState(url);
    localStorage.setItem('lpp2_server_url', url);
  };

  const [socket, setSocket] = useState<Socket | null>(null);
  const [serverConnected, setServerConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<UserProfile[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [whiteboardElements, setWhiteboardElements] = useState<WhiteboardElement[]>([]);
  const [remoteCursors, setRemoteCursors] = useState<Map<string, { username: string; x: number; y: number; color: string }>>(new Map());
  const [backups, setBackups] = useState<GameBackup[]>([]);

  // 1. Supabase Initialization and Data Sync
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setSupabaseConnected(false);
      return;
    }

    // Verify connection by querying messages
    const initSupabaseData = async () => {
      try {
        const { data: dbMessages, error: msgErr } = await supabase
          .from('messages')
          .select('*')
          .order('created_at', { ascending: true });

        if (!msgErr && dbMessages) {
          setSupabaseConnected(true);
          setMessages(
            dbMessages.map((m: any) => ({
              id: m.id,
              channelId: m.channel_id,
              userId: m.user_id,
              username: m.username,
              avatar: m.avatar,
              content: m.content,
              fileUrl: m.file_url,
              timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }))
          );
        }

        const { data: dbWhiteboard } = await supabase
          .from('whiteboard_elements')
          .select('*');

        if (dbWhiteboard) {
          setWhiteboardElements(dbWhiteboard.map((w: any) => w.element_data));
        }

        const { data: dbBackups } = await supabase
          .from('game_backups')
          .select('*')
          .order('created_at', { ascending: false });

        if (dbBackups) {
          setBackups(
            dbBackups.map((b: any) => ({
              id: b.id,
              version: b.version,
              title: b.title,
              notes: b.notes,
              author: b.author,
              fileName: b.file_name,
              size: b.file_size,
              date: new Date(b.created_at).toLocaleDateString(),
              fileData: b.file_url
            }))
          );
        }

        // Setup Realtime subscriptions
        const channel = supabase
          .channel('lpp2-realtime')
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages' },
            (payload) => {
              const m = payload.new as any;
              setMessages((prev) => [
                ...prev,
                {
                  id: m.id,
                  channelId: m.channel_id,
                  userId: m.user_id,
                  username: m.username,
                  avatar: m.avatar,
                  content: m.content,
                  fileUrl: m.file_url,
                  timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                }
              ]);
            }
          )
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'whiteboard_elements' },
            (payload) => {
              const w = payload.new as any;
              setWhiteboardElements((prev) => [...prev, w.element_data]);
            }
          )
          .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'whiteboard_elements' },
            () => {
              setWhiteboardElements([]);
            }
          )
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'game_backups' },
            (payload) => {
              const b = payload.new as any;
              setBackups((prev) => [
                {
                  id: b.id,
                  version: b.version,
                  title: b.title,
                  notes: b.notes,
                  author: b.author,
                  fileName: b.file_name,
                  size: b.file_size,
                  date: new Date(b.created_at).toLocaleDateString(),
                  fileData: b.file_url
                },
                ...prev
              ]);
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      } catch (err) {
        console.warn('Supabase initialization error:', err);
        setSupabaseConnected(false);
      }
    };

    initSupabaseData();
  }, [supabaseUrl, supabaseAnonKey]);

  // 2. Local / Server Socket.io Setup
  useEffect(() => {
    const newSocket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000
    });

    setSocket(newSocket);

    newSocket.on('connect', () => {
      setServerConnected(true);
      newSocket.emit('register-user', currentUser);
    });

    newSocket.on('disconnect', () => {
      setServerConnected(false);
    });

    newSocket.on('online-users', (users: UserProfile[]) => {
      setOnlineUsers(users);
    });

    // Fallback Socket Chat if Supabase isn't active
    newSocket.on('chat-history', (history: ChatMessage[]) => {
      if (!isSupabaseConfigured()) {
        setMessages(history);
      }
    });

    newSocket.on('new-message', (msg: ChatMessage) => {
      if (!isSupabaseConfigured()) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    newSocket.on('whiteboard-init', (elements: WhiteboardElement[]) => {
      if (!isSupabaseConfigured()) {
        setWhiteboardElements(elements);
      }
    });

    newSocket.on('whiteboard-action', (action: { type: 'add' | 'clear'; element?: WhiteboardElement }) => {
      if (action.type === 'add' && action.element) {
        setWhiteboardElements((prev) => [...prev, action.element!]);
      } else if (action.type === 'clear') {
        setWhiteboardElements([]);
      }
    });

    newSocket.on('whiteboard-cursor', (data: { socketId: string; username: string; x: number; y: number; color: string }) => {
      setRemoteCursors((prev) => {
        const next = new Map(prev);
        next.set(data.socketId, { username: data.username, x: data.x, y: data.y, color: data.color });
        return next;
      });
    });

    newSocket.on('cursor-remove', (data: { socketId: string }) => {
      setRemoteCursors((prev) => {
        const next = new Map(prev);
        next.delete(data.socketId);
        return next;
      });
    });

    newSocket.on('backups-list', (list: GameBackup[]) => {
      if (!isSupabaseConfigured()) {
        setBackups(list);
      }
    });

    return () => {
      newSocket.close();
    };
  }, [serverUrl]);

  // Actions
  const sendMessage = async (content: string, channelId: string, fileUrl?: string) => {
    if (!content.trim() && !fileUrl) return;

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.from('messages').insert({
          channel_id: channelId || 'geral',
          user_id: currentUser.id,
          username: currentUser.username,
          avatar: currentUser.avatar || '🎮',
          content,
          file_url: fileUrl
        });
      } catch (err) {
        console.error('Error inserting message into Supabase:', err);
      }
    }

    if (socket && socket.connected) {
      socket.emit('send-message', {
        channelId,
        userId: currentUser.id,
        username: currentUser.username,
        avatar: currentUser.avatar,
        content,
        fileUrl
      });
    }
  };

  const sendWhiteboardAction = async (action: { type: 'add' | 'clear'; element?: WhiteboardElement }) => {
    const supabase = getSupabaseClient();
    if (supabase) {
      if (action.type === 'add' && action.element) {
        await supabase.from('whiteboard_elements').insert({
          id: action.element.id,
          element_data: action.element
        });
      } else if (action.type === 'clear') {
        await supabase.from('whiteboard_elements').delete().neq('id', 'placeholder');
      }
    }

    if (action.type === 'add' && action.element) {
      setWhiteboardElements((prev) => [...prev, action.element!]);
    } else if (action.type === 'clear') {
      setWhiteboardElements([]);
    }

    if (socket && socket.connected) {
      socket.emit('whiteboard-action', action);
    }
  };

  const sendCursorMove = (x: number, y: number) => {
    if (!socket || !socket.connected) return;
    socket.emit('whiteboard-cursor', {
      userId: currentUser.id,
      username: currentUser.username,
      x,
      y,
      color: '#38bdf8'
    });
  };

  const addBackup = async (backup: Partial<GameBackup>) => {
    const supabase = getSupabaseClient();
    const backupId = `b-${Date.now()}`;

    if (supabase) {
      try {
        await supabase.from('game_backups').insert({
          id: backupId,
          version: backup.version || 'v1.0.0',
          title: backup.title || 'Nova Versão',
          notes: backup.notes || '',
          author: currentUser.username,
          file_name: backup.fileName || 'backup.zip',
          file_size: backup.size || '10 MB',
          file_url: backup.fileData || ''
        });
      } catch (err) {
        console.error('Error inserting backup into Supabase:', err);
      }
    }

    if (socket && socket.connected) {
      socket.emit('add-backup', {
        ...backup,
        id: backupId,
        author: currentUser.username
      });
    }
  };

  const saveSupabaseConfig = async (url: string, key: string): Promise<boolean> => {
    try {
      updateSupabaseCredentials(url.trim(), key.trim());
      setSupabaseUrl(url.trim());
      setSupabaseAnonKey(key.trim());

      const client = getSupabaseClient();
      if (!client) return false;

      const { error } = await client.from('messages').select('id').limit(1);
      const isOk = !error;
      setSupabaseConnected(isOk);
      return isOk;
    } catch (e) {
      setSupabaseConnected(false);
      return false;
    }
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        currentUser,
        setCurrentUser,
        onlineUsers,
        serverConnected,
        serverUrl,
        setServerUrl,
        messages,
        sendMessage,
        whiteboardElements,
        sendWhiteboardAction,
        sendCursorMove,
        remoteCursors,
        backups,
        addBackup,
        supabaseConnected,
        saveSupabaseConfig,
        supabaseUrl,
        supabaseAnonKey
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
