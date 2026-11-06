-- Read-only deployment checks; safe to run after 001_social.sql.
SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'shiri_%' ORDER BY tablename;
SELECT has_function_privilege('anon','public.shiri_social(text,jsonb)','EXECUTE') AS anon_must_be_false,
       has_function_privilege('authenticated','public.shiri_social(text,jsonb)','EXECUTE') AS user_must_be_true;
SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id='shiri-shared';
SELECT policyname,permissive,roles FROM pg_policies WHERE policyname IN ('shiri_storage_private','shiri_bucket_private','shiri_record_read');
