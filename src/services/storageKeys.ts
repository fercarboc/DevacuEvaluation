// src/services/storageKeys.ts
// Fuente única de verdad para las claves de localStorage de la app.

export const LS_KEYS = {
  /** Objeto User serializado (EvalAuthContext) */
  USER: "debacu_eval_user",

  /** org_id de la org activa del usuario */
  ORG_ID: "debacu_eval_org_id",

  /** property_id de la propiedad Revenue activa */
  ACTIVE_PROPERTY_ID: "revenue_active_property_id",

  /** session_token legacy (x-session-token header) */
  SESSION_TOKEN: "debacu_eval_session_token",
} as const;
