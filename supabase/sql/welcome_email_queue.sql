-- Migración: tabla de cola de emails de bienvenida
-- Ejecutar en Supabase Studio > SQL Editor

CREATE TABLE IF NOT EXISTS debacu_eval_welcome_emails (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID        NOT NULL,
  org_id          UUID        NOT NULL,
  recipient_email TEXT        NOT NULL,
  recipient_name  TEXT,
  plan_code       TEXT,
  queued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  send_after      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour',
  sent_at         TIMESTAMPTZ,
  error_detail    TEXT,
  UNIQUE (customer_id)
);

COMMENT ON TABLE debacu_eval_welcome_emails IS
  'Cola de emails de bienvenida. Se inserta al detectar primer login (perfil nulo). '
  'El cron debacu_eval_welcome_email_dispatch los envía cuando send_after <= NOW().';

-- Índice para el cron: busca pendientes ordenados por send_after
CREATE INDEX IF NOT EXISTS idx_welcome_emails_pending
  ON debacu_eval_welcome_emails (send_after)
  WHERE sent_at IS NULL;

-- pg_cron: disparar el dispatch cada hora (requiere extensión pg_cron habilitada)
-- Ejecutar separado si pg_cron ya está activo en el proyecto:
/*
SELECT cron.schedule(
  'debacu-welcome-email-hourly',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url      := (SELECT 'https://' || current_setting('app.supabase_project_ref') || '.supabase.co/functions/v1/debacu_eval_welcome_email_dispatch'),
      headers  := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body     := '{}'::jsonb
    );
  $$
);
*/
