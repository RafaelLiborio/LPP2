import React, { useState } from 'react';
import { useSocket } from '../../context/SocketContext';
import type { UserProfile } from '../../types';
import { X, Server, Check, Shield, Database, User, AlertCircle, Copy } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AVATAR_OPTIONS = ['👾', '🎮', '🧙‍♂️', '⚔️', '🏹', '🎨', '🕹️', '🛡️', '🐉', '🤖', '💀', '💎'];
const ROLES: UserProfile['role'][] = ['Diretor', 'Programador', 'Artista 2D', 'Game Designer', 'Músico'];

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const {
    currentUser,
    setCurrentUser,
    serverUrl,
    setServerUrl,
    serverConnected,
    supabaseConnected,
    saveSupabaseConfig,
    supabaseUrl: currentSbUrl,
    supabaseAnonKey: currentSbKey
  } = useSocket();

  const [activeTab, setActiveTab] = useState<'profile' | 'supabase' | 'server'>('profile');

  // Profile Form
  const [username, setUsername] = useState(currentUser.username);
  const [avatar, setAvatar] = useState(currentUser.avatar);
  const [role, setRole] = useState<UserProfile['role']>(currentUser.role);

  // Supabase Form
  const [sbUrl, setSbUrl] = useState(currentSbUrl);
  const [sbKey, setSbKey] = useState(currentSbKey);
  const [testingSupabase, setTestingSupabase] = useState(false);
  const [supabaseTestMsg, setSupabaseTestMsg] = useState<{ success: boolean; text: string } | null>(null);

  // Server Form
  const [customServerUrl, setCustomServerUrl] = useState(serverUrl);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    setCurrentUser({
      ...currentUser,
      username: username.trim(),
      avatar,
      role
    });

    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 700);
  };

  const handleTestAndSaveSupabase = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestingSupabase(true);
    setSupabaseTestMsg(null);

    const isOk = await saveSupabaseConfig(sbUrl, sbKey);
    setTestingSupabase(false);

    if (isOk) {
      setSupabaseTestMsg({ success: true, text: 'Conectado com sucesso ao banco Supabase!' });
    } else {
      setSupabaseTestMsg({
        success: false,
        text: 'Não foi possível conectar. Verifique a URL, a chave Anon ou se rodou o script SQL das tabelas.'
      });
    }
  };

  const handleSaveServer = (e: React.FormEvent) => {
    e.preventDefault();
    if (customServerUrl.trim()) {
      setServerUrl(customServerUrl.trim());
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 700);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-[#181a24] border border-gray-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-[#13151f]">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{avatar}</span>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">Configurações & Conexão</h2>
              <p className="text-xs text-gray-400">Gerencie seu perfil e o banco de dados da equipe</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center px-6 border-b border-gray-800 bg-[#151620] gap-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('profile')}
            className={`py-3 flex items-center gap-1.5 border-b-2 transition ${
              activeTab === 'profile' ? 'border-indigo-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <User size={14} /> Perfil
          </button>
          <button
            onClick={() => setActiveTab('supabase')}
            className={`py-3 flex items-center gap-1.5 border-b-2 transition ${
              activeTab === 'supabase' ? 'border-emerald-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Database size={14} className={supabaseConnected ? 'text-emerald-400' : 'text-gray-400'} />
            Banco Supabase
            {supabaseConnected && (
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('server')}
            className={`py-3 flex items-center gap-1.5 border-b-2 transition ${
              activeTab === 'server' ? 'border-indigo-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Server size={14} /> Servidor WebRTC / Socket
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6">
          {/* TAB 1: Profile */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300 mb-2">
                  Ícone / Avatar
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {AVATAR_OPTIONS.map((icon) => (
                    <button
                      type="button"
                      key={icon}
                      onClick={() => setAvatar(icon)}
                      className={`h-11 rounded-xl text-xl flex items-center justify-center transition border ${
                        avatar === icon
                          ? 'border-indigo-500 bg-indigo-500/20 scale-105 shadow-md shadow-indigo-500/10'
                          : 'border-gray-800 bg-gray-900/60 hover:bg-gray-800 text-gray-300'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300 mb-1.5">
                  Seu Nome
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ex: Dev_Rafael"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300 mb-1.5">
                  Cargo no Projeto
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map((r) => (
                    <button
                      type="button"
                      key={r}
                      onClick={() => setRole(r)}
                      className={`px-3 py-2 rounded-xl text-xs font-medium border text-left transition flex items-center justify-between ${
                        role === r
                          ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300'
                          : 'border-gray-800 bg-gray-900/60 text-gray-400 hover:bg-gray-800'
                      }`}
                    >
                      <span>{r}</span>
                      {role === r && <Shield size={12} className="text-indigo-400" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-3">
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition flex items-center gap-1.5"
                >
                  {savedSuccess ? <><Check size={14} /> Salvo!</> : 'Salvar Perfil'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: Supabase Database */}
          {activeTab === 'supabase' && (
            <form onSubmit={handleTestAndSaveSupabase} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex items-start gap-3">
                <Database size={20} className="text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs text-gray-300 space-y-1">
                  <p className="font-semibold text-emerald-300">Conexão Gratuita com Supabase</p>
                  <p className="text-gray-400 leading-relaxed">
                    Com o Supabase conectado, todo o chat, backups do jogo e desenhos do quadro ficam salvos na nuvem para você e seus sócios para sempre!
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300 mb-1.5">
                  Project URL do Supabase
                </label>
                <input
                  type="text"
                  value={sbUrl}
                  onChange={(e) => setSbUrl(e.target.value)}
                  placeholder="https://xyzcompany.supabase.co"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300 mb-1.5">
                  Anon / Public API Key
                </label>
                <input
                  type="password"
                  value={sbKey}
                  onChange={(e) => setSbKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              {supabaseTestMsg && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                    supabaseTestMsg.success
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                  }`}
                >
                  {supabaseTestMsg.success ? <Check size={16} /> : <AlertCircle size={16} />}
                  <span>{supabaseTestMsg.text}</span>
                </div>
              )}

              <div className="p-3 bg-gray-900/60 rounded-xl border border-gray-800 text-[11px] text-gray-400 space-y-1.5">
                <p className="font-semibold text-gray-300 flex items-center gap-1.5">
                  <Copy size={12} className="text-indigo-400" /> Script SQL das Tabelas
                </p>
                <p>
                  Criamos o arquivo <code>supabase_schema.sql</code> na raiz do projeto. Basta copiar o conteúdo dele e colar no <strong>SQL Editor</strong> do painel do seu Supabase para criar as tabelas com 1 clique!
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={testingSupabase}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-emerald-600/30 transition flex items-center gap-1.5"
                >
                  {testingSupabase ? 'Testando Conexão...' : 'Conectar e Salvar'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: Server */}
          {activeTab === 'server' && (
            <form onSubmit={handleSaveServer} className="space-y-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
                  <Server size={14} className="text-indigo-400" />
                  Servidor WebSockets & Sinalização WebRTC
                </label>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    serverConnected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {serverConnected ? 'Conectado' : 'Desconectado'}
                </span>
              </div>
              <input
                type="text"
                value={customServerUrl}
                onChange={(e) => setCustomServerUrl(e.target.value)}
                placeholder="http://localhost:3001"
                className="w-full px-3.5 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white text-xs placeholder-gray-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Use <code>http://localhost:3001</code> para testes em máquina local. Quando publicar o servidor no Render.com ou Koyeb, insira a URL aqui para sincronizar com seus sócios.
              </p>

              <div className="flex justify-end pt-3">
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition flex items-center gap-1.5"
                >
                  {savedSuccess ? <><Check size={14} /> Salvo!</> : 'Salvar Servidor'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
