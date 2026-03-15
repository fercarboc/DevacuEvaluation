# DebacuEvaluation360 — Memoria Técnica
**Versión:** 1.0 — Marzo 2026
**Confidencial — Uso interno / Inversores / Convocatorias públicas (NEOTEC)**

---

## 1. Descripción del proyecto

**DebacuEvaluation360** es una plataforma SaaS de inteligencia de riesgo hotelero basada en una red colaborativa de datos anonimizados. Permite a establecimientos de alojamiento (hoteles, hostales, apartamentos, casas rurales) evaluar el perfil de riesgo de un huésped antes del check-in, a partir de señales agregadas procedentes de toda la red, sin exponer datos de identificación entre competidores.

### Problema que resuelve

El sector hotelero carece de una infraestructura compartida para la prevención de fraude y daños en establecimientos. Cada hotel gestiona sus incidencias de forma aislada (hojas de cálculo, anotaciones internas, memoria del personal) sin posibilidad de contrastar si un huésped tiene historial de incidencias en otros establecimientos. Esto genera:

- Pérdidas económicas recurrentes por daños, impagos, robos y comportamientos disruptivos
- Incapacidad para tomar decisiones preventivas basadas en datos
- Ausencia de trazabilidad del impacto económico de las incidencias
- Falta de herramientas de recuperación (seguimiento de cobros, reclamaciones a seguro)

### Solución

Una red de datos colaborativa donde:
1. Cada hotel contribuye sus registros de estancias e incidencias (pseudoanonimizados)
2. La plataforma calcula un *Score Debacu* (0–100) para cada identidad de la red
3. Al consultar un huésped futuro, el hotel recibe señales de riesgo agregadas — sin conocer qué hotel las generó
4. El circuito económico queda cerrado: registro de incidencia → seguimiento de recuperación → impacto neto

---

## 2. Estado del arte y diferenciación tecnológica

### 2.1 Soluciones existentes

| Solución | Tipo | Limitación |
|----------|------|------------|
| Listas negras hoteleras manuales | Hoja de cálculo / email | No escalable, sin red, sin anonimización |
| Sistemas de scoring de crédito (Experian, Equifax) | B2C financiero | No orientado a alojamiento, no captura incidencias de comportamiento |
| Plataformas de reputación de huésped (Bruisr, GuestBook) | Anglosajón | Sin presencia en mercado hispanohablante, sin motor de riesgo propio, sin trazabilidad económica |
| PMS con notas internas (Opera, Mews, Cloudbeds) | Siloed | Los datos quedan encerrados en el PMS del hotel, no hay red |
| Listas de sanciones (Refinitiv, OFAC) | Cumplimiento normativo | Solo perfil sancionador, no incidencias hoteleras |

### 2.2 Diferenciación de DebacuEvaluation360

| Elemento diferencial | Descripción |
|----------------------|-------------|
| **Red colaborativa sector-específica** | Datos exclusivamente de alojamiento turístico — señales calibradas para el sector |
| **Privacidad por diseño** | El hotel consultante nunca sabe qué hotel reportó. El proveedor nunca sabe quién es el huésped |
| **Motor de score propio** | Algoritmo determinista (v1) → ML/clustering (v2). Score 0–100 con bandas de riesgo accionables |
| **Trazabilidad económica completa** | `reported_amount` → `recovered_amount` → `net_loss` por incidencia |
| **Catálogo de incidencias privado** | Cada hotel configura sus propios tipos e importes. Los importes nunca se comparten |
| **Doble canal de entrada** | API para PMS (tiempo real) + ImportWizard CSV (disponible desde día 1 sin integración) |
| **Multi-tenant seguro** | Un único set de tablas. Cada org solo descifra sus propios PII. El score es global |

---

## 3. Arquitectura técnica

### 3.1 Stack tecnológico

```
Frontend
  React 18 + TypeScript + Vite
  TailwindCSS
  React Router v7
  Supabase JS Client

Backend / API
  Supabase Edge Functions (Deno / TypeScript)
  PostgreSQL 15 (Supabase managed)
  Supabase Vault (gestión de claves de cifrado)
  Supabase Auth (autenticación JWT)

Infraestructura
  Supabase Cloud (región EU — cumplimiento RGPD)
  CDN + hosting: Vercel / Netlify
  Dominio + TLS gestionado

Seguridad
  SHA-256 para identity_key (irreversible)
  AES-256-GCM para PII (cifrado en reposo)
  Row Level Security (RLS) en todas las tablas sensibles
  API keys por hotel para ingesta PMS
```

### 3.2 Modelo de datos — Tablas principales

```
debacu_eval_guest_records          — Registro central de estancias (multi-tenant)
debacu_eval_incidents              — Incidencias por hotel (privadas por org)
debacu_eval_incident_catalog       — Catálogo de tipos de incidencia por hotel
debacu_eval_watch_reservations     — Vigilancia de próximos check-ins
debacu_eval_hotel_profile          — Perfil del establecimiento
debacu_eval_query_log              — Auditoría de consultas (acceso a datos)
debacu_eval_api_keys               — Claves de integración PMS por hotel
```

### 3.3 Flujo de datos — Ingesta

```
Origen de datos
  ├── PMS via API  →  POST /debacu_eval_pms_ingest
  │                   Auth: Bearer {api_key_hotel}
  │
  └── CSV manual  →  POST /debacu_eval_import_csv
                      Auth: JWT usuario autenticado

Edge Function (común a ambos canales)
  │
  ├── 1. Valida credenciales → resuelve org_id + property_id
  ├── 2. Genera identity_key = SHA-256( jerarquía: DOC > EMAIL > PHONE )
  ├── 3. Cifra PII con AES-256-GCM (clave en Vault)
  ├── 4. Upsert en debacu_eval_guest_records
  └── 5. Encola recálculo de risk_score (o responde con score actual)
```

### 3.4 Flujo de datos — Consulta

```
Hotel consulta huésped futuro
  │
  ▼
POST /debacu_eval_screening
  │
  ├── Genera identity_key del documento / email / teléfono consultado
  ├── Busca en debacu_eval_guest_records (búsqueda global por identity_key)
  ├── Agrega señales de TODOS los orgs que tienen ese identity_key
  │     ├── Suma incidencias (count, severity)
  │     ├── Suma net_loss (anonimizado → rango)
  │     ├── Cuenta orgs distintas
  │     └── Calcula ventana temporal (última incidencia)
  ├── Calcula / recupera risk_score (0–100) y risk_band
  ├── Registra consulta en debacu_eval_query_log (auditoría)
  └── Devuelve respuesta anonimizada:
        {
          risk_band: "HIGH",
          score: 79,
          incidents_count: 3,
          orgs_count: 1,           ← cuántas orgs distintas reportaron
          net_loss_range: "200-400",  ← nunca el importe exacto
          temporal_window: "≤3m",
          match: true
        }
```

---

## 4. Motor de riesgo — Score Debacu

### 4.1 Versión 1 — Algoritmo determinista

El score (0–100) se calcula ponderando señales anonimizadas de la red:

| Factor | Peso | Lógica |
|--------|------|--------|
| Número de incidencias | Alto (35%) | Escala logarítmica — la diferencia entre 1 y 5 es mayor que entre 10 y 15 |
| Severidad media | Alto (30%) | CRITICAL=4, HIGH=3, MEDIUM=2, LOW=1 → media ponderada |
| Recencia | Medio (15%) | Incidencia de hace 1 mes pesa 1.0, de hace 12 meses pesa 0.3 |
| Número de orgs distintas | Medio (12%) | Si 3 hoteles distintos lo reportan, el patrón es más fiable |
| Net loss ratio | Bajo (8%) | Impacto económico normalizado (rango, no importe exacto) |

**Bandas de riesgo resultantes:**
```
0–29:   LOW      — sin señales significativas
30–59:  MEDIUM   — señales moderadas, vigilancia recomendada
60–79:  HIGH     — señales claras, acción preventiva recomendada
80–100: CRITICAL — historial grave, política del hotel a criterio
```

### 4.2 Versión 2 — Motor IA (roadmap)

Extensiones planificadas sobre el motor determinista:

| Capacidad | Descripción técnica |
|-----------|---------------------|
| **Detección de identidades relacionadas** | Clustering por patrones: misma nacionalidad + canal de reserva + ventana temporal + rango de edad — sin cruzar identity_keys |
| **Grupos de riesgo correlados** | Identidades que aparecen juntas en incidencias de distintos hoteles → señal de grupo |
| **Score predictivo** | Probabilidad de incidencia en próxima estancia basada en historial y contexto de reserva (canal, temporada, duración) |
| **Señales débiles acumuladas** | Una incidencia LOW no dispara alerta, pero 4 incidencias LOW en 6 meses en 3 hoteles distintos sí |
| **Ajuste por recuperación** | Si el huésped pagó el daño → el score se reduce proporcionalmente |

---

## 5. Privacidad por diseño — Arquitectura RGPD

### 5.1 Fundamento legal

El tratamiento se basa en **interés legítimo (Art. 6.1.f RGPD)**, reforzado por:
- DPA (Data Processing Agreement) firmado por cada hotel al solicitar acceso
- Finalidad: prevención de daños y fraude en el sector de alojamiento turístico
- Proporcionalidad: solo señales de riesgo, no perfiles de comportamiento general

### 5.2 Capas de anonimización

```
Capa 1 — Pseudoanonimización del identificador
  identity_key = SHA-256( "DOC:" + numero_documento )
  → Irreversible. Permite búsqueda cruzada sin revelar el documento.
  → Jerarquía: DOC > EMAIL > PHONE (el nombre nunca se usa — homónimos)

Capa 2 — Cifrado de PII
  Los campos personales (nombre, documento, email, teléfono, fecha de nacimiento)
  se cifran con AES-256-GCM antes de almacenar.
  La clave está en Supabase Vault — nunca en el código.
  Solo el org propietario del registro puede descifrar su PII.
  Cada acceso queda auditado en debacu_eval_query_log.

Capa 3 — Anonimización de la respuesta
  El hotel consultante recibe:
  - Número de incidencias (exacto)
  - Risk band (LOW/MEDIUM/HIGH/CRITICAL)
  - Rango de impacto económico (< 200 / 200-400 / 400-600 / 600-800 / > 800 €)
  - Número de orgs distintas (sin identificar cuáles)
  - Ventana temporal (≤1m / ≤3m / ≤6m / >6m)

  El hotel consultante NUNCA recibe:
  - Qué hotel registró el incidente
  - El importe exacto
  - La fecha exacta del incidente
  - El tipo de incidencia concreto
  - Las notas internas
```

### 5.3 Derecho al olvido

```
DELETE /functions/v1/debacu_eval_guest_forget
  { "identity_key": "sha256..." }

→ Elimina todos los registros de ese identity_key de la tabla compartida
→ Elimina PII cifrada del org solicitante
→ Mantiene contadores agregados (no identificables) si así lo requiere
   el DPA firmado con ese hotel (configuración de retención)
```

---

## 6. Integración con PMS — Especificación de API

### 6.1 Autenticación

Cada hotel recibe una API key única al activar la integración:

```
Authorization: Bearer deb_live_{32_chars_aleatorios}
```

La key identifica al hotel (org_id + property_id) en el backend. No hay credenciales de usuario en la integración PMS.

### 6.2 Endpoint de ingesta

```
POST https://[proyecto].supabase.co/functions/v1/debacu_eval_pms_ingest
Content-Type: application/json
Authorization: Bearer {API_KEY_DEL_HOTEL}
```

**Payload mínimo:**
```json
{
  "reservations": [
    {
      "checkin_date":    "2026-08-20",
      "checkout_date":   "2026-08-22",
      "document_number": "44764767M"
    }
  ]
}
```

**Payload completo:**
```json
{
  "reservations": [
    {
      "document_number": "44764767M",
      "email":           "guest@example.com",
      "phone":           "+34600123456",
      "full_name":       "PÉREZ GARCÍA, JUAN",
      "date_of_birth":   "1979-10-02",
      "nationality":     "ES",
      "gender":          "M",
      "loyalty_tier":    "Club",
      "reservation_ref": "RES-1001",
      "booking_source":  "BOOKING",
      "status":          "CONFIRMED",
      "checkin_date":    "2026-08-20",
      "checkout_date":   "2026-08-22",
      "currency":        "EUR",
      "total_amount":    298.60,
      "nights":          2,
      "rooms":           1
    }
  ]
}
```

**Respuesta:**
```json
{
  "ok": true,
  "processed": 1,
  "results": [
    {
      "reservation_ref": "RES-1001",
      "identity_key":    "a3f9...d2",
      "risk_band":       "HIGH",
      "score":           79,
      "match":           true
    }
  ]
}
```

### 6.3 Frecuencia recomendada de llamada

| Evento PMS | Cuándo llamar |
|------------|---------------|
| Reserva confirmada | Inmediatamente — alerta temprana |
| Check-in D-7 | Reconsulta — el score puede haber cambiado |
| Check-in D-1 | Reconsulta final — cron nocturno o evento |
| Check-in real | Opcional — confirmación en tiempo real en recepción |

### 6.4 Compatibilidad por PMS

| PMS | Mecanismo de integración | Estado |
|-----|--------------------------|--------|
| Mews | Webhook nativo en evento `reservation.confirmed` | Pendiente |
| Opera Cloud | Oracle Integration Cloud Webhooks | Pendiente |
| Cloudbeds | Webhooks API v2 | Pendiente |
| Ulyses Cloud (Tesipro) | Export API / webhooks | Pendiente |
| Cualquier PMS | CSV + ImportWizard (perfil de columnas guardado) | Disponible |

---

## 7. Módulo de Revenue Intelligence

Módulo paralelo al motor de riesgo, orientado al seguimiento económico de incidencias:

### Tablas específicas

```
debacu_eval_incidents
  reported_amount    DECIMAL   — pérdida estimada
  recovered_amount   DECIMAL   — recuperado (cobro, seguro, fianza)
  net_loss           DECIMAL   — reported - recovered (calculado)
  recovery_source    TEXT      — CLIENT_PAID | INSURANCE | PARTIAL
  status             TEXT      — OPEN | RESOLVED | CLAIMED

debacu_eval_incident_catalog
  code               TEXT      — SMOKING | LOST_KEY | DAMAGE | ...
  base_amount        DECIMAL   — importe base del hotel (privado)
  severity           TEXT      — LOW | MEDIUM | HIGH | CRITICAL
```

### Dashboard ejecutivo

- Impacto neto del mes (bruto − recuperado)
- Tendencia 6 meses
- Top plataformas de reserva por impacto
- Score de riesgo agregado del período

---

## 8. Módulo de vigilancia de próximos check-ins

```
debacu_eval_watch_reservations
  identity_key      — huésped a vigilar
  checkin_date      — fecha de entrada
  last_risk_band    — band en el momento de la última consulta
  alert_pending     BOOLEAN   — cambió desde la última consulta
  alert_seen_at     TIMESTAMPTZ
```

**Agente nocturno (cron 02:00):**
- Escanea check-ins en ventana HOY → HOY+14
- Recalcula risk_band para cada identity_key
- Si cambió → `alert_pending = true` → notificación al hotel

---

## 9. Hoja de ruta técnica

### Q1 2026 — Base operativa (completado)
- [x] Motor de score determinista v1
- [x] Ingesta CSV con ImportWizard
- [x] Cifrado PII (AES-256-GCM)
- [x] Dashboard de impacto económico
- [x] Catálogo de incidencias por hotel
- [x] Módulo de recuperación (net_loss)
- [x] Perfil de hotel con campo PMS

### Q2 2026 — Red y automatización
- [ ] Agente cron de vigilancia de check-ins
- [ ] Sistema de alertas (email / push)
- [ ] API key por hotel para ingesta PMS
- [ ] Primera integración PMS nativa (piloto)
- [ ] Endpoint derecho al olvido

### Q3 2026 — Inteligencia
- [ ] Motor IA v2: clustering de identidades relacionadas
- [ ] Score predictivo por contexto de reserva
- [ ] Detección de señales débiles acumuladas

### Q4 2026 — Escala
- [ ] Integraciones PMS adicionales (3–5 PMS)
- [ ] API pública documentada (portal developer)
- [ ] Modelo B2B2H: PMS como canal de distribución
- [ ] Panel analítico para cadenas hoteleras (multi-property)

---

## 10. Indicadores técnicos clave (KPIs)

| Indicador | Objetivo Q2 2026 |
|-----------|-----------------|
| Latencia consulta de riesgo | < 300 ms (p95) |
| Disponibilidad | 99.5 % mensual |
| Tiempo de ingesta CSV (100 filas) | < 5 s |
| Cobertura identity_key | > 85 % de reservas con doc o email válido |
| Tamaño de red | > 500 huéspedes únicos en red |

---

## 11. Modelo de negocio técnico

```
Tier BÁSICO    — 150 consultas/mes  — CSV manual
Tier MEDIO     — 500 consultas/mes  — CSV manual + perfiles guardados
Tier PREMIUM   — 2.000 consultas/mes — CSV + API PMS + alertas
Tier ENTERPRISE — Sin límite         — API + integración PMS dedicada
                                      + SLA + soporte técnico
```

**Canal B2B2H (PMS como distribuidor):**
- El PMS integra Debacu en su plataforma
- Sus hoteles clientes acceden sin fricción (ya dentro del PMS)
- Modelo de revenue sharing o tarifa por hotel activo/mes

---

*Documento confidencial — DebacuEvaluation360 — Marzo 2026*
*No distribuir sin autorización expresa.*
