# DEBACU — Consultas de Negocio desde PMS
## Documento de definición v1.0

---

## ARQUITECTURA DE CONSULTAS

Las 3 consultas leen de las tablas canónicas PMS (ya sincronizadas).
NO hacen llamadas directas al PMS — leen de la DB de Debacu.
Esto garantiza velocidad de respuesta y no consume rate limit del PMS.

```
PMS → [Sync automático] → pms_stays / pms_reservations / pms_guests
                               ↓
                    Edge Functions de consulta
                               ↓
                    Frontend Debacu (cliente)
                               ↓
                    Motores IA → Alertas / Scoring
```

---

## CONSULTA 1 — RIESGO IN-HOUSE
**Nombre:** `pms-query-inhouse-risk`
**Cuándo:** Agente nocturno (2AM) + consulta manual desde recepción

### Input
```json
{
  "property_id": "uuid",
  "org_id": "uuid",
  "date": "2024-03-18"  // opcional, default = hoy
}
```

### Lógica
```sql
SELECT
  s.external_stay_id,
  s.external_reservation_id,
  s.external_guest_id,
  s.external_room_id,
  s.adults,
  s.children,
  s.arrival_scheduled_at,
  s.departure_scheduled_at,
  s.check_in_at,
  s.channel_code,         -- de la reserva asociada
  s.nights,               -- de la reserva asociada
  g.name_key,
  g.email_key,
  g.document_key,
  g.nationality_code,
  g.country_code
FROM pms_stays s
LEFT JOIN pms_guests g ON g.external_guest_id = s.external_guest_id
                       AND g.connection_id = s.connection_id
WHERE s.property_id = ?
  AND s.org_id = ?
  AND s.stay_status = 'IN_HOUSE'
ORDER BY s.departure_scheduled_at ASC
```

### Cruce con motor de riesgo Debacu
Para cada huésped con identity_key:
→ Consultar `debacu_eval_identity_risk_state` por identity_key
→ Devolver risk_level, risk_score, incidents_total

### Output por huésped
```json
{
  "stayId": "...",
  "roomId": "...",
  "checkoutDate": "2024-03-20",
  "nightsRemaining": 2,
  "adults": 2,
  "channelCode": "BookingCom",
  "riskLevel": "HIGH",        // del motor Debacu
  "riskScore": 78,            // del motor Debacu
  "incidentsTotal": 3,        // del motor Debacu
  "hasRiskSignals": true,
  "alertPriority": "URGENT"   // calculado: HIGH + checkout pronto
}
```

### Lógica de prioridad de alerta
```
URGENT  = riskLevel HIGH  + nightsRemaining <= 1
HIGH    = riskLevel HIGH  + nightsRemaining <= 3
MEDIUM  = riskLevel MEDIUM
LOW     = riskLevel LOW o NONE
```

---

## CONSULTA 2 — RESERVAS FUTURAS (PRE-SCREENING)
**Nombre:** `pms-query-future-reservations`
**Cuándo:** Cron diario (6AM) + consulta manual

### Input
```json
{
  "property_id": "uuid",
  "org_id": "uuid",
  "date_from": "2024-03-18",   // default = hoy
  "date_to": "2024-12-31",     // default = fin de año
  "statuses": ["CONFIRMED", "PENDING"]  // opcional
}
```

### Lógica
```sql
SELECT
  r.external_reservation_id,
  r.external_confirmation_code,
  r.external_guest_id,
  r.status,
  r.check_in_date,
  r.check_out_date,
  r.nights,
  r.adults,
  r.children,
  r.channel_code,
  r.channel_name,
  r.rate_plan_code,
  r.total_amount,
  r.currency_code,
  r.booked_at,
  g.name_key,
  g.email_key,
  g.document_key,
  g.nationality_code
FROM pms_reservations r
LEFT JOIN pms_guests g ON g.external_guest_id = r.external_guest_id
                       AND g.connection_id = r.connection_id
WHERE r.property_id = ?
  AND r.org_id = ?
  AND r.check_in_date >= ?
  AND r.check_in_date <= ?
  AND r.status IN ('CONFIRMED', 'PENDING', 'IN_HOUSE')
ORDER BY r.check_in_date ASC
```

### Cruce con motor de riesgo
Para cada reserva con external_guest_id:
→ Buscar pms_guests por external_guest_id → obtener identity_key
→ Consultar debacu_eval_identity_risk_state
→ Añadir risk_level al resultado

### Output agregado
```json
{
  "period": { "from": "2024-03-18", "to": "2024-12-31" },
  "totalReservations": 145,
  "riskSummary": {
    "HIGH": 3,
    "MEDIUM": 12,
    "LOW": 45,
    "NONE": 85,
    "UNKNOWN": 0
  },
  "upcomingAlerts": [
    {
      "reservationId": "...",
      "checkInDate": "2024-03-19",
      "riskLevel": "HIGH",
      "riskScore": 82,
      "channelCode": "BookingCom",
      "nights": 3,
      "alertType": "HIGH_RISK_ARRIVAL"
    }
  ],
  "reservations": [ /* lista completa */ ]
}
```

---

## CONSULTA 3 — REVENUE ANALYTICS
**Nombre:** `pms-query-revenue`
**Cuándo:** Consulta manual + dashboard revenue

### Input
```json
{
  "property_id": "uuid",
  "org_id": "uuid",
  "date_from": "2024-03-01",   // configurable por usuario
  "date_to": "2024-03-31",
  "compare_with": {            // opcional — período de comparación
    "date_from": "2024-02-01",
    "date_to": "2024-02-29"
  },
  "rooms_total": 120           // total habitaciones del hotel (de debacu_eval_properties)
}
```

### Métricas calculadas

#### ADR (Average Daily Rate)
```
ADR = SUM(room_revenue_amount) / COUNT(noches_ocupadas)
```

#### RevPAR (Revenue Per Available Room)
```
RevPAR = SUM(room_revenue_amount) / (rooms_total × días_período)
```

#### Ocupación %
```
Ocupación = (COUNT(noches_ocupadas) / (rooms_total × días_período)) × 100
```

#### Pickup (reservas nuevas por día)
```sql
SELECT
  DATE(booked_at) as booking_date,
  COUNT(*) as new_reservations,
  SUM(total_amount) as new_revenue
FROM pms_reservations
WHERE property_id = ?
  AND org_id = ?
  AND booked_at >= ?
  AND booked_at <= ?
  AND status NOT IN ('CANCELLED', 'NO_SHOW')
GROUP BY DATE(booked_at)
ORDER BY booking_date ASC
```

### Output
```json
{
  "period": { "from": "2024-03-01", "to": "2024-03-31", "days": 31 },
  "metrics": {
    "adr": { "value": 125.50, "currency": "EUR", "vs_prev": "+8.2%" },
    "revpar": { "value": 89.30, "currency": "EUR", "vs_prev": "+5.1%" },
    "occupancy": { "value": 71.2, "unit": "%", "vs_prev": "-2.3%" },
    "totalRevenue": { "value": 332450.00, "currency": "EUR", "vs_prev": "+6.8%" }
  },
  "pickup": [
    { "date": "2024-03-01", "newReservations": 12, "newRevenue": 4500.00 },
    { "date": "2024-03-02", "newReservations": 8, "newRevenue": 2800.00 }
  ],
  "comparison": { /* mismas métricas para período anterior */ },
  "channelMix": [
    { "channelCode": "BookingCom", "reservations": 45, "revenue": 12500, "pct": 31.2 },
    { "channelCode": "Direct", "reservations": 38, "revenue": 11200, "pct": 26.3 }
  ]
}
```

---

## EDGE FUNCTIONS A CREAR (Bloque siguiente)

| Función | Frecuencia | Trigger |
|---------|-----------|---------|
| `pms-query-inhouse-risk` | Cada 15min + manual | Agente nocturno + recepción |
| `pms-query-future-reservations` | Diario 6AM + manual | Dashboard + cron |
| `pms-query-revenue` | Manual + configurable | Dashboard revenue |

---

## INTEGRACIÓN CON MOTORES IA

### Motor de Riesgo (ya existe en Debacu)
- Input: identity_key del huésped PMS
- Lookup: `debacu_eval_identity_risk_state`
- Output: risk_level, risk_score, incidents_total

### Motor de Revenue (Fase 2)
- Input: métricas de pms-query-revenue
- Features: ADR_vs_historico, RevPAR_tendencia, canal_concentracion
- Output: alertas de revenue leak, forecast

### Agente Nocturno (caso estrella)
```
2:00 AM cada día:
  1. pms-query-inhouse-risk → huéspedes IN_HOUSE
  2. Cruzar con motor de riesgo
  3. Filtrar alertPriority = URGENT | HIGH
  4. Enviar notificaciones al recepcionista de turno
```
