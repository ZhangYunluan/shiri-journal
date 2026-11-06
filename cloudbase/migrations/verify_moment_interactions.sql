SELECT 'likes_rls' AS check_name,coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.shiri_moment_likes')),false) AS ok
UNION ALL SELECT 'rpc_authenticated',has_function_privilege('authenticated','public.shiri_interactions(text,jsonb)','EXECUTE')
UNION ALL SELECT 'rpc_anon_denied',NOT has_function_privilege('anon','public.shiri_interactions(text,jsonb)','EXECUTE')
UNION ALL SELECT 'direct_table_denied',NOT has_table_privilege('authenticated','public.shiri_moment_likes','SELECT,INSERT,UPDATE,DELETE')
UNION ALL SELECT 'aggregate_helper_private',NOT has_function_privilege('authenticated','shiri_private.interaction_allowed(uuid,text)','EXECUTE')
UNION ALL SELECT 'comments_preserved',to_regclass('public.shiri_moment_comments') IS NOT NULL;
