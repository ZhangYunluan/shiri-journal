-- Additive: requires 004. Does not replace comments, friendship, grants or media policies.
BEGIN;
CREATE TABLE IF NOT EXISTS public.shiri_moment_likes (
 record_id uuid NOT NULL REFERENCES public.shiri_records(id) ON DELETE CASCADE,
 user_id text NOT NULL REFERENCES public.shiri_profiles(user_id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(record_id,user_id)
);
ALTER TABLE public.shiri_moment_likes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shiri_moment_likes FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS shiri_private.like_limits (
 user_id text PRIMARY KEY,minute_start timestamptz NOT NULL,minute_count integer NOT NULL,
 day date NOT NULL,day_count integer NOT NULL
);
REVOKE ALL ON shiri_private.like_limits FROM PUBLIC,anon,authenticated;

-- Internal aggregate filter only. Not callable by clients with another user's identity.
CREATE OR REPLACE FUNCTION shiri_private.interaction_allowed(key uuid,viewer text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.shiri_records r WHERE r.id=key AND r.shared AND
 (r.owner_id=viewer OR(shiri_private.friends(r.owner_id,viewer) AND EXISTS(
 SELECT 1 FROM public.shiri_grants g WHERE g.owner_id=r.owner_id AND g.viewer_id=viewer
 AND(g.scope='all' OR(g.scope='shared' AND r.kind='shared') OR(g.scope='categories' AND r.category_id=ANY(g.categories)))
 AND(g.since_date IS NULL OR r.record_date>=g.since_date)
 AND(g.history_days=0 OR r.record_date>=(now() AT TIME ZONE 'Asia/Shanghai')::date-g.history_days)))))
$$;
REVOKE ALL ON FUNCTION shiri_private.interaction_allowed(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.shiri_interactions(p_action text,p_payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 u text:=auth.uid();key uuid;owner_key text;wanted boolean;present boolean;
 limits shiri_private.like_limits%ROWTYPE;today date:=(now() AT TIME ZONE 'Asia/Shanghai')::date;
 result jsonb:='[]'::jsonb;row_data jsonb;like_count integer;comment_count integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR u IS NULL OR u='anon' OR char_length(u)>64
 THEN RAISE EXCEPTION '请先登录' USING ERRCODE='42501';END IF;
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>5000
 THEN RAISE EXCEPTION '互动请求格式无效' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN('ids','recordId','liked'))
 THEN RAISE EXCEPTION '互动请求包含未知字段' USING ERRCODE='22023';END IF;
 IF p_action='capabilities' THEN RETURN jsonb_build_object('version',1);END IF;
 IF p_action='set_like' THEN
  IF jsonb_typeof(p_payload->'recordId') IS DISTINCT FROM 'string' OR jsonb_typeof(p_payload->'liked') IS DISTINCT FROM 'boolean'
  THEN RAISE EXCEPTION '点赞格式无效' USING ERRCODE='22023';END IF;
  key:=(p_payload->>'recordId')::uuid;wanted:=(p_payload->>'liked')::boolean;
  SELECT owner_id INTO owner_key FROM public.shiri_records WHERE id=key;
  IF owner_key IS NULL THEN RAISE EXCEPTION '没有片刻访问权限' USING ERRCODE='42501';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('shiri:user:'||least(u,owner_key),0));
  IF u<>owner_key THEN PERFORM pg_advisory_xact_lock(hashtextextended('shiri:user:'||greatest(u,owner_key),0));END IF;
  IF NOT shiri_private.interaction_allowed(key,u) THEN RAISE EXCEPTION '没有互动权限' USING ERRCODE='42501';END IF;
  SELECT EXISTS(SELECT 1 FROM public.shiri_moment_likes WHERE record_id=key AND user_id=u) INTO present;
  IF present IS DISTINCT FROM wanted THEN
   SELECT * INTO limits FROM shiri_private.like_limits WHERE user_id=u;
   IF FOUND AND((limits.minute_start>now()-interval '1 minute' AND limits.minute_count>=60) OR(limits.day=today AND limits.day_count>=500))
   THEN RAISE EXCEPTION '操作过于频繁，请稍后再试' USING ERRCODE='P0001';END IF;
   INSERT INTO shiri_private.like_limits VALUES(u,now(),1,today,1) ON CONFLICT(user_id) DO UPDATE SET
    minute_start=CASE WHEN like_limits.minute_start>now()-interval '1 minute' THEN like_limits.minute_start ELSE now() END,
    minute_count=CASE WHEN like_limits.minute_start>now()-interval '1 minute' THEN like_limits.minute_count+1 ELSE 1 END,
    day=today,day_count=CASE WHEN like_limits.day=today THEN like_limits.day_count+1 ELSE 1 END;
   IF wanted THEN INSERT INTO public.shiri_moment_likes(record_id,user_id) VALUES(key,u) ON CONFLICT DO NOTHING;
   ELSE DELETE FROM public.shiri_moment_likes WHERE record_id=key AND user_id=u;END IF;
  END IF;
  p_payload:=jsonb_build_object('ids',jsonb_build_array(key));
 ELSIF p_action<>'summary' THEN RAISE EXCEPTION '未知互动操作' USING ERRCODE='22023';END IF;
 IF jsonb_typeof(p_payload->'ids') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION '片刻列表格式无效' USING ERRCODE='22023';END IF;
 IF jsonb_array_length(p_payload->'ids')>50 THEN RAISE EXCEPTION '一次最多查询 50 条片刻' USING ERRCODE='22023';END IF;
 FOR row_data IN SELECT value FROM jsonb_array_elements(p_payload->'ids') LOOP
  IF jsonb_typeof(row_data)<>'string' THEN RAISE EXCEPTION '片刻编号格式无效' USING ERRCODE='22023';END IF;
  key:=(row_data#>>'{}')::uuid;
  IF NOT shiri_private.interaction_allowed(key,u) THEN RAISE EXCEPTION '没有互动访问权限' USING ERRCODE='42501';END IF;
  SELECT count(*)::int INTO like_count FROM public.shiri_moment_likes l WHERE l.record_id=key AND shiri_private.interaction_allowed(key,l.user_id);
  SELECT count(*)::int INTO comment_count FROM public.shiri_moment_comments c WHERE c.record_id=key AND shiri_private.comment_access(key,c.participant_id);
  SELECT EXISTS(SELECT 1 FROM public.shiri_moment_likes WHERE record_id=key AND user_id=u) INTO present;
  result:=result||jsonb_build_array(jsonb_build_object('id',key,'likes',like_count,'liked',present,'comments',comment_count));
 END LOOP;
 RETURN jsonb_build_object('records',result);
END $$;
REVOKE ALL ON FUNCTION public.shiri_interactions(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.shiri_interactions(text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
