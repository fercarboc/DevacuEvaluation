-- Migración: añadir campo pms_key a debacu_eval_hotel_profile
-- Ejecutar en Supabase Studio > SQL Editor

ALTER TABLE debacu_eval_hotel_profile
ADD COLUMN IF NOT EXISTS pms_key TEXT DEFAULT NULL;

COMMENT ON COLUMN debacu_eval_hotel_profile.pms_key IS
  'Identificador del PMS del hotel (MEWS, OPERA, CLOUDBEDS, etc.). '
  'Se usa para aplicar automáticamente el perfil de mapping de columnas CSV en importaciones.';
