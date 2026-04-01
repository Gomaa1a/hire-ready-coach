
-- Remove the anon policy that exposes sensitive data
DROP POLICY IF EXISTS "Anon can read active promo codes" ON public.promo_codes;

-- Drop the view (we'll use an RPC instead)
DROP VIEW IF EXISTS public.public_promo_codes;

-- Create a secure function for public promo code lookups
CREATE OR REPLACE FUNCTION public.lookup_promo_code(_code text)
RETURNS TABLE(id uuid, code text, discount_percent numeric, is_active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.code, p.discount_percent, p.is_active
  FROM public.promo_codes p
  WHERE p.code = upper(trim(_code))
    AND p.is_active = true
  LIMIT 1;
$$;
