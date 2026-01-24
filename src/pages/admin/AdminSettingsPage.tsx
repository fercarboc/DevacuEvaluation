import React, { useEffect, useState } from "react";
import { get_system_settings, update_system_settings } from "@/services/adminService";

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState({
    retention_days: 90,
    abuse_threshold_percent: 75,
    allow_new_access_requests: true,
  });

  useEffect(() => {
    void (async () => {
      const data = await get_system_settings();
      setSettings(data);
    })();
  }, []);

  const handleSave = async () => {
    await update_system_settings(settings);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Configuración</h1>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
        <label className="text-xs font-semibold text-slate-600">Retention (días)</label>
        <input
          className="w-32 rounded-lg border px-3 py-2 text-sm"
          type="number"
          value={settings.retention_days}
          onChange={(e) => setSettings({ ...settings, retention_days: Number(e.target.value) })}
        />
        <label className="text-xs font-semibold text-slate-600">Abuse threshold (%)</label>
        <input
          className="w-32 rounded-lg border px-3 py-2 text-sm"
          type="number"
          value={settings.abuse_threshold_percent}
          onChange={(e) => setSettings({ ...settings, abuse_threshold_percent: Number(e.target.value) })}
        />
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input
            type="checkbox"
            checked={settings.allow_new_access_requests}
            onChange={(e) => setSettings({ ...settings, allow_new_access_requests: e.target.checked })}
          />
          Permitir nuevas solicitudes
        </label>
        <button
          onClick={handleSave}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
        >
          Guardar cambios
        </button>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Textos legales</h2>
        <p className="text-xs text-slate-500">Aquí se podrían editar los términos y condiciones.</p>
        <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
          Editar
        </button>
      </section>
    </div>
  );
}
