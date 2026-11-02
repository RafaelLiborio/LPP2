import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Download,
  RotateCw,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import type { UpdateInfo, UpdateProgress, UpdateStatusPayload } from '../types';

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialInfo?: UpdateInfo | null;
  onUpdateAvailable?: (info: UpdateInfo) => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  isOpen,
  onClose,
  initialInfo = null,
  onUpdateAvailable
}) => {
  const [currentVersion, setCurrentVersion] = useState('1.0.0');
  const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(initialInfo);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch installed version on mount
  useEffect(() => {
    if (window.electronAPI?.getAppVersion) {
      window.electronAPI.getAppVersion().then((ver) => {
        if (ver) setCurrentVersion(ver);
      });
    }
  }, []);

  // Sync initialInfo if provided
  useEffect(() => {
    if (initialInfo) {
      setUpdateInfo(initialInfo);
      setStatus('available');
    }
  }, [initialInfo]);

  // Listen to Electron IPC update status events
  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatus) return;

    const cleanup = window.electronAPI.onUpdateStatus((payload: UpdateStatusPayload) => {
      console.log('[UpdateModal] Status payload:', payload);
      switch (payload.type) {
        case 'checking':
          setStatus('checking');
          setErrorMessage(null);
          break;
        case 'available':
          setStatus('available');
          if (payload.info) {
            setUpdateInfo(payload.info);
            onUpdateAvailable?.(payload.info);
          }
          break;
        case 'not-available':
          setStatus('not-available');
          break;
        case 'downloading':
          setStatus('downloading');
          if (payload.progress) {
            setProgress(payload.progress);
          }
          break;
        case 'downloaded':
          setStatus('downloaded');
          break;
        case 'error':
          setStatus('error');
          setErrorMessage(payload.error || 'Erro ao processar atualização.');
          break;
      }
    });

    return () => {
      cleanup?.();
    };
  }, [onUpdateAvailable]);

  // Handle Manual Check
  const handleCheckForUpdates = async () => {
    setStatus('checking');
    setErrorMessage(null);
    setProgress(null);

    if (window.electronAPI?.checkForUpdates) {
      try {
        const res = await window.electronAPI.checkForUpdates();
        if (res.available && res.updateInfo) {
          setStatus('available');
          setUpdateInfo(res.updateInfo);
          onUpdateAvailable?.(res.updateInfo);
        } else if (res.error) {
          setStatus('error');
          setErrorMessage(res.error);
        } else {
          setStatus('not-available');
        }
      } catch (err: any) {
        setStatus('error');
        setErrorMessage(err?.message || 'Falha na verificação de atualização.');
      }
      return;
    }

    // Fallback: Web browser direct GitHub check
    try {
      const res = await fetch('https://api.github.com/repos/RafaelLiborio/LPP2/releases/latest');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const remoteVer = (data.tag_name || '').replace(/^v/i, '');
      const isNewer = remoteVer && remoteVer !== currentVersion;

      if (isNewer) {
        let downloadUrl = data.html_url;
        if (data.assets && data.assets.length > 0) {
          const exe = data.assets.find((a: any) => a.name.endsWith('.exe'));
          if (exe) downloadUrl = exe.browser_download_url;
        }

        const info: UpdateInfo = {
          version: remoteVer,
          releaseNotes: data.body || 'Atualização automática com melhorias de estabilidade.',
          releaseDate: data.published_at,
          downloadUrl
        };
        setUpdateInfo(info);
        setStatus('available');
        onUpdateAvailable?.(info);
      } else {
        setStatus('not-available');
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err?.message || 'Não foi possível conectar ao GitHub.');
    }
  };

  // Handle Download Update
  const handleStartDownload = async () => {
    if (window.electronAPI?.startUpdateDownload) {
      setStatus('downloading');
      setProgress({ percent: 0, transferred: 0, total: 100, bytesPerSecond: 0 });
      try {
        const res = await window.electronAPI.startUpdateDownload();
        if (!res.success && res.error) {
          setStatus('error');
          setErrorMessage(res.error);
        }
      } catch (err: any) {
        setStatus('error');
        setErrorMessage(err?.message || 'Erro ao iniciar download.');
      }
      return;
    }

    // In web mode: open direct download link
    if (updateInfo?.downloadUrl) {
      window.open(updateInfo.downloadUrl, '_blank');
    }
  };

  // Handle Install & Restart
  const handleInstallAndRestart = async () => {
    if (window.electronAPI?.installUpdate) {
      await window.electronAPI.installUpdate();
    }
  };

  // Format bytes to MB
  const formatMB = (bytes: number) => {
    return (bytes / (1024 * 1024)).toFixed(1);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#151722] border border-gray-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-[#11121b]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">Central de Atualizações</h2>
              <p className="text-xs text-gray-400">Sincronização automática para toda a equipe</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Version Status Card */}
          <div className="bg-[#1b1e2c] border border-gray-800 rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Versão Atual Instalada</span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-lg font-bold text-white font-mono">v{currentVersion}</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                  Ativa
                </span>
              </div>
            </div>

            {updateInfo?.version && (
              <div className="text-right">
                <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Nova Versão</span>
                <div className="flex items-center gap-2 mt-0.5 justify-end">
                  <span className="text-lg font-bold text-indigo-400 font-mono">v{updateInfo.version}</span>
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-bold">
                    Disponível
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* STATE 1: Idle or Not Checked */}
          {status === 'idle' && !updateInfo && (
            <div className="text-center py-4 space-y-3">
              <RotateCw size={36} className="text-gray-500 mx-auto" />
              <p className="text-sm text-gray-300">
                O LPP2 Studio verifica automaticamente novas atualizações ao iniciar.
              </p>
              <button
                onClick={handleCheckForUpdates}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center gap-2 mx-auto shadow-lg shadow-indigo-600/30"
              >
                <RefreshCw size={15} />
                Verificar Atualizações Agora
              </button>
            </div>
          )}

          {/* STATE 2: Checking */}
          {status === 'checking' && (
            <div className="text-center py-8 space-y-3">
              <RefreshCw size={36} className="text-indigo-400 animate-spin mx-auto" />
              <p className="text-sm text-white font-semibold">Verificando atualizações no GitHub...</p>
              <p className="text-xs text-gray-400">Consultando novas versões do repositório oficial.</p>
            </div>
          )}

          {/* STATE 3: Up to date */}
          {status === 'not-available' && (
            <div className="text-center py-5 space-y-3 bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-4">
              <CheckCircle size={36} className="text-emerald-400 mx-auto" />
              <div>
                <p className="text-sm font-bold text-white">Você já está na versão mais recente!</p>
                <p className="text-xs text-gray-400 mt-1">
                  Seus sócios e você estão sincronizados na versão <strong>v{currentVersion}</strong>.
                </p>
              </div>
              <button
                onClick={handleCheckForUpdates}
                className="px-3.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold transition inline-flex items-center gap-1.5"
              >
                <RefreshCw size={13} />
                Verificar Novamente
              </button>
            </div>
          )}

          {/* STATE 4: Update Available */}
          {status === 'available' && updateInfo && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-indigo-950/50 to-purple-950/30 border border-indigo-500/30 rounded-xl p-4 flex items-start gap-3">
                <Sparkles size={24} className="text-indigo-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-white">
                    Nova atualização v{updateInfo.version} disponível!
                  </h4>
                  <p className="text-xs text-gray-300 mt-1">
                    Baixe e instale com 1 clique para receber as novas melhorias automaticamente.
                  </p>
                </div>
              </div>

              {/* Release Notes */}
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5 block">
                  Novidades desta versão:
                </span>
                <div className="max-h-36 overflow-y-auto bg-black/40 border border-gray-800 rounded-xl p-3 text-xs text-gray-300 font-sans leading-relaxed whitespace-pre-wrap select-text">
                  {updateInfo.releaseNotes || 'Melhorias de desempenho e correções automáticas de bugs.'}
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={handleStartDownload}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm shadow-xl shadow-indigo-600/30 transition flex items-center justify-center gap-2"
              >
                <Download size={18} />
                Baixar e Atualizar Automaticamente
              </button>
            </div>
          )}

          {/* STATE 5: Downloading */}
          {status === 'downloading' && (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white flex items-center gap-2">
                  <Download size={16} className="text-indigo-400 animate-bounce" />
                  Baixando atualização v{updateInfo?.version || ''}...
                </span>
                <span className="font-mono font-bold text-indigo-400 text-sm">
                  {progress?.percent || 0}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden p-0.5 border border-gray-700">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all duration-300 shadow-md"
                  style={{ width: `${Math.min(100, Math.max(2, progress?.percent || 0))}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-gray-400">
                <span>
                  {progress && progress.total > 0
                    ? `${formatMB(progress.transferred)} MB / ${formatMB(progress.total)} MB`
                    : 'Preparando download...'}
                </span>
                {progress && progress.bytesPerSecond > 0 && (
                  <span>{formatMB(progress.bytesPerSecond)} MB/s</span>
                )}
              </div>
            </div>
          )}

          {/* STATE 6: Downloaded and Ready */}
          {status === 'downloaded' && (
            <div className="text-center py-4 space-y-4 bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-5">
              <ShieldCheck size={42} className="text-emerald-400 mx-auto" />
              <div>
                <h4 className="text-base font-bold text-white">Atualização pronta para instalação!</h4>
                <p className="text-xs text-gray-300 mt-1">
                  O aplicativo será reiniciado para aplicar a versão <strong>v{updateInfo?.version || ''}</strong>.
                </p>
              </div>

              <button
                onClick={handleInstallAndRestart}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-xl shadow-emerald-600/30 transition flex items-center justify-center gap-2"
              >
                <RotateCw size={18} />
                Reiniciar e Atualizar Agora
              </button>
            </div>
          )}

          {/* STATE 7: Error */}
          {status === 'error' && (
            <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-xs">
                <AlertTriangle size={16} />
                <span>Não foi possível concluir a atualização</span>
              </div>
              <p className="text-xs text-gray-300">{errorMessage}</p>
              <div className="pt-2 flex items-center gap-2">
                <button
                  onClick={handleCheckForUpdates}
                  className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-white transition"
                >
                  Tentar Novamente
                </button>
                {updateInfo?.downloadUrl && (
                  <button
                    onClick={() => {
                      if (window.electronAPI?.openExternalUrl) {
                        window.electronAPI.openExternalUrl(updateInfo.downloadUrl!);
                      } else {
                        window.open(updateInfo.downloadUrl, '_blank');
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-xs font-semibold text-indigo-300 transition flex items-center gap-1.5"
                  >
                    <ExternalLink size={12} />
                    Baixar Manualmente no GitHub
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Partner Notice Explainer */}
          <div className="bg-[#101118] border border-gray-800/80 rounded-xl p-3.5 text-xs text-gray-400 flex items-start gap-2.5">
            <span className="text-base">🤝</span>
            <div>
              <p className="font-semibold text-gray-300">Como funciona para os sócios:</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400">
                Você nunca mais precisará reenviar arquivos pesados manualmente. Sempre que uma nova versão do LPP2 Studio for publicada no GitHub, o software de todos os seus sócios receberá e aplicará as atualizações automaticamente!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
