const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3001;

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

  // User presence
  socket.on('register-user', (user) => {
    users.set(socket.id, { ...user, socketId: socket.id });
    io.emit('online-users', Array.from(users.values()));
    socket.emit('chat-history', chatMessages);
    socket.emit('whiteboard-init', whiteboardElements);
    socket.emit('backups-list', gameBackups);
  });

  // Chat
  socket.on('send-message', (data) => {
    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      channelId: data.channelId || 'geral',
      userId: data.userId,
      username: data.username,
      avatar: data.avatar || '👾',
      content: data.content,
      fileUrl: data.fileUrl,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    chatMessages.push(message);
    io.emit('new-message', message);
  });

  // Whiteboard sync
  socket.on('whiteboard-action', (data) => {
    // broadcast to everyone else in real-time
    socket.broadcast.emit('whiteboard-action', data);
    if (data.type === 'add') {
      whiteboardElements.push(data.element);
    } else if (data.type === 'clear') {
      whiteboardElements.length = 0;
    }
  });

  socket.on('whiteboard-cursor', (data) => {
    socket.broadcast.emit('whiteboard-cursor', {
      socketId: socket.id,
      userId: data.userId,
      username: data.username,
      x: data.x,
      y: data.y,
      color: data.color
    });
  });

  // WebRTC Voice & Screen Room Signaling
  socket.on('join-voice', ({ roomId, user }) => {
    socket.join(roomId);
    if (!voiceRooms.has(roomId)) {
      voiceRooms.set(roomId, new Set());
    }
    const room = voiceRooms.get(roomId);

    // Tell current members in this room about the new peer
    socket.to(roomId).emit('peer-joined', {
      peerId: socket.id,
      user
    });

    room.add(socket.id);

    // Send the list of existing peers in the room to the joining user
    const existingPeers = Array.from(room).filter(id => id !== socket.id);
    socket.emit('existing-peers', existingPeers.map(id => ({
      peerId: id,
      user: users.get(id)
    })));
  });

  socket.on('signal-peer', ({ targetPeerId, signal, type }) => {
    io.to(targetPeerId).emit('signal-received', {
      fromPeerId: socket.id,
      signal,
      type
    });
  });

  socket.on('leave-voice', ({ roomId }) => {
    if (voiceRooms.has(roomId)) {
      voiceRooms.get(roomId).delete(socket.id);
      socket.to(roomId).emit('peer-left', { peerId: socket.id });
    }
    socket.leave(roomId);
  });

  // Game Backups
  socket.on('add-backup', (newBackup) => {
    const backupItem = {
      id: `b-${Date.now()}`,
      version: newBackup.version || 'v1.0.0',
      title: newBackup.title,
      notes: newBackup.notes,
      author: newBackup.author || 'Membro do Time',
      date: new Date().toLocaleDateString(),
      size: newBackup.size || '10.0 MB',
      fileName: newBackup.fileName || 'backup.zip',
      fileData: newBackup.fileData || null
    };
    gameBackups.unshift(backupItem);
    io.emit('backups-list', gameBackups);
  });

  socket.on('disconnect', () => {
    users.delete(socket.id);
    voiceRooms.forEach((room, roomId) => {
      if (room.has(socket.id)) {
        room.delete(socket.id);
        socket.to(roomId).emit('peer-left', { peerId: socket.id });
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
