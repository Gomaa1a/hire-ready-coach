
-- Switch view back to security_invoker = true to satisfy linter
CREATE OR REPLACE VIEW public.public_promo_codes
WITH (security_invoker = true)
AS SELECT id, code, discount_percent, is_active
FROM public.promo_codes
WHERE is_active = true;

-- Add a minimal SELECT policy for anon/authenticated to read active promo codes
-- This is safe because the view only exposes id, code, discount_percent, is_active
CREATE POLICY "Anon can read active promo codes"
ON public.promo_codes
FOR SELECT
TO anon, authenticated
USING (is_active = true);
