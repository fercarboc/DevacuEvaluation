-- supabase/sql/chatbot_tables.sql
-- F2: Tablas para el asistente conversacional RAG.
-- Incluye base de conocimiento, sesiones y mensajes.

-- Documentos de conocimiento (global: ayuda sobre la plataforma)
CREATE TABLE IF NOT EXISTS debacu_eval_chatbot_docs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid        REFERENCES debacu_eval_organizations(id) ON DELETE CASCADE,
  category   text        NOT NULL DEFAULT 'help',
  title      text        NOT NULL,
  content    text        NOT NULL,
  is_global  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Sesiones de conversación
CREATE TABLE IF NOT EXISTS debacu_eval_chatbot_sessions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL,
  auth_user_id uuid        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Mensajes de cada sesión
CREATE TABLE IF NOT EXISTS debacu_eval_chatbot_messages (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid        NOT NULL REFERENCES debacu_eval_chatbot_sessions(id) ON DELETE CASCADE,
  role       text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content    text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_chatbot_docs_global    ON debacu_eval_chatbot_docs(is_global) WHERE is_global = true;
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_org   ON debacu_eval_chatbot_sessions(org_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_user  ON debacu_eval_chatbot_sessions(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_sess  ON debacu_eval_chatbot_messages(session_id, created_at);

-- RLS
ALTER TABLE debacu_eval_chatbot_docs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE debacu_eval_chatbot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE debacu_eval_chatbot_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_global_docs" ON debacu_eval_chatbot_docs
  FOR SELECT TO authenticated USING (is_global = true);

CREATE POLICY "manage_own_sessions" ON debacu_eval_chatbot_sessions
  FOR ALL TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM debacu_eval_org_members
      WHERE auth_user_id = auth.uid() AND status = 'ACTIVE'
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM debacu_eval_org_members
      WHERE auth_user_id = auth.uid() AND status = 'ACTIVE'
    )
  );

CREATE POLICY "messages_via_session" ON debacu_eval_chatbot_messages
  FOR ALL TO authenticated
  USING (
    session_id IN (
      SELECT id FROM debacu_eval_chatbot_sessions
      WHERE org_id IN (
        SELECT org_id FROM debacu_eval_org_members
        WHERE auth_user_id = auth.uid() AND status = 'ACTIVE'
      )
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM debacu_eval_chatbot_sessions
      WHERE org_id IN (
        SELECT org_id FROM debacu_eval_org_members
        WHERE auth_user_id = auth.uid() AND status = 'ACTIVE'
      )
    )
  );

-- Datos iniciales: documentación global de la plataforma
INSERT INTO debacu_eval_chatbot_docs (category, title, content) VALUES

('general', 'Qué es Debacu Evaluation 360',
'Debacu Evaluation 360 es una plataforma SaaS para hoteles que permite gestionar el riesgo operativo de las reservas. Las principales funciones son: screening automático de huéspedes mediante CSV del PMS, detección de riesgo alto/medio en reservas futuras, panel de alarmas activas, módulo de Revenue Intelligence, e integración API con sistemas PMS.'),

('screening', 'Cómo funciona el screening de reservas',
'El screening evalúa cada reserva comparando los datos del huésped (nombre, documento, email, teléfono) contra la base de incidencias registradas. El resultado es un nivel de riesgo: BAJO (sin coincidencias relevantes), MEDIO (coincidencias parciales o historial moderado), ALTO (coincidencias directas o historial grave). Puedes ejecutar un screening masivo subiendo un CSV desde la sección "Consulta automática (CSV)".'),

('alarmas', 'Alarmas Detectadas: qué son y cómo usarlas',
'Las alarmas son reservas futuras con nivel de riesgo ALTO o MEDIO detectadas automáticamente por el agente nocturno (que se ejecuta cada noche). Cada alarma muestra: fecha de check-in, nombre de propiedad, nivel de riesgo, referencia del lote CSV, número de incidencias, e impacto económico acumulado. Desde el botón "Ver riesgo" puedes ver el detalle completo del huésped.'),

('revenue', 'Revenue Intelligence: módulo de análisis económico',
'El módulo Revenue Intelligence (disponible en planes PROFESSIONAL y ENTERPRISE) ofrece: Análisis por canal, Nivel de riesgo económico, Fugas de revenue, importación de datos del PMS, comparativa mensual, análisis de pickup avanzado, calendario de precios, y gestión de tipos de habitación. Requiere primero configurar propiedades y subir datos del PMS.'),

('integraciones', 'Integración con el PMS del hotel',
'Debacu se integra con tu PMS (Property Management System) de dos formas: 1) Importación CSV manual: descarga un CSV de reservas de tu PMS y súbelo en "Consulta automática (CSV)". 2) Integración API directa: configura las credenciales de tu PMS en "Integración PMS" para sincronización automática. Los datos se mapean a la estructura canónica de Debacu automáticamente.'),

('incidencias', 'Cómo registrar una incidencia manualmente',
'Ve a la sección "Registrar incidencia". Rellena los datos del huésped (nombre, documento, email, teléfono), selecciona la propiedad afectada, describe la incidencia y asigna un nivel de gravedad. Las incidencias registradas se usan en futuros screenings para detectar riesgo en nuevas reservas del mismo huésped.'),

('planes', 'Planes y precios de Debacu',
'Debacu ofrece tres planes: BASIC (screening manual, consultas individuales, historial básico), PROFESSIONAL (screening masivo CSV, alarmas nocturnas, Revenue Intelligence, integración PMS), ENTERPRISE (todo lo anterior más API pública, benchmarks sectoriales, multiusuario, módulo de alquileres vacacionales). Para actualizar tu plan ve a "Mi cuenta".');
