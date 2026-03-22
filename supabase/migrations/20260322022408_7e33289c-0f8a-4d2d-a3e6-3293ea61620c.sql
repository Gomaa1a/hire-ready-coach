
CREATE OR REPLACE VIEW public.platform_stats AS
SELECT
  (SELECT count(*) FROM public.profiles) AS total_users,
  (SELECT count(*) FROM public.interviews) AS total_interviews;

GRANT SELECT ON public.platform_stats TO anon, authenticated;
