import React from "react";
import { Lock, ArrowRight } from "lucide-react";
import { PlanTier } from "../../../auditor";

type Props = {
  currentPlan: PlanTier;
  onGoPlans?: () => void;
};

export default function RevenueLockedDemo({ currentPlan, onGoPlans }: Props) {
  const planLabel =
    currentPlan === PlanTier.FREE ? "FREE" :
    currentPlan === PlanTier.BASIC ? "BASIC" :
    currentPlan === PlanTier.MEDIUM ? "MEDIUM" : "PREMIUM";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="flex items-start gap-4">
        
        {/* Icono */}
        <div className="h-12 w-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
          <Lock className="w-6 h-6" />
        </div>

        <div className="min-w-0 w-full">
          <h2 className="text-xl font-bold text-slate-900">
            Revenue Intelligence
          </h2>

          <p className="mt-1 text-sm text-slate-600">
            Esta sección está disponible solo para planes{" "}
            <span className="font-semibold">MEDIUM</span> y{" "}
            <span className="font-semibold">PREMIUM</span>.
          </p>

          <div className="mt-3 text-xs text-slate-500">
            Plan actual:{" "}
            <span className="font-semibold text-slate-700">
              {planLabel}
            </span>
          </div>

          {/* DEMO IMAGE BLOCK */}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
           
         

            <div className="mt-5 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
              <img
                src="/img/revenueinteligence.png"
                alt="Vista previa Revenue Intelligence"
                className="w-full h-auto object-cover"
              />
            </div>
          </div>

          <div className="mt-6">
            <button
              type="button"
              onClick={onGoPlans}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-black transition-colors"
            >
              Ver planes
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

