-- ============================================================
-- DEBACU — Migración: debacu_eval_risk_alerts
-- VERSIÓN CORREGIDA con nombres reales de tablas
-- ============================================================
-- Tablas reales confirmadas:
--   debacu_eval_organizations  → orgs
--   debacu_eval_org_members    → membresías (campo: auth_user_id)
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLA PRINCIPAL
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS debacu_eval_risk_alerts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  org_id                uuid NOT NULL,
  property_id           uuid,

  stay_id               uuid NOT NULL,
  import_batch_id       uuid NOT NULL,

  identity_key          text NOT NULL,

  checkin_date          date NOT NULL,
  checkout_date         date,

  risk_score            integer NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  risk_level            text NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  risk_reason           text,

  incidents_count       integer NOT NULL DEFAULT 0,
  total_net_loss        numeric(10,2) DEFAULT 0,
  incident_types        jsonb DEFAULT '[]',

  is_resolved           boolean NOT NULL DEFAULT false,
  resolved_at           timestamptz,
  resolved_by           uuid,
  resolution_note       text,

  agent_run_id          uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 2. ÍNDICES
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_risk_alerts_org_pending
  ON debacu_eval_risk_alerts (org_id, is_resolved, checkin_date ASC)
  WHERE is_resolved = false;

CREATE INDEX IF NOT EXISTS idx_risk_alerts_property_pending
  ON debacu_eval_risk_alerts (org_id, property_id, is_resolved, checkin_date ASC)
  WHERE is_resolved = false;

CREATE INDEX IF NOT EXISTS idx_risk_alerts_identity
  ON debacu_eval_risk_alerts (org_id, identity_key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_risk_alerts_no_duplicate
  ON debacu_eval_risk_alerts (org_id, stay_id)
  WHERE is_resolved = false;

-- ------------------------------------------------------------
-- 3. TRIGGER updated_at
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_risk_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_risk_alerts_updated_at
  BEFORE UPDATE ON debacu_eval_risk_alerts
  FOR EACH ROW EXECUTE FUNCTION update_risk_alerts_updated_at();

-- ------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ✅ CORREGIDO: usa debacu_eval_org_members + auth_user_id
-- ------------------------------------------------------------

ALTER TABLE debacu_eval_risk_alerts ENABLE ROW LEVEL SECURITY;

-- Lectura: usuario autenticado que sea miembro activo de la org
CREATE POLICY "risk_alerts_select_own_org"
  ON debacu_eval_risk_alerts
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id
      FROM debacu_eval_org_members
      WHERE auth_user_id = auth.uid()
        AND status = 'ACTIVE'
    )
  );

-- Escritura solo desde service_role (Edge Functions)
CREATE POLICY "risk_alerts_insert_service_role"
  ON debacu_eval_risk_alerts
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "risk_alerts_update_service_role"
  ON debacu_eval_risk_alerts
  FOR UPDATE
  USING (auth.role() = 'service_role');

-- ------------------------------------------------------------
-- 5. COMENTARIOS
-- ------------------------------------------------------------

COMMENT ON TABLE debacu_eval_risk_alerts IS
  'Alarmas de riesgo generadas por el agente nocturno. '
  'Sin PII: usa identity_key para enlazar con el perfil del huésped.';

-- ------------------------------------------------------------
-- 6. VERIFICACIÓN RÁPIDA (ejecutar después para confirmar)
-- ------------------------------------------------------------
-- SELECT COUNT(*) FROM debacu_eval_risk_alerts;
-- SELECT schemaname, tablename, rowsecurity
--   FROM pg_tables WHERE tablename = 'debacu_eval_risk_alerts';

-- ------------------------------------------------------------
-- 7. ROLLBACK
-- ------------------------------------------------------------
-- DROP TRIGGER IF EXISTS trg_risk_alerts_updated_at ON debacu_eval_risk_alerts;
-- DROP FUNCTION IF EXISTS update_risk_alerts_updated_at();
-- DROP TABLE IF EXISTS debacu_eval_risk_alerts;
