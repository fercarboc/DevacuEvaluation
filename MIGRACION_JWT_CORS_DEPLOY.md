# Migración Edge Functions: JWT-only + CORS unificado + Deploy por CLI (Debacu Evaluation360)

## Objetivo
Estandarizar TODAS las Edge Functions para:
1) Autenticación **JWT-only** (Supabase Auth)  
2) CORS centralizado en `_shared/cors.ts`  
3) Deploy **solo** con Supabase CLI (no Studio) para evitar fallos de imports de `_shared`.

---

## Regla crítica
- **NO desplegar funciones desde Supabase Studio** si importan `../_shared/*`.
- Usar **SIEMPRE**: `supabase functions deploy ...` (CLI).

---

## Estándar JWT-only

### En la request
- `Authorization: Bearer <jwt>` **obligatorio**
- `apikey: <anon_key>` (ok mantenerlo)

### En el código
- Crear un `userClient(req)` con el bearer.
- Validar sesión con `auth.getUser()`.
- **Prohibido**:
  - leer o enviar `x-session-token`
  - usar tablas / lógica legacy de sesiones
- `SERVICE_ROLE` solo para:
  - operaciones admin
  - signed urls de Storage
  - lecturas/insert internos que requieren bypass RLS

---

## Estructura final por función (plantilla)

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { json, preflight } from "../_shared/cors.ts";
import { requireUser, requireAdmin } from "../_shared/auth.ts"; // según aplique

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  // JWT-only
  const { user } = await requireUser(req); // o requireAdmin(req)

  // ... lógica de negocio
  return json(req, 200, { ok: true });
});

hared files mínimos

En supabase/functions/_shared/:

1) _shared/cors.ts

whitelist de orígenes

corsHeaders(req)

preflight(req) -> 204

json(req, status, body)

2) _shared/auth.ts

getBearer(req)

userClient(token)

adminClient()

requireUser(req) -> valida JWT y devuelve user

requireAdmin(req) -> valida JWT + check en debacu_eval_admin_users (o tu criterio final)

Nota: Si en alguna función se usa el patrón ADMIN_EMAILS, se sustituye por tabla debacu_eval_admin_users (recomendado).

Deploy (única forma)
Deploy 1 función
supabase functions deploy <nombre_funcion>

Deploy todas (cuando ya estén)
supabase functions deploy --all

Smoke tests (por función)
Caso 1: sin Bearer

debe devolver 401 missing_bearer (o equivalente)

Caso 2: Bearer inválido

debe devolver 401 invalid_token

Caso 3: Bearer válido

debe devolver 200 ok:true (según endpoint)

Caso 4: CORS

desde http://localhost:3000 y https://debacu.com no debe fallar preflight.

Flujo de trabajo “una a una”
Paso A — Auditoría rápida

Para cada función:

revisar si sigue usando x-session-token

revisar si hace auth.getUser() con bearer

revisar si CORS está hardcoded en cada función o usa _shared

Resultado:

✅ ya es JWT-only

⚠️ mezcla legacy

❌ no cumple

Paso B — Refactor

mover CORS a _shared/cors.ts

mover auth a _shared/auth.ts

sustituir auth legacy por JWT-only

unificar formato de errores

Paso C — Deploy
supabase functions deploy <func>

Paso D — Test

UI / curl

verificar 401/200 y CORS

Orden recomendado (prioridad)

Auth / login / whoami / entitlements

Revenue (channels, leak detail, risk)

Exports (signed url, list, create)

Admin (access requests, plans, billing, etc)

Nota de producción (cuando toque Vercel + dominio)

En Supabase (Auth -> URL Configuration):

Site URL: https://debacu.com

Redirect URLs: añadir rutas reales, por ejemplo:

https://debacu.com/auth/activate

https://debacu.com/auth/reset

(si preview): https://*.vercel.app/auth/activate (si decides permitir previews)

En CORS whitelist (_shared/cors.ts):

mantener localhost para dev

añadir dominios finales (https://debacu.com, https://www.debacu.com)

añadir https://<project>.vercel.app solo si lo necesitas (mejor limitarlo)

Recordatorio

No es necesario “tocar todas” hoy.

Sí es necesario que todas nuevas/refactorizadas sigan el estándar, y el deploy sea por CLI.

// supabase/functions/_shared/auth.ts
import { createClient, type User } from "https://esm.sh/@supabase/supabase-js@2";

/* =====================================================
   ENV
===================================================== */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/* =====================================================
   Helpers
===================================================== */

function getBearer(req: Request): string {
  const h = req.headers.get("Authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m?.[1]) throw new Error("UNAUTHORIZED");
  return m[1];
}

/* =====================================================
   Clients
===================================================== */

export function supabaseUserClient(jwt: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
  });
}

export function supabaseServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/* =====================================================
   REQUIRE USER (JWT-only)
===================================================== */

export async function requireUser(req: Request): Promise<{
  user: User;
  sbUser: ReturnType<typeof supabaseUserClient>;
}> {
  const jwt = getBearer(req);

  const sbUser = supabaseUserClient(jwt);
  const { data, error } = await sbUser.auth.getUser();

  if (error || !data?.user) {
    throw new Error("UNAUTHORIZED");
  }

  return {
    user: data.user,
    sbUser,
  };
}

/* =====================================================
   REQUIRE ADMIN
   Fuente de verdad: RPC is_admin()
===================================================== */

export async function requireAdmin(req: Request): Promise<{
  user: User;
}> {
  const { user, sbUser } = await requireUser(req);

  const { data, error } = await sbUser.rpc("is_admin");

  if (error) {
    throw new Error("ADMIN_CHECK_FAILED");
  }

  if (!data) {
    throw new Error("FORBIDDEN");
  }

  return { user };
}

ómo usarlo ahora en una Edge Function

Ejemplo limpio:

import { json, preflight } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);

  try {
    const { user } = await requireAdmin(req);

    return json(req, 200, { ok: true, admin: user.email });
  } catch (e: any) {
    const msg = e.message;

    if (msg === "UNAUTHORIZED")
      return json(req, 401, { ok: false, error: "unauthorized" });

    if (msg === "FORBIDDEN")
      return json(req, 403, { ok: false, error: "forbidden" });

    return json(req, 500, { ok: false, error: msg });
  }
});

🔎 ¿Por qué esta versión es mejor?

No mezcla token manual y header

No devuelve { ok:false } → usa throw + catch centralizado

Funciona perfecto con RLS

Compatible con tu RPC is_admin()

Es 100% JWT-only

Lista para producción

📌 Importante

Tu RPC is_admin() debe estar creada así:

create or replace function public.is_admin()
returns boolean
language sql
security definer
as $$
  select exists (
    select 1
    from debacu_eval_admin_users
    where user_id = auth.uid()
      and active = true
  );
$$;


Y con permisos:

grant execute on function public.is_admin() to authenticated;

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type PlanCode = "FREE" | "BASIC" | "MEDIUM" | "PREMIUM";
export type SubStatus =
  | "TRIAL_ACTIVE"
  | "ACTIVE"
  | "PENDING_PAYMENT"
  | "PAST_DUE"
  | "CANCELED"
  | "SUSPENDED";

export function planMaxUsers(plan: PlanCode): number {
  switch (plan) {
    case "FREE":
    case "BASIC":
      return 1;
    case "MEDIUM":
      return 2;
    case "PREMIUM":
      return 4;
  }
}

export function isAppEnabled(status: SubStatus): boolean {
  return status === "ACTIVE" || status === "TRIAL_ACTIVE";
}

export function supabaseAdmin(req: Request) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
}

export function supabaseUser(req: Request) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  return createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
}

export async function getAuthUserOrThrow(sbUser: ReturnType<typeof supabaseUser>) {
  const { data, error } = await sbUser.auth.getUser();
  if (error || !data?.user) throw new Error("UNAUTHENTICATED");
  return data.user;
}

export async function getCustomerIdForUserOrThrow(
  sbAdmin: ReturnType<typeof supabaseAdmin>,
  userId: string
): Promise<string> {
  const { data, error } = await sbAdmin
    .from("debacu_eval_hotel_profile")
    .select("customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.customer_id) throw new Error("NO_CUSTOMER");
  return data.customer_id as string;
}

export type ActiveSub = {
  id: string;
  customer_id: string;
  plan_code: PlanCode;
  status: SubStatus;
};

export async function getCurrentSubscriptionOrThrow(
  sbAdmin: ReturnType<typeof supabaseAdmin>,
  customerId: string
): Promise<ActiveSub> {
  const { data, error } = await sbAdmin
    .from("subscriptions")
    .select("id, customer_id, plan_code, status")
    .eq("customer_id", customerId)
    .eq("app_id", "debacu_eval")
    .in("status", ["TRIAL_ACTIVE", "ACTIVE"])
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("NO_ACTIVE_SUBSCRIPTION");
  return data as ActiveSub;
}

export async function assertAppEnabledOrThrow(sub: ActiveSub) {
  if (!isAppEnabled(sub.status)) {
    throw new Error(`PLAN_NOT_ACTIVE:${sub.status}`);
  }
}

