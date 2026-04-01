
-- 1. Remove the direct SELECT policy on promo_codes (the safe view is already in use)
DROP POLICY IF EXISTS "Anyone can read active promo codes" ON public.promo_codes;

-- Add admin-only SELECT policy for promo_codes management
CREATE POLICY "Admins can view all promo codes"
ON public.promo_codes
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 2. Add SELECT policies for referral_signups
CREATE POLICY "Users can view own referrals"
ON public.referral_signups
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all referrals"
ON public.referral_signups
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
