import React, { useState, useEffect } from 'react';
import { useSocket } from '../../context/SocketContext';
import type { UserProfile } from '../../types';
import { X, Server, Check, Shield, Database, User, AlertCircle, Copy, Sparkles, RefreshCw } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenUpdates?: () => void;
}

const AVATAR_OPTIONS = ['👾', '🎮', '🧙‍♂️', '⚔️', '🏹', '🎨', '🕹️', '🛡️', '🐉', '🤖', '💀', '💎'];
const ROLES: UserProfile['role'][] = ['Diretor', 'Programador', 'Artista 2D', 'Game Designer', 'Músico'];

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onOpenUpdates }) => {
  const {
    currentUser,
    setCurrentUser,
    serverUrl,
    setServerUrl,
    serverConnected,
    supabaseConnected,
    saveSupabaseConfig,
    isAuthenticated,
    isTeamMember,
    authEmail,
    signIn,
    signUp,
    signOut,
    supabaseUrl: currentSbUrl,
    supabaseAnonKey: currentSbKey
  } = useSocket();

  const [activeTab, setActiveTab] = useState<'profile' | 'supabase' | 'server' | 'updates'>('profile');
  const [appVersion, setAppVersion] = useState('1.0.0');

  useEffect(() => {
    if (window.electronAPI?.getAppVersion) {
      window.electronAPI.getAppVersion().then(v => {
        if (v) setAppVersion(v);
      });
    }
  }, []);

  // Profile Form
  const [username, setUsername] = useState(currentUser.username);
  const [avatar, setAvatar] = useState(currentUser.avatar);
  const [role, setRole] = useState<UserProfile['role']>(currentUser.role);

  // Supabase Form
  const [sbUrl, setSbUrl] = useState(currentSbUrl);
  const [sbKey, setSbKey] = useState(currentSbKey);
  const [testingSupabase, setTestingSupabase] = useState(false);
  const [supabaseTestMsg, setSupabaseTestMsg] = useState<{ success: boolean; text: string } | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<{ success: boolean; text: string } | null>(null);

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

  const handleTestAndSaveSupabase = async (e?: React.FormEvent) => {
    e?.preventDefault();
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

  const handleAccountSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setAuthBusy(true);
    setAuthMessage(null);
    const result = authMode === 'signin'
      ? await signIn(accountEmail, accountPassword)
      : await signUp(accountEmail, accountPassword);
    setAuthMessage({ success: result.success, text: result.message });
    setAuthBusy(false);
    if (result.success && authMode === 'signin') setAccountPassword('');
  };

  const handleSaveServer = (e: React.FormEvent) => {
    e.preventDefault();
    if (customServerUrl.trim()) {
      if (!setServerUrl(customServerUrl.trim())) {
        window.alert('Use HTTPS para servidores remotos. HTTP só é permitido para localhost.');
        return;
      }
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 700);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg max-h-[90vh] bg-[#181a24] border border-gray-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
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
          <button
            onClick={() => setActiveTab('updates')}
            className={`py-3 flex items-center gap-1.5 border-b-2 transition ${
              activeTab === 'updates' ? 'border-purple-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Sparkles size={14} className="text-purple-400" /> Atualizações
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto">
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
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex items-start gap-3">
                <Database size={20} className="text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs text-gray-300 space-y-1">
                  <p className="font-semibold text-emerald-300">Conexão Gratuita com Supabase</p>
                  <p className="text-gray-400 leading-relaxed">
                    Com o Supabase configurado, o chat, os backups e o quadro são sincronizados entre as contas autorizadas da equipe.
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

              {isAuthenticated ? (
                <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${isTeamMember ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
                  <div className="text-xs text-gray-200">
                    {isTeamMember === null ? 'Verificando acesso…' : isTeamMember ? 'Sessão autorizada:' : 'E-mail sem autorização da equipe:'} <strong>{authEmail}</strong>
                  </div>
                  <button type="button" onClick={() => void signOut()} className="text-xs text-gray-200 hover:text-white">Sair</button>
                </div>
              ) : (
                <form onSubmit={handleAccountSubmit} className="space-y-3 rounded-xl border border-gray-800 bg-[#11121b] p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-white">Conta da equipe</h3>
                    <button type="button" onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')} className="text-[11px] text-indigo-300 hover:text-indigo-200">
                      {authMode === 'signin' ? 'Criar conta' : 'Já tenho conta'}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400">A criação de conta só funciona para e-mails que o administrador adicionou à lista autorizada no Supabase.</p>
                  <input type="email" value={accountEmail} onChange={(e) => setAccountEmail(e.target.value)} placeholder="Seu e-mail" required autoComplete="email" className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-white text-xs" />
                  <input type="password" value={accountPassword} onChange={(e) => setAccountPassword(e.target.value)} placeholder="Senha (mínimo 8 caracteres)" required minLength={8} autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-white text-xs" />
                  {authMessage && <p className={`text-xs ${authMessage.success ? 'text-emerald-300' : 'text-rose-300'}`}>{authMessage.text}</p>}
                  <button type="submit" disabled={authBusy || !sbUrl || !sbKey} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold">
                    {authBusy ? 'Aguarde…' : authMode === 'signin' ? 'Entrar' : 'Criar conta'}
                  </button>
                </form>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => void handleTestAndSaveSupabase()}
                  disabled={testingSupabase}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-emerald-600/30 transition flex items-center gap-1.5"
                >
                  {testingSupabase ? 'Testando Conexão...' : 'Conectar e Salvar'}
                </button>
              </div>
            </div>
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

          {/* TAB 4: Updates */}
          {activeTab === 'updates' && (
            <div className="space-y-4">
              <div className="bg-[#1b1e2c] border border-gray-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Versão do LPP2 Studio</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xl font-bold text-white font-mono">v{appVersion}</span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                      Instalada
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    onClose();
                    onOpenUpdates?.();
                  }}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-indigo-600/30"
                >
                  <RefreshCw size={14} />
                  Verificar Atualizações
                </button>
              </div>

              <div className="bg-[#11121b] border border-gray-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs">
                  <Sparkles size={16} />
                  <span>Atualizações Automáticas para Sócios</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  O LPP2 Studio está configurado para buscar novas versões diretamente no GitHub. Toda vez que você lançar uma nova build ou correção:
                </p>
                <ul className="text-xs text-gray-400 space-y-1.5 list-disc pl-4">
                  <li>O aplicativo dos seus sócios avisa que há uma nova versão automaticamente ao iniciar.</li>
                  <li>O download é feito em segundo plano com barra de progresso.</li>
                  <li>Basta 1 clique para reiniciar e usar a versão mais recente!</li>
                  <li>Você não precisa mais compactar ou enviar arquivos de 100MB+ manualmente.</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
