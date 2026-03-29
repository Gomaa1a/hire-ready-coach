CREATE TABLE public.negotiation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid REFERENCES public.interviews(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  ended_at timestamp with time zone,
  assertiveness_score integer,
  professionalism_score integer,
  outcome text,
  tips jsonb
);

ALTER TABLE public.negotiation_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own negotiation sessions"
ON public.negotiation_sessions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own negotiation sessions"
ON public.negotiation_sessions FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can view own negotiation sessions"
ON public.negotiation_sessions FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all negotiation sessions"
ON public.negotiation_sessions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));