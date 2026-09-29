-- =============================================================
-- Subscription plans catalog (admin-configurable; no hardcoding).
-- =============================================================

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  description        TEXT,
  price_display      TEXT NOT NULL DEFAULT 'Liên hệ',
  price_monthly_vnd  INTEGER NOT NULL DEFAULT 0 CHECK (price_monthly_vnd >= 0),
  storage_limit_bytes BIGINT,
  documents_limit    INTEGER,
  features           JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_active_sort
  ON public.subscription_plans (is_active, sort_order, name);

COMMENT ON TABLE public.subscription_plans IS
  'Product plan catalog managed by admins (Plus/Premium etc).';

CREATE OR REPLACE FUNCTION public.touch_subscription_plans_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscription_plans_updated_at ON public.subscription_plans;
CREATE TRIGGER trg_subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW
  EXECUTE PROCEDURE public.touch_subscription_plans_updated_at();

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- Authenticated users may read active plans (Settings upgrade tab).
DROP POLICY IF EXISTS "users_read_active_plans" ON public.subscription_plans;
CREATE POLICY "users_read_active_plans" ON public.subscription_plans
  FOR SELECT
  USING (is_active = true);

-- Admins manage the full catalog via service role in API (or is_admin()).
DROP POLICY IF EXISTS "admins_manage_plans" ON public.subscription_plans;
CREATE POLICY "admins_manage_plans" ON public.subscription_plans
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Seed defaults (idempotent by slug).
INSERT INTO public.subscription_plans (
  slug, name, description, price_display, price_monthly_vnd,
  storage_limit_bytes, documents_limit, features, sort_order, is_active
)
VALUES
  (
    'free',
    'Free',
    'Gói mặc định cho mọi tài khoản mới',
    'Miễn phí',
    0,
    5368709120,
    200,
    '["Kho tài liệu cơ bản","Chat RAG","OCR ảnh"]'::jsonb,
    10,
    true
  ),
  (
    'plus',
    'Plus',
    'Phù hợp học tập / làm việc cá nhân nâng cao',
    'Liên hệ',
    0,
    21474836480,
    1000,
    '["Mọi tính năng Free","Hạn mức lưu trữ lớn hơn","Ưu tiên hỗ trợ"]'::jsonb,
    20,
    true
  ),
  (
    'premium',
    'Premium',
    'Cho tổ chức / lớp học / triển khai chuyên sâu',
    'Liên hệ',
    0,
    107374182400,
    5000,
    '["Mọi tính năng Plus","Hạn mức cao","Tư vấn triển khai"]'::jsonb,
    30,
    true
  )
ON CONFLICT (slug) DO NOTHING;
