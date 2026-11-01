import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Get credentials from localStorage or Vite env
const getSavedUrl = () => localStorage.getItem('lpp2_supabase_url') || import.meta.env.VITE_SUPABASE_URL || '';
const getSavedKey = () => localStorage.getItem('lpp2_supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let client: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient | null => {
  const url = getSavedUrl();
  const key = getSavedKey();

  if (!url || !key) {
    return null;
  }

  if (!client) {
    client = createClient(url, key);
  }
  return client;
};

export const updateSupabaseCredentials = (url: string, key: string) => {
  localStorage.setItem('lpp2_supabase_url', url);
  localStorage.setItem('lpp2_supabase_anon_key', key);
  client = createClient(url, key);
};

export const isSupabaseConfigured = () => {
  return Boolean(getSavedUrl() && getSavedKey());
};
