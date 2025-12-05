import { supabase } from '../supabaseClient';
import { User, PlanType } from '../types';

function mapPlanCodeToPlanType(planCode: string | null): PlanType {
  if (!planCode) return PlanType.INACTIVE;

  const code = planCode.toUpperCase();

  if (code === 'BASIC') return PlanType.BASIC;
  if (code === 'MEDIUM') return PlanType.PROFESSIONAL;
  if (code === 'PREMIUM') return PlanType.ENTERPRISE;

  return PlanType.INACTIVE;
}

/**
 * Login centralizado:
 *  - Busca cliente en `customers` por serviceUsername + servicePassword
 *  - Comprueba isActive
 *  - Comprueba suscripción activa en `subscriptions` para appId = appCode
 *  - Lee el plan en `plans` y devuelve un `User` para DebacuEvaluation360
 */
export async function validateUserAccess(
  username: string,
  password: string,
  appCode: string
): Promise<User> {
  // 1️⃣ Buscar cliente en customers
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('*')
    .eq('serviceUsername', username)
    .eq('servicePassword', password)
    .maybeSingle();

  if (customerError || !customer) {
    console.error('Error customers:', customerError);
    throw new Error('Usuario o contraseña incorrectos');
  }

  if (customer.isActive === false) {
    throw new Error('Cliente inactivo. Contacta con administración.');
  }

  const customerId: string = customer.id;
  const customerName: string = customer.name || 'Cliente';
  const customerEmail: string = customer.email || '';
  const planStartDate: string = customer.startDate || '';

  // 2️⃣ Suscripción activa a esta app
  const { data: subs, error: subsError } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('customerId', customerId)
    .eq('appId', appCode)   // aquí DEBACU_EVAL
    .eq('status', 'ACTIVE')
    .limit(1);

  if (subsError) {
    console.error('Error subscriptions:', subsError);
    throw new Error('Error comprobando suscripción.');
  }

  if (!subs || subs.length === 0) {
    throw new Error('Su plan no incluye acceso a esta aplicación.');
  }

  const subscription = subs[0];

  // 3️⃣ Datos del plan en `plans`
  let planType: PlanType = PlanType.INACTIVE;
  let monthlyFee = 0;

  if (subscription.planId) {
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('*')
      .eq('id', subscription.planId)
      .maybeSingle();

    if (!planError && plan) {
      planType = mapPlanCodeToPlanType(plan.code);
      monthlyFee = plan.price_monthly || 0;
    }
  }

  const user: User = {
    id: customerId,                              // customerId
    username: customer.serviceUsername || username,
    fullName: customerName,
    email: customerEmail,
    plan: planType,
    planStartDate,
    monthlyFee,
  };

  return user;
}
