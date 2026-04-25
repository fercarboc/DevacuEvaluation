-- supabase/sql/pg_cron_jobs.sql
-- Programa los dos Edge Functions con pg_cron + pg_net.
-- pg_cron 1.6.4 y pg_net 0.19.5 ya están instalados en el proyecto.
--
-- PREREQUISITO (ejecutar UNA sola vez en el SQL Editor de Supabase):
--   ALTER DATABASE postgres SET app.service_role_key = '<tu-service-role-key>';
--   SELECT pg_reload_conf();
-- Luego los jobs funcionarán automáticamente.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'debacu-welcome-dispatch') THEN
    PERFORM cron.unschedule('debacu-welcome-dispatch');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'debacu-risk-digest') THEN
    PERFORM cron.unschedule('debacu-risk-digest');
  END IF;
END;
$$;

-- Cada hora (minuto 5): envía emails de bienvenida pendientes
SELECT cron.schedule(
  'debacu-welcome-dispatch',
  '5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://dqqjaujnulutinskmqsu.supabase.co/functions/v1/debacu_eval_welcome_email_dispatch',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || coalesce(current_setting('app.service_role_key', true), '')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Diariamente a las 08:00 UTC: resumen de alertas de riesgo por email
SELECT cron.schedule(
  'debacu-risk-digest',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://dqqjaujnulutinskmqsu.supabase.co/functions/v1/debacu_eval_risk_digest',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || coalesce(current_setting('app.service_role_key', true), '')
    ),
    body    := '{}'::jsonb
  );
  $$
);
