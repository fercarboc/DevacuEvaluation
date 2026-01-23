import { supabase } from "@/services/supabaseClient";
import { User, PlanType } from "@/types/types";

function mapPlanCodeToPlanType(planCode: string | null): PlanType {
  if (!planCode) return PlanType.INACTIVE;

  const code = planCode.toUpperCase();

  if (code === "BASIC") return PlanType.BASIC;
  if (code === "MEDIUM") return PlanType.PROFESSIONAL;
  if (code === "PREMIUM") return PlanType.ENTERPRISE;

  return PlanType.INACTIVE;
}

function norm(s: string) {
  return (s ?? "").trim();
}

/**
 * Login centralizado:
 *  - Busca cliente en `customers` por serviceUsername + servicePassword
 *  - Comprueba isActive
 *  - Comprueba suscripción activa en `subscriptions` para appId = appCode
 *  - Lee el plan en `plans` y devuelve un `User`
 */
export async function validateUserAccess(
  username: string,
  password: string,
  appCode: string
): Promise<User> {
  const u = norm(username);
  const p = norm(password);
  const app = norm(appCode);

  if (!u || !p) throw new Error("Usuario o contraseña incorrectos");
  if (!app) throw new Error("Aplicación inválida");

  // 1) Customer
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("*")
    .eq("service_username", u)
    .eq("service_password", p)
    .maybeSingle();

  if (customerError || !customer) {
    // No logs de password. Si quieres log, loguea solo el message.
    console.error("customers:", customerError?.message);
    throw new Error("Usuario o contraseña incorrectos");
  }

  if (customer.is_active === false) {
    throw new Error("Cliente inactivo. Contacta con administración.");
  }

  const customerId: string = customer.id;
  const customerName: string = customer.name || "Cliente";
  const customerEmail: string = customer.email || "";
  const planStartDate: string = customer.start_date || "";

// 2) Subscription ACTIVE para la app
const { data: subscription, error: subsError } = await supabase
  .from("subscriptions")
  .select("*")
  .eq("customer_id", customerId)
  .eq("app_id", app)
  .eq("status", "ACTIVE")
  // si tienes start_date, ordena para coger la más reciente
  .order("start_date", { ascending: false })
  .limit(1)
  .maybeSingle();


  if (subsError) {
    console.error("subscriptions:", subsError.message);
    throw new Error("Error comprobando suscripción.");
  }

  if (!subscription) {
    throw new Error("Su plan no incluye acceso a esta aplicación.");
  }

  // 3) Plan
  let planType: PlanType = PlanType.INACTIVE;
  let monthlyFee = 0;

  if (subscription.plan_id) {
    const { data: plan, error: planError } = await supabase
      .from("plans")
      .select("*")
      .eq("id", subscription.plan_id)
      .maybeSingle();

    if (planError) {
      console.error("plans:", planError.message);
      // No bloqueamos login por fallo de plan; dejamos INACTIVE.
    } else if (plan) {
      planType = mapPlanCodeToPlanType(plan.code ?? null);
      monthlyFee = plan.price_monthly || 0;
    }
  }

  const user: User = {
    id: customerId,
    username: customer.service_username || u,
    fullName: customerName,
    email: customerEmail,
    plan: planType,
    planStartDate,
    monthlyFee,
  };

  return user;
}
