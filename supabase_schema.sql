-- LPP2 Hub schema. Safe to rerun in the Supabase SQL Editor.
-- This script replaces the old public-access policies with authenticated team access.

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users (id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '🎮',
  role TEXT NOT NULL DEFAULT 'Programador',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id TEXT NOT NULL DEFAULT 'geral',
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '🎮',
  content TEXT NOT NULL DEFAULT '',
  file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.whiteboard_elements (
  id TEXT PRIMARY KEY,
  element_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.game_backups (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL,
  user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_size TEXT NOT NULL,
  file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.game_backups ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS game_backups_user_id_idx ON public.game_backups (user_id);

-- Only addresses explicitly approved by the project owner may create accounts.
CREATE TABLE IF NOT EXISTS public.lpp2_allowed_emails (
  email TEXT PRIMARY KEY CHECK (email = lower(btrim(email))),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.lpp2_allowed_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lpp2_allowed_emails FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.lpp2_require_allowed_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.lpp2_allowed_emails
    WHERE email = lower(btrim(NEW.email))
  ) THEN
    RAISE EXCEPTION 'Este e-mail ainda não foi autorizado pela equipe.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.lpp2_require_allowed_email() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS lpp2_require_allowed_email ON auth.users;
CREATE TRIGGER lpp2_require_allowed_email
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.lpp2_require_allowed_email();

CREATE OR REPLACE FUNCTION public.lpp2_is_allowed_member()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lpp2_allowed_emails
    WHERE email = lower(btrim(auth.jwt() ->> 'email'))
  );
$$;
REVOKE ALL ON FUNCTION public.lpp2_is_allowed_member() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lpp2_is_allowed_member() TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whiteboard_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Perfis são públicos para leitura" ON public.profiles;
DROP POLICY IF EXISTS "Usuários podem atualizar seus próprios perfis" ON public.profiles;
DROP POLICY IF EXISTS "lpp2_profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "lpp2_profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "lpp2_profiles_update_own" ON public.profiles;
CREATE POLICY "lpp2_profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated USING ((SELECT public.lpp2_is_allowed_member()) AND (SELECT auth.uid()) = id);
CREATE POLICY "lpp2_profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.lpp2_is_allowed_member()) AND (SELECT auth.uid()) = id);
CREATE POLICY "lpp2_profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING ((SELECT public.lpp2_is_allowed_member()) AND (SELECT auth.uid()) = id) WITH CHECK ((SELECT public.lpp2_is_allowed_member()) AND (SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Todos podem ler mensagens" ON public.messages;
DROP POLICY IF EXISTS "Todos podem inserir mensagens" ON public.messages;
DROP POLICY IF EXISTS "lpp2_messages_select_team" ON public.messages;
DROP POLICY IF EXISTS "lpp2_messages_insert_self" ON public.messages;
CREATE POLICY "lpp2_messages_select_team" ON public.messages
  FOR SELECT TO authenticated USING ((SELECT public.lpp2_is_allowed_member()));
CREATE POLICY "lpp2_messages_insert_self" ON public.messages
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.lpp2_is_allowed_member()) AND user_id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "Todos podem ler o quadro" ON public.whiteboard_elements;
DROP POLICY IF EXISTS "Todos podem desenhar no quadro" ON public.whiteboard_elements;
DROP POLICY IF EXISTS "Todos podem atualizar o quadro" ON public.whiteboard_elements;
DROP POLICY IF EXISTS "Todos podem limpar elementos" ON public.whiteboard_elements;
DROP POLICY IF EXISTS "lpp2_whiteboard_select_team" ON public.whiteboard_elements;
DROP POLICY IF EXISTS "lpp2_whiteboard_insert_team" ON public.whiteboard_elements;
DROP POLICY IF EXISTS "lpp2_whiteboard_delete_team" ON public.whiteboard_elements;
CREATE POLICY "lpp2_whiteboard_select_team" ON public.whiteboard_elements
  FOR SELECT TO authenticated USING ((SELECT public.lpp2_is_allowed_member()));
CREATE POLICY "lpp2_whiteboard_insert_team" ON public.whiteboard_elements
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.lpp2_is_allowed_member()));
CREATE POLICY "lpp2_whiteboard_delete_team" ON public.whiteboard_elements
  FOR DELETE TO authenticated USING ((SELECT public.lpp2_is_allowed_member()));

DROP POLICY IF EXISTS "Todos podem ver os backups" ON public.game_backups;
DROP POLICY IF EXISTS "Todos podem publicar backups" ON public.game_backups;
DROP POLICY IF EXISTS "lpp2_backups_select_team" ON public.game_backups;
DROP POLICY IF EXISTS "lpp2_backups_insert_self" ON public.game_backups;
CREATE POLICY "lpp2_backups_select_team" ON public.game_backups
  FOR SELECT TO authenticated USING ((SELECT public.lpp2_is_allowed_member()));
CREATE POLICY "lpp2_backups_insert_self" ON public.game_backups
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.lpp2_is_allowed_member()) AND (SELECT auth.uid()) = user_id);

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('lpp2-files', 'lpp2-files', false, 52428800)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 52428800;

DROP POLICY IF EXISTS "Acesso público ao bucket game-backups" ON storage.objects;
DROP POLICY IF EXISTS "lpp2_files_select_team" ON storage.objects;
DROP POLICY IF EXISTS "lpp2_files_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "lpp2_files_delete_own" ON storage.objects;
CREATE POLICY "lpp2_files_select_team" ON storage.objects
  FOR SELECT TO authenticated USING ((SELECT public.lpp2_is_allowed_member()) AND bucket_id = 'lpp2-files');
CREATE POLICY "lpp2_files_insert_own" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    (SELECT public.lpp2_is_allowed_member()) AND bucket_id = 'lpp2-files' AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  );
CREATE POLICY "lpp2_files_delete_own" ON storage.objects
  FOR DELETE TO authenticated USING (
    (SELECT public.lpp2_is_allowed_member()) AND bucket_id = 'lpp2-files' AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  );
UPDATE storage.buckets SET public = false WHERE id = 'game-backups';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'whiteboard_elements') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whiteboard_elements;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'game_backups') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.game_backups;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;
