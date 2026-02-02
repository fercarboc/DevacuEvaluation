import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { get_system_settings, update_system_settings } from "@/services/adminService";

export default function AdminSettingsPage() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [settings, setSettings] = useState({
    retention_days: 90,
    abuse_threshold_percent: 75,
    allow_new_access_requests: true,
  });

  const [meta, setMeta] = useState<{ updated_at?: string; updated_by?: string | null }>({});
  const [error, setError] = useState<string>("");
  const [okMsg, setOkMsg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await get_system_settings();
        if (cancelled) return;

        setSettings({
          retention_days: data.retention_days,
          abuse_threshold_percent: data.abuse_threshold_percent,
          allow_new_access_requests: data.allow_new_access_requests,
        });

        setMeta({ updated_at: data.updated_at, updated_by: data.updated_by });
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Error loading settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setOkMsg("");

    try {
      const res = await update_system_settings(settings);

      setMeta({
        updated_at: res.settings.updated_at,
        updated_by: res.settings.updated_by,
      });

      setOkMsg(res.unchanged ? "Sin cambios (ya estaba guardado)." : "Configuración guardada.");
      setTimeout(() => setOkMsg(""), 2500);
    } catch (e: any) {
      setError(e?.message ?? "Error saving settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Configuración</h1>
          <p className="text-sm text-slate-500">
            Control real del sistema (persistente + auditable).
          </p>

          {meta.updated_at && (
            <p className="mt-1 text-xs text-slate-500">
              Última modificación:{" "}
              <span className="font-medium text-slate-700">
                {new Date(meta.updated_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}
              </span>
              {meta.updated_by ? (
                <span className="text-slate-400"> · by {meta.updated_by}</span>
              ) : null}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => nav("/app/admin/cambios-saas")}
            disabled={loading}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
            title="Ver historial de cambios de configuración"
          >
            Ver cambios
          </button>

          <button
            onClick={handleSave}
            disabled={loading || saving}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>

      {loading && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-600">Cargando configuración…</p>
        </div>
      )}

      {!loading && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {okMsg && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {okMsg}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Retention (días)</label>
              <input
                type="number"
                min={30}
                max={730}
                className="w-40 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={settings.retention_days}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, retention_days: Number(e.target.value) }))
                }
              />
              <p className="text-xs text-slate-500">Rango permitido: 30–730</p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Abuse threshold (%)</label>
              <input
                type="number"
                min={1}
                max={99}
                className="w-40 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={settings.abuse_threshold_percent}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    abuse_threshold_percent: Number(e.target.value),
                  }))
                }
              />
              <p className="text-xs text-slate-500">Rango permitido: 1–99</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-600">Accesos</label>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.allow_new_access_requests}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      allow_new_access_requests: e.target.checked,
                    }))
                  }
                />
                Permitir nuevas solicitudes de acceso
              </label>

              <p className="text-xs text-slate-500">
                Si lo desactivas, bloqueas nuevas altas por solicitud (no afecta a clientes existentes).
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
