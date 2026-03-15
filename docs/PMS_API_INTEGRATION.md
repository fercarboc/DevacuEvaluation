# Integración PMS → DebacuEvaluation360 — Especificación técnica

**Versión:** 1.2 — Marzo 2026
**Estado:** Borrador para revisión

---

## 1. Base legal — RGPD e interés legítimo

**El tratamiento de datos se fundamenta en interés legítimo (Art. 6.1.f RGPD).**

Cada hotel firma el DPA (Data Processing Agreement) en el momento de solicitar acceso a la plataforma. Este acuerdo cubre:
- Custodia de datos de huéspedes con historial de incidencias
- Tratamiento con finalidad de prevención de daños y fraude hotelero
- Interés legítimo del sector para compartir señales de riesgo de forma anonimizada
- Derecho al olvido: el huésped puede solicitar eliminación de sus datos (`DELETE /guests/{identity_key}`)
- Retención: se define por contrato (ej. 3 años desde la última estancia)

**Ningún hotel conoce:**
- Qué hotel registró el incidente
- El importe exacto de la pérdida
- La valoración concreta de otro hotel

**La plataforma muestra únicamente señales agregadas y anonimizadas.**

---

## 2. Modelo de integración

**Debacu proporciona la API. El PMS la llama.**

```
PMS (Opera, Mews, Cloudbeds, etc.)
        │
        │  POST /functions/debacu_eval_pms_ingest
        │  Authorization: Bearer {API_KEY_DEL_HOTEL}
        ▼
DebacuEvaluation360 (Edge Function)
        │
        ├─ Valida API key → identifica org_id + property_id
        ├─ Genera identity_key (SHA-256 irreversible)
        ├─ Encripta PII (AES-256-GCM)
        └─ Almacena en tabla compartida
```

---

## 3. Catálogo de incidencias por hotel

Cada hotel configura su propio catálogo de tipos de incidencia con sus valoraciones.
**Los importes son privados del hotel — nunca se comparten con la red.**

### Tabla `debacu_eval_incident_catalog`

```
org_id             UUID
property_id        UUID    -- NULL = aplica a todo el grupo
code               TEXT    -- 'SMOKING' | 'LOST_KEY' | 'EXTRA_GUESTS' | ...
label              TEXT    -- "Fumar en habitación"
severity           TEXT    -- 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
base_amount        DECIMAL -- Importe base que estima el hotel (€)
is_active          BOOLEAN
```

### Ejemplos reales

| Código | Descripción | Hotel A | Hotel B | Gravedad |
|--------|-------------|---------|---------|----------|
| `SMOKING` | Fumar en habitación | 25 € | 12 € | HIGH |
| `LOST_KEY` | Pérdida de llave | 5 € | 12 € | LOW |
| `LOST_ROBE` | Pérdida albornoz | 30 € | 34 € | MEDIUM |
| `LOST_FRAME` | Pérdida marco/decoración | 30 € | — | LOW |
| `EXTRA_GUESTS` | Personas no declaradas | 80 € | 60 € | HIGH |
| `EXCESSIVE_NOISE` | Ruidos / fiesta no autorizada | 150 € | 100 € | HIGH |
| `EXCESSIVE_DIRT` | Suciedad excesiva | 60 € | 45 € | MEDIUM |
| `DAMAGE` | Daños en mobiliario | libre | libre | CRITICAL |

### Al registrar una incidencia

1. El hotel selecciona el tipo del catálogo
2. El sistema propone el importe base del catálogo del hotel
3. El hotel puede ajustarlo al caso concreto
4. Se asigna el `severity` del catálogo → contribuye al `risk_band` del huésped

---

## 4. Registro de incidencia y seguimiento económico

### Tabla `debacu_eval_incidents`

```
id
org_id              -- privado: qué hotel lo registró (nunca se expone fuera)
property_id         -- qué propiedad concreta
identity_key        -- SHA-256 del huésped (enlace anonimizado)
catalog_code        -- tipo de incidencia del catálogo propio
severity            -- LOW | MEDIUM | HIGH | CRITICAL
reported_amount     DECIMAL   -- importe estimado de la pérdida
recovered_amount    DECIMAL   -- lo que se recuperó (0 por defecto)
recovery_source     TEXT      -- 'CLIENT_PAID' | 'INSURANCE' | 'PARTIAL' | NULL
net_loss            DECIMAL   -- reported_amount - recovered_amount (calculado)
incident_date       DATE
notes               TEXT      -- observaciones internas (encriptadas)
status              TEXT      -- 'OPEN' | 'RESOLVED' | 'CLAIMED'
```

### Flujo de recuperación

```
Incidencia registrada:
  reported_amount = 30 € (pérdida albornoz)
  recovered_amount = 0
  net_loss = 30 €
  status = OPEN

Cliente abona en check-out:
  recovered_amount = 30 €
  net_loss = 0 €
  recovery_source = 'CLIENT_PAID'
  status = RESOLVED

Reclamación parcial al seguro:
  recovered_amount = 4.50 € (15% del seguro)
  net_loss = 25.50 €
  recovery_source = 'INSURANCE'
  status = RESOLVED
```

---

## 5. Motor de riesgo — Score Debacu

### Inputs del score

El score (0–100) se calcula a partir de señales anonimizadas de toda la red:

| Factor | Peso | Descripción |
|--------|------|-------------|
| Número de incidencias | Alto | Más incidencias → más riesgo |
| Severidad media | Alto | CRITICAL pesa más que LOW |
| Ventana temporal | Medio | Incidencias recientes pesan más |
| Número de orgs distintas | Medio | Si varios hoteles distintos lo reportan |
| Número de propiedades | Bajo | Amplitud del patrón |
| Net loss acumulado | Medio | Impacto económico total (anonimizado) |
| Ratio de recuperación | Bajo | Si recuperó → el impacto real es menor |

### Bandas de riesgo

```
0–29:   LOW    — sin señales significativas
30–59:  MEDIUM — señales moderadas, vigilancia recomendada
60–79:  HIGH   — señales claras, acción preventiva recomendada
80–100: CRITICAL — historial grave, política de hotel a criterio
```

### Motor IA (futuro próximo)

El score actual es determinista (reglas fijas). El motor IA añade:

- **Detección de patrones**: identidad_key distinta pero mismo patrón de comportamiento (mismo rango de edad, misma nacionalidad, mismo canal de reserva, misma ventana temporal)
- **Clustering**: grupos de identidades que viajan juntas y aparecen en incidencias correladas
- **Predicción**: probabilidad de incidencia en la próxima estancia basada en histórico y contexto
- **Señales débiles**: una sola incidencia de baja gravedad no dispara alerta, pero el motor puede detectar acumulación de señales débiles que juntas son significativas
- **Ajuste temporal**: incidencias de hace 2 años pesan menos que las de hace 1 mes

---

## 6. Qué se muestra al consultar un huésped

**Regla fundamental: ningún dato identifica al hotel que reportó el incidente.**

### Ejemplo de resultado de consulta (como en la pantalla actual)

```
SCORE DEBACU: 79/100
Riesgo: ALTO

RESUMEN AGREGADO (señales no identificables)
  Perfiles relacionados:  2
  Incidencias totales:    3
  Estancias registradas: 13
  Impacto estimado:      74 € (*)

CONTEXTO TEMPORAL
  Ventana:  ≤ 3 meses
  Orgs:     1
  Props:    1
  Match:    Sí

(*) El importe se muestra en rangos — nunca el valor exacto:
    < 200 €  |  200–400 €  |  400–600 €  |  600–800 €  |  > 800 €
```

### Lo que NUNCA se muestra al hotel consultante

| Dato | Razón |
|------|-------|
| Nombre del hotel que reportó | Privacidad entre competidores |
| Importe exacto de la pérdida | Cada hotel valora distinto — no es comparable |
| Fecha exacta del incidente | Podría identificar la propiedad |
| Tipo de incidencia concreto | Podría identificar la propiedad |
| Notas internas | Son privadas del hotel que las escribió |

### Lo que SÍ se muestra (señales agregadas)

| Dato | Cómo se muestra |
|------|----------------|
| Número de incidencias | Número exacto |
| Riesgo | Banda: LOW / MEDIUM / HIGH / CRITICAL |
| Ventana temporal | ≤ 1 mes / ≤ 3 meses / ≤ 6 meses / > 6 meses |
| Número de orgs distintas | Número (sin identificar cuáles) |
| Impacto económico | Rango: <200 / 200-400 / 400-600 / 600-800 / >800 |
| Score Debacu | 0–100 |

---

## 7. Tabla principal — Arquitectura multi-tenant

```
debacu_eval_guest_records
─────────────────────────────────────────────────────────────
identity_key       TEXT        -- SHA-256 — índice global compartido
org_id             UUID        -- quién registró el dato
property_id        UUID        -- propiedad concreta
pii_encrypted      JSONB       -- nombre, doc, email, teléfono (AES-256)
checkin_date       DATE        -- sin cifrar (búsquedas por fecha)
checkout_date      DATE
booking_source     TEXT
source             TEXT        -- 'PMS_API' | 'CSV_IMPORT' | 'MANUAL'
risk_band          TEXT        -- NULL | LOW | MEDIUM | HIGH | CRITICAL
risk_score         INT         -- 0-100
risk_updated_at    TIMESTAMPTZ
last_checked_at    TIMESTAMPTZ
created_at         TIMESTAMPTZ
```

**Visibilidad:**
- PII: cada org solo descifra sus propios registros
- `risk_band` / `risk_score`: calculados de la red global, visibles en consulta
- Dentro del mismo grupo (mismo org_id): el resultado indica en qué propiedad hay registro

---

## 8. Motor de re-consulta y vigilancia de futuros check-ins

### Tabla de vigilancia

```
debacu_eval_watch_reservations
─────────────────────────────────────────────────────────────
org_id
property_id
identity_key
checkin_date
last_risk_band     -- risk_band en el momento de la última consulta
last_checked_at
alert_pending      BOOLEAN
alert_seen_at      TIMESTAMPTZ
```

### Flujo de re-consulta

```
DÍA 0: Hotel sube 30 reservas de agosto
  → 30 registros en watch_reservations
  → last_risk_band para cada uno (NULL o el que exista)

DÍA 5: Hotel vuelve a consultar un huésped futuro
  → Sistema detecta: ya está en watch
  → Re-analiza risk_band en la red
  → Si cambió → alert_pending = true
  → "Huésped con nuevo riesgo desde tu última consulta"

DÍA N (cron nocturno 02:00):
  → Escanea checkin_date entre HOY y HOY+14
  → Re-analiza todos
  → Genera alertas si risk_band cambió
```

---

## 9. Panel "Próximos Check-ins" con alertas IA

```
┌────────────────────────────────────────────────────────┐
│  📅 PRÓXIMOS CHECK-INS · Hotel Costa Mar               │
│  Mañana · 18 entradas · ⚠️ 2 alertas nuevas           │
├────────────────────────────────────────────────────────┤
│  🔴 Juan P. · Hab 301 · Check-in mañana               │
│     Riesgo ALTO · Detectado hace 2 días               │
│     Impacto estimado: 200–400 €                        │
│     [Ver señales]                                      │
├────────────────────────────────────────────────────────┤
│  🟡 Anna S. · Hab 104 · Check-in mañana               │
│     Riesgo MEDIO · Sin incidencias propias            │
│     [Ver señales]                                      │
├────────────────────────────────────────────────────────┤
│  ✅ 16 huéspedes sin alertas                          │
└────────────────────────────────────────────────────────┘
```

---

## 10. Encriptación

```
Capa 1 — identity_key (búsqueda cruzada)
  SHA-256("DOC:44764767M") → irreversible
  Jerarquía: DOC > EMAIL > PHONE
  Nombre NO se usa como identity_key (homónimos)

Capa 2 — PII (solo visible al org propietario)
  AES-256-GCM, clave en Supabase Vault
  Campos: full_name, document, email, phone, dob, address...
  Solo se descifra en consulta activa — cada acceso auditado
```

---

## 11. Payload API PMS

```json
POST /functions/v1/debacu_eval_pms_ingest
Authorization: Bearer deb_live_abc123xyz...

{
  "reservations": [
    {
      "document_number":    "44764767M",
      "email":              "guest@example.com",
      "phone":              "+34600123456",
      "full_name":          "PÉREZ GARCÍA, JUAN",
      "date_of_birth":      "1979-10-02",
      "nationality":        "ES",
      "gender":             "M",
      "loyalty_tier":       "Club",
      "reservation_ref":    "RES-1001",
      "booking_source":     "BOOKING",
      "status":             "CONFIRMED",
      "checkin_date":       "2026-08-20",
      "checkout_date":      "2026-08-22",
      "currency":           "EUR",
      "total_amount":       298.60,
      "nights":             2,
      "rooms":              1
    }
  ]
}
```

Mínimo requerido: `checkin_date` + uno de `document_number` / `email` / `phone`.

---

## 12. Compatibilidad PMS

| PMS | Método | Estado |
|-----|--------|--------|
| Mews | Webhooks nativos | Pendiente integración |
| Opera Cloud | Oracle Webhooks | Pendiente integración |
| Cloudbeds | Webhooks API | Pendiente integración |
| Ulyses Cloud (Tesipro) | Webhooks / export API | Pendiente integración |
| Cualquier PMS | CSV + ImportWizard | Disponible ahora |

---

## 14. Ruta de integración — De CSV a API nativa

### Filosofía: "La API está lista. Solo hay que conectarla."

La plataforma está diseñada desde el día 1 para recibir datos vía API. Mientras no existe integración nativa con un PMS concreto, los hoteles importan CSV manualmente. Cuando el PMS firma el acuerdo, se activa el canal automático — sin cambios en la plataforma, solo en el punto de entrada de datos.

### Diagrama de fases

```
╔══════════════════════════════════════════════════════════════════╗
║  FASE 1 — Ahora (sin acuerdo PMS)                               ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║   Hotel exporta CSV desde PMS                                    ║
║        │                                                         ║
║        ▼                                                         ║
║   ImportWizard (perfil PMS guardado → sin mapeo manual)          ║
║        │                                                         ║
║        ▼                                                         ║
║   debacu_eval_import_csv  →  tabla compartida  →  red de riesgo  ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════╗
║  FASE 2 — Con acuerdo PMS (webhook nativo)                      ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║   PMS (evento: reserva confirmada / check-in)                    ║
║        │                                                         ║
║        │  POST /functions/v1/debacu_eval_pms_ingest             ║
║        │  Authorization: Bearer {API_KEY_DEL_HOTEL}             ║
║        ▼                                                         ║
║   Edge Function  →  identity_key  →  tabla compartida           ║
║        │                                                         ║
║        ▼  (respuesta inmediata)                                  ║
║   { risk_band: "HIGH", score: 79, incidents: 3 }                ║
║        │                                                         ║
║        ▼                                                         ║
║   PMS muestra alerta en ficha del huésped en tiempo real         ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════╗
║  FASE 3 — Integración bidireccional (futuro)                    ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║   PMS  ──────────────────────────────►  Debacu                  ║
║   (reservas, check-ins, incidencias)    (ingesta automática)     ║
║                                                                  ║
║   Debacu  ───────────────────────────►  PMS                     ║
║   (alertas, risk_band actualizado)      (webhook de vuelta /     ║
║                                          campo custom en ficha)  ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

### Flujo de negociación con el PMS

```
1. Hoteles del PMS llevan N meses usando Debacu vía CSV
      │
      ▼
2. Debacu tiene datos reales de esos hoteles en la red
   → "Tu base de hoteles ya está en nuestra plataforma.
      Tienen resultados. Solo necesitamos automatizar la entrada de datos."
      │
      ▼
3. Propuesta al PMS:
   → Webhook de salida en evento reserva/check-in → nuestro endpoint
   → Respuesta inmediata con risk_band (enriquece su ficha de huésped)
   → El PMS se convierte en distribuidor: sus clientes ya tienen
     DebacuEvaluation integrado de serie
      │
      ▼
4. Modelo comercial:
   → El PMS paga tarifa de API por hotel activo (B2B2H)
   → O el hotel sigue pagando su suscripción y el PMS cobra el setup
   → Decisión pendiente según interés del PMS
```

### Por qué la API está lista aunque no haya acuerdo firmado

- El endpoint `POST /functions/v1/debacu_eval_pms_ingest` ya existe
- La autenticación por API key por hotel ya existe
- El payload está documentado y es estándar (ver §11)
- La tabla compartida ya recibe datos de CSV y de API indistintamente
- El `source` del registro (`PMS_API` vs `CSV_IMPORT`) queda auditado

**En la primera reunión con un PMS se puede hacer una demo en vivo.**
No hay nada que construir: solo hay que entregarles la documentación de §11 y generar una API key de prueba.

---

## 15. Pendiente de decisión

- [ ] ¿Alertas activas al hotel? (email diario / push / webhook de vuelta al PMS)
- [ ] Frecuencia del agente IA: ¿diario a las 2am? ¿configurable por hotel?
- [ ] Retención de datos: plazo acordado en el DPA con cada hotel
- [ ] ¿Endpoint de eliminación por derecho al olvido?
- [ ] Motor IA de score: ¿reglas deterministas primero, ML después?
- [ ] Rangos de importe a mostrar: < 200 / 200-400 / 400-600 / 600-800 / > 800
