
-- The public_promo_codes view needs to work for anon users on signup.
-- Change it to security_invoker = false so it uses the view owner's permissions,
-- not the caller's. This is safe because the view only exposes non-sensitive columns.
CREATE OR REPLACE VIEW public.public_promo_codes
WITH (security_invoker = false)
AS SELECT id, code, discount_percent, is_active
FROM public.promo_codes
WHERE is_active = true;

GRANT SELECT ON public.public_promo_codes TO anon, authenticated;
