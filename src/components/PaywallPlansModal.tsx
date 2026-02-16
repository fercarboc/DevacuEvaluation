// src/components/PaywallPlansModal.tsx
import React, { useMemo, useState } from "react";
import { createCheckoutForPlan } from "@/services/debacu_eval_billing.service";

type PlanCode = "BASIC" | "MEDIUM" | "PREMIUM";

type PlanUI = {
  code: PlanCode;
  name: string;
  price: string;
  subtitle: string;
  includes: string[];
  badge?: { text: string; tone: "neutral" | "best" };
  emphasis?: boolean;
};

export default function PaywallPlansModal({
  open,
  onClose,
  reason,
}: {
  open: boolean;
  onClose: () => void;
  reason: "EXPIRED" | "NONE" | null;
}) {
  const [loading, setLoading] = useState<PlanCode | null>(null);
  const [err, setErr] = useState("");

  const plans = useMemo<PlanUI[]>(
    () => [
      {
        code: "BASIC",
        name: "Básico",
        price: "55€ / mes",
        subtitle: "Para equipos pequeños con operativa estable.",
        includes: [
          "Consultas y registro operativo",
          "Auditoría básica y trazabilidad",
          "Exportaciones esenciales (PDF/CSV según módulo)",
          "Facturación Stripe",
          "Soporte estándar",
        ],
        badge: { text: "Inicio", tone: "neutral" },
      },
      {
        code: "MEDIUM",
        name: "Medio",
        price: "95€ / mes",
        subtitle: "Más capacidad y control para mayor volumen.",
        includes: [
          "Mayor cuota de consultas/mes",
          "Auditoría y trazabilidad avanzada",
          "Exportaciones ampliadas (PDF/CSV)",
          "Controles de acceso avanzados",
          "Soporte prioritario",
        ],
        badge: { text: "Recomendado", tone: "best" },
        emphasis: true,
      },
      {
        code: "PREMIUM",
        name: "Premium",
        price: "145€ / mes",
        subtitle: "SaaS completo con reporting y exportación total.",
        includes: [
          "Máxima cuota de consultas/mes",
          "Auditoría + reporting extendido",
          "Exportaciones completas (PDF/CSV/XML)",
          "Más usuarios incluidos",
          "Soporte y seguimiento preferente",
        ],
        badge: { text: "Top", tone: "neutral" },
      },
    ],
    [],
  );

  if (!open) return null;

  async function go(plan: PlanCode) {
    try {
      setErr("");
      setLoading(plan);

      // ✅ JWT-only: la service obtiene access_token y llama a Edge Function
      const { url } = await createCheckoutForPlan({ plan_code: plan });

      // Redirige a Stripe Checkout
      window.location.href = url;
    } catch (e: any) {
      console.error(e);
      setErr(e?.message ?? "No se pudo iniciar el pago.");
    } finally {
      setLoading(null);
    }
  }

  const title = reason === "EXPIRED" ? "Reactivar cuenta" : "Activar acceso";
  const subtitle =
    reason === "EXPIRED"
      ? "Tu periodo de prueba ha finalizado. Elige un plan para continuar."
      : "Elige un plan para habilitar el acceso a la plataforma.";

  return (
    <div className="fixed inset-0 z-[80]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-[2px]" onClick={onClose} />

      {/* Modal */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100">
            <div>
              <div className="text-base font-semibold text-slate-900">{title}</div>
              <div className="mt-1 text-sm text-slate-600">{subtitle}</div>
              <div className="mt-2 text-xs text-slate-400">
                Facturación automática · Cancelación cuando quieras · Sin permanencia
              </div>
            </div>

            <button
              className="shrink-0 rounded-xl px-3 py-2 text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800"
              onClick={onClose}
            >
              Cerrar
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {plans.map((p) => {
                const isBusy = loading !== null;
                const isThisLoading = loading === p.code;

                const badge =
                  p.badge?.tone === "best" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600/10 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />
                      {p.badge.text}
                    </span>
                  ) : p.badge ? (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {p.badge.text}
                    </span>
                  ) : null;

                return (
                  <div
                    key={p.code}
                    className={[
                      "relative rounded-2xl border bg-white p-5",
                      p.emphasis
                        ? "border-indigo-200 shadow-[0_10px_30px_rgba(2,6,23,0.10)]"
                        : "border-slate-200",
                    ].join(" ")}
                  >
                    {/* badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-slate-900">{p.name}</div>
                        <div className="mt-1 text-sm text-slate-600">{p.subtitle}</div>
                      </div>
                      {badge}
                    </div>

                    {/* price */}
                    <div className="mt-4">
                      <div className="text-3xl font-bold tracking-tight text-slate-900">
                        {p.price}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Impuestos no incluidos (si aplica)
                      </div>
                    </div>

                    {/* includes */}
                    <div className="mt-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Incluye
                      </div>
                      <ul className="mt-2 space-y-2">
                        {p.includes.map((it) => (
                          <li key={it} className="flex gap-2 text-sm text-slate-700">
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                            <span>{it}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* CTA */}
                    <button
                      onClick={() => go(p.code)}
                      disabled={isBusy}
                      className={[
                        "mt-5 w-full rounded-xl py-2.5 text-sm font-semibold transition",
                        p.emphasis
                          ? "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                          : "bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60",
                      ].join(" ")}
                    >
                      {isThisLoading ? "Abriendo pago..." : "Contratar"}
                    </button>

                    <div className="mt-3 text-[12px] text-slate-500">
                      Se abrirá Stripe Checkout en una ventana segura.
                    </div>
                  </div>
                );
              })}
            </div>

            {err && (
              <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {err}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-xs text-slate-600">
              <div>
                ¿Necesitas condiciones Enterprise o integración PMS?{" "}
                <span className="font-semibold text-slate-800">Solicítalo</span> desde “Solicitar acceso”.
              </div>
              <div className="text-slate-500">Soporte · Auditoría · RGPD/LOPDGDD</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
