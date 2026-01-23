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
  limit: number;
};

const APP_CODE = "DEBACU_EVAL";

export default function DashboardHome() {
  const { user } = useEvalAuth();
  const customerId = user?.customerId ?? user?.id;

  const [planCard, setPlanCard] = useState<PlanCard | null>(null);
  const [queryCount, setQueryCount] = useState<number>(0);
  const [activityRows, setActivityRows] = useState<ActivityRow[]>([]);
  const [activitySource, setActivitySource] = useState<"audit" | "evaluations">("audit");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const usagePercent = useMemo(() => {
    if (!planCard?.limit) return 0;
    return Math.min(100, Math.round((queryCount / planCard.limit) * 100));
  }, [planCard, queryCount]);

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const sb = supabase as any;

        const { data: subscription } = await sb
          .from("subscriptions")
          .select(`
            *,
            plans:plan_id ( id, name, code, max_queries_per_month, price_monthly )
          `)
          .eq("customer_id", customerId)
          .eq("app_id", APP_CODE)
          .in("status", ["ACTIVE", "TRIALING"])
          .order("start_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (subscription) {
          const limit = Number(subscription.plans?.max_queries_per_month ?? 0);
          setPlanCard({
            name: subscription.plans?.name || "Plan activo",
            status: subscription.status,
            billingFrequency: subscription.billing_frequency || "Mensual",
            nextBilling: subscription.next_billing_date || "Pendiente",
            limit,
          });
        } else {
          setPlanCard(null);
        }

        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const { count } = await sb
          .from("debacu_eval_audit_log")
          .select("*", { count: "exact" })
          .eq("actor_user_id", customerId)
          .eq("action", "QUERY")
          .gte("created_at", startOfMonth);
        setQueryCount(count ?? 0);

        const { data: audits } = await sb
          .from("debacu_eval_audit_log")
          .select("id,created_at,action,entity,entity_id,meta")
          .eq("actor_user_id", customerId)
          .order("created_at", { ascending: false })
          .limit(10);

        if (audits && audits.length > 0) {
          const rows = audits.map((row: any) => {
            let parsedMeta = undefined;
            if (row.meta) {
              try {
                parsedMeta = JSON.parse(row.meta);
              } catch {
                parsedMeta = undefined;
              }
            }
            const contactEmail = parsedMeta?.clientEmail ?? parsedMeta?.client_email;
            return {
              id: row.id,
              date: new Date(row.created_at).toLocaleString(),
              type: row.action,
              label: row.entity || "Evento",
              rating: parsedMeta?.rating,
              contact: contactEmail ? maskEmail(contactEmail) : undefined,
              meta: row.entity_id,
            };
          });
          setActivityRows(rows);
          setActivitySource("audit");
        } else {
          const { data: evaluations } = await sb
            .from("debacu_evaluations")
            .select("id,platform,rating,created_at,email,phone")
            .eq("creator_customer_id", customerId)
            .order("created_at", { ascending: false })
            .limit(10);

          const rows = (evaluations || []).map((ev: any) => ({
            id: ev.id,
            date: new Date(ev.created_at).toLocaleString(),
            type: "EVALUACIÓN",
            label: ev.platform || "Registro",
            rating: ev.rating,
            contact: maskEmail(ev.email) || maskPhone(ev.phone),
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
      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Plan activo</p>
          {planCard ? (
            <>
              <div className="mt-3 text-xl font-semibold text-slate-900">{planCard.name}</div>
              <div className="mt-2 text-sm text-slate-600">
                Estado: <span className="font-semibold text-slate-900">{planCard.status}</span>
              </div>
              <div className="flex items-center justify-between mt-3 text-sm text-slate-600">
                <span>Facturación</span>
                <span className="font-semibold text-slate-900">{planCard.billingFrequency}</span>
              </div>
              <div className="flex items-center justify-between mt-2 text-sm text-slate-600">
                <span>Próx. cobro</span>
                <span className="font-semibold text-slate-900">{planCard.nextBilling}</span>
              </div>
            </>
          ) : (
            <div className="mt-3 text-sm text-slate-500">No hay plan activo registrado.</div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Consultas este mes</p>
          <div className="mt-3 text-3xl font-semibold text-slate-900">{queryCount}</div>
          <div className="text-sm text-slate-600">
            Límite: {planCard?.limit ? planCard.limit : "Sin límite"} consultas
          </div>
          <div className="mt-4 h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-indigo-600 transition-all"
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          <div className="mt-2 text-sm text-slate-500">{usagePercent}% del plan utilizado</div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Registros añadidos este mes
          </p>
          <div className="mt-3 text-3xl font-semibold text-slate-900">
            {activityRows.length}
          </div>
          <div className="text-sm text-slate-600">
            {activitySource === "audit"
              ? "Eventos auditados (QUERY / CREATE)"
              : "Evaluaciones recientes ingresadas manualmente"}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Actividad reciente</div>
            <div className="mt-1 text-sm text-slate-600">
              Últimos eventos ligados a este cliente (sin PII).
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
                  <Th>Evento</Th>
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
                    <Td>{row.label} {row.meta && `(ID ${row.meta})`}</Td>
                    <Td>{row.contact || "-"}</Td>
                    <Td>
                      {row.rating != null ? (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          {row.rating}/5
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">sin rating</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </div>
        {error && (
          <div className="mt-4 text-sm text-red-600">{error}</div>
        )}
      </section>
    </div>
  );
}
