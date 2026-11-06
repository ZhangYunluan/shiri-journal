-- Run as the environment database administrator in CloudBase's SQL editor.
-- Additive/idempotent: never modifies local diaries or provider auth.users.
-- CloudBase PG environment verified 2026-10-12: auth.users.id is bigint (int8).
-- CloudBase auth.uid() returns JWT sub as text. Business user IDs are kept as text
-- and are obtained exclusively from trusted auth.uid() in SECURITY DEFINER RPCs.
-- Do NOT add a text -> auth.users(id) foreign key: PostgreSQL rejects it (42804).
-- On account deletion, the application must revoke sessions and delete/anonymize
-- this user's business rows and private files through a privileged server workflow.
BEGIN;
CREATE SCHEMA IF NOT EXISTS shiri_private;
REVOKE ALL ON SCHEMA shiri_private FROM PUBLIC;
CREATE TABLE IF NOT EXISTS public.shiri_profiles (
  user_id text PRIMARY KEY,
  nickname text NOT NULL CHECK(char_length(nickname) BETWEEN 2 AND 48),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.shiri_requests (
  low_id text NOT NULL REFERENCES public.shiri_profiles(user_id),
  high_id text NOT NULL REFERENCES public.shiri_profiles(user_id),
  sender text NOT NULL, recipient text NOT NULL,
  note text NOT NULL DEFAULT '' CHECK(char_length(note)<=120),
  status text NOT NULL CHECK(status IN ('pending','accepted','rejected','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(low_id,high_id), CHECK(low_id<high_id),
  CHECK(least(sender,recipient)=low_id AND greatest(sender,recipient)=high_id)
);
CREATE TABLE IF NOT EXISTS public.shiri_friendships (
  low_id text NOT NULL REFERENCES public.shiri_profiles(user_id),
  high_id text NOT NULL REFERENCES public.shiri_profiles(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(low_id,high_id), CHECK(low_id<high_id)
);
CREATE TABLE IF NOT EXISTS public.shiri_blocks (
  owner_id text NOT NULL REFERENCES public.shiri_profiles(user_id),
  target_id text NOT NULL REFERENCES public.shiri_profiles(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,target_id), CHECK(owner_id<>target_id)
);
CREATE TABLE IF NOT EXISTS public.shiri_grants (
  owner_id text NOT NULL REFERENCES public.shiri_profiles(user_id),
  viewer_id text NOT NULL REFERENCES public.shiri_profiles(user_id),
  scope text NOT NULL DEFAULT 'none' CHECK(scope IN ('none','shared','categories','all')),
  categories text[] NOT NULL DEFAULT '{}', since_date date,
  history_days integer NOT NULL DEFAULT 0 CHECK(history_days IN (0,7,30,90)),
  PRIMARY KEY(owner_id,viewer_id), CHECK(owner_id<>viewer_id)
);
CREATE TABLE IF NOT EXISTS public.shiri_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL REFERENCES public.shiri_profiles(user_id),
  local_id text NOT NULL CHECK(char_length(local_id) BETWEEN 1 AND 100),
  kind text NOT NULL CHECK(kind IN ('record','shared')),
  title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 200),
  note text NOT NULL DEFAULT '' CHECK(char_length(note)<=4000),
  record_date date NOT NULL, category_id text NOT NULL CHECK(char_length(category_id) BETWEEN 1 AND 64),
  category_name text NOT NULL DEFAULT '' CHECK(char_length(category_name)<=64),
  shared boolean NOT NULL DEFAULT false, media_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,local_id)
);
CREATE TABLE IF NOT EXISTS public.shiri_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.shiri_records(id),
  owner_id text NOT NULL REFERENCES public.shiri_profiles(user_id),
  path text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shiri_records ADD COLUMN IF NOT EXISTS publish_token uuid;
CREATE INDEX IF NOT EXISTS shiri_records_feed ON public.shiri_records(record_date DESC,id) WHERE shared;
CREATE INDEX IF NOT EXISTS shiri_requests_recipient ON public.shiri_requests(recipient,status);
CREATE INDEX IF NOT EXISTS shiri_requests_sender ON public.shiri_requests(sender,created_at);
CREATE INDEX IF NOT EXISTS shiri_grants_viewer ON public.shiri_grants(viewer_id);

ALTER TABLE public.shiri_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shiri_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shiri_friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shiri_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shiri_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shiri_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shiri_media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shiri_profiles,public.shiri_requests,public.shiri_friendships,
 public.shiri_blocks,public.shiri_grants,public.shiri_records,public.shiri_media FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION shiri_private.blocked(a text,b text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.shiri_blocks WHERE (owner_id=a AND target_id=b) OR (owner_id=b AND target_id=a))
$$;
CREATE OR REPLACE FUNCTION shiri_private.friends(a text,b text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.shiri_friendships WHERE low_id=least(a,b) AND high_id=greatest(a,b))
 AND NOT shiri_private.blocked(a,b)
$$;
CREATE OR REPLACE FUNCTION shiri_private.can_read(record_key uuid,viewer text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT viewer=auth.uid() AND auth.role()='authenticated' AND EXISTS(SELECT 1 FROM public.shiri_records r WHERE r.id=record_key AND
 (r.owner_id=viewer OR (r.shared AND shiri_private.friends(r.owner_id,viewer) AND EXISTS(
   SELECT 1 FROM public.shiri_grants g WHERE g.owner_id=r.owner_id AND g.viewer_id=viewer
   AND (g.scope='all' OR (g.scope='shared' AND r.kind='shared') OR (g.scope='categories' AND r.category_id=ANY(g.categories)))
   AND (g.since_date IS NULL OR r.record_date>=g.since_date)
   AND (g.history_days=0 OR r.record_date>=(now() AT TIME ZONE 'Asia/Shanghai')::date-g.history_days)
 ))))
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA shiri_private FROM PUBLIC,anon,authenticated;
-- A read-only RLS helper; callers cannot mutate data or impersonate an RPC actor.
GRANT USAGE ON SCHEMA shiri_private TO authenticated;
GRANT EXECUTE ON FUNCTION shiri_private.can_read(uuid,text) TO authenticated;
GRANT SELECT ON public.shiri_records TO authenticated;
DROP POLICY IF EXISTS shiri_record_read ON public.shiri_records;
CREATE POLICY shiri_record_read ON public.shiri_records FOR SELECT TO authenticated
 USING(auth.role()='authenticated' AND shiri_private.can_read(id,auth.uid()));

-- Storage is deliberately inaccessible directly to app users (including signing).
-- Only the media proxy can transfer bytes after checking the current grant via RPC.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('shiri-shared','shiri-shared',false,1048576,ARRAY['image/jpeg']) ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='shiri-shared' AND public IS DISTINCT FROM false)
 THEN RAISE EXCEPTION 'shiri-shared must be a private bucket; aborting migration'; END IF;
END $$;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shiri_storage_private ON storage.objects;
CREATE POLICY shiri_storage_private ON storage.objects AS RESTRICTIVE
 FOR ALL TO anon,authenticated USING(bucket_id<>'shiri-shared') WITH CHECK(bucket_id<>'shiri-shared');
-- Prevent client changes to this bucket even when unrelated broad policies exist.
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shiri_bucket_private ON storage.buckets;
CREATE POLICY shiri_bucket_private ON storage.buckets AS RESTRICTIVE
 FOR ALL TO anon,authenticated USING(id<>'shiri-shared') WITH CHECK(id<>'shiri-shared');

CREATE OR REPLACE FUNCTION public.shiri_social(p_action text,p_payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 u text:=auth.uid(); target text:=p_payload->>'id'; lo text; hi text;
 item public.shiri_records%ROWTYPE; media public.shiri_media%ROWTYPE;
 req public.shiri_requests%ROWTYPE; nick text; scope_value text; cats text[];
 result jsonb; photo boolean; key uuid; start_date date; days integer;
 skip integer:=least(10000,greatest(0,coalesce((p_payload->>'offset')::integer,0)));
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR u IS NULL OR u='anon' OR char_length(u)>64
 THEN RAISE EXCEPTION '请先登录邮箱账号' USING ERRCODE='42501'; END IF;
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>24000
 THEN RAISE EXCEPTION '请求内容过大或格式错误' USING ERRCODE='22023'; END IF;
 -- Per-user serialisation also makes daily rate checks atomic.
 PERFORM pg_advisory_xact_lock(hashtextextended('shiri:user:'||u,0));
 IF p_action='profile' THEN
   nick:=btrim(p_payload->>'nickname');
   IF nick IS NULL OR char_length(nick) NOT BETWEEN 2 AND 48 OR nick~'[[:cntrl:]]'
   THEN RAISE EXCEPTION '昵称需要 2–48 个字' USING ERRCODE='22023'; END IF;
   INSERT INTO public.shiri_profiles(user_id,nickname) VALUES(u,nick)
    ON CONFLICT(user_id) DO UPDATE SET nickname=excluded.nickname;
   RETURN jsonb_build_object('id',u,'nickname',nick,'version',1);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.shiri_profiles WHERE user_id=u)
 THEN RAISE EXCEPTION '请先刷新好友资料' USING ERRCODE='22023'; END IF;
 IF p_action='dashboard' THEN
   RETURN jsonb_build_object('version',1,
    'friends',coalesce((SELECT jsonb_agg(x ORDER BY x.nickname,x.id) FROM (
      SELECT p.user_id AS id,p.nickname,coalesce(g.scope,'none') AS scope,coalesce(g.categories,'{}') AS categories,
       g.since_date AS since,coalesce(g.history_days,0) AS "historyDays",f.created_at AS "sinceFriend"
      FROM public.shiri_friendships f JOIN public.shiri_profiles p
       ON p.user_id=CASE WHEN f.low_id=u THEN f.high_id ELSE f.low_id END
      LEFT JOIN public.shiri_grants g ON g.owner_id=u AND g.viewer_id=p.user_id
      WHERE (f.low_id=u OR f.high_id=u) AND NOT shiri_private.blocked(u,p.user_id)
    ) x),'[]'::jsonb),
    'incoming',coalesce((SELECT jsonb_agg(x ORDER BY x."createdAt" DESC) FROM (
      SELECT r.sender AS id,p.nickname,r.note,r.created_at AS "createdAt" FROM public.shiri_requests r
      JOIN public.shiri_profiles p ON p.user_id=r.sender WHERE r.recipient=u AND r.status='pending'
      AND NOT shiri_private.blocked(u,r.sender) LIMIT 100) x),'[]'::jsonb),
    'outgoing',coalesce((SELECT jsonb_agg(x ORDER BY x."createdAt" DESC) FROM (
      SELECT r.recipient AS id,p.nickname,r.status,r.created_at AS "createdAt" FROM public.shiri_requests r
      JOIN public.shiri_profiles p ON p.user_id=r.recipient WHERE r.sender=u
      AND NOT shiri_private.blocked(u,r.recipient) ORDER BY r.created_at DESC LIMIT 50) x),'[]'::jsonb),
    'blocked',coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.target_id,'nickname',p.nickname))
      FROM public.shiri_blocks b JOIN public.shiri_profiles p ON p.user_id=b.target_id WHERE b.owner_id=u),'[]'::jsonb),
    'mine',coalesce((SELECT jsonb_agg(x ORDER BY x."updatedAt" DESC) FROM (
      SELECT id,local_id AS "localId",title,shared,media_id AS "mediaId",updated_at AS "updatedAt"
      FROM public.shiri_records WHERE owner_id=u ORDER BY updated_at DESC LIMIT 100) x),'[]'::jsonb));
 ELSIF p_action='search' THEN
   SELECT jsonb_build_object('id',user_id,'nickname',nickname,'isFriend',shiri_private.friends(u,user_id)) INTO result
    FROM public.shiri_profiles WHERE user_id=target AND user_id<>u AND NOT shiri_private.blocked(u,user_id);
   RETURN jsonb_build_object('user',result);
 ELSIF p_action IN ('request','respond','cancel','grant','remove','block','unblock') THEN
   IF target IS NULL OR target=u OR NOT EXISTS(SELECT 1 FROM public.shiri_profiles WHERE user_id=target)
   THEN RAISE EXCEPTION '找不到该用户' USING ERRCODE='22023'; END IF;
   lo:=least(u,target);hi:=greatest(u,target);
   PERFORM pg_advisory_xact_lock(hashtextextended('shiri:pair:'||lo||':'||hi,0));
   IF p_action='unblock' THEN
     DELETE FROM public.shiri_blocks WHERE owner_id=u AND target_id=target;
   ELSIF p_action IN ('remove','block') THEN
     IF p_action='block' THEN INSERT INTO public.shiri_blocks(owner_id,target_id) VALUES(u,target) ON CONFLICT DO NOTHING; END IF;
     DELETE FROM public.shiri_grants WHERE (owner_id=u AND viewer_id=target) OR (owner_id=target AND viewer_id=u);
     DELETE FROM public.shiri_friendships WHERE low_id=lo AND high_id=hi;
     UPDATE public.shiri_requests SET status='cancelled',updated_at=now() WHERE low_id=lo AND high_id=hi;
   ELSE
     IF shiri_private.blocked(u,target) THEN RAISE EXCEPTION '找不到该用户' USING ERRCODE='42501'; END IF;
     SELECT * INTO req FROM public.shiri_requests WHERE low_id=lo AND high_id=hi;
     IF p_action='request' THEN
       IF shiri_private.friends(u,target) THEN RETURN jsonb_build_object('status','friends'); END IF;
       IF req.status='pending' THEN
         IF req.recipient=u THEN RAISE EXCEPTION '请先处理对方发来的好友申请' USING ERRCODE='22023'; END IF;
         RETURN jsonb_build_object('status','pending');
       END IF;
       IF req.status='rejected' AND req.sender=u AND req.updated_at>now()-interval '1 day'
       THEN RAISE EXCEPTION '对方已拒绝，请一天后再申请' USING ERRCODE='22023'; END IF;
       IF (SELECT count(*) FROM public.shiri_requests WHERE sender=u AND created_at>now()-interval '1 day')>=50
       THEN RAISE EXCEPTION '今天申请较多，请明天再试' USING ERRCODE='22023'; END IF;
       INSERT INTO public.shiri_requests(low_id,high_id,sender,recipient,note,status) VALUES(lo,hi,u,target,coalesce(p_payload->>'note',''),'pending')
        ON CONFLICT(low_id,high_id) DO UPDATE SET sender=u,recipient=target,note=excluded.note,status='pending',created_at=now(),updated_at=now();
     ELSIF p_action='respond' THEN
       IF req.recipient IS DISTINCT FROM u OR req.status IS DISTINCT FROM 'pending'
       THEN RAISE EXCEPTION '好友申请不存在或已处理' USING ERRCODE='42501'; END IF;
       IF coalesce((p_payload->>'accept')::boolean,false) THEN
         INSERT INTO public.shiri_friendships(low_id,high_id) VALUES(lo,hi) ON CONFLICT DO NOTHING;
         UPDATE public.shiri_requests SET status='accepted',updated_at=now() WHERE low_id=lo AND high_id=hi;
       ELSE UPDATE public.shiri_requests SET status='rejected',updated_at=now() WHERE low_id=lo AND high_id=hi; END IF;
     ELSIF p_action='cancel' THEN
       IF req.sender IS DISTINCT FROM u OR req.status IS DISTINCT FROM 'pending' THEN RAISE EXCEPTION '不能撤回这条申请' USING ERRCODE='42501'; END IF;
       UPDATE public.shiri_requests SET status='cancelled',updated_at=now() WHERE low_id=lo AND high_id=hi;
     ELSIF p_action='grant' THEN
       IF NOT shiri_private.friends(u,target) THEN RAISE EXCEPTION '请先成为好友' USING ERRCODE='42501'; END IF;
       scope_value:=p_payload->>'scope';start_date:=nullif(p_payload->>'since','')::date;days:=coalesce((p_payload->>'historyDays')::integer,0);
       IF scope_value IS NULL OR scope_value NOT IN ('none','shared','categories','all') OR days NOT IN (0,7,30,90)
       THEN RAISE EXCEPTION '授权范围无效' USING ERRCODE='22023'; END IF;
       SELECT coalesce(array_agg(value),'{}') INTO cats FROM jsonb_array_elements_text(coalesce(p_payload->'categories','[]'));
       IF cardinality(cats)>30 OR EXISTS(SELECT 1 FROM unnest(cats)c WHERE char_length(c) NOT BETWEEN 1 AND 64)
       THEN RAISE EXCEPTION '分类范围无效' USING ERRCODE='22023'; END IF;
       INSERT INTO public.shiri_grants(owner_id,viewer_id,scope,categories,since_date,history_days) VALUES(u,target,scope_value,cats,start_date,days)
        ON CONFLICT(owner_id,viewer_id) DO UPDATE SET scope=excluded.scope,categories=excluded.categories,since_date=excluded.since_date,history_days=excluded.history_days;
     END IF;
   END IF;
   RETURN jsonb_build_object('ok',true);
 ELSIF p_action='publish_begin' THEN
   IF p_payload->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION '请逐条确认分享内容' USING ERRCODE='22023'; END IF;
   photo:=coalesce((p_payload->>'photo')::boolean,false);
   INSERT INTO public.shiri_records(owner_id,local_id,kind,title,note,record_date,category_id,category_name,publish_token)
    VALUES(u,p_payload->>'localId',p_payload->>'kind',btrim(p_payload->>'title'),coalesce(p_payload->>'note',''),
      (p_payload->>'date')::date,p_payload->>'categoryId',coalesce(p_payload->>'categoryName',''),gen_random_uuid())
    ON CONFLICT(owner_id,local_id) DO UPDATE SET kind=excluded.kind,title=excluded.title,note=excluded.note,
     record_date=excluded.record_date,category_id=excluded.category_id,category_name=excluded.category_name,shared=false,media_id=null,updated_at=now(),publish_token=excluded.publish_token
    RETURNING * INTO item;
   IF photo THEN
     key:=gen_random_uuid();INSERT INTO public.shiri_media(id,record_id,owner_id,path) VALUES(key,item.id,u,key::text||'.jpg');
     UPDATE public.shiri_records SET media_id=key WHERE id=item.id;
   END IF;
   RETURN jsonb_build_object('id',item.id,'mediaId',key,'publishToken',item.publish_token);
 ELSIF p_action IN ('publish_finish','revoke') THEN
   SELECT * INTO item FROM public.shiri_records WHERE id=target::uuid AND owner_id=u FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION '找不到这条记录' USING ERRCODE='42501'; END IF;
   IF p_action='publish_finish' AND (item.publish_token IS NULL OR item.publish_token IS DISTINCT FROM (p_payload->>'publishToken')::uuid)
   THEN RAISE EXCEPTION '这次发布已撤回或失效，请重新确认发布' USING ERRCODE='42501'; END IF;
   IF p_action='publish_finish' AND item.media_id IS NOT NULL AND NOT EXISTS(
     SELECT 1 FROM public.shiri_media m JOIN storage.objects o ON o.bucket_id='shiri-shared' AND o.name=m.path
     WHERE m.id=item.media_id AND m.owner_id=u AND (o.metadata->>'size')::bigint BETWEEN 1 AND 1048576
      AND o.metadata->>'mimetype'='image/jpeg')
   THEN RAISE EXCEPTION '照片尚未上传成功，请重试' USING ERRCODE='22023'; END IF;
   UPDATE public.shiri_records SET shared=(p_action='publish_finish'),updated_at=now(),publish_token=CASE WHEN p_action='revoke' THEN null ELSE publish_token END WHERE id=item.id;
   RETURN jsonb_build_object('ok',true);
 ELSIF p_action='revoke_local' THEN
   UPDATE public.shiri_records SET shared=false,updated_at=now(),publish_token=null WHERE owner_id=u AND local_id=p_payload->>'localId';
   RETURN jsonb_build_object('ok',true);
 ELSIF p_action='revoke_all' THEN
   UPDATE public.shiri_records SET shared=false,updated_at=now(),publish_token=null WHERE owner_id=u;
   DELETE FROM public.shiri_grants WHERE owner_id=u;
   RETURN jsonb_build_object('ok',true);
 ELSIF p_action='feed' THEN
   SELECT coalesce(jsonb_agg(x ORDER BY x.date DESC,x.id DESC),'[]'::jsonb) INTO result FROM (
    SELECT r.id,r.owner_id AS "ownerId",p.nickname,r.title,r.note,r.record_date AS date,
     r.category_id AS "categoryId",r.category_name AS "categoryName",r.media_id AS "mediaId"
    FROM public.shiri_records r JOIN public.shiri_profiles p ON p.user_id=r.owner_id
    WHERE r.owner_id<>u AND r.shared AND (target IS NULL OR r.owner_id=target)
     AND shiri_private.can_read(r.id,u) ORDER BY r.record_date DESC,r.id DESC LIMIT 20 OFFSET skip) x;
   RETURN jsonb_build_object('records',result,'hasMore',jsonb_array_length(result)=20);
 ELSIF p_action IN ('media_read','media_write','media_delete') THEN
   SELECT * INTO media FROM public.shiri_media WHERE id=target::uuid;
   IF NOT FOUND THEN RAISE EXCEPTION '照片不可访问' USING ERRCODE='42501'; END IF;
   SELECT * INTO item FROM public.shiri_records WHERE id=media.record_id;
   IF p_action='media_delete' THEN
     IF media.owner_id<>u OR (item.shared AND item.media_id=media.id) THEN RAISE EXCEPTION '请先撤回照片分享' USING ERRCODE='42501'; END IF;
   ELSIF p_action='media_write' THEN
     IF media.owner_id<>u OR item.shared OR item.publish_token IS NULL OR item.media_id IS DISTINCT FROM media.id OR media.created_at<now()-interval '6 hours'
     THEN RAISE EXCEPTION '照片上传已过期，请重新发布' USING ERRCODE='42501'; END IF;
   ELSE
     IF item.media_id IS DISTINCT FROM media.id OR NOT shiri_private.can_read(item.id,u)
     THEN RAISE EXCEPTION '照片不可访问' USING ERRCODE='42501'; END IF;
   END IF;
   RETURN jsonb_build_object('path',media.path,'bucket','shiri-shared');
 ELSE RAISE EXCEPTION '未知好友操作' USING ERRCODE='22023';
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.shiri_social(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.shiri_social(text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
