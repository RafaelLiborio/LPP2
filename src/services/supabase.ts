import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const FILES_BUCKET = 'lpp2-files';
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const getSavedUrl = () => localStorage.getItem('lpp2_supabase_url') || import.meta.env.VITE_SUPABASE_URL || '';
const getSavedKey = () => localStorage.getItem('lpp2_supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let client: SupabaseClient | null = null;
let clientConfig = '';

export const getSupabaseClient = (): SupabaseClient | null => {
  const url = getSavedUrl().replace(/\/$/, '');
  const key = getSavedKey();
  if (!url || !key) return null;

  const config = `${url}|${key}`;
  if (!client || clientConfig !== config) {
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    clientConfig = config;
  }
  return client;
};

export const updateSupabaseCredentials = (url: string, key: string) => {
  const normalizedUrl = url.trim().replace(/\/$/, '');
  if (!/^https:\/\/[\w.-]+\.supabase\.co$/i.test(normalizedUrl) || !key.trim()) {
    throw new Error('Informe uma URL HTTPS válida do Supabase e uma chave pública.');
  }
  localStorage.setItem('lpp2_supabase_url', normalizedUrl);
  localStorage.setItem('lpp2_supabase_anon_key', key.trim());
  client = null;
  clientConfig = '';
  getSupabaseClient();
};

export const isSupabaseConfigured = () => Boolean(getSavedUrl() && getSavedKey());

export const uploadProjectFile = async (file: File, category: 'chat' | 'backups'): Promise<string> => {
  if (file.size > MAX_FILE_SIZE) throw new Error('O arquivo excede o limite de 50 MB do projeto.');
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Configure o Supabase antes de enviar arquivos.');

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('Entre na sua conta antes de enviar arquivos.');

  const safeName = file.name.replace(/[^\w.-]/g, '_').slice(-120) || 'arquivo';
  const path = `${category}/${user.id}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from(FILES_BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false
  });
  if (error) throw new Error(`Falha no upload: ${error.message}`);
  return `storage:${path}`;
};

export const removeProjectFile = async (fileRef: string): Promise<void> => {
  if (!fileRef.startsWith('storage:')) return;
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const path = fileRef.slice('storage:'.length);
  const { error } = await supabase.storage.from(FILES_BUCKET).remove([path]);
  if (error) console.warn('Falha ao remover arquivo órfão do Storage:', error.message);
};

export const resolveProjectFileUrl = async (fileRef: string, downloadName?: string): Promise<string> => {
  if (!fileRef.startsWith('storage:')) return fileRef;
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Configure o Supabase para baixar este arquivo.');
  const { data, error } = await supabase.storage
    .from(FILES_BUCKET)
    .createSignedUrl(fileRef.slice('storage:'.length), 60 * 60, downloadName ? { download: downloadName } : undefined);
  if (error) throw new Error(`Falha ao gerar link para download: ${error.message}`);
  return data.signedUrl;
};

export const MAX_PROJECT_FILE_SIZE = MAX_FILE_SIZE;
