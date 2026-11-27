-- Verifikasi Row Level Security (RLS) dan jumlah policy pada tabel utama IT Ticketing
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  COUNT(p.policyname) AS policy_count,
  COALESCE(
    STRING_AGG(p.policyname || ' (' || p.cmd || ')', ', ' ORDER BY p.policyname),
    'NONE'
  ) AS policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'tickets',
    'ticket_comments',
    'in_app_notifications',
    'remote_credentials',
    'inventory_stocks',
    'stock_movements',
    'admin_audit_logs',
    'knowledge_articles',
    'assets',
    'users',
    'categories',
    'sites',
    'settings',
    'notification_logs'
  )
GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
ORDER BY c.relname;
