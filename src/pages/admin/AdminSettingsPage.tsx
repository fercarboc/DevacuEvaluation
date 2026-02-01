import React, { useEffect, useState } from "react";
import {
  get_system_settings,
  update_system_settings,
} from "@/services/adminService";

type Settings = {
  retention_days: number;
  abuse_threshold_percent: number;
  allow_new_access_requests: boolean;
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    retention_days: 90,
    abuse_threshold_percent: 75,
    allow_new_access_requests: true,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const data = await get_system_settings();
        setSettings(data);
      } catch (e: any) {
        setError(e.message ?? "Error cargando configuración");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      await update_system_settings(settings);
      setSaved(true);
    } catch (e: any) {
      setError(e.message ?? "Error guardando configuración");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Cargando configuración…</p>;
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Configuración del sistema</h1>
        <p className="text-sm text-slate-500">
          Parámetros globales del SaaS. Los cambios quedan auditados.
        </p>
      </div>

      {/* =========================
          Retención de datos
         ========================= */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Retención de datos</h2>
          <p className="text-xs text-slate-500">
            Tiempo máximo de conservación de datos históricos y auditorías.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <input
            type="number"
            min={30}
            max={3650}
            className="w-32 rounded-lg border px-3 py-2 text-sm"
            value={settings.retention_days}
            onChange={(e) =>
              setSettings({
                ...settings,
                retention_days: Number(e.target.value),
              })
            }
          />
          <span className="text-sm text-slate-600">días</span>
        </div>

        <p className="text-xs text-amber-600">
          ⚠️ Reducir este valor puede eliminar datos históricos y afectar a
          auditorías legales.
        </p>
      </section>

      {/* =========================
          Umbral de abuso
         ========================= */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Umbral de abuso
          </h2>
          <p className="text-xs text-slate-500">
            Porcentaje a partir del cual se generan alertas automáticas.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <input
            type="number"
            min={50}
            max={100}
            className="w-32 rounded-lg border px-3 py-2 text-sm"
            value={settings.abuse_threshold_percent}
            onChange={(e) =>
              setSettings({
                ...settings,
                abuse_threshold_percent: Number(e.target.value),
              })
            }
          />
          <span className="text-sm text-slate-600">%</span>
        </div>

        <p className="text-xs text-slate-500">
          Valores bajos generan más alertas. Valores altos pueden retrasar la
          detección de abuso.
        </p>
      </section>

      {/* =========================
          Acceso al sistema
         ========================= */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Acceso al sistema
          </h2>
          <p className="text-xs text-slate-500">
            Control global de nuevas solicitudes de acceso.
          </p>
        </div>

        <label className="flex items-center gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={settings.allow_new_access_requests}
            onChange={(e) =>
              setSettings({
                ...settings,
                allow_new_access_requests: e.target.checked,
              })
            }
          />
          Permitir nuevas solicitudes de acceso
        </label>

        {!settings.allow_new_access_requests && (
          <p className="text-xs text-amber-600">
            ⚠️ Los nuevos clientes no podrán solicitar acceso mientras esté
            desactivado.
          </p>
        )}
      </section>

      {/* =========================
          Acciones
         ========================= */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>

        {saved && (
          <span className="text-sm text-emerald-600">
            ✔ Cambios guardados
          </span>
        )}

        {error && (
          <span className="text-sm text-red-600">
            {error}
          </span>
        )}
      </div>

      {/* =========================
          Textos legales
         ========================= */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">
          Textos legales
        </h2>
        <p className="text-xs text-slate-500">
          Gestión de términos, condiciones y avisos legales (pendiente de
          implementación).
        </p>
        <button
          disabled
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-400 cursor-not-allowed"
        >
          Editar (próximamente)
        </button>
      </section>
    </div>
  );
}
