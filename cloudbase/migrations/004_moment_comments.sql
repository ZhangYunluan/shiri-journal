-- Additive, separate comments RPC. Does not replace shiri_social or photo policies.
-- Apply only after 001/002 are deployed, with the project owner's approval.
BEGIN;
CREATE TABLE IF NOT EXISTS public.shiri_moment_comments (
 id uuid PRIMARY KEY,
 record_id uuid NOT NULL REFERENCES public.shiri_records(id) ON DELETE CASCADE,
 owner_id text NOT NULL REFERENCES public.shiri_profiles(user_id),
 participant_id text NOT NULL REFERENCES public.shiri_profiles(user_id),
 author_id text NOT NULL REFERENCES public.shiri_profiles(user_id),
 body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 300),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(owner_id<>participant_id),CHECK(author_id IN(owner_id,participant_id))
);
CREATE INDEX IF NOT EXISTS shiri_comments_thread ON public.shiri_moment_comments(record_id,participant_id,created_at,id);
ALTER TABLE public.shiri_moment_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shiri_moment_comments FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS shiri_private.comment_limits (
 user_id text PRIMARY KEY,
 minute_start timestamptz NOT NULL,minute_count integer NOT NULL CHECK(minute_count>=0),
 day date NOT NULL,day_count integer NOT NULL CHECK(day_count>=0)
);
REVOKE ALL ON shiri_private.comment_limits FROM PUBLIC,anon,authenticated;

-- Unlike can_read(viewer=auth.uid()), an owner also needs to check the current
-- grant to the other thread participant. Same directional scope/history rules.
CREATE OR REPLACE FUNCTION shiri_private.comment_access(record_key uuid,participant text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.role()='authenticated' AND auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.shiri_records r WHERE r.id=record_key AND r.shared
   AND r.owner_id<>participant AND auth.uid() IN(r.owner_id,participant)
   AND shiri_private.friends(r.owner_id,participant)
   AND EXISTS(SELECT 1 FROM public.shiri_grants g WHERE g.owner_id=r.owner_id AND g.viewer_id=participant
    AND (g.scope='all' OR(g.scope='shared' AND r.kind='shared') OR(g.scope='categories' AND r.category_id=ANY(g.categories)))
    AND (g.since_date IS NULL OR r.record_date>=g.since_date)
    AND (g.history_days=0 OR r.record_date>=(now() AT TIME ZONE 'Asia/Shanghai')::date-g.history_days))
 )
$$;
REVOKE ALL ON FUNCTION shiri_private.comment_access(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION shiri_private.comment_access(uuid,text) TO authenticated;
DROP POLICY IF EXISTS shiri_comments_private_thread ON public.shiri_moment_comments;
CREATE POLICY shiri_comments_private_thread ON public.shiri_moment_comments FOR SELECT TO authenticated
 USING(shiri_private.comment_access(record_id,participant_id));
-- Direct table reads/writes remain revoked. Only the bounded authenticated RPC is exposed.
CREATE OR REPLACE FUNCTION public.shiri_comments(p_action text,p_payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 u text:=auth.uid();key uuid;participant text;content text;client_key uuid;item public.shiri_records%ROWTYPE;
 old public.shiri_moment_comments%ROWTYPE;limits shiri_private.comment_limits%ROWTYPE;
 results jsonb;skip integer;comment_time timestamptz;today date:=(now() AT TIME ZONE 'Asia/Shanghai')::date;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR u IS NULL OR u='anon' OR char_length(u)>64
 THEN RAISE EXCEPTION '请先登录' USING ERRCODE='42501';END IF;
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>6000
 THEN RAISE EXCEPTION '评论请求格式无效' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN('recordId','participantId','body','clientId','id','offset'))
 THEN RAISE EXCEPTION '评论请求包含未知字段' USING ERRCODE='22023';END IF;
 IF p_payload ? 'participantId' AND jsonb_typeof(p_payload->'participantId') IS DISTINCT FROM 'string'
 THEN RAISE EXCEPTION '评论参与者格式无效' USING ERRCODE='22023';END IF;
 IF p_action='capabilities' THEN RETURN jsonb_build_object('version',1,'maxLength',300);END IF;
 IF p_action='delete' THEN
  SELECT * INTO old FROM public.shiri_moment_comments WHERE id=(p_payload->>'id')::uuid;
  IF NOT FOUND OR u NOT IN(old.author_id,old.owner_id) THEN RAISE EXCEPTION '无权删除评论' USING ERRCODE='42501';END IF;
  DELETE FROM public.shiri_moment_comments WHERE id=old.id AND (author_id=u OR owner_id=u);
  RETURN jsonb_build_object('ok',true);
 END IF;
 key:=(p_payload->>'recordId')::uuid;
 SELECT * INTO item FROM public.shiri_records WHERE id=key;
 IF NOT FOUND THEN RAISE EXCEPTION '没有片刻访问权限' USING ERRCODE='42501';END IF;
 IF p_action='threads' THEN
  IF item.owner_id<>u THEN RAISE EXCEPTION '没有评论访问权限' USING ERRCODE='42501';END IF;
  SELECT coalesce(jsonb_agg(x ORDER BY x."lastAt" DESC),'[]'::jsonb) INTO results FROM(
   SELECT c.participant_id AS "participantId",p.nickname,count(*) AS count,max(c.created_at) AS "lastAt"
   FROM public.shiri_moment_comments c JOIN public.shiri_profiles p ON p.user_id=c.participant_id
   WHERE c.record_id=key AND shiri_private.comment_access(key,c.participant_id)
   GROUP BY c.participant_id,p.nickname ORDER BY max(c.created_at) DESC LIMIT 100
  ) x;
  RETURN jsonb_build_object('threads',results);
 END IF;
 participant:=CASE WHEN item.owner_id=u THEN p_payload->>'participantId' ELSE u END;
 IF item.owner_id=u AND participant IS NULL THEN RAISE EXCEPTION '请选择回复参与者' USING ERRCODE='22023';END IF;
 IF item.owner_id<>u AND p_payload ? 'participantId' AND p_payload->>'participantId'<>u
 THEN RAISE EXCEPTION '没有其他评论参与者的访问权限' USING ERRCODE='42501';END IF;
 IF NOT shiri_private.comment_access(key,participant) THEN RAISE EXCEPTION '没有评论访问权限' USING ERRCODE='42501';END IF;
 IF p_action='list' THEN
  skip:=least(10000,greatest(0,coalesce((p_payload->>'offset')::integer,0)));
  SELECT coalesce(jsonb_agg(x ORDER BY x."createdAt",x.id),'[]'::jsonb) INTO results FROM(
   SELECT c.id,c.author_id AS "authorId",c.body,c.created_at AS "createdAt"
   FROM public.shiri_moment_comments c WHERE c.record_id=key AND c.participant_id=participant
   ORDER BY c.created_at,c.id LIMIT 30 OFFSET skip
  ) x;
  RETURN jsonb_build_object('comments',results,'hasMore',jsonb_array_length(results)=30);
 ELSIF p_action='send' THEN
  -- Same user locks used by existing relationship/grant mutations. Stable order avoids deadlocks.
  PERFORM pg_advisory_xact_lock(hashtextextended('shiri:user:'||least(u,item.owner_id),0));
  IF u<>item.owner_id THEN PERFORM pg_advisory_xact_lock(hashtextextended('shiri:user:'||greatest(u,item.owner_id),0));END IF;
  IF NOT shiri_private.comment_access(key,participant) THEN RAISE EXCEPTION '评论权限已变化' USING ERRCODE='42501';END IF;
  IF item.owner_id=u AND NOT EXISTS(SELECT 1 FROM public.shiri_moment_comments WHERE record_id=key AND participant_id=participant AND author_id=participant)
  THEN RAISE EXCEPTION '这位参与者还没有留言' USING ERRCODE='22023';END IF;
  IF jsonb_typeof(p_payload->'body') IS DISTINCT FROM 'string' OR jsonb_typeof(p_payload->'clientId') IS DISTINCT FROM 'string'
  THEN RAISE EXCEPTION '评论格式无效' USING ERRCODE='22023';END IF;
  content:=btrim(p_payload->>'body');client_key:=(p_payload->>'clientId')::uuid;
  IF content IS NULL OR char_length(content) NOT BETWEEN 1 AND 300 OR client_key IS NULL
  THEN RAISE EXCEPTION '评论需要 1–300 个字' USING ERRCODE='22023';END IF;
  IF regexp_replace(content,E'[\n\r\t]','','g')~'[[:cntrl:]]' THEN RAISE EXCEPTION '评论格式无效' USING ERRCODE='22023';END IF;
  SELECT * INTO old FROM public.shiri_moment_comments WHERE id=client_key;
  IF FOUND THEN
   IF old.author_id<>u OR old.record_id<>key OR old.participant_id<>participant OR old.body<>content
   THEN RAISE EXCEPTION '评论重试标识冲突' USING ERRCODE='22023';END IF;
   RETURN jsonb_build_object('id',old.id,'authorId',old.author_id,'body',old.body,'createdAt',old.created_at);
  END IF;
  SELECT * INTO limits FROM shiri_private.comment_limits WHERE user_id=u;
  IF FOUND THEN
   IF limits.minute_start>now()-interval '1 minute' AND limits.minute_count>=10 THEN RAISE EXCEPTION '评论过于频繁，请稍后再试' USING ERRCODE='P0001';END IF;
   IF limits.day=today AND limits.day_count>=100 THEN RAISE EXCEPTION '今日评论已达上限' USING ERRCODE='P0001';END IF;
  END IF;
  INSERT INTO shiri_private.comment_limits(user_id,minute_start,minute_count,day,day_count) VALUES(u,now(),1,today,1)
  ON CONFLICT(user_id) DO UPDATE SET
   minute_start=CASE WHEN comment_limits.minute_start>now()-interval '1 minute' THEN comment_limits.minute_start ELSE now() END,
   minute_count=CASE WHEN comment_limits.minute_start>now()-interval '1 minute' THEN comment_limits.minute_count+1 ELSE 1 END,
   day=today,day_count=CASE WHEN comment_limits.day=today THEN comment_limits.day_count+1 ELSE 1 END;
  INSERT INTO public.shiri_moment_comments(id,record_id,owner_id,participant_id,author_id,body) VALUES(client_key,key,item.owner_id,participant,u,content) RETURNING created_at INTO comment_time;
  RETURN jsonb_build_object('id',client_key,'authorId',u,'body',content,'createdAt',comment_time);
 ELSE RAISE EXCEPTION '未知评论操作' USING ERRCODE='22023';END IF;
END $$;
REVOKE ALL ON FUNCTION public.shiri_comments(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.shiri_comments(text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
