-- =============================================================
-- Folder shares: cascade to nested subfolders (ancestor share).
-- Chat/browse of a shared root includes the full subtree.
-- =============================================================

-- True if this folder, or any ancestor, is shared with auth.uid().
CREATE OR REPLACE FUNCTION public.has_folder_share(p_folder_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  current_id UUID := p_folder_id;
  parent UUID;
BEGIN
  IF p_folder_id IS NULL OR auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  WHILE current_id IS NOT NULL LOOP
    IF EXISTS (
      SELECT 1 FROM public.folder_shares
      WHERE folder_id = current_id AND grantee_id = auth.uid()
    ) THEN
      RETURN TRUE;
    END IF;

    SELECT f.parent_id INTO parent
    FROM public.folders f
    WHERE f.id = current_id;

    -- Missing folder or cycle guard
    IF NOT FOUND THEN
      RETURN FALSE;
    END IF;

    current_id := parent;
  END LOOP;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Document readable via share if its folder (or an ancestor folder) is shared.
CREATE OR REPLACE FUNCTION public.can_read_document_via_folder_share(p_document_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.documents d
    WHERE d.id = p_document_id
      AND d.folder_id IS NOT NULL
      AND d.deleted_at IS NULL
      AND public.has_folder_share(d.folder_id)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Keep can_read_folder in sync (owner OR share on this/ancestor).
CREATE OR REPLACE FUNCTION public.can_read_folder(p_folder_id UUID)
RETURNS BOOLEAN AS $$
  SELECT public.is_folder_owner(p_folder_id) OR public.has_folder_share(p_folder_id);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;
