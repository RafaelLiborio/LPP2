const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));

const server = http.createServer(app);
const io = new Server(server, {
  // Keep file attachments within a bounded size until uploads move to object storage.
  maxHttpBufferSize: 10 * 1024 * 1024,
  pingTimeout: 20000,
  pingInterval: 25000,
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3001;
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_PUBLIC_KEY = process.env.SUPABASE_PUBLIC_KEY || process.env.SUPABASE_ANON_KEY || '';
const REQUIRE_SOCKET_AUTH = process.env.REQUIRE_SOCKET_AUTH === 'true' ||
  (process.env.NODE_ENV !== 'development' && process.env.REQUIRE_SOCKET_AUTH !== 'false');
const MAX_MESSAGES = 500;
const MAX_WHITEBOARD_ELEMENTS = 5000;
const MAX_BACKUPS = 100;
const MAX_TEXT_LENGTH = 4000;

function boundedText(value, maxLength, fallback = '') {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : fallback;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validFileData(value) {
  return value == null || (typeof value === 'string' && value.length <= 8_500_000);
}

function validImageData(value) {
  return typeof value === 'string' && /^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(value) && value.length <= 8_500_000;
}

async function validateSocketMember(accessToken) {
  if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY || !accessToken) {
    throw new Error('Autenticação Supabase obrigatória para este servidor.');
  }
  const headers = {
    apikey: SUPABASE_PUBLIC_KEY,
    Authorization: `Bearer ${accessToken}`
  };
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers,
    signal: AbortSignal.timeout(8000)
  });
  if (!userResponse.ok) throw new Error('Sessão Supabase inválida ou expirada.');
  const user = await userResponse.json();
  const membershipResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/lpp2_is_allowed_member`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(8000)
  });
  if (!membershipResponse.ok || await membershipResponse.json() !== true) {
    throw new Error('Este usuário não está autorizado para o projeto.');
  }
  return user;
}

io.use(async (socket, next) => {
  if (!REQUIRE_SOCKET_AUTH) return next();
  try {
    socket.data.authUser = await validateSocketMember(socket.handshake.auth?.accessToken);
    next();
  } catch (error) {
    next(new Error(error instanceof Error ? error.message : 'Falha na autenticação.'));
  }
});

// In-memory real-time state (can be hooked to SQLite/Supabase)
const users = new Map(); // socket.id -> user
const voiceRooms = new Map(); // roomId -> Set of socket.id
const chatMessages = [
  {
    id: 'msg-welcome-1',
    channelId: 'geral',
    userId: 'system',
    username: 'LPP2 Bot',
    avatar: '🎮',
    content: '🎉 Bem-vindos ao HUB de Desenvolvimento LPP2! Canais de voz, pixel art, quadro compartilhado e backups prontos para uso.',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
];

const whiteboardElements = [];
const gameBackups = [
  {
    id: 'b-0.1.0',
    version: 'v0.1.0-alpha',
    title: 'Protótipo Inicial de Movimentação e Física',
    notes: 'Primeira versão jogável com colisões, movimentação do personagem e mapa de testes.',
    author: 'Equipe LPP2',
    date: new Date().toLocaleDateString(),
    size: '42.5 MB',
    fileName: 'LPP2_Build_v0.1.0_alpha.zip',
    downloadUrl: '#'
  }
];

io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);
  const eventCounts = new Map();
  const allowEvent = (name, limit = 60) => {
    const now = Date.now();
    const state = eventCounts.get(name) || { start: now, count: 0 };
    if (now - state.start >= 10_000) {
      state.start = now;
      state.count = 0;
    }
    state.count += 1;
    eventCounts.set(name, state);
    return state.count <= limit;
  };

  // User presence
  socket.on('register-user', (user) => {
    if (!allowEvent('register-user', 5) || !isPlainObject(user)) return;
    users.set(socket.id, {
      id: socket.data.authUser?.id || boundedText(user.id, 80, socket.id),
      username: boundedText(user.username, 40, 'Membro'),
      avatar: boundedText(user.avatar, 16, '🎮'),
      role: boundedText(user.role, 40, 'Membro'),
      status: ['online', 'idle', 'dnd', 'offline'].includes(user.status) ? user.status : 'online',
      isMuted: Boolean(user.isMuted),
      isDeafened: Boolean(user.isDeafened),
      isScreenSharing: Boolean(user.isScreenSharing),
      socketId: socket.id
    });
    io.emit('online-users', Array.from(users.values()));
    socket.emit('chat-history', chatMessages);
    socket.emit('whiteboard-init', whiteboardElements);
    socket.emit('backups-list', gameBackups);
  });

  // Chat
  socket.on('send-message', (data) => {
    if (REQUIRE_SOCKET_AUTH || !allowEvent('send-message', 30) || !isPlainObject(data)) return;
    const content = boundedText(data.content, MAX_TEXT_LENGTH);
    const fileUrl = data.fileUrl == null ? null : (validImageData(data.fileUrl) ? data.fileUrl : undefined);
    if ((!content && !fileUrl) || fileUrl === undefined) return;
    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      channelId: boundedText(data.channelId, 64, 'geral'),
      userId: users.get(socket.id)?.id || socket.id,
      username: users.get(socket.id)?.username || 'Membro',
      avatar: users.get(socket.id)?.avatar || '👾',
      content,
      fileUrl,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    chatMessages.push(message);
    if (chatMessages.length > MAX_MESSAGES) chatMessages.splice(0, chatMessages.length - MAX_MESSAGES);
    io.emit('new-message', message);
  });

  // Whiteboard sync
  socket.on('whiteboard-action', (data) => {
    if (REQUIRE_SOCKET_AUTH || !allowEvent('whiteboard-action', 60) || !isPlainObject(data)) return;
    if (data.type === 'add') {
      const element = data.element;
      if (!isPlainObject(element) || typeof element.id !== 'string' || element.id.length > 100) return;
      if (!['pencil', 'rectangle', 'circle', 'sticky', 'arrow', 'text'].includes(element.type)) return;
      if (![element.x, element.y, element.strokeWidth].every(Number.isFinite)) return;
      if (element.points && (!Array.isArray(element.points) || element.points.length > 2000 || !element.points.every(p => isPlainObject(p) && Number.isFinite(p.x) && Number.isFinite(p.y)))) return;
      data = { type: 'add', element: { ...element, author: users.get(socket.id)?.username || 'Membro' } };
    } else if (data.type === 'remove') {
      if (typeof data.elementId !== 'string' || data.elementId.length > 100) return;
    } else if (data.type !== 'clear') {
      return;
    }
    // broadcast to everyone else in real-time
    socket.broadcast.emit('whiteboard-action', data);
    if (data.type === 'add') {
      whiteboardElements.push(data.element);
      if (whiteboardElements.length > MAX_WHITEBOARD_ELEMENTS) whiteboardElements.shift();
    } else if (data.type === 'clear') {
      whiteboardElements.length = 0;
    } else if (data.type === 'remove') {
      const index = whiteboardElements.findIndex(element => element.id === data.elementId);
      if (index >= 0) whiteboardElements.splice(index, 1);
    }
  });

  socket.on('whiteboard-cursor', (data) => {
    if (!allowEvent('whiteboard-cursor', 120) || !isPlainObject(data) || !Number.isFinite(data.x) || !Number.isFinite(data.y)) return;
    socket.broadcast.emit('whiteboard-cursor', {
      socketId: socket.id,
      userId: users.get(socket.id)?.id || socket.id,
      username: users.get(socket.id)?.username || 'Membro',
      x: data.x,
      y: data.y,
      color: data.color
    });
  });

  // WebRTC Voice & Screen Room Signaling
  socket.on('join-voice', (payload) => {
    if (!isPlainObject(payload)) return;
    const { roomId } = payload;
    if (!allowEvent('join-voice', 10) || typeof roomId !== 'string' || !/^[\w-]{1,64}$/.test(roomId)) return;
    if (voiceRooms.get(roomId)?.size >= 12 && !voiceRooms.get(roomId).has(socket.id)) return;
    socket.join(roomId);
    if (!voiceRooms.has(roomId)) {
      voiceRooms.set(roomId, new Set());
    }
    const room = voiceRooms.get(roomId);

    // Tell current members in this room about the new peer
    socket.to(roomId).emit('peer-joined', {
      peerId: socket.id,
      user: users.get(socket.id) || { username: 'Membro' }
    });

    room.add(socket.id);

    // Send the list of existing peers in the room to the joining user
    const existingPeers = Array.from(room).filter(id => id !== socket.id);
    socket.emit('existing-peers', existingPeers.map(id => ({
      peerId: id,
      user: users.get(id)
    })));
  });

  socket.on('signal-peer', (payload) => {
    if (!isPlainObject(payload)) return;
    const { targetPeerId, signal, type } = payload;
    if (!allowEvent('signal-peer', 120) || typeof targetPeerId !== 'string') return;
    const sharesRoom = [...voiceRooms.values()].some(room => room.has(socket.id) && room.has(targetPeerId));
    if (!sharesRoom || !isPlainObject(signal)) return;
    io.to(targetPeerId).emit('signal-received', {
      fromPeerId: socket.id,
      signal,
      type
    });
  });

  socket.on('leave-voice', (payload) => {
    if (!isPlainObject(payload)) return;
    const { roomId } = payload;
    if (typeof roomId !== 'string') return;
    if (voiceRooms.has(roomId)) {
      voiceRooms.get(roomId).delete(socket.id);
      socket.to(roomId).emit('peer-left', { peerId: socket.id });
      if (voiceRooms.get(roomId).size === 0) voiceRooms.delete(roomId);
    }
    socket.leave(roomId);
  });

  // Game Backups
  socket.on('add-backup', (newBackup) => {
    if (REQUIRE_SOCKET_AUTH || !allowEvent('add-backup', 5) || !isPlainObject(newBackup) || !validFileData(newBackup.fileData)) return;
    const backupItem = {
      id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      version: boundedText(newBackup.version, 40, 'v1.0.0'),
      title: boundedText(newBackup.title, 120, 'Nova build'),
      notes: boundedText(newBackup.notes, MAX_TEXT_LENGTH),
      author: users.get(socket.id)?.username || 'Membro do Time',
      date: new Date().toLocaleDateString(),
      size: boundedText(newBackup.size, 32, '10.0 MB'),
      fileName: boundedText(newBackup.fileName, 180, 'backup.zip'),
      fileData: newBackup.fileData || null
    };
    gameBackups.unshift(backupItem);
    if (gameBackups.length > MAX_BACKUPS) gameBackups.length = MAX_BACKUPS;
    io.emit('backups-list', gameBackups);
  });

  socket.on('disconnect', () => {
    users.delete(socket.id);
    voiceRooms.forEach((room, roomId) => {
      if (room.has(socket.id)) {
        room.delete(socket.id);
        socket.to(roomId).emit('peer-left', { peerId: socket.id });
        if (room.size === 0) voiceRooms.delete(roomId);
      }
    });
    io.emit('online-users', Array.from(users.values()));
    socket.broadcast.emit('cursor-remove', { socketId: socket.id });
    console.log(`[Socket Disconnected] ID: ${socket.id}`);
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', online: users.size, rooms: voiceRooms.size });
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor LPP2 rodando com sucesso na porta ${PORT}`);
});
