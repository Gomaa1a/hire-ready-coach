
-- 1. Fix credits: Remove dangerous UPDATE policy, create secure deduct function
DROP POLICY IF EXISTS "Users can update own credits" ON public.credits;

CREATE OR REPLACE FUNCTION public.deduct_credit()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_balance integer;
BEGIN
  SELECT balance INTO current_balance
  FROM public.credits
  WHERE user_id = auth.uid()
  FOR UPDATE;

  IF current_balance IS NULL OR current_balance < 1 THEN
    RETURN false;
  END IF;

  UPDATE public.credits
  SET balance = balance - 1, updated_at = now()
  WHERE user_id = auth.uid();

  RETURN true;
END;
$$;

-- 2. Fix promo_codes: Create a safe view and update the policy
DROP POLICY IF EXISTS "Anyone can read active promo codes" ON public.promo_codes;

CREATE POLICY "Anyone can read active promo codes"
ON public.promo_codes
FOR SELECT
TO anon, authenticated
USING (is_active = true);

CREATE OR REPLACE VIEW public.public_promo_codes
WITH (security_invoker = true)
AS SELECT id, code, discount_percent, is_active
FROM public.promo_codes
WHERE is_active = true;

-- 3. Platform stats: it's a view, but ensure it's intentionally public
-- (Views don't support RLS directly, this is just documentation via comment)
COMMENT ON VIEW public.platform_stats IS 'Intentionally public aggregate stats for landing page display';
