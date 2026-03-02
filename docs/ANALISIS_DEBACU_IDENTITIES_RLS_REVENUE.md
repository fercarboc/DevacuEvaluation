# Análisis Debacu: Identities / RLS / Revenue

## 1. Resumen ejecutivo
- El frontend React (especialmente `AuthedApp`, `DashboardHome`, `SearchRatings`, los dashboards de revenue y auditoría) consume datos a través de Edge Functions JWT (`callEvalFn`) y, en un único punto, mediante consultas directas a `public.debacu_evaluations`. Esa tabla almacena DNI/email/teléfono en claro y alimenta comprobaciones y listados críticos.
- Todas las Edge Functions de Supabase (`supabase/functions/...`) se apoyan en `debacu_evaluations` para métricas operativas y financieras. Varias devuelven información identificable (canal leaks, auditorías, exportaciones), lo que refuerza la necesidad de una estrategia “identity-first” con datos hashed y RLS estrictas.
- Ya existen piezas de identidad (HMAC de `debacu-eval-add`, `_shared/identity.ts` y `debacu_eval_import_guest_index`). La ruta recomendada: normalizar inputs → derivar `identity_key` + keys por tipo → almacenar en `debacu_evaluations` y en un nuevo `public.debacu_eval_guest_index` multi-tenant → servir los dashboards y el nuevo `guest_lookup` sin exponer PII.
- Paralelamente, preparar materializaciones de Revenue Intelligence (`incidents_by_type`, `by_channel`, `trend_monthly`) y proyección (forecast) para mantener rendimiento y soportar decisiones comerciales.

## 2. Mapa Pantallas → Fuentes de datos
| Pantalla / componente | Archivo(s) | Propósito | Endpoints / functions | Tablas implicadas | Campos clave consumidos |
| --- | --- | --- | --- | --- | --- |
| Dashboard ejecutivo | `src/pages/DashboardHome.tsx` | Resumen de uso del plan y pérdidas netas | `getClientDashboard()` (`client_dashboard`), `getRevenueMonthSummary()` (`debacu_eval_dashboard_revenue_month`) | `debacu_evaluations` (conteos por `customer_id`/`creator_customer_id`) | `created_at`, `customer_id`, `economic_*`, `platform`, `rating` |
| Consulta automática (CSV) | `src/pages/app/ScreeningCsv.tsx` → screen components | Importar/validar CSV, revisar run/alertas | Supabase queries (`listScreeningRuns`, `getScreeningRun`, `listRunResults`, `listRunAlerts`), `import_validate_commit` | `screening_runs`, `screening_results`, `screening_alerts`, `import_jobs`, bucket `customer-imports` | `identity_key`, `risk_band`, `delta_total_net_loss`, `match_confidence`, `row_number` |
| Consulta manual / Check Signals | `src/components/SearchRatings.tsx` + `src/services/evaluationService.ts` | Señales globales + Mis registros | `checkSignalsGlobal()` (`debacu-eval-check-signals`), `getGlobalSummary()` (`debacu_eval_platform_summary`/`country_summary`), `searchMyRatingsInSupabase()` (direct `.from("debacu_evaluations")`), `getGlobalRiskSnapshot()`, `global_guest_lookup()` | `debacu_evaluations` | `document`, `email`, `phone`, `full_name`, `identity_key`, `economic_*`, `platform`, `channel` |
| Registrar incidencia | `src/components/RatingForm.tsx` | Crear registro con varios campos económicos | `addEvaluation()` → `debacu-eval-add` | `debacu_evaluations` | `document` ( + `document_norm`), `email`/`phone`, `identity_key`, `incident_type`, `impact_items`, `economic_*` |
| Revenue Intelligence (Canal/Riesgo/Fugas) | `src/views/ChannelAnalysis.tsx`, `RiskAnalysis.tsx`, `Leaks.tsx`, `ChannelLeakDetailDrawer.tsx` | Visualizar net loss por canal/plataforma y recomendaciones | `customerRevenueChannelsGet` (`customer_revenue_channels_get`), `customerDashboardKpisGet` (`debacu_eval_customer_dashboard_kpis_get`), `getRevenueMonthSummary()` (`debacu_eval_dashboard_revenue_month`), `callEvalFn("debacu_eval_channel_leak_detail_get")` | `debacu_evaluations` | `platform`, `channel`, `channel_group`, `economic_net_loss`, `rating`, `document`, `full_name`, `identity_key` |
| Auditoría y exportaciones | `src/views/StatsViewAuditor.tsx`, `HistoryViewAuditor.tsx`, `ExportsViewAuditor.tsx` | KPIs operativos, trazabilidad y descargas | `client_operational_stats`, `customer_audit_metrics`, `customer_audit_export_build`, `list_audit_history`, `client_audit_history_detail`, `client_audit_export_generate/download` | `debacu_evaluations` (conteos), `customer_audit_exports`, `client_audit_history` | `risk_band`, `created_at`, `actor_email`, `audit_id`, `document` (en exportaciones) |

## 3. Mapa Edge Functions → Tablas
| Edge Function | Ruta | Auth | Tablas | PII | Observaciones |
| --- | --- | --- | --- | --- | --- |
| `debacu-eval-check-signals` | `supabase/functions/debacu_eval_check_signals/index.ts` | JWT (requiere user) | `debacu_evaluations`, `debacu_eval_import_guest_index` | No retorna doc/email/phone, pero usa `document`, `email`, `phone` | Calcula coincidencias globales o por hotel; usa `identity_key` en GLOBAL.
| `debacu-eval-global-summary` | `supabase/functions/debacu-eval-global-summary/index.ts` | JWT | `debacu_evaluations` | No | Agrega por `platform`/`nationality` para dashboard principal.
| `debacu_eval_customer_dashboard_kpis_get` | `supabase/functions/debacu_eval_customer_dashboard_kpis_get/index.ts` | JWT | `debacu_evaluations` | No | Extrae `channel`, `rating` y `economic_net_loss` filtrando por `customer_id` y `app_id`.
| `debacu_eval_dashboard_revenue_month` | `supabase/functions/debacu_eval_dashboard_revenue_month/index.ts` | JWT | `debacu_evaluations` | No | Recupera métricas netas de los últimos 6 meses por `platform`.
| `customer_revenue_channels_get` | `supabase/functions/customer_revenue_channels_get/index.ts` | JWT | `debacu_evaluations`, `debacu_eval_org_members` | No | Devuelve KPI por canal/plataforma para Revenue Intelligence.
| `customer_operational_weekly_series_get` | `supabase/functions/customer_operational_weekly_series_get/index.ts` | JWT | `debacu_evaluations` | No | Serie semanal y diaria filtrada por `customer_id`/`creator_customer_uuid`.
| `customer_audit_metrics` | `supabase/functions/customer_audit_metrics/index.ts` | JWT | `debacu_evaluations` | No | Extrae `incident_type`, economía y `rating` por rango.
| `client_dashboard` | `supabase/functions/client_dashboard/index.ts` | JWT | `debacu_evaluations`, `debacu_eval_org_members` | No | Cuenta registros creados este mes.
| `client_operational_stats` | `supabase/functions/client_operational_stats/index.ts` | JWT | `debacu_evaluations` | No | Calcula consultas y registros por `creator_customer_uuid`.
| `customer_audit_export_build` | `supabase/functions/customer_audit_export_build/index.ts` | Service role | `debacu_evaluations` (variantes públicas) | Sí | Genera CSV/PDF con PII completo.
| `debacu_eval_channel_leak_detail_get` | `supabase/functions/debacu_eval_channel_leak_detail_get/index.ts` | JWT | `debacu_evaluations` | Sí (document, full_name) | Detalla incidentes por canal (riesgo alto).
| `debacu-eval-my-ratings-search` | `supabase/functions/debacu-eval-my-ratings-search/index.ts` | JWT | `debacu_evaluations` | Sí (document/email/phone) | Devuelve registros completos para “Mis registros”.
| `debacu-eval-add` | `supabase/functions/debacu-eval-add/index.ts` | JWT | `debacu_evaluations`, `debacu_eval_org_members` | Inserta doc/email/phone con hashes | Calcula `identity_key`, `document_norm`, `email_norm`, `phone_digits` antes de escribir.
| `debacu_eval_global_guest_lookup` | `supabase/functions/debacu_eval_global_guest_lookup/index.ts` | JWT + Anon | `debacu_eval_import_guest_index` | No | Lookup agregado por `identity_key`.
| `import_validate_commit` | `supabase/functions/import_validate_commit/index.ts` | JWT/Service | `screening_runs`, `screening_results`, `screening_alerts`, `import_jobs`, storage `customer-imports` | Sí (CSV completo) | Procesa CSVs y genera `identity_key`.

## 4. Modelo lógico BD (tablas/relaciones/tenancy)
- `public.debacu_evaluations`: almacena PII (`document`, `email`, `phone`, `full_name`), normalizaciones (`document_norm`, `email_norm`, `phone_digits`, `identity_key`) y contexto (`platform`, `channel`, `incident_type`, `economic_*`, `impact_items`, `rating`, `evaluation_date`, `created_at`, `org_id`, `customer_id`, `creator_customer_id`, `creator_customer_uuid`). Necesita índices sobre `(org_id, evaluation_date)`, `(identity_key)`, `(customer_id, evaluation_date)` y `(identity_key, platform)`.
- `public.debacu_eval_organizations`, `debacu_eval_org_members`, `debacu_eval_org_entitlements`: gobiernan el modelo multi-tenant; todas las funciones `_shared/auth.ts` y `_shared/plan.ts` las consultan antes de acceder a `debacu_evaluations`.
- `public.debacu_eval_import_guest_index`: índice global (sin `org_id`) por `identity_key` usado por `debacu_eval_check_signals` y `global_guest_lookup`. Contiene métricas (`risk_band`, `incidents_count`, `total_net_loss`, `stays_count`, `first_seen_date`, `last_incident_date`). No hay DDL en el repo (marcar como “NO ENCONTRADO”), pero servirá como base del nuevo `public.debacu_eval_guest_index` multi-tenant.
- `import_profiles`, `import_jobs`, `screening_runs`, `screening_results`, `screening_alerts`: usadas por el módulo CSV (`screeningCsv.service.ts`). Faltan en `src/types/database.ts` y requieren tipado. Mantienen `identity_key`, `risk_band`, `row_number`.
- `public.debacu_eval_platform_summary` / `debacu_eval_country_summary`: resúmenes legados leídos por `getGlobalSummary`.
- Ausentes en el repo (marcar como “NO ENCONTRADO”): `public.app_settings`, `public.debacu_get_pepper`, `public.debacu_eval_guest_index` (la nueva tabla objetivo).
- Enforcement multi-tenant: `callEvalFn` (`src/services/callEvalFn.ts`) inyecta `org_id` desde `localStorage`, y las funciones de Supabase comprueban `debacu_eval_org_members` antes de leer/escribir.

## 5. Dónde se usa `debacu_evaluations` hoy
- **Frontend**: `src/services/evaluationService.ts` (líneas ~295-452) ejecuta `.from("debacu_evaluations")` en `searchMyRatingsInSupabase`, `searchRatingsInSupabase`, `searchEvaluations` y `getClientHistoryByDocument`. `SearchRatings` (`src/components/SearchRatings.tsx`) consume esos resultados en el modo MINE.
- **Edge Functions**: todas las descritas en la sección 3 acceden directamente a `debacu_evaluations`. En particular, las exportaciones y los detalles por canal devuelven PII.
- **Screening CSV**: aunque no lee `debacu_evaluations`, genera `identity_key` y alimenta el índice global.

## 6. Riesgos RGPD
1. `SearchRatings` (modo MINE) recupera `document`, `email`, `phone`, `full_name` en claro, incluso si la UI los mascara.
2. `debacu-eval-my-ratings-search` y `debacu_eval_channel_leak_detail_get` devuelven PII completo a vistas de auditoría y revenue.
3. `customer_audit_export_build` genera CSV/PDF con PII y la UI permite descargarlos sin limpiar.
4. `import_validate_commit` muestra el preview del CSV con PII; ese contenido queda en almacenamiento.
5. No hay políticas RLS en el repo para `debacu_evaluations`; un usuario mal configurado podría leer la tabla completa.
6. `debacu_eval_import_guest_index` no restringe por `org_id`, permitiendo búsquedas fuera del tenant.

## 7. Diseño target identities/keys + guest_index + CSV + revenue/forecast
1. **Normalización y claves**: usar funciones SQL (`public.debacu_doc_key`, `debacu_email_key`, `debacu_phone_key`, `debacu_identity_key`) para derivar HMAC con `public.debacu_get_pepper()` y almacenar `identity_key` en `debacu_evaluations` y `screening_results`.
2. **Tabla `public.debacu_eval_guest_index`**: por `(org_id, customer_id, identity_key)` almacena métricas agregadas (`risk_band`, `incidents_count`, `total_net_loss`, `stays_count`, `platform_breakdown`, `first_seen_date`, `last_incident_date`). Indexarla por `(org_id, identity_key)` y `(identity_key)`.
3. **Edge Function `guest_lookup`**: POST `{ type: "doc"|"email"|"phone", value, period_from?, period_to?, org_id? }`. Normalizar input, derivar `identity_key`, buscar en `debacu_eval_guest_index`, y si no hay hit generar resumen desde `debacu_evaluations` (filtrado por `identity_key`, `org_id`). Responder `{ ok, exists, risk_band, incidents_count, total_net_loss, first_seen_date, last_incident_date, input_kind, charts: { incidents_by_type, by_channel, by_platform, trend_monthly } }` sin PII.
4. **CSV & Screening**: `import_validate_commit` y `screening_results` deben trabajar con `identity_key` y no volver a mostrar PII en `ResultsTable` o `AlertsPanel`. El run final actualiza `debacu_eval_guest_index`.
5. **Revenue Intelligence & Forecast**: crear materializaciones `incidents_by_type`, `by_channel`, `trend_monthly`, `forecast_monthly` basadas en `debacu_evaluations` y `identity_key`; consumirlas desde `ChannelAnalysis`, `RiskAnalysis`, `Leaks` y `guest_lookup`.
6. **Índices propuestos**: `(org_id, evaluation_date DESC)`, `(identity_key)`, `(identity_key, channel_group)`, `(customer_id, evaluation_date)`, `(document_norm)`, `(email_norm)`, `(phone_digits)`. En `debacu_eval_guest_index` también `(identity_key, risk_band)`.

## 8. Plan por fases
**Fase 1 (quick wins)**
1. Redirigir a `guest_lookup` el modo GLOBAL de `SearchRatings` y bloquear el acceso directo.
2. Ajustar `ChannelLeakDetailDrawer` para mostrar solo `identity_key` y evitar descargas de PII.
3. Forzar advertencias y descargas anonimizadas en `ExportsViewAuditor`.

**Fase 2 (refactor estructural)**
1. Añadir columnas de keys a `debacu_evaluations` y crear `public.debacu_eval_guest_index` con `org_id`.
2. Reescribir funciones (`debacu_eval_channel_leak_detail_get`, `customer_audit_export_build`, `debacu-eval-my-ratings-search`, `debacu_eval_check_signals`) para trabajar con keys hashed.
3. Implementar `guest_lookup` y aplicar RLS sobre las tablas clave.

**Fase 3 (Revenue intelligence + forecast)**
1. Materializar `incidents_by_type`, `by_channel`, `trend_monthly`, `forecast_monthly`.
2. Actualizar `customerRevenueChannelsGet` y las vistas (Channel/Risk/Leaks) para leer esas vistas.
3. Integrar el forecast en `DashboardHome` y el nuevo `guest_lookup`.

## 9. Checklist exacta (frontend/backend/sql)
- **Frontend**
  1. `src/components/SearchRatings.tsx` / `src/services/clientService.ts`: migrar a `guest_lookup` y eliminar la consulta directa.
  2. `src/components/ChannelLeakDetailDrawer.tsx`: exponer solo `identity_key`.
  3. `src/components/RatingForm.tsx` y `ScreeningCsv`/`ImportWizard`: mostrar únicamente hashes.
  4. `ExportsViewAuditor.tsx` / `HistoryViewAuditor.tsx`: avisar antes de descargar PII.
- **Backend (Edge)**
  1. `supabase/functions/debacu-eval-add/index.ts`: documentar y verificar normalización de keys.
  2. `supabase/functions/debacu_eval_channel_leak_detail_get` y `debacu-eval-my-ratings-search`: devolver claves hashed + agregados.
  3. `debacu_eval_check_signals` y nuevo `guest_lookup`: usar índices y evitar PII.
  4. `customer_*` / `client_*`: apuntar a materializaciones.
- **SQL / DB**
  1. `public.debacu_evaluations`: añadir `identity_key`, `doc_key`, `email_key`, `phone_key`, `org_id`; crear índices recomendados.
  2. Crear `public.debacu_eval_guest_index` multi-tenant y `public.debacu_eval_forecast`.
  3. Definir funciones SQL para derivar keys y aplicar RLS.

## 10. Apéndice trazable
- `rg -n "debacu_evaluations" supabase`: identificó todas las Edge Functions que leen/insertan la tabla (`client_*`, `customer_*`, `debacu_eval_*`, `debacu-eval-*`).
- `rg --fixed-strings -n '.from("debacu_evaluations"' src/services/evaluationService.ts`: confirmó la única consulta frontal con PII.
- `Select-String -Path supabase/functions/debacu-eval-add/index.ts -Pattern 'document_norm' -Context 5`: mostró el pipeline de normalización y la inserción de `identity_key`.
