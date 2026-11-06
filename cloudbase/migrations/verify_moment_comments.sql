-- Read-only administrator checks. All ok values should be true. No comment bodies are queried.
SELECT 'comments_table' AS check_name,to_regclass('public.shiri_moment_comments') IS NOT NULL AS ok
UNION ALL SELECT 'row_level_security',coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.shiri_moment_comments')),false)
UNION ALL SELECT 'authenticated_rpc',has_function_privilege('authenticated','public.shiri_comments(text,jsonb)','EXECUTE')
UNION ALL SELECT 'anonymous_rpc_denied',NOT has_function_privilege('anon','public.shiri_comments(text,jsonb)','EXECUTE')
UNION ALL SELECT 'direct_read_denied',NOT has_table_privilege('authenticated','public.shiri_moment_comments','SELECT')
UNION ALL SELECT 'direct_write_denied',NOT has_table_privilege('authenticated','public.shiri_moment_comments','INSERT,UPDATE,DELETE')
UNION ALL SELECT 'private_rate_table',NOT has_table_privilege('authenticated','shiri_private.comment_limits','SELECT,INSERT,UPDATE,DELETE');
