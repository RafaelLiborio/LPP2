-- ============================================================
-- SCRIPT DE CRIAÇÃO DO BANCO SUPABASE - PROJETO LPP2 HUB
-- Cole este script no SQL Editor do seu projeto Supabase e clique em RUN
-- ============================================================

-- 1. TABELA DE PERFIS DE USUÁRIOS
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT NOT NULL,
  avatar TEXT DEFAULT '🎮',
  role TEXT DEFAULT 'Programador',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Perfis são públicos para leitura" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Usuários podem atualizar seus próprios perfis" ON public.profiles FOR ALL USING (auth.uid() = id);

-- 2. TABELA DE MENSAGENS DO CHAT (DISCORD)
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id TEXT NOT NULL DEFAULT 'geral',
  user_id TEXT,
  username TEXT NOT NULL,
  avatar TEXT DEFAULT '🎮',
  content TEXT NOT NULL,
  file_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos podem ler mensagens" ON public.messages FOR SELECT USING (true);
CREATE POLICY "Todos podem inserir mensagens" ON public.messages FOR INSERT WITH CHECK (true);

-- 3. TABELA DO QUADRO BRANCO COMPARTILHADO (FIGMA)
CREATE TABLE IF NOT EXISTS public.whiteboard_elements (
  id TEXT PRIMARY KEY,
  element_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.whiteboard_elements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos podem ler o quadro" ON public.whiteboard_elements FOR SELECT USING (true);
CREATE POLICY "Todos podem desenhar no quadro" ON public.whiteboard_elements FOR INSERT WITH CHECK (true);
CREATE POLICY "Todos podem atualizar o quadro" ON public.whiteboard_elements FOR UPDATE USING (true);
CREATE POLICY "Todos podem limpar elementos" ON public.whiteboard_elements FOR DELETE USING (true);

-- 4. TABELA DE BACKUPS E BUILDS DO JOGO
CREATE TABLE IF NOT EXISTS public.game_backups (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT NOT NULL,
  author TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size TEXT NOT NULL,
  file_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.game_backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos podem ver os backups" ON public.game_backups FOR SELECT USING (true);
CREATE POLICY "Todos podem publicar backups" ON public.game_backups FOR INSERT WITH CHECK (true);

-- 5. HABILITAR SINCRONIZAÇÃO EM TEMPO REAL (REALTIME)
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whiteboard_elements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_backups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- 6. CRIAR BUCKET DE ARMAZENAMENTO PARA BUILDS E ASSETS (Storage)
INSERT INTO storage.buckets (id, name, public)
VALUES ('game-backups', 'game-backups', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Acesso público ao bucket game-backups" ON storage.objects
FOR ALL USING (bucket_id = 'game-backups')
WITH CHECK (bucket_id = 'game-backups');
