import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../../context/SocketContext';
import {
  Hash,
  Volume2,
  Mic,
  MicOff,
  Headphones,
  Monitor,
  PhoneOff,
  Send,
  Image,
  Smile,
  Users,
  Shield,
  CircleDot,
  X,
  Tv
} from 'lucide-react';
import type { ScreenSource } from '../../types';

interface Channel {
  id: string;
  name: string;
  type: 'text' | 'voice';
  description: string;
}

const CHANNELS: Channel[] = [
  { id: 'geral', name: 'geral', type: 'text', description: 'Conversas gerais da equipe' },
  { id: 'gamedev', name: 'gamedev-prog', type: 'text', description: 'Código, física e lógica do jogo' },
  { id: 'pixel-art', name: 'arte-e-sprites', type: 'text', description: 'Conceitos, sprites e animações' },
  { id: 'bugs-ideias', name: 'bugs-e-tarefas', type: 'text', description: 'Anotações de bugs e novas ideias' },
  { id: 'voz-geral', name: 'Reunião Geral', type: 'voice', description: 'Canal de voz aberto' },
  { id: 'voz-dev', name: 'Game Dev Ao Vivo', type: 'voice', description: 'Transmissão e pair programming' }
];

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

const QUICK_EMOJIS = ['🎮', '👾', '🎨', '⚔️', '🛡️', '💎', '🚀', '🔥', '👍', '❤️', '💀', '🕹️', '🏆'];

export const DiscordModule: React.FC = () => {
  const { socket, currentUser, setCurrentUser, onlineUsers, messages, sendMessage } = useSocket();

  const [activeChannelId, setActiveChannelId] = useState('geral');
  const [inputText, setInputText] = useState('');
  const [inVoiceRoom, setInVoiceRoom] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Screen share picker modal state
  const [availableSources, setAvailableSources] = useState<ScreenSource[]>([]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  // WebRTC state
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const [remoteStreams, setRemoteStreams] = useState<Map<string, { stream: MediaStream; username: string; isScreen?: boolean }>>(new Map());

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeChannel = CHANNELS.find((c) => c.id === activeChannelId) || CHANNELS[0];
  const channelMessages = messages.filter((m) => m.channelId === activeChannelId);

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [channelMessages]);

  // Handle WebRTC Peer Signaling
  useEffect(() => {
    if (!socket) return;

    socket.on('peer-joined', async ({ peerId, user }: { peerId: string; user: any }) => {
      console.log('Peer joined voice:', peerId, user);
      if (!inVoiceRoom) return;
      const pc = createPeerConnection(peerId, user?.username || 'Colega');
      peerConnections.current.set(peerId, pc);

      // Add local tracks if any
      const streamToSend = screenStreamRef.current || localStreamRef.current;
      if (streamToSend) {
        streamToSend.getTracks().forEach((track) => pc.addTrack(track, streamToSend));
      }

      // Create Offer
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('signal-peer', {
          targetPeerId: peerId,
          signal: offer,
          type: 'offer'
        });
      } catch (err) {
        console.error('Error creating offer:', err);
      }
    });

    socket.on('existing-peers', async (peers: { peerId: string; user: any }[]) => {
      peers.forEach(({ peerId, user }) => {
        const pc = createPeerConnection(peerId, user?.username || 'Colega');
        peerConnections.current.set(peerId, pc);
        const streamToSend = screenStreamRef.current || localStreamRef.current;
        if (streamToSend) {
          streamToSend.getTracks().forEach((track) => pc.addTrack(track, streamToSend));
        }
      });
    });

    socket.on('signal-received', async ({ fromPeerId, signal, type }: any) => {
      let pc = peerConnections.current.get(fromPeerId);
      if (!pc) {
        pc = createPeerConnection(fromPeerId, 'Colega');
        peerConnections.current.set(fromPeerId, pc);
      }

      try {
        if (type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('signal-peer', {
            targetPeerId: fromPeerId,
            signal: answer,
            type: 'answer'
          });
        } else if (type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
        } else if (type === 'candidate' && signal) {
          await pc.addIceCandidate(new RTCIceCandidate(signal));
        }
      } catch (err) {
        console.error('Signal handling error:', err);
      }
    });

    socket.on('peer-left', ({ peerId }: { peerId: string }) => {
      const pc = peerConnections.current.get(peerId);
      if (pc) {
        pc.close();
        peerConnections.current.delete(peerId);
      }
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.delete(peerId);
        return next;
      });
    });

    return () => {
      socket.off('peer-joined');
      socket.off('existing-peers');
      socket.off('signal-received');
      socket.off('peer-left');
    };
  }, [socket, inVoiceRoom]);

  const createPeerConnection = (peerId: string, peerUsername: string) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('signal-peer', {
          targetPeerId: peerId,
          signal: event.candidate,
          type: 'candidate'
        });
      }
    };

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];
      const hasVideo = remoteStream.getVideoTracks().length > 0;
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.set(peerId, { stream: remoteStream, username: peerUsername, isScreen: hasVideo });
        return next;
      });
    };

    return pc;
  };

  // Join or Leave Voice Room
  const toggleVoiceRoom = async (channelId: string) => {
    if (inVoiceRoom === channelId) {
      leaveVoiceRoom();
    } else {
      if (inVoiceRoom) {
        leaveVoiceRoom();
      }
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = audioStream;
        setInVoiceRoom(channelId);
        if (socket) {
          socket.emit('join-voice', { roomId: channelId, user: currentUser });
        }
      } catch (err) {
        console.warn('Microfone indisponível ou permissão negada, entrando apenas para escuta:', err);
        setInVoiceRoom(channelId);
        if (socket) {
          socket.emit('join-voice', { roomId: channelId, user: currentUser });
        }
      }
    }
  };

  const leaveVoiceRoom = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    stopScreenStream();
    peerConnections.current.forEach((pc) => pc.close());
    peerConnections.current.clear();
    setRemoteStreams(new Map());

    if (socket && inVoiceRoom) {
      socket.emit('leave-voice', { roomId: inVoiceRoom });
    }
    setInVoiceRoom(null);
  };

  const stopScreenStream = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    setIsScreenSharing(false);
    setCurrentUser({ ...currentUser, isScreenSharing: false });
  };

  // Toggle Screen Share
  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      stopScreenStream();
      return;
    }

    // If running in Electron: fetch sources and show picker modal
    if (window.electronAPI?.getScreenSources) {
      try {
        const sources = await window.electronAPI.getScreenSources();
        if (sources && sources.length > 0) {
          setAvailableSources(sources);
          setIsPickerOpen(true);
          return;
        }
      } catch (err) {
        console.warn('Fallback from electron getScreenSources:', err);
      }
    }

    // Browser or standard fallback
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });
      attachScreenStream(screenStream);
    } catch (err) {
      console.error('Erro ao iniciar compartilhamento de tela:', err);
      alert('Não foi possível iniciar a transmissão de tela. Verifique as permissões de gravação de tela.');
    }
  };

  // Start Screen share with a chosen source (Electron native)
  const selectScreenSource = async (sourceId: string) => {
    setIsPickerOpen(false);
    try {
      const screenStream = await (navigator.mediaDevices as any).getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            minWidth: 1280,
            maxWidth: 1920,
            minHeight: 720,
            maxHeight: 1080
          }
        }
      });
      attachScreenStream(screenStream);
    } catch (err) {
      console.error('Erro ao capturar fonte de tela:', err);
      alert('Falha ao capturar a janela/tela selecionada.');
    }
  };

  const attachScreenStream = (screenStream: MediaStream) => {
    screenStreamRef.current = screenStream;
    setIsScreenSharing(true);
    setCurrentUser({ ...currentUser, isScreenSharing: true });

    const videoTrack = screenStream.getVideoTracks()[0];
    videoTrack.onended = () => {
      stopScreenStream();
    };

    // Replace or add track to peer connections
    peerConnections.current.forEach((pc) => {
      pc.addTrack(videoTrack, screenStream);
    });
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = isMuted;
      });
    }
    setIsMuted(!isMuted);
    setCurrentUser({ ...currentUser, isMuted: !isMuted });
  };

  const toggleDeafen = () => {
    setIsDeafened(!isDeafened);
    setCurrentUser({ ...currentUser, isDeafened: !isDeafened });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    sendMessage(inputText.trim(), activeChannelId);
    setInputText('');
    setShowEmojiPicker(false);
  };

  const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      sendMessage('Enviou uma imagem/anexo:', activeChannelId, reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const hasActiveVideoStreams = isScreenSharing || Array.from(remoteStreams.values()).some((s) => s.isScreen);

  return (
    <div className="flex w-full h-full bg-[#1e202a] text-gray-200 overflow-hidden select-none">
      {/* Hidden Audio Elements for ALWAYS-WORKING WebRTC Voice */}
      {Array.from(remoteStreams.entries()).map(([peerId, data]) => (
        <audio
          key={`audio-${peerId}`}
          autoPlay
          playsInline
          muted={isDeafened}
          ref={(audio) => {
            if (audio && data.stream) {
              audio.srcObject = data.stream;
            }
          }}
        />
      ))}

      {/* Hidden File Input for Real Image Uploads */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleImageFileSelect}
        className="hidden"
      />

      {/* 1. Sub-sidebar: Channels */}
      <div className="w-60 bg-[#161720] border-r border-gray-800/80 flex flex-col justify-between shrink-0">
        <div className="flex flex-col h-full overflow-hidden">
          {/* Server Title with Official Logo */}
          <div className="h-14 px-3 border-b border-gray-800 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-7 h-7 rounded-md overflow-hidden shrink-0 bg-indigo-950/60 border border-indigo-500/30">
                <img
                  src="./logo.png"
                  alt="LPP2 Logo"
                  className="w-[150%] h-[150%] object-cover object-[center_38%] -ml-[25%] -mt-[10%]"
                  style={{ imageRendering: 'pixelated' }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/logo.png';
                  }}
                />
              </div>
              <span className="font-bold text-white text-xs tracking-wide truncate">
                LPP2 Studio Hub
              </span>
            </div>
            <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded font-mono font-bold shrink-0">
              PROD
            </span>
          </div>

          {/* Channel Lists */}
          <div className="flex-1 overflow-y-auto p-2 space-y-4">
            {/* Text Channels */}
            <div>
              <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 flex items-center justify-between">
                <span>Canais de Texto</span>
              </div>
              <div className="space-y-0.5">
                {CHANNELS.filter((c) => c.type === 'text').map((channel) => (
                  <button
                    key={channel.id}
                    onClick={() => setActiveChannelId(channel.id)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                      activeChannelId === channel.id
                        ? 'bg-indigo-600/20 text-white font-semibold'
                        : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
                    }`}
                  >
                    <Hash size={15} className={activeChannelId === channel.id ? 'text-indigo-400' : 'text-gray-500'} />
                    <span className="truncate">{channel.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Voice Channels */}
            <div>
              <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 flex items-center justify-between">
                <span>Canais de Voz e Tela</span>
              </div>
              <div className="space-y-1">
                {CHANNELS.filter((c) => c.type === 'voice').map((channel) => {
                  const isConnected = inVoiceRoom === channel.id;
                  return (
                    <div key={channel.id} className="space-y-1">
                      <button
                        onClick={() => toggleVoiceRoom(channel.id)}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition ${
                          isConnected
                            ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                            : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Volume2 size={16} className={isConnected ? 'text-emerald-400 animate-pulse' : 'text-gray-500'} />
                          <span className="truncate">{channel.name}</span>
                        </div>
                        {isConnected && (
                          <span className="text-[9px] bg-emerald-500 text-black px-1.5 py-0.5 rounded-full font-bold">
                            Conectado
                          </span>
                        )}
                      </button>

                      {/* Connected members in this voice channel */}
                      {isConnected && (
                        <div className="pl-6 pr-2 py-1 space-y-1 bg-black/20 rounded-md">
                          <div className="flex items-center justify-between text-[11px] text-gray-300">
                            <span className="flex items-center gap-1.5">
                              <span>{currentUser.avatar}</span>
                              <span className="font-semibold text-white truncate">{currentUser.username} (Você)</span>
                            </span>
                            <div className="flex items-center gap-1">
                              {isMuted && <MicOff size={11} className="text-rose-400" />}
                              {isScreenSharing && <Monitor size={11} className="text-indigo-400 animate-pulse" />}
                            </div>
                          </div>

                          {/* Remote voice peers */}
                          {Array.from(remoteStreams.entries()).map(([peerId, data]) => (
                            <div key={peerId} className="flex items-center justify-between text-[11px] text-gray-300">
                              <span className="flex items-center gap-1.5">
                                <span>👾</span>
                                <span className="truncate">{data.username}</span>
                              </span>
                              {data.isScreen && <Monitor size={11} className="text-indigo-400" />}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Voice Controls Dock (if connected) */}
          {inVoiceRoom && (
            <div className="p-3 bg-[#111219] border-t border-gray-800 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                  <CircleDot size={10} className="animate-ping" /> Voz Conectada
                </span>
                <span className="text-xs text-gray-300 truncate font-semibold">WebRTC P2P</span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={toggleScreenShare}
                  title={isScreenSharing ? 'Parar Transmissão' : 'Transmitir Tela'}
                  className={`p-1.5 rounded-md transition ${
                    isScreenSharing ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <Monitor size={15} />
                </button>
                <button
                  onClick={leaveVoiceRoom}
                  title="Desconectar da chamada"
                  className="p-1.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white transition"
                >
                  <PhoneOff size={15} />
                </button>
              </div>
            </div>
          )}

          {/* User Profile Bar */}
          <div className="h-14 px-3 bg-[#111219] border-t border-gray-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-base">
                  {currentUser.avatar}
                </div>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#111219]" />
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-white truncate leading-tight">{currentUser.username}</p>
                <p className="text-[10px] text-gray-400 truncate">{currentUser.role}</p>
              </div>
            </div>

            <div className="flex items-center gap-0.5">
              <button
                onClick={toggleMute}
                title={isMuted ? 'Desmutar' : 'Mutar'}
                className={`p-1.5 rounded-lg transition ${
                  isMuted ? 'text-rose-400 bg-rose-500/10' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {isMuted ? <MicOff size={15} /> : <Mic size={15} />}
              </button>
              <button
                onClick={toggleDeafen}
                title={isDeafened ? 'Desativar áudio' : 'Áudio ativo'}
                className={`p-1.5 rounded-lg transition ${
                  isDeafened ? 'text-rose-400 bg-rose-500/10' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <Headphones size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Chat / Screen Share Area */}
      <div className="flex-1 flex flex-col h-full bg-[#1a1b24] overflow-hidden">
        {/* Channel Header */}
        <div className="h-14 px-6 border-b border-gray-800 flex items-center justify-between shrink-0 bg-[#161720]">
          <div className="flex items-center gap-2.5">
            <Hash size={18} className="text-gray-400" />
            <h3 className="font-bold text-white text-sm">{activeChannel.name}</h3>
            <span className="text-gray-500">|</span>
            <p className="text-xs text-gray-400">{activeChannel.description}</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <button
              onClick={toggleScreenShare}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                isScreenSharing
                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20'
              }`}
            >
              <Monitor size={14} />
              {isScreenSharing ? 'Parar Transmissão' : 'Transmitir Tela'}
            </button>
            <span className="flex items-center gap-1.5">
              <Users size={14} className="text-indigo-400" />
              {onlineUsers.length} Membros
            </span>
          </div>
        </div>

        {/* Video / Screen Share Grid */}
        {hasActiveVideoStreams && (
          <div className="p-4 bg-black/40 border-b border-gray-800 grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto">
            {isScreenSharing && screenStreamRef.current && (
              <div className="relative rounded-xl overflow-hidden bg-gray-900 border border-indigo-500/50 aspect-video flex items-center justify-center">
                <video
                  autoPlay
                  muted
                  playsInline
                  ref={(video) => {
                    if (video && screenStreamRef.current) {
                      video.srcObject = screenStreamRef.current;
                    }
                  }}
                  className="w-full h-full object-contain"
                />
                <div className="absolute top-2 left-2 bg-black/60 px-2 py-0.5 rounded text-[11px] font-semibold text-white flex items-center gap-1.5">
                  <Monitor size={12} className="text-indigo-400" />
                  Sua Transmissão
                </div>
              </div>
            )}

            {Array.from(remoteStreams.entries()).map(([peerId, data]) => {
              if (!data.isScreen) return null;
              return (
                <div key={peerId} className="relative rounded-xl overflow-hidden bg-gray-900 border border-gray-700 aspect-video flex items-center justify-center">
                  <video
                    autoPlay
                    playsInline
                    muted={isDeafened}
                    ref={(video) => {
                      if (video) video.srcObject = data.stream;
                    }}
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute top-2 left-2 bg-black/60 px-2 py-0.5 rounded text-[11px] font-semibold text-white flex items-center gap-1.5">
                    <Monitor size={12} className="text-emerald-400" />
                    {data.username}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {channelMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 space-y-2">
              <Hash size={42} className="text-gray-600" />
              <p className="text-base font-semibold text-gray-300">Início do canal #{activeChannel.name}</p>
              <p className="text-xs max-w-sm">Compartilhe ideias de mecânicas, assets e notas de desenvolvimento com seus sócios!</p>
            </div>
          ) : (
            channelMessages.map((msg) => (
              <div key={msg.id} className="flex items-start gap-3.5 hover:bg-white/[0.02] -mx-2 px-2 py-1.5 rounded-lg transition group">
                <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center text-lg shrink-0 border border-gray-700/60">
                  {msg.avatar}
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-baseline gap-2">
                    <span className="font-bold text-sm text-indigo-400">{msg.username}</span>
                    <span className="text-[10px] text-gray-400">{msg.timestamp}</span>
                  </div>
                  <p className="text-sm text-gray-200 mt-0.5 break-words leading-relaxed select-text">
                    {msg.content}
                  </p>
                  {msg.fileUrl && (
                    <div className="mt-2 max-w-md rounded-lg overflow-hidden border border-gray-700">
                      <img src={msg.fileUrl} alt="Anexo" className="w-full h-auto object-contain bg-black/30" />
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input Box with Real Image File Upload & Quick Emoji Bar */}
        <div className="p-4 bg-[#161720] border-t border-gray-800 relative">
          {showEmojiPicker && (
            <div className="absolute bottom-16 left-6 bg-[#212330] border border-gray-700 rounded-xl p-2.5 shadow-2xl flex items-center gap-1.5 z-30">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    setInputText((prev) => prev + ' ' + emoji);
                    setShowEmojiPicker(false);
                  }}
                  className="hover:scale-125 transition text-lg p-1"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleSendMessage} className="flex items-center gap-2 bg-[#212330] rounded-xl px-4 py-2 border border-gray-700/70 focus-within:border-indigo-500 transition">
            <button
              type="button"
              title="Anexar imagem ou sprite do computador"
              onClick={() => fileInputRef.current?.click()}
              className="text-gray-400 hover:text-white transition"
            >
              <Image size={18} />
            </button>

            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Enviar mensagem em #${activeChannel.name}...`}
              className="flex-1 bg-transparent border-none text-white text-sm placeholder-gray-500 focus:outline-none"
            />

            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              title="Emojis de Game Dev"
              className={`transition ${showEmojiPicker ? 'text-indigo-400' : 'text-gray-400 hover:text-white'}`}
            >
              <Smile size={18} />
            </button>

            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      </div>

      {/* 3. Right Sidebar: Team Members Online */}
      <div className="w-56 bg-[#161720] border-l border-gray-800/80 p-3 hidden lg:flex flex-col shrink-0">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3 px-1">
          Sócios & Equipe ({onlineUsers.length})
        </h4>

        <div className="space-y-1 overflow-y-auto">
          {onlineUsers.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-800/50 transition cursor-default"
            >
              <div className="relative">
                <div className="w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center text-sm border border-gray-700">
                  {user.avatar}
                </div>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#161720] ${
                    user.status === 'online' ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-200 truncate leading-tight">
                  {user.username} {user.id === currentUser.id && '(Você)'}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Shield size={10} className="text-indigo-400" />
                  <span className="text-[10px] text-gray-400 truncate">{user.role}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Discord-style Screen & Window Picker Modal */}
      {isPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-[#181a24] border border-gray-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-[#13151f]">
              <div className="flex items-center gap-2">
                <Tv size={20} className="text-indigo-400" />
                <h3 className="text-base font-bold text-white">Escolha o que deseja transmitir</h3>
              </div>
              <button
                onClick={() => setIsPickerOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <p className="text-xs text-gray-400 mb-4">
                Selecione uma tela inteira ou janela aberta para compartilhar ao vivo com seus sócios:
              </p>

              <div className="grid grid-cols-2 gap-4">
                {availableSources.map((source) => (
                  <div
                    key={source.id}
                    onClick={() => selectScreenSource(source.id)}
                    className="group bg-gray-900 border border-gray-700/80 hover:border-indigo-500 rounded-xl p-2.5 cursor-pointer transition flex flex-col gap-2 hover:scale-[1.02] shadow-lg"
                  >
                    <div className="aspect-video bg-black/60 rounded-lg overflow-hidden border border-gray-800 flex items-center justify-center">
                      <img
                        src={source.thumbnail}
                        alt={source.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <span className="text-xs font-semibold text-gray-300 group-hover:text-indigo-300 truncate">
                      {source.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
