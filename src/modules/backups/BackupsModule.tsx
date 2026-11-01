import React, { useState } from 'react';
import { useSocket } from '../../context/SocketContext';
import type { GameBackup } from '../../types';
import {
  Package,
  Upload,
  Download,
  Calendar,
  User,
  FileArchive,
  Search,
  Plus,
  CheckCircle,
  FileCode,
  Tag
} from 'lucide-react';

export const BackupsModule: React.FC = () => {
  const { backups, addBackup, sendMessage } = useSocket();

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Backup form state
  const [version, setVersion] = useState('v0.2.0-alpha');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [fileData, setFileData] = useState<string | null>(null);

  const filteredBackups = backups.filter(
    (b) =>
      b.version.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.notes.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    setFileSize(`${sizeMb} MB`);

    const reader = new FileReader();
    reader.onload = () => {
      setFileData(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCreateBackup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !version.trim()) return;

    const newBackup: Partial<GameBackup> = {
      version: version.trim(),
      title: title.trim(),
      notes: notes.trim(),
      fileName: fileName || `LPP2_Build_${version.trim()}.zip`,
      size: fileSize || '15.4 MB',
      fileData: fileData || undefined
    };

    addBackup(newBackup);

    // Notify team in general chat
    sendMessage(
      `🚀 Nova build do jogo publicada: **${version.trim()} - ${title.trim()}**! Verifique a aba de Backups para baixar e testar.`,
      'geral'
    );

    setIsModalOpen(false);
    setTitle('');
    setNotes('');
    setFileName('');
    setFileData(null);
  };

  const handleDownload = (backup: GameBackup) => {
    if (backup.fileData) {
      const a = document.createElement('a');
      a.href = backup.fileData;
      a.download = backup.fileName;
      a.click();
    } else {
      const blob = new Blob([
        `Pacote LPP2 - Build: ${backup.title}\nVersão: ${backup.version}\nAutor: ${backup.author}\nData: ${backup.date}\n\nChangelog:\n${backup.notes}`
      ], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${backup.fileName}_info.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="flex w-full h-full bg-[#151620] text-gray-200 overflow-hidden flex-col select-none">
      {/* Top Header */}
      <div className="h-16 px-8 border-b border-gray-800 bg-[#12131b] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Package size={22} />
          </div>
          <div>
            <h2 className="text-base font-bold text-white leading-tight">Backups & Releases do Jogo</h2>
            <p className="text-xs text-gray-400">Gerenciador de versões, builds e histórico de atualizações</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar versão ou nota..."
              className="pl-9 pr-3 py-1.5 rounded-xl bg-gray-900 border border-gray-700 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 w-56"
            />
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 transition"
          >
            <Plus size={15} />
            Publicar Nova Build
          </button>
        </div>
      </div>

      {/* Main Backups List */}
      <div className="flex-1 overflow-y-auto p-8 space-y-4">
        {filteredBackups.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 space-y-3">
            <FileArchive size={52} className="text-gray-600" />
            <p className="text-base font-semibold text-gray-300">Nenhum backup encontrado</p>
            <p className="text-xs max-w-sm">Publique uma nova versão do jogo compactada (.zip, .exe) para compartilhar com a equipe de sócios.</p>
          </div>
        ) : (
          filteredBackups.map((b) => (
            <div
              key={b.id}
              className="bg-[#1c1d28] border border-gray-800 hover:border-gray-700/80 rounded-2xl p-6 transition shadow-lg group flex flex-col md:flex-row md:items-center justify-between gap-6"
            >
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 font-mono font-bold text-xs flex items-center gap-1">
                    <Tag size={12} /> {b.version}
                  </span>
                  <h3 className="text-base font-bold text-white">{b.title}</h3>
                </div>

                <p className="text-sm text-gray-300 whitespace-pre-line leading-relaxed">
                  {b.notes}
                </p>

                <div className="flex items-center gap-5 text-xs text-gray-400 pt-1">
                  <span className="flex items-center gap-1.5">
                    <User size={13} className="text-indigo-400" /> {b.author}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar size={13} className="text-gray-500" /> {b.date}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <FileCode size={13} className="text-emerald-400" /> {b.fileName} ({b.size})
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => handleDownload(b)}
                  className="px-5 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-semibold text-xs flex items-center gap-2 border border-gray-700 transition shadow"
                >
                  <Download size={15} />
                  Baixar Build ({b.size})
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Upload New Backup Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-[#1a1b26] border border-gray-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-[#14151f]">
              <div className="flex items-center gap-2">
                <Package size={20} className="text-indigo-400" />
                <h3 className="text-base font-bold text-white">Publicar Nova Atualização / Backup</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white text-xs font-semibold"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleCreateBackup} className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                    Versão
                  </label>
                  <input
                    type="text"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder="v0.2.0"
                    required
                    className="w-full px-3 py-2 rounded-xl bg-gray-900 border border-gray-700 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                    Título do Release
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex: Novo Sistema de Inventário e Combate"
                    required
                    className="w-full px-3 py-2 rounded-xl bg-gray-900 border border-gray-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Notas de Atualização (Changelog)
                </label>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="• Adicionado suporte a controle&#10;• Corrigido bug de colisão no boss&#10;• Novos sprites de ataque adicionados"
                  required
                  className="w-full px-3 py-2 rounded-xl bg-gray-900 border border-gray-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Anexar Arquivo de Build (.zip, .exe, .rar)
                </label>
                <div className="border-2 border-dashed border-gray-700 hover:border-indigo-500 rounded-xl p-4 text-center cursor-pointer transition bg-gray-900/50 relative">
                  <input
                    type="file"
                    onChange={handleFileSelect}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <Upload size={24} className="mx-auto text-gray-500 mb-1.5" />
                  <p className="text-xs font-semibold text-gray-300">
                    {fileName ? fileName : 'Clique para selecionar o arquivo da build'}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {fileSize ? `Tamanho: ${fileSize}` : 'Zip, Executável ou Pacote de Assets'}
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:bg-gray-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 transition"
                >
                  <CheckCircle size={14} /> Salvar & Publicar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
