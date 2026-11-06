-- Read-only checks for 002_nickname_search.sql. Never paste real JWTs into the SQL editor.
SELECT column_name,data_type,column_default,is_nullable
FROM information_schema.columns WHERE table_schema='public' AND table_name='shiri_profiles' AND column_name IN ('user_id','nickname','discoverable') ORDER BY column_name;
SELECT to_regclass('shiri_private.search_limits') IS NOT NULL AS rate_limit_table_exists;
SELECT has_function_privilege('anon','public.shiri_social(text,jsonb)','EXECUTE') AS anon_can_execute_should_be_false,
       has_function_privilege('authenticated','public.shiri_social(text,jsonb)','EXECUTE') AS authenticated_can_execute_should_be_true;
SELECT count(*) AS public_profiles_total,
       count(*) FILTER (WHERE discoverable=true) AS nickname_search_opted_in
FROM public.shiri_profiles;
SELECT count(*) AS shiri_tables_with_rls FROM pg_tables
WHERE schemaname='public' AND tablename IN ('shiri_profiles','shiri_requests','shiri_friendships','shiri_blocks','shiri_grants','shiri_records','shiri_media') AND rowsecurity;
SELECT id,public FROM storage.buckets WHERE id='shiri-shared';
