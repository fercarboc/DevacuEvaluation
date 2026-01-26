import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/services/supabaseClient";
import { useEvalAuth } from "@/context/EvalAuthContext";
import { DataTable, Td, Th, Tr } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { maskEmail, maskPhone } from "@/utils/mask";

type ActivityRow = {
  id: string;
  date: string;
  type: string;
  label: string;
  meta?: string;
  rating?: number;
  contact?: string;
};

type PlanCard = {
  name: string;
  status: string;
  billingFrequency: string;
  nextBilling: string;
  limit: number | null;
};

const APP_CODE = "DEBACU_EVAL";

function startOfCurrentMonthISO() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return d.toISOString();
}

function formatBillingFrequency(v?: string | null) {
  const x = (v ?? "").toUpperCase();
  if (x === "MONTHLY") return "MONTHLY";
  if (x === "YEARLY" || x === "ANNUAL" || x === "ANNUALLY") return "YEARLY";
  return v || "—";
}

function formatDateOrPending(v?: string | null) {
  if (!v) return "Pendiente";
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return "Pendiente";
  return dt.toLocaleDateString();
}

function statusBadge(status?: string | null) {
  const s = (status ?? "UNKNOWN").toUpperCase();

  const base =
    "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold";

  if (s === "ACTIVE" || s === "TRIALING") {
    return <span className={`${base} bg-green-50 text-green-700`}>{s}</span>;
  }
  if (s === "PENDING_PAYMENT") {
    return <span className={`${base} bg-amber-50 text-amber-700`}>{s}</span>;
  }
  if (s === "SUSPENDED") {
    return <span className={`${base} bg-red-50 text-red-700`}>{s}</span>;
  }
  return <span className={`${base} bg-slate-100 text-slate-700`}>{s}</span>;
}


function prettyEvent(eventType?: string | null, action?: string | null) {
  const e = (eventType ?? "").toUpperCase();
  const a = (action ?? "").toUpperCase();

  // Tu caso principal
  if (e === "CHECK_SIGNALS") return "Consulta";

  // Por si en el futuro registras otras acciones
  if (a === "INSERT" || a === "CREATE") return "Registro";
  if (a === "UPDATE") return "Actualización";
  if (a === "DELETE") return "Eliminación";

  return "Actividad";
}

function prettyDetail(entity?: string | null) {
  const en = (entity ?? "").toUpperCase();

  // Tu caso principal
  if (en === "EVALUATION_SEARCH") return "Consulta de registro";

  // Otros ejemplos (por si los metes luego)
  if (en === "EVALUATION_CREATE") return "Alta de registro";
  if (en === "EVALUATION_UPDATE") return "Edición de registro";

  return "—";
}




export default function DashboardHome() {
  const { user } = useEvalAuth();
  const customerId = user?.customerId ?? user?.id;

  const [planCard, setPlanCard] = useState<PlanCard | null>(null);

  const [queryCount, setQueryCount] = useState<number>(0);
  const [createdThisMonth, setCreatedThisMonth] = useState<number>(0);

  const [activityRows, setActivityRows] = useState<ActivityRow[]>([]);
  const [activitySource, setActivitySource] = useState<"audit" | "evaluations">(
    "audit",
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const usagePercent = useMemo(() => {
    const limit = planCard?.limit ?? 0;
    if (!limit) return 0;
    return Math.min(100, Math.round((queryCount / limit) * 100));
  }, [planCard, queryCount]);

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const sb = supabase as any;
        const monthStart = startOfCurrentMonthISO();

        // -------------------------
        // 1) Suscripción + plan
        // -------------------------
        // Cogemos la más reciente “viva” (ACTIVE/TRIALING/PENDING_PAYMENT/SUSPENDED si quieres reflejarlo)
        const { data: subscription, error: subsErr } = await sb
          .from("subscriptions")
          .select(
            `
            id, status, billing_frequency, next_billing_date, start_date,
            plans:plan_id ( id, name, code, max_queries_per_month, price_monthly )
          `,
          )
          .eq("customer_id", customerId)
          .eq("app_id", APP_CODE)
          .order("start_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (subsErr) {
          // no rompemos el dashboard por esto
          console.warn("dashboard subscription load:", subsErr?.message);
        }

        if (subscription) {
          const limitRaw = subscription.plans?.max_queries_per_month;
          const limit = limitRaw == null ? null : Number(limitRaw);

          setPlanCard({
            name: subscription.plans?.name || "Plan activo",
            status: subscription.status || "UNKNOWN",
            billingFrequency: formatBillingFrequency(subscription.billing_frequency),
            nextBilling: formatDateOrPending(subscription.next_billing_date),
            limit: Number.isFinite(limit as number) ? (limit as number) : null,
          });
        } else {
          setPlanCard(null);
        }

      
        // Por si tu audit_log usa actor_user_id o actor_customer_id, cubrimos ambos con .or()
       // -------------------------
     
       // -------------------------
          // 2) Consultas del mes (CHECK_SIGNALS)
          // -------------------------
          const { count: qCount, error: qErr } = await sb
            .from("debacu_eval_audit_log")
            .select("id", { count: "exact", head: true })
            .eq("customer_id", customerId)
            .eq("event_type", "CHECK_SIGNALS")
            .gte("created_at", monthStart);

          if (qErr) console.warn("dashboard query count:", qErr?.message);
          setQueryCount(qCount ?? 0);



        // -------------------------
        // 3) Registros creados este mes (evaluations)
        // -------------------------
        const { count: createdCount, error: cErr } = await sb
          .from("debacu_evaluations")
          .select("*", { count: "exact", head: true })
          .eq("creator_customer_id", customerId)
          .gte("created_at", monthStart);

        if (cErr) {
          console.warn("dashboard created count:", cErr?.message);
        }
        setCreatedThisMonth(createdCount ?? 0);

     
        // Preferimos audit log si existe.
       // -------------------------
        // 4) Actividad reciente
        // -------------------------
        const { data: audits, error: aErr } = await sb
          .from("debacu_eval_audit_log")
          .select("id,created_at,action,event_type,entity,entity_id,meta,search_value_masked,result_count")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false })
          .limit(12);



        if (!aErr && audits && audits.length > 0) {
        const rows: ActivityRow[] = audits.map((row: any) => {
            let parsedMeta: any = undefined;

            if (row.meta) {
              try {
                parsedMeta = typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta;
              } catch {
                parsedMeta = undefined;
              }
            }

            // ✅ Contacto consultado (enmascarado) desde audit_log
            const maskedContact =
              row.search_value_masked ??
              parsedMeta?.search_value_masked ??
              undefined;

            // ✅ Media agregada de esa consulta (si existe)
            const rating =
              parsedMeta?.avg_stars != null ? Number(parsedMeta.avg_stars) : undefined;

            const actionLabel = row.event_type ? String(row.event_type).toUpperCase() : "EVENTO";
            const entityLabel = row.entity ? String(row.entity).toUpperCase() : "EVENTO";

            return {
              id: row.id,
              date: new Date(row.created_at).toLocaleString(),
              type: prettyEvent(row.event_type, row.action),     // "Consulta"
              label: prettyDetail(row.entity),                   // "Consulta de registro"
              meta: undefined,               // si quieres, aquí puedes poner bucket/riesgo
              rating: Number.isFinite(rating) ? rating : undefined,
              contact: maskedContact || "-",
            };
          });

          setActivityRows(rows);
          setActivitySource("audit");
        } else {
          // fallback: evaluaciones creadas por el cliente
          const { data: evaluations, error: eErr } = await sb
            .from("debacu_evaluations")
            .select("id,platform,rating,created_at,email,phone")
            .eq("creator_customer_id", customerId)
            .order("created_at", { ascending: false })
            .limit(12);

          if (eErr) {
            console.warn("dashboard evaluations fallback:", eErr?.message);
          }

          const rows: ActivityRow[] = (evaluations || []).map((ev: any) => ({
            id: ev.id,
            date: new Date(ev.created_at).toLocaleString(),
            type: "EVALUACIÓN",
            label: ev.platform || "Registro",
            rating: ev.rating != null ? Number(ev.rating) : undefined,
            contact: ev.email ? maskEmail(ev.email) : ev.phone ? maskPhone(ev.phone) : undefined,
            meta: ev.id,
          }));

          setActivityRows(rows);
          setActivitySource("evaluations");
        }
      } catch (err: any) {
        console.error(err);
        if (!cancelled) setError("No ha sido posible cargar el dashboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (!customerId) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Cliente no disponible. Inicia sesión nuevamente.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Plan */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Plan activo</p>
              <div className="mt-3 text-xl font-semibold text-slate-900">
                {planCard?.name ?? "—"}
              </div>
            </div>
            {statusBadge(planCard?.status)}
          </div>

          {planCard ? (
            <>
              <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
                <span>Facturación</span>
                <span className="font-semibold text-slate-900">{planCard.billingFrequency}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                <span>Próx. cobro</span>
                <span className="font-semibold text-slate-900">{planCard.nextBilling}</span>
              </div>
            </>
          ) : (
            <div className="mt-3 text-sm text-slate-500">No hay plan activo registrado.</div>
          )}
        </section>

        {/* Consultas */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Consultas este mes</p>
          <div className="mt-3 text-3xl font-semibold text-slate-900">{queryCount}</div>

          <div className="text-sm text-slate-600">
            Límite:{" "}
            {planCard?.limit != null && planCard.limit > 0 ? (
              <span className="font-semibold text-slate-900">{planCard.limit}</span>
            ) : (
              "Sin límite"
            )}{" "}
            consultas
          </div>

          <div className="mt-4 h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-indigo-600 transition-all"
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          <div className="mt-2 text-sm text-slate-500">{usagePercent}% del plan utilizado</div>
        </section>

        {/* Registros creados */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Registros añadidos este mes
          </p>
          <div className="mt-3 text-3xl font-semibold text-slate-900">{createdThisMonth}</div>
          <div className="text-sm text-slate-600">
            Evaluaciones recientes ingresadas manualmente
          </div>
        </section>
      </div>

      {/* Actividad reciente */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Actividad reciente</div>
            <div className="mt-1 text-sm text-slate-600">
              Últimos eventos ligados a este cliente (sin PII).
              {activitySource === "audit" ? " (audit_log)" : " (evaluations)"}
            </div>
          </div>
        </div>

        <div className="mt-4">
          {loading ? (
            <div className="text-sm text-slate-500">Cargando actividad...</div>
          ) : activityRows.length === 0 ? (
            <EmptyState
              title="Sin actividad"
              description="Cuando el sistema registre la primera consulta o evaluación, aparecerá aquí."
            />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Actividad</Th>
                  <Th>Detalle</Th>
                  <Th>Contacto</Th>
                  <Th>Valoración</Th>
                </tr>
              </thead>
              <tbody>
                {activityRows.map((row) => (
                  <Tr key={row.id}>
                    <Td className="text-xs text-slate-500">{row.date}</Td>
                    <Td>{row.type}</Td>
                    <Td>
                      {row.label} {row.meta && <span className="text-slate-500">{`(ID ${row.meta})`}</span>}
                    </Td>
                    <Td>{row.contact || "-"}</Td>
                    <Td>
                      {row.rating != null && !Number.isNaN(row.rating) ? (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          {row.rating}/5
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </div>

        {error && <div className="mt-4 text-sm text-red-600">{error}</div>}
      </section>
    </div>
  );
}
