-- =============================================================
-- Personal library: share folders (viewer) for browse + RAG chat.
-- Exact folder only (not nested). Docs stay owned by sharer.
-- =============================================================

CREATE TABLE IF NOT EXISTS folder_shares (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id    UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grantee_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission   TEXT NOT NULL DEFAULT 'viewer'
                 CHECK (permission IN ('viewer')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (folder_id, grantee_id),
  CONSTRAINT folder_shares_no_self CHECK (owner_id <> grantee_id)
);

CREATE INDEX IF NOT EXISTS idx_folder_shares_grantee
  ON folder_shares (grantee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_folder_shares_folder
  ON folder_shares (folder_id);

CREATE INDEX IF NOT EXISTS idx_folder_shares_owner
  ON folder_shares (owner_id);

-- ---------------------------------------------------------------
-- Helpers (SECURITY DEFINER — avoid RLS recursion)
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_folder_owner(p_folder_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.folders
    WHERE id = p_folder_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.has_folder_share(p_folder_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.folder_shares
    WHERE folder_id = p_folder_id AND grantee_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_read_folder(p_folder_id UUID)
RETURNS BOOLEAN AS $$
  SELECT public.is_folder_owner(p_folder_id) OR public.has_folder_share(p_folder_id);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_read_document_via_folder_share(p_document_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.documents d
    JOIN public.folder_shares s ON s.folder_id = d.folder_id
    WHERE d.id = p_document_id
      AND d.folder_id IS NOT NULL
      AND s.grantee_id = auth.uid()
      AND d.deleted_at IS NULL
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ---------------------------------------------------------------
-- folder_shares RLS
-- ---------------------------------------------------------------

ALTER TABLE folder_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "folder_shares_select" ON folder_shares;
CREATE POLICY "folder_shares_select" ON folder_shares
  FOR SELECT USING (
    owner_id = auth.uid() OR grantee_id = auth.uid()
  );

DROP POLICY IF EXISTS "folder_shares_insert" ON folder_shares;
CREATE POLICY "folder_shares_insert" ON folder_shares
  FOR INSERT WITH CHECK (
    owner_id = auth.uid()
    AND public.is_folder_owner(folder_id)
  );

DROP POLICY IF EXISTS "folder_shares_delete" ON folder_shares;
CREATE POLICY "folder_shares_delete" ON folder_shares
  FOR DELETE USING (
    owner_id = auth.uid() OR grantee_id = auth.uid()
  );

-- ---------------------------------------------------------------
-- folders: split ALL → owner writes + shared reads
-- ---------------------------------------------------------------

DROP POLICY IF EXISTS "user_owns_folders" ON folders;

DROP POLICY IF EXISTS "folders_select" ON folders;
CREATE POLICY "folders_select" ON folders
  FOR SELECT USING (
    user_id = auth.uid() OR public.has_folder_share(id)
  );

DROP POLICY IF EXISTS "folders_insert" ON folders;
CREATE POLICY "folders_insert" ON folders
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "folders_update" ON folders;
CREATE POLICY "folders_update" ON folders
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "folders_delete" ON folders;
CREATE POLICY "folders_delete" ON folders
  FOR DELETE USING (user_id = auth.uid());

-- ---------------------------------------------------------------
-- documents: owner full access; sharees read docs in shared folders
-- ---------------------------------------------------------------

DROP POLICY IF EXISTS "user_owns_documents" ON documents;

DROP POLICY IF EXISTS "documents_select" ON documents;
CREATE POLICY "documents_select" ON documents
  FOR SELECT USING (
    user_id = auth.uid()
    OR (
      folder_id IS NOT NULL
      AND public.has_folder_share(folder_id)
      AND deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "documents_insert" ON documents;
CREATE POLICY "documents_insert" ON documents
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "documents_update" ON documents;
CREATE POLICY "documents_update" ON documents
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "documents_delete" ON documents;
CREATE POLICY "documents_delete" ON documents
  FOR DELETE USING (user_id = auth.uid());

-- ---------------------------------------------------------------
-- chunks: sharees can read chunks of shared-folder docs (optional;
-- chat mainly uses Qdrant + service paths, but keep consistent)
-- ---------------------------------------------------------------

DROP POLICY IF EXISTS "user_owns_chunks" ON document_chunks;

DROP POLICY IF EXISTS "chunks_select" ON document_chunks;
CREATE POLICY "chunks_select" ON document_chunks
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.can_read_document_via_folder_share(document_id)
  );

DROP POLICY IF EXISTS "chunks_insert" ON document_chunks;
CREATE POLICY "chunks_insert" ON document_chunks
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "chunks_update" ON document_chunks;
CREATE POLICY "chunks_update" ON document_chunks
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "chunks_delete" ON document_chunks;
CREATE POLICY "chunks_delete" ON document_chunks
  FOR DELETE USING (user_id = auth.uid());

-- Grantees/owners may read peer usernames for share UI labels
DROP POLICY IF EXISTS "profiles_read_folder_share_peers" ON profiles;
CREATE POLICY "profiles_read_folder_share_peers" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.folder_shares s
      WHERE (s.owner_id = profiles.id AND s.grantee_id = auth.uid())
         OR (s.grantee_id = profiles.id AND s.owner_id = auth.uid())
    )
  );
