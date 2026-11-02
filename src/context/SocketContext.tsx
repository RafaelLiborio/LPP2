import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { UserProfile, ChatMessage, WhiteboardElement, GameBackup } from '../types';
import {
  getSupabaseClient,
  updateSupabaseCredentials,
  isSupabaseConfigured,
  uploadProjectFile,
  removeProjectFile
} from '../services/supabase';

interface SocketContextType {
  socket: Socket | null;
  currentUser: UserProfile;
  setCurrentUser: (user: UserProfile) => void;
  onlineUsers: UserProfile[];
  serverConnected: boolean;
  serverUrl: string;
  setServerUrl: (url: string) => boolean;
  messages: ChatMessage[];
  sendMessage: (content: string, channelId: string, attachment?: File | string) => Promise<boolean>;
  whiteboardElements: WhiteboardElement[];
  sendWhiteboardAction: (action: { type: 'add' | 'clear'; element?: WhiteboardElement } | { type: 'remove'; elementId: string }) => Promise<boolean>;
  sendCursorMove: (x: number, y: number) => void;
  remoteCursors: Map<string, { username: string; x: number; y: number; color: string }>;
  backups: GameBackup[];
  addBackup: (backup: Partial<GameBackup> & { file?: File }) => Promise<boolean>;
  supabaseConnected: boolean;
  saveSupabaseConfig: (url: string, key: string) => Promise<boolean>;
  isAuthenticated: boolean;
  isTeamMember: boolean | null;
  authEmail: string;
  signIn: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  signUp: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  signOut: () => Promise<void>;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

const DEFAULT_SERVER_URL = 'https://lpp2-server.onrender.com';

function isSecureSocketUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (
      url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

const SocketContext = createContext<SocketContextType | null>(null);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [serverUrl, setServerUrlState] = useState<string>(() => {
    const saved = localStorage.getItem('lpp2_server_url');
    return saved && isSecureSocketUrl(saved) ? saved : DEFAULT_SERVER_URL;
  });

  const [supabaseUrl, setSupabaseUrl] = useState<string>(() => {
    return localStorage.getItem('lpp2_supabase_url') || import.meta.env.VITE_SUPABASE_URL || '';
  });

  const [supabaseAnonKey, setSupabaseAnonKey] = useState<string>(() => {
    return localStorage.getItem('lpp2_supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  });

  const [supabaseConnected, setSupabaseConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isTeamMember, setIsTeamMember] = useState<boolean | null>(null);
  const [authEmail, setAuthEmail] = useState('');

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
    const normalized = url.trim().replace(/\/$/, '');
    if (!isSecureSocketUrl(normalized)) return false;
    setServerUrlState(normalized);
    localStorage.setItem('lpp2_server_url', normalized);
    return true;
  };

  const [socket, setSocket] = useState<Socket | null>(null);
  const [serverConnected, setServerConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<UserProfile[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [whiteboardElements, setWhiteboardElements] = useState<WhiteboardElement[]>([]);
  const [remoteCursors, setRemoteCursors] = useState<Map<string, { username: string; x: number; y: number; color: string }>>(new Map());
  const [backups, setBackups] = useState<GameBackup[]>([]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setIsAuthenticated(false);
      setIsTeamMember(false);
      setAuthEmail('');
      return;
    }
    let active = true;
    const applySession = (user: { id: string; email?: string } | null) => {
      if (!active) return;
      setIsAuthenticated(Boolean(user));
      setIsTeamMember(user ? null : false);
      setAuthEmail(user?.email || '');
      if (user) {
        setCurrentUserState((previous) => {
          const updated = { ...previous, id: user.id };
          localStorage.setItem('lpp2_user_profile', JSON.stringify(updated));
          return updated;
        });
      }
    };
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.warn('Falha ao restaurar sessão Supabase:', error.message);
      applySession(data.session?.user || null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session?.user || null);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabaseUrl, supabaseAnonKey]);

  // 1. Supabase Initialization and Data Sync
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !isAuthenticated) {
      setSupabaseConnected(false);
      return;
    }

    let active = true;
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    // Verify connection by querying messages
    const initSupabaseData = async () => {
      try {
        const { data: isMember, error: memberError } = await supabase.rpc('lpp2_is_allowed_member');
        if (memberError) throw memberError;
        if (!active) return;
        setIsTeamMember(Boolean(isMember));
        if (!isMember) {
          setSupabaseConnected(false);
          return;
        }

        const { data: dbMessages, error: msgErr } = await supabase
          .from('messages')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500);

        if (!msgErr && active) {
          setSupabaseConnected(true);
          setMessages(
            (dbMessages || []).reverse().map((m: any) => ({
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
          .select('*')
          .limit(5000);

        if (active && dbWhiteboard) {
          setWhiteboardElements(dbWhiteboard.map((w: any) => w.element_data));
        }

        const { data: dbBackups } = await supabase
          .from('game_backups')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);

        if (active && dbBackups) {
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
        if (!active) return;

        realtimeChannel = supabase
          .channel('lpp2-realtime')
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages' },
            (payload) => {
              const m = payload.new as any;
              const message = {
                  id: m.id,
                  channelId: m.channel_id,
                  userId: m.user_id,
                  username: m.username,
                  avatar: m.avatar,
                  content: m.content,
                  fileUrl: m.file_url,
                  timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                };
              setMessages((prev) => {
                if (prev.some((item) => item.id === message.id)) return prev;
                return [...prev, message].slice(-500);
              });
            }
          )
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'whiteboard_elements' },
            (payload) => {
              const w = payload.new as any;
              setWhiteboardElements((prev) =>
                prev.some((element) => element.id === w.element_data?.id)
                  ? prev
                  : [...prev, w.element_data]
              );
            }
          )
          .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'whiteboard_elements' },
            (payload) => {
              const deletedId = (payload.old as any)?.id;
              setWhiteboardElements((prev) => deletedId
                ? prev.filter((element) => element.id !== deletedId)
                : []
              );
            }
          )
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'game_backups' },
            (payload) => {
              const b = payload.new as any;
              const backup = {
                  id: b.id,
                  version: b.version,
                  title: b.title,
                  notes: b.notes,
                  author: b.author,
                  fileName: b.file_name,
                  size: b.file_size,
                  date: new Date(b.created_at).toLocaleDateString(),
                  fileData: b.file_url
                };
              setBackups((prev) => prev.some((item) => item.id === backup.id) ? prev : [backup, ...prev].slice(0, 100));
            }
          )
          .subscribe((status) => {
            if (active && status === 'SUBSCRIBED') setSupabaseConnected(true);
          });
      } catch (err) {
        console.warn('Supabase initialization error:', err);
        if (active) setSupabaseConnected(false);
        if (active) setIsTeamMember(false);
      }
    };

    initSupabaseData();
    return () => {
      active = false;
      if (realtimeChannel) void supabase.removeChannel(realtimeChannel);
    };
  }, [supabaseUrl, supabaseAnonKey, isAuthenticated]);

  // 2. Local / Server Socket.io Setup
  useEffect(() => {
    if (!isSecureSocketUrl(serverUrl)) {
      setServerConnected(false);
      return;
    }
    const newSocket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      auth: (callback) => {
        const client = getSupabaseClient();
        if (!client) return callback({});
        void client.auth.getSession().then(({ data }) => {
          callback({ accessToken: data.session?.access_token });
        }).catch(() => callback({}));
      },
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
        setMessages((prev) => [...prev, msg].slice(-500));
      }
    });

    newSocket.on('whiteboard-init', (elements: WhiteboardElement[]) => {
      if (!isSupabaseConfigured()) {
        setWhiteboardElements(elements);
      }
    });

    newSocket.on('whiteboard-action', (action: { type: 'add' | 'clear'; element?: WhiteboardElement } | { type: 'remove'; elementId: string }) => {
      if (isSupabaseConfigured()) return;
      if (action.type === 'add' && action.element) {
        setWhiteboardElements((prev) =>
          prev.some((element) => element.id === action.element!.id)
            ? prev
            : [...prev, action.element!].slice(-5000)
        );
      } else if (action.type === 'clear') {
        setWhiteboardElements([]);
      } else if (action.type === 'remove') {
        setWhiteboardElements((prev) => prev.filter((element) => element.id !== action.elementId));
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
  }, [serverUrl, isAuthenticated]);

  useEffect(() => {
    if (socket?.connected) socket.emit('register-user', currentUser);
  }, [socket, currentUser]);

  // Actions
  const sendMessage = async (content: string, channelId: string, attachment?: File | string): Promise<boolean> => {
    if (!content.trim() && !attachment) return false;

    const supabase = getSupabaseClient();
    if (supabase) {
      let fileUrl: string | undefined;
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return false;
        if (attachment) {
          const file = typeof attachment === 'string'
            ? new File([await (await fetch(attachment)).blob()], 'anexo.png', { type: 'image/png' })
            : attachment;
          fileUrl = await uploadProjectFile(file, 'chat');
        }
        const { data: savedMessage, error } = await supabase.from('messages').insert({
          channel_id: channelId || 'geral',
          user_id: user.id,
          username: currentUser.username,
          avatar: currentUser.avatar || '🎮',
          content: content.trim(),
          file_url: fileUrl
        }).select('*').single();
        if (error) {
          if (fileUrl) await removeProjectFile(fileUrl);
          console.error('Error inserting message into Supabase:', error);
          return false;
        }
        if (savedMessage) {
          const message: ChatMessage = {
            id: savedMessage.id,
            channelId: savedMessage.channel_id,
            userId: savedMessage.user_id,
            username: savedMessage.username,
            avatar: savedMessage.avatar,
            content: savedMessage.content,
            fileUrl: savedMessage.file_url,
            timestamp: new Date(savedMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          setMessages((previous) => previous.some((item) => item.id === message.id) ? previous : [...previous, message].slice(-500));
        }
        return true;
      } catch (err) {
        if (fileUrl) await removeProjectFile(fileUrl);
        console.error('Error inserting message into Supabase:', err);
        return false;
      }
    }

    if (socket?.connected) {
      let fileUrl: string | undefined;
      if (attachment) {
        const file = typeof attachment === 'string'
          ? new File([await (await fetch(attachment)).blob()], 'anexo.png', { type: 'image/png' })
          : attachment;
        if (file.size > 6 * 1024 * 1024) return false;
        fileUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Não foi possível ler o anexo.'));
          reader.readAsDataURL(file);
        });
      }
      socket.emit('send-message', {
        channelId,
        userId: currentUser.id,
        username: currentUser.username,
        avatar: currentUser.avatar,
        content,
        fileUrl
      });
      return true;
    }
    return false;
  };

  const sendWhiteboardAction = async (action: { type: 'add' | 'clear'; element?: WhiteboardElement } | { type: 'remove'; elementId: string }): Promise<boolean> => {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) return false;
      if (action.type === 'add' && action.element) {
        const { error } = await supabase.from('whiteboard_elements').insert({
          id: action.element.id,
          element_data: action.element
        });
        if (error) {
          console.error('Error adding whiteboard element to Supabase:', error);
          return false;
        }
      } else if (action.type === 'clear') {
        const { error } = await supabase.from('whiteboard_elements').delete().neq('id', 'placeholder');
        if (error) {
          console.error('Error clearing whiteboard in Supabase:', error);
          return false;
        }
      } else if (action.type === 'remove') {
        const { error } = await supabase.from('whiteboard_elements').delete().eq('id', action.elementId);
        if (error) {
          console.error('Error removing whiteboard element from Supabase:', error);
          return false;
        }
      }
    }

    if (action.type === 'add' && action.element) {
      setWhiteboardElements((prev) => prev.some((el) => el.id === action.element!.id) ? prev : [...prev, action.element!]);
    } else if (action.type === 'clear') {
      setWhiteboardElements([]);
    } else if (action.type === 'remove') {
      setWhiteboardElements((prev) => prev.filter((element) => element.id !== action.elementId));
    }

    if (!supabase && socket && socket.connected) {
      socket.emit('whiteboard-action', action);
    }
    return Boolean(supabase || socket?.connected);
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

  const addBackup = async (backup: Partial<GameBackup> & { file?: File }): Promise<boolean> => {
    const supabase = getSupabaseClient();
    const backupId = `b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let fileData = backup.fileData || '';

    if (supabase) {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return false;
        if (backup.file) fileData = await uploadProjectFile(backup.file, 'backups');
        const row = {
          id: backupId,
          version: backup.version || 'v1.0.0',
          title: backup.title || 'Nova Versão',
          notes: backup.notes || '',
          author: currentUser.username,
          user_id: user.id,
          file_name: backup.fileName || 'backup.zip',
          file_size: backup.size || '10 MB',
          file_url: fileData
        };
        const { error } = await supabase.from('game_backups').insert(row);
        if (error) {
          await removeProjectFile(fileData);
          console.error('Error inserting backup into Supabase:', error);
          return false;
        }
        const localBackup: GameBackup = {
          id: backupId, version: row.version, title: row.title, notes: row.notes,
          author: row.author, fileName: row.file_name, size: row.file_size,
          date: new Date().toLocaleDateString(), fileData
        };
        setBackups((previous) => [localBackup, ...previous.filter((item) => item.id !== backupId)]);
        return true;
      } catch (err) {
        await removeProjectFile(fileData);
        console.error('Error inserting backup into Supabase:', err);
        return false;
      }
    }

    if (socket?.connected) {
      if (backup.file) {
        if (backup.file.size > 6 * 1024 * 1024) return false;
        fileData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
          reader.readAsDataURL(backup.file!);
        });
      }
      socket.emit('add-backup', {
        ...backup,
        file: undefined,
        fileData,
        id: backupId,
        author: currentUser.username
      });
      return true;
    }
    return false;
  };

  const saveSupabaseConfig = async (url: string, key: string): Promise<boolean> => {
    try {
      updateSupabaseCredentials(url.trim(), key.trim());
      setSupabaseUrl(url.trim());
      setSupabaseAnonKey(key.trim());
      const response = await fetch(`${url.trim().replace(/\/$/, '')}/auth/v1/health`, {
        headers: { apikey: key.trim() },
        signal: AbortSignal.timeout(10_000)
      });
      setSupabaseConnected(false);
      return response.ok;
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
        isAuthenticated,
        isTeamMember,
        authEmail,
        signIn: async (email, password) => {
          const client = getSupabaseClient();
          if (!client) return { success: false, message: 'Configure o projeto Supabase primeiro.' };
          const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
          return error ? { success: false, message: error.message } : { success: true, message: 'Sessão iniciada.' };
        },
        signUp: async (email, password) => {
          const client = getSupabaseClient();
          if (!client) return { success: false, message: 'Configure o projeto Supabase primeiro.' };
          const { data, error } = await client.auth.signUp({ email: email.trim(), password });
          if (error) return { success: false, message: error.message };
          return data.session
            ? { success: true, message: 'Conta criada e sessão iniciada.' }
            : { success: true, message: 'Conta criada. Confirme o e-mail para entrar.' };
        },
        signOut: async () => {
          const client = getSupabaseClient();
          if (client) await client.auth.signOut();
          setSupabaseConnected(false);
        },
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
