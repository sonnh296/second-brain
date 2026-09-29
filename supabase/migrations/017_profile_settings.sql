-- =============================================================
-- Profile settings: display name, avatar, personalization consent.
-- =============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_r2_key TEXT,
  ADD COLUMN IF NOT EXISTS personalization_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS personalization_consent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.display_name IS 'Optional display name shown in UI (login username stays separate).';
COMMENT ON COLUMN public.profiles.avatar_r2_key IS 'R2 object key for profile avatar image.';
COMMENT ON COLUMN public.profiles.personalization_enabled IS 'User opt-in for academic preference memory in chat.';
COMMENT ON COLUMN public.profiles.personalization_consent_at IS 'When the user last consented to personalization.';

-- Users may update their own profile row (API still whitelists columns).
DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Prevent privilege / identity tampering via client updates.
CREATE OR REPLACE FUNCTION public.protect_profile_immutable_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.id := OLD.id;
  NEW.username := OLD.username;
  NEW.role := OLD.role;
  NEW.created_at := OLD.created_at;
  NEW.disabled_at := OLD.disabled_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_immutable ON public.profiles;
CREATE TRIGGER trg_protect_profile_immutable
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.protect_profile_immutable_columns();
