-- Independent AI quota only. Run once in CloudBase PostgreSQL SQL editor.
CREATE TABLE IF NOT EXISTS public.shiri_ai_usage(uid text NOT NULL, day date NOT NULL, calls integer NOT NULL DEFAULT 0, tokens integer NOT NULL DEFAULT 0, PRIMARY KEY(uid,day));
ALTER TABLE public.shiri_ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shiri_ai_usage FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.shiri_ai_reserve(p_uid text,p_tokens integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE d date := (now() AT TIME ZONE 'Asia/Shanghai')::date; u public.shiri_ai_usage;
BEGIN
 IF p_uid IS NULL OR length(p_uid)>128 OR p_tokens<1 OR p_tokens>17000 THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(731462912);
 IF coalesce((SELECT sum(tokens) FROM public.shiri_ai_usage),0)+p_tokens>900000 THEN RETURN false; END IF;
 INSERT INTO public.shiri_ai_usage(uid,day) VALUES(p_uid,d) ON CONFLICT DO NOTHING;
 SELECT * INTO u FROM public.shiri_ai_usage WHERE uid=p_uid AND day=d FOR UPDATE;
 IF u.calls>=10 OR u.tokens+p_tokens>100000 THEN RETURN false; END IF;
 UPDATE public.shiri_ai_usage SET calls=calls+1,tokens=tokens+p_tokens WHERE uid=p_uid AND day=d;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.shiri_ai_reserve(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shiri_ai_reserve(text,integer) TO service_role;
